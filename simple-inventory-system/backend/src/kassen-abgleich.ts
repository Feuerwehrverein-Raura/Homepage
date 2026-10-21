/**
 * Lagerbuchung der Kasse als Abgleich (Oktober 2026).
 *
 * Bis zur Chilbi 2026 buchte die Kasse jede neue Position einmal aus
 * (POST /api/items/sell). Stornos kamen nie zurueck, eine wiederholte Meldung
 * buchte doppelt, und ein einziger unbekannter Artikel liess die ganze
 * Bestellung durchfallen. An der Chilbi 2026: 633 Stueck abgebucht, 540
 * verkauft.
 *
 * Jetzt meldet die Kasse pro Bestellung den ganzen Soll-Stand:
 *
 *   PUT /api/kasse/bestellungen/:id   (x-order-api-key)
 *   { quelle?: 'kasse', positionen: [{ id, menge, art?: 'artikel'|'rezept' }] }
 *
 * Das Lager vergleicht mit dem, was fuer diese Bestellung schon gebucht ist
 * (transactions.order_id), und bucht nur die Differenz: mehr = Ausgang,
 * weniger = Eingang ("Storno"). Dieselbe Meldung zweimal bucht nichts.
 *
 * - Rezepte: art 'rezept' oder negative id (so fuehrt die Kasse sie, damit
 *   sie nicht mit Artikelnummern zusammenfallen). Gebucht werden die
 *   Zutaten; Bruchteile werden pro Bestellung aufgerundet, weil der Bestand
 *   (noch) ganzzahlig ist.
 * - Unbekannte Artikel/Rezepte werden uebersprungen und gemeldet, der Rest
 *   der Bestellung wird trotzdem gebucht.
 * - Der Bestand darf durch Verkaeufe unter null fallen: Die Ware ist
 *   draussen, ein negativer Bestand zeigt, dass gezaehlt werden muss.
 * - Pro Bestellung ein Advisory-Lock, Bestand nur relativ geaendert
 *   (quantity = quantity - n): keine verlorenen Buchungen.
 */

import type { Express, RequestHandler } from 'express';
import type pg from 'pg';

// Namensraum fuer pg_advisory_xact_lock(ns, order_id)
const LOCK_NS = 4711;
const KASSE_EMAIL = 'kasse@fwv-raura.ch';

export interface SollPosition { id: number; menge: number; art?: 'artikel' | 'rezept' }

export async function kassenAbgleichTabellen(pool: pg.Pool): Promise<void> {
  await pool.query('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS order_id INTEGER');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_transactions_order ON transactions(order_id) WHERE order_id IS NOT NULL');
  // Buchungen aus der Zeit vor der Spalte: Nummer steht im Grund.
  await pool.query(`
    UPDATE transactions SET order_id = substring(reason from 'Bestellung #([0-9]+)')::int
    WHERE order_id IS NULL AND reason ~ 'Bestellung #[0-9]+'`);
}

// Soll je Lagerartikel aus den Positionen der Kasse (Rezepte aufgeloest).
async function sollRechnen(client: pg.PoolClient, positionen: SollPosition[], warnungen: string[]): Promise<Map<number, number>> {
  const soll = new Map<number, number>();
  const dazu = (id: number, n: number) => soll.set(id, (soll.get(id) || 0) + n);
  for (const p of positionen) {
    const rezept = p.art === 'rezept' || p.id < 0;
    const id = Math.abs(p.id);
    if (!rezept) {
      const da = await client.query('SELECT 1 FROM items WHERE id = $1', [id]);
      if (da.rows.length) dazu(id, p.menge);
      else warnungen.push(`Artikel ${id} unbekannt`);
      continue;
    }
    const r = await client.query('SELECT name FROM recipes WHERE id = $1', [id]);
    if (!r.rows.length) { warnungen.push(`Rezept ${id} unbekannt`); continue; }
    const zutaten = await client.query(
      'SELECT item_id, quantity FROM recipe_ingredients WHERE recipe_id = $1 AND optional = false', [id]);
    for (const z of zutaten.rows) dazu(z.item_id, Number(z.quantity) * p.menge);
  }
  // Bestand ist ganzzahlig: angebrochene Einheiten zaehlen als verbraucht.
  for (const [id, n] of soll) soll.set(id, Math.ceil(n - 1e-9));
  return soll;
}

