// ---------------------------------------------------------------------------
// Lagerbuchung der Kasse (Oktober 2026)
//
// Nur die Cloud bucht im Lager (der T400 nie). Pro Bestellung meldet sie den
// ganzen Soll-Stand an PUT /api/kasse/bestellungen/:id des Inventars; das
// Lager bucht die Differenz zu dem, was schon gebucht ist. Damit kommen
// Stornos zurueck, und eine Meldung zweimal schadet nicht.
//
// Was zaehlt (lagerSoll):
//  - jede vorhandene Position mit Artikelnummer (geloeschte = storniert)
//  - in einer stornierten Bestellung nur Positionen, die Kueche/Bar schon
//    erledigt haben: Die automatische Stornierung offener Bestellungen nach
//    2 h trifft auch Servierte (Chilbi 2026: 16 von 22) - die Ware ist weg.
//  - Sonderposten (ohne Artikelnummer) nie
//  - Rezepte fuehrt die Kasse mit negativer Nummer (artikelListe), das
//    Lager loest sie in Zutaten auf
//
// Wann: sofort nach jeder Aenderung in der Kasse (anstossen) und ein Lauf
// alle 20 s fuer alles, dessen "geaendert" neuer ist als der letzte
// erfolgreiche Abgleich (lager_abgleich.stand) - das faengt T400-
// Bestellungen, die automatische Stornierung und Fehlversuche (Lager nicht
// erreichbar) auf. Bestellungen von vor der Einfuehrung bleiben, wie sie
// gebucht wurden.
// ---------------------------------------------------------------------------
import type pg from 'pg';

export interface LagerPosition { item_id: string | number | null; quantity: number; completed?: boolean | null }

export function lagerSoll(status: string | null, positionen: LagerPosition[]): { id: number; menge: number }[] {
  const storniert = status === 'cancelled';
  const soll = new Map<number, number>();
  for (const p of positionen) {
    if (storniert && !p.completed) continue;
    const id = Number(p.item_id);
    const menge = Number(p.quantity);
    if (p.item_id === null || p.item_id === '' || !Number.isInteger(id) || id === 0) continue;
    if (!Number.isInteger(menge) || menge <= 0) continue;
    soll.set(id, (soll.get(id) || 0) + menge);
  }
  return [...soll].map(([id, menge]) => ({ id, menge }));
}

// Wartezeit nach n Fehlversuchen (1, 2, 4 ... hoechstens 30 Minuten).
export function wartezeitMs(versuche: number): number {
  return versuche <= 0 ? 0 : Math.min(30, 2 ** (versuche - 1)) * 60000;
}

export async function lagerSchema(pool: pg.Pool): Promise<void> {
  const neu = !(await pool.query(`SELECT to_regclass('lager_abgleich') AS t`)).rows[0].t;
  await pool.query(`CREATE TABLE IF NOT EXISTS lager_abgleich (
    order_id INTEGER PRIMARY KEY,
    stand TEXT,
    versuche INTEGER NOT NULL DEFAULT 0,
    fehler TEXT,
    aktualisiert TIMESTAMPTZ DEFAULT now()
  )`);
  // Einfuehrung: Was es schon gibt, gilt als gebucht (keine Nachbuchungen
  // fuer alte Bestellungen ohne ausdrueckliche Korrektur).
  if (neu) {
    await pool.query(`INSERT INTO lager_abgleich (order_id, stand)
      SELECT id, geaendert::text FROM orders ON CONFLICT (order_id) DO NOTHING`);
  }
}

export function lagerEinrichten(d: { pool: pg.Pool; inventoryApiUrl: string; orderApiKey: string }) {
  const laufend = new Set<number>();

  async function abgleichen(orderId: number): Promise<void> {
    if (laufend.has(orderId)) return;
    laufend.add(orderId);
    try {
      const o = (await d.pool.query('SELECT status, geaendert::text AS stand FROM orders WHERE id = $1', [orderId])).rows[0];
      if (!o) return;
      const pos = (await d.pool.query('SELECT item_id, quantity, completed FROM order_items WHERE order_id = $1', [orderId])).rows;
      try {
        const r = await fetch(`${d.inventoryApiUrl}/api/kasse/bestellungen/${orderId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-Order-API-Key': d.orderApiKey },
          body: JSON.stringify({ quelle: 'kasse', positionen: lagerSoll(o.status, pos) }),
          signal: AbortSignal.timeout(10000),
        });
        const antwort: any = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(antwort?.error || `HTTP ${r.status}`);
        if (antwort.warnungen?.length) console.warn(`Lager #${orderId}:`, antwort.warnungen.join('; '));
        await d.pool.query(`INSERT INTO lager_abgleich (order_id, stand, versuche, fehler, aktualisiert)
          VALUES ($1, $2, 0, NULL, now())
          ON CONFLICT (order_id) DO UPDATE SET stand = $2, versuche = 0, fehler = NULL, aktualisiert = now()`,
          [orderId, o.stand]);
      } catch (e: any) {
        const meldung = String(e?.message || e).slice(0, 500);
        console.error(`Lager #${orderId} nicht gebucht:`, meldung);
        await d.pool.query(`INSERT INTO lager_abgleich (order_id, versuche, fehler, aktualisiert)
          VALUES ($1, 1, $2, now())
          ON CONFLICT (order_id) DO UPDATE SET versuche = lager_abgleich.versuche + 1, fehler = $2, aktualisiert = now()`,
          [orderId, meldung]);
      }
    } finally {
      laufend.delete(orderId);
    }
  }

  async function nachholen(): Promise<void> {
    const offen = (await d.pool.query(`
      SELECT o.id, COALESCE(l.versuche, 0) AS versuche, l.aktualisiert
      FROM orders o LEFT JOIN lager_abgleich l ON l.order_id = o.id
      WHERE o.geaendert > now() - interval '7 days'
        AND l.stand IS DISTINCT FROM o.geaendert::text
      ORDER BY o.geaendert LIMIT 50`)).rows;
    for (const z of offen) {
      if (z.versuche > 0 && Date.now() - new Date(z.aktualisiert).getTime() < wartezeitMs(z.versuche)) continue;
      await abgleichen(z.id);
    }
  }

  return {
    // Nach einer Aenderung in der Kasse; wartet nicht.
    anstossen(orderId: number | string): void {
      const id = Number(orderId);
      if (Number.isInteger(id) && id > 0) abgleichen(id).catch((e) => console.error('Lager:', e?.message || e));
    },
    starten(): void {
      setInterval(() => { nachholen().catch((e) => console.error('Lager nachholen:', e?.message || e)); }, 20000);
    },
  };
}
