// ---------------------------------------------------------------------------
// Geraete-Freigabe der Kasse (Oktober 2026)
//
// Jede Kasse - native App (flutter/kasse) und PWA (order.fwv-raura.ch) -
// schickt eine Geraetekennung mit (X-Kasse-Geraet, -Name, -Typ). Neue Geraete
// landen automatisch in kassen_geraete. Ist die Freigabe eingeschaltet
// (Einstellung geraete_freigabe = 'an'), duerfen nur freigegebene, nicht
// gesperrte Geraete BUCHEN und BEZAHLEN (SCHREIBEND unten). Ansehen bleibt
// erlaubt; die Kueche (nur lesen/abschliessen) ist nicht betroffen.
//
// Eingefuehrt in zwei Schritten, damit am laufenden Anlass niemand
// ausgesperrt wird: erst erfassen (Freigabe aus), Vorstand gibt die Geraete
// frei, dann einschalten.
//
// Verwaltung: Vorstandsbereich -> api-members /vorstand/kassen-geraete ->
// hier /api/internal/geraete* (X-Order-API-Key). Der T400 holt Liste und
// Einstellung aus der Cloud und meldet dort neue Geraete (src/vorort.ts-Takt).
// ---------------------------------------------------------------------------
import type express from 'express';
import type pg from 'pg';

export const SCHREIBEND: RegExp[] = [
  /^POST \/orders$/,
  /^POST \/orders\/\d+\/items$/,
  /^PUT \/orders\/\d+\/status$/,
  /^POST \/orders\/\d+\/split-payment$/,
  /^POST \/orders\/\d+\/pay-items$/,
  /^POST \/orders\/\d+\/cancel$/,
  /^DELETE \/orders\/\d+\/items\/\d+$/,
  /^POST \/auth\/kassenbon$/,
];

export function istSchreibend(methode: string, pfad: string): boolean {
  const z = `${methode.toUpperCase()} ${pfad.replace(/\/+$/, '')}`;
  return SCHREIBEND.some((re) => re.test(z));
}

export function kennungPruefen(v: unknown): string | null {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null;
}

/** Kurzcode fuer Menschen (auf dem Geraet angezeigt, im Vorstand gesucht) */
export function kurzcode(id: string): string {
  const s = id.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return `${s.slice(0, 4)}-${s.slice(4, 8)}`;
}