export async function bestellungAbgleichen(
  pool: pg.Pool, orderId: number, positionen: SollPosition[], quelle: string
): Promise<{ gebucht: { item_id: number; name: string; menge: number; bestand: number }[]; warnungen: string[] }> {
  const warnungen: string[] = [];
  const gebucht: { item_id: number; name: string; menge: number; bestand: number }[] = [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [LOCK_NS, orderId]);

    const soll = await sollRechnen(client, positionen, warnungen);
    const ist = new Map<number, number>();
    const r = await client.query(`
      SELECT item_id, SUM(CASE type WHEN 'out' THEN quantity WHEN 'in' THEN -quantity ELSE 0 END)::int AS menge
      FROM transactions WHERE order_id = $1 AND item_id IS NOT NULL GROUP BY item_id`, [orderId]);
    for (const z of r.rows) ist.set(z.item_id, z.menge);

    // Feste Reihenfolge: zwei Abgleiche sperren Artikel nie ueberkreuz.
    const ids = [...new Set([...soll.keys(), ...ist.keys()])].sort((a, b) => a - b);
    for (const itemId of ids) {
      const diff = (soll.get(itemId) || 0) - (ist.get(itemId) || 0);
      if (!diff) continue;
      const u = await client.query(
        'UPDATE items SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING name, quantity',
        [diff, itemId]);
      if (!u.rows.length) continue; // Artikel inzwischen geloescht
      const nachher = u.rows[0].quantity;
      await client.query(`
        INSERT INTO transactions (item_id, type, quantity, previous_quantity, new_quantity, reason, user_email, order_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [itemId, diff > 0 ? 'out' : 'in', Math.abs(diff), nachher + diff, nachher,
         `${diff > 0 ? 'Verkauf' : 'Storno'} - Bestellung #${orderId} (${quelle})`, KASSE_EMAIL, orderId]);
      if (nachher < 0) warnungen.push(`${u.rows[0].name}: Bestand ${nachher}`);
      gebucht.push({ item_id: itemId, name: u.rows[0].name, menge: diff, bestand: nachher });
    }
    await client.query('COMMIT');
    return { gebucht, warnungen };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// Positionen pruefen; null = ungueltig.
export function positionenLesen(roh: unknown): SollPosition[] | null {
  if (!Array.isArray(roh) || roh.length > 500) return null;
  const aus: SollPosition[] = [];
  for (const p of roh) {
    const id = Number(p?.id);
    const menge = Number(p?.menge);
    if (!Number.isInteger(id) || id === 0 || !Number.isInteger(menge) || menge < 0 || menge > 100000) return null;
    if (p.art !== undefined && p.art !== 'artikel' && p.art !== 'rezept') return null;
    aus.push({ id, menge, ...(p.art ? { art: p.art } : {}) });
  }
  return aus;
}

export function kassenAbgleichEinrichten(d: {
  app: Express; pool: pg.Pool; nurKasse: RequestHandler; broadcast: (x: any) => void;
}): void {
  d.app.put('/api/kasse/bestellungen/:id', d.nurKasse, async (req, res) => {
    const orderId = Number(req.params.id);
    const positionen = positionenLesen(req.body?.positionen);
    if (!Number.isInteger(orderId) || orderId <= 0 || !positionen) {
      return res.status(400).json({ error: 'Bestellnummer und positionen [{id, menge}] noetig' });
    }
    const quelle = typeof req.body?.quelle === 'string' && /^[a-z0-9-]{1,20}$/.test(req.body.quelle) ? req.body.quelle : 'kasse';
    try {
      const erg = await bestellungAbgleichen(d.pool, orderId, positionen, quelle);
      for (const g of erg.gebucht) d.broadcast({ type: 'stock_updated', item_id: g.item_id });
      res.json({ success: true, ...erg });
    } catch (e: any) {
      console.error(`Kassen-Abgleich #${orderId}:`, e);
      res.status(500).json({ error: String(e?.message || e) });
    }
  });
}
