// ---------------------------------------------------------------------------
// Kassen-Protokoll fuer die Fehlersuche im Nachhinein (Oktober 2026)
//
// kassen_ereignisse: was auf den Geraeten passiert (native App, Web-Kasse)
// und was der Server selbst bemerkt (Druckfehler, Abgleich). Die Geraete
// schicken gesammelt an POST /api/kasse/ereignisse - bewusst OHNE Anmeldung,
// damit auch Anmeldefehler ankommen (dafuer Groessen- und Ratenlimit). Der
// T400 reicht seine Ereignisse jede Minute an die Cloud weiter; dort liegt
// alles beisammen. Aufbewahrung 120 Tage.
//
// Abfragen (Cloud, psql):
//   SELECT zeit, geraet, quelle, version, ort, typ, bestellung, meldung, daten
//   FROM kassen_ereignisse WHERE zeit > now() - interval '1 day' ORDER BY zeit;
//
// Ausserdem: audit_log bekommt die Geraetekennung und die Fehlermeldung jeder
// Antwort mit Status >= 400 (siehe index.ts).
// ---------------------------------------------------------------------------
import type express from 'express';
import type pg from 'pg';

export async function protokollSchema(pool: pg.Pool): Promise<void> {
  await pool.query('ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS geraet TEXT');
  await pool.query(`CREATE TABLE IF NOT EXISTS kassen_ereignisse (
      id BIGSERIAL PRIMARY KEY,
      zeit TIMESTAMPTZ NOT NULL,
      empfangen TIMESTAMPTZ DEFAULT now(),
      standort TEXT,
      geraet TEXT,
      quelle TEXT,
      version TEXT,
      ort TEXT,
      typ TEXT NOT NULL,
      bestellung INTEGER,
      meldung TEXT,
      daten JSONB,
      ip TEXT,
      weitergeleitet BOOLEAN DEFAULT false)`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_kassen_ereignisse_zeit ON kassen_ereignisse (zeit DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_kassen_ereignisse_geraet ON kassen_ereignisse (geraet, zeit DESC)');
}

const kurz = (v: unknown, n: number): string | null =>
  v === undefined || v === null ? null : String(v).slice(0, n);

interface Ereignis {
  zeit?: string; geraet?: string; quelle?: string; version?: string; ort?: string;
  typ: string; bestellung?: number | null; meldung?: string; daten?: unknown;
}

let standortName = 'cloud';

async function speichern(pool: pg.Pool, liste: Ereignis[], ip: string | null, standort: string): Promise<number> {
  let n = 0;
  for (const e of liste.slice(0, 100)) {
    if (!e || typeof e.typ !== 'string') continue;
    const zeit = e.zeit && !Number.isNaN(Date.parse(e.zeit)) ? e.zeit : new Date().toISOString();
    let daten: string | null = null;
    if (e.daten !== undefined) {
      daten = JSON.stringify(e.daten);
      if (daten.length > 4000) daten = JSON.stringify({ gekuerzt: daten.slice(0, 3900) });
    }
    await pool.query(
      `INSERT INTO kassen_ereignisse (zeit, standort, geraet, quelle, version, ort, typ, bestellung, meldung, daten, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)`,
      [zeit, standort, kurz(e.geraet, 64), kurz(e.quelle, 20), kurz(e.version, 40), kurz(e.ort, 20), kurz(e.typ, 60),
       Number.isInteger(e.bestellung) ? e.bestellung : null, kurz(e.meldung, 1000), daten, kurz(ip, 45)]);
    n++;
  }
  return n;
}

/** Ereignis des Servers selbst (Druckfehler, Abgleich ...) */
export function serverEreignis(pool: pg.Pool, typ: string, meldung: string, extra: { bestellung?: number; daten?: unknown } = {}): void {
  speichern(pool, [{ typ, meldung, quelle: 'server', bestellung: extra.bestellung, daten: extra.daten }], null, standortName)
    .catch(() => { /* Protokoll darf nie stoeren */ });
}

export function protokollEinrichten(d: {
  app: express.Express; pool: pg.Pool; orderApiKey: string; vorOrt: boolean; cloudUrl: string;
  ip: (req: express.Request) => string;
}): void {
  const { app, pool } = d;
  standortName = d.vorOrt ? 't400' : 'cloud';

  // Geraete melden gesammelt (ohne Anmeldung, siehe oben). Ratenlimit je IP.
  const zaehler = new Map<string, { n: number; seit: number }>();
  app.post('/api/kasse/ereignisse', async (req, res) => {
    const ip = d.ip(req);
    const jetzt = Date.now();
    const z = zaehler.get(ip);
    if (!z || z.seit < jetzt - 60000) zaehler.set(ip, { n: 1, seit: jetzt });
    else if (++z.n > 60) return res.status(429).json({ error: 'zu viele Meldungen' });
    const liste = Array.isArray(req.body?.ereignisse) ? req.body.ereignisse : [];
    try {
      res.json({ gespeichert: await speichern(pool, liste, ip, standortName) });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Fehler' });
    }
  });

  // Cloud: Ereignisse, die der T400 weiterreicht
  app.post('/api/internal/ereignisse', async (req, res) => {
    if (req.headers['x-order-api-key'] !== d.orderApiKey) return res.status(401).json({ error: 'Invalid API key' });
    const liste = Array.isArray(req.body?.ereignisse) ? req.body.ereignisse : [];
    let n = 0;
    for (const e of liste.slice(0, 500)) {
      try {
        await pool.query(
          `INSERT INTO kassen_ereignisse (zeit, empfangen, standort, geraet, quelle, version, ort, typ, bestellung, meldung, daten, ip, weitergeleitet)
           VALUES ($1, $2, 't400', $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, true)`,
          [e.zeit, e.empfangen, e.geraet, e.quelle, e.version, e.ort, String(e.typ || 'unbekannt').slice(0, 60),
           e.bestellung ?? null, e.meldung, e.daten === null || e.daten === undefined ? null : JSON.stringify(e.daten), e.ip]);
        n++;
      } catch { /* einzelne kaputte Zeile ueberspringen */ }
    }
    res.json({ gespeichert: n });
  });

  // Aufraeumen: einmal pro Stunde, aelter als 120 Tage
  setInterval(() => {
    pool.query("DELETE FROM kassen_ereignisse WHERE zeit < now() - interval '120 days'").catch(() => {});
  }, 60 * 60 * 1000);

  if (!d.vorOrt) return;
  // T400 -> Cloud, jede Minute
  setInterval(async () => {
    try {
      const r = await pool.query(
        `SELECT id, zeit, empfangen, geraet, quelle, version, ort, typ, bestellung, meldung, daten, ip
         FROM kassen_ereignisse WHERE NOT weitergeleitet ORDER BY id LIMIT 500`);
      if (!r.rows.length) return;
      const a = await fetch(`${d.cloudUrl}/api/internal/ereignisse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Order-API-Key': d.orderApiKey },
        body: JSON.stringify({ ereignisse: r.rows }),
        signal: AbortSignal.timeout(15000),
      });
      if (a.ok) {
        await pool.query('UPDATE kassen_ereignisse SET weitergeleitet = true WHERE id = ANY($1)', [r.rows.map((x) => x.id)]);
      }
    } catch { /* ohne Internet: spaeter */ }
  }, 60 * 1000);
}