export async function geraeteSchema(pool: pg.Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS kassen_geraete (
      id TEXT PRIMARY KEY,
      name TEXT,
      typ TEXT,
      erstes_mal TIMESTAMPTZ DEFAULT now(),
      zuletzt TIMESTAMPTZ DEFAULT now(),
      freigegeben BOOLEAN DEFAULT false,
      gesperrt BOOLEAN DEFAULT false,
      geaendert_von TEXT,
      geaendert_am TIMESTAMPTZ)`);
}

interface Schranke {
  app: express.Express;
  pool: pg.Pool | (() => pg.Pool); // Funktion: Pool wird in index.ts erst spaeter angelegt
  getSetting: (k: string) => Promise<string | null>;
}

interface Abh extends Omit<Schranke, 'pool'> {
  pool: pg.Pool;
  orderApiKey: string;
  setSetting: (k: string, v: string) => Promise<void>;
  vorOrt: boolean;
  cloudUrl: string;
}

// Kleiner Speicher: zuletzt-Zeit nicht bei jeder Anfrage schreiben
const gesehen = new Map<string, number>();

/** Erfassen und (falls eingeschaltet) durchsetzen - direkt nach der Auth-Schranke einhaengen */
export function geraeteSchranke(d: Schranke): void {
  const { app } = d;
  const db = () => (typeof d.pool === 'function' ? d.pool() : d.pool);

  async function melden(id: string, name: string | null, typ: string | null): Promise<void> {
    const jetzt = Date.now();
    if ((gesehen.get(id) || 0) > jetzt - 60000) return;
    gesehen.set(id, jetzt);
    await db().query(
      `INSERT INTO kassen_geraete (id, name, typ) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET zuletzt = now(),
         name = COALESCE(kassen_geraete.name, EXCLUDED.name), typ = COALESCE(EXCLUDED.typ, kassen_geraete.typ)`,
      [id, name, typ]);
  }

  app.use('/api', async (req, res, next) => {
    if (req.method === 'OPTIONS') return next();
    const id = kennungPruefen(req.headers['x-kasse-geraet']);
    const name = typeof req.headers['x-kasse-geraet-name'] === 'string' ? String(req.headers['x-kasse-geraet-name']).slice(0, 80) : null;
    const typ = req.headers['x-kasse-geraet-typ'] === 'app' ? 'app' : req.headers['x-kasse-geraet-typ'] === 'pwa' ? 'pwa' : null;
    if (id) melden(id, name, typ).catch(() => {});
    if (!istSchreibend(req.method, req.path)) return next();
    let g: { freigegeben: boolean; gesperrt: boolean } | undefined;
    try {
      if ((await d.getSetting('geraete_freigabe')) !== 'an') return next();
      if (id) g = (await db().query('SELECT freigegeben, gesperrt FROM kassen_geraete WHERE id = $1', [id])).rows[0];
    } catch {
      return next(); // Datenbank weg: die eigentliche Route meldet den Fehler
    }
    if (!id) {
      return res.status(403).json({ code: 'geraet_unbekannt', error: 'Dieses Gerät ist nicht angemeldet - bitte die Kasse neu laden.' });
    }
    if (g && g.freigegeben && !g.gesperrt) return next();
    return res.status(403).json({
      code: 'geraet_nicht_freigegeben',
      geraet: kurzcode(id),
      error: g?.gesperrt
        ? `Dieses Gerät (${kurzcode(id)}) ist gesperrt.`
        : `Dieses Gerät (${kurzcode(id)}) ist noch nicht freigegeben - bitte beim Vorstand freigeben lassen.`,
    });
  });
}

/** Verwaltung (intern, X-Order-API-Key) und Abgleich T400 <-> Cloud */
export function geraeteEinrichten(d: Abh): void {
  const { app, pool, orderApiKey } = d;

  const schluessel = (req: express.Request, res: express.Response) => {
    if (req.headers['x-order-api-key'] !== orderApiKey) {
      res.status(401).json({ error: 'Invalid API key' });
      return false;
    }
    return true;
  };

  // Liste fuer den Vorstand (und den T400)
  app.get('/api/internal/geraete', async (req, res) => {
    if (!schluessel(req, res)) return;
    const r = await pool.query(`SELECT id, name, typ, erstes_mal, zuletzt, freigegeben, gesperrt, geaendert_von, geaendert_am
                                FROM kassen_geraete ORDER BY zuletzt DESC NULLS LAST`);
    res.json({
      modus: (await d.getSetting('geraete_freigabe')) === 'an' ? 'an' : 'aus',
      geraete: r.rows.map((g) => ({ ...g, code: kurzcode(g.id) })),
    });
  });

  // Freigeben / sperren / umbenennen
  app.put('/api/internal/geraete/:id', async (req, res) => {
    if (!schluessel(req, res)) return;
    const id = kennungPruefen(req.params.id);
    if (!id) return res.status(400).json({ error: 'Ungueltige Geraetekennung' });
    const b = req.body || {};
    const r = await pool.query(
      `UPDATE kassen_geraete SET
         freigegeben = COALESCE($2, freigegeben), gesperrt = COALESCE($3, gesperrt),
         name = COALESCE($4, name), geaendert_von = $5, geaendert_am = now()
       WHERE id = $1 RETURNING id`,
      [id, typeof b.freigegeben === 'boolean' ? b.freigegeben : null, typeof b.gesperrt === 'boolean' ? b.gesperrt : null,
       typeof b.name === 'string' && b.name.trim() ? b.name.trim().slice(0, 80) : null, String(b.von || 'Vorstand').slice(0, 100)]);
    if (!r.rows.length) return res.status(404).json({ error: 'Gerät nicht gefunden' });
    gesehen.delete(id);
    res.json({ ok: true });
  });

  // Durchsetzung ein/aus
  app.put('/api/internal/geraete-modus', async (req, res) => {
    if (!schluessel(req, res)) return;
    const an = req.body?.an === true;
    await d.setSetting('geraete_freigabe', an ? 'an' : 'aus');
    res.json({ modus: an ? 'an' : 'aus' });
  });

  // T400 meldet Geraete, die nur er kennt
  app.post('/api/internal/geraete/melden', async (req, res) => {
    if (!schluessel(req, res)) return;
    const liste = Array.isArray(req.body?.geraete) ? req.body.geraete.slice(0, 200) : [];
    for (const g of liste) {
      const id = kennungPruefen(g?.id);
      if (!id) continue;
      await pool.query(
        `INSERT INTO kassen_geraete (id, name, typ, erstes_mal, zuletzt) VALUES ($1, $2, $3, COALESCE($4::timestamptz, now()), COALESCE($5::timestamptz, now()))
         ON CONFLICT (id) DO UPDATE SET zuletzt = GREATEST(kassen_geraete.zuletzt, EXCLUDED.zuletzt)`,
        [id, g.name ?? null, g.typ ?? null, g.erstes_mal ?? null, g.zuletzt ?? null]);
    }
    res.json({ ok: true });
  });

  if (!d.vorOrt) return;

  // T400: Liste aus der Cloud uebernehmen (Freigabe/Sperre/Name sind dort
  // fuehrend), eigene neue Geraete dorthin melden. Alle 2 min.
  async function abgleichen(): Promise<void> {
    try {
      const lokal = (await pool.query('SELECT id, name, typ, erstes_mal, zuletzt FROM kassen_geraete')).rows;
      await fetch(`${d.cloudUrl}/api/internal/geraete/melden`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Order-API-Key': orderApiKey },
        body: JSON.stringify({ geraete: lokal }),
        signal: AbortSignal.timeout(10000),
      });
      const r = await fetch(`${d.cloudUrl}/api/internal/geraete`, {
        headers: { 'X-Order-API-Key': orderApiKey }, signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) return;
      const daten: any = await r.json();
      for (const g of daten.geraete || []) {
        await pool.query(
          `INSERT INTO kassen_geraete (id, name, typ, freigegeben, gesperrt) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, freigegeben = EXCLUDED.freigegeben, gesperrt = EXCLUDED.gesperrt`,
          [g.id, g.name, g.typ, !!g.freigegeben, !!g.gesperrt]);
      }
      if (daten.modus === 'an' || daten.modus === 'aus') await d.setSetting('geraete_freigabe', daten.modus);
    } catch {
      // ohne Internet: letzter Stand gilt
    }
  }
  setInterval(abgleichen, 2 * 60 * 1000);
  setTimeout(abgleichen, 8000);
}
