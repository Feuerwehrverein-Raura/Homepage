// ---------------------------------------------------------------------------
// Kassen-Anmeldebon (Oktober 2026)
//
// Ein Bon vom Bondrucker mit QR-Code, der ein Geraet als Kasse anmeldet -
// ohne persoenliches Konto. Gilt EINMAL und eine Stunde (wie der Anmeldebon
// fuer Mitglieder); ein liegengebliebener Bon ist danach wertlos.
// QR-Inhalt: {"v":1,"type":"fwv-kasse-bon","code":"..."} (src/qrcode.ts).
//
// Drucken: in der Kasse (Einstellungen), im Vorstandsbereich und in der
// Mitglieder-App unter Zugaenge (ueber api-members -> /api/internal/kassenbon).
// Die Cloud erreicht den Drucker im Schopf nicht: sie legt den Bon mit
// druck_offen an, der T400 holt offene Bons ab, druckt sie am Bar-Drucker
// und meldet sie als gedruckt (kassenbonDruckdienst unten). Die Bons liegen in der Cloud; der
// T400 holt sich den Code dort, solange Internet da ist, und legt ihn sonst
// selbst an (dann nur am T400 einloesbar). Einloesen am T400: zuerst lokal,
// sonst in der Cloud nachfragen.
// ---------------------------------------------------------------------------
import crypto from 'crypto';
import type pg from 'pg';

export const KASSENBON_MINUTEN = 60;

export async function kassenbonSchema(pool: pg.Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS kassen_bons (
      code TEXT PRIMARY KEY,
      erstellt_von TEXT,
      erstellt_am TIMESTAMPTZ DEFAULT now(),
      gilt_bis TIMESTAMPTZ NOT NULL,
      benutzt_am TIMESTAMPTZ)`);
  await pool.query('ALTER TABLE kassen_bons ADD COLUMN IF NOT EXISTS druck_offen BOOLEAN DEFAULT false');
}

export async function kassenbonAnlegen(pool: pg.Pool, erstelltVon: string, druckOffen = false): Promise<{ code: string; giltBis: Date }> {
  const code = crypto.randomBytes(24).toString('base64url');
  const giltBis = new Date(Date.now() + KASSENBON_MINUTEN * 60000);
  await pool.query('INSERT INTO kassen_bons (code, erstellt_von, gilt_bis, druck_offen) VALUES ($1, $2, $3, $4)',
    [code, erstelltVon.slice(0, 200), giltBis, druckOffen]);
  return { code, giltBis };
}

/** Cloud: noch zu druckende, gueltige Bons (fuer den T400) */
export async function kassenbonsZuDrucken(pool: pg.Pool): Promise<{ code: string; erstellt_von: string; gilt_bis: string }[]> {
  const r = await pool.query(
    `SELECT code, erstellt_von, gilt_bis FROM kassen_bons
     WHERE druck_offen AND benutzt_am IS NULL AND gilt_bis > now() ORDER BY erstellt_am LIMIT 5`);
  return r.rows.map((b) => ({ ...b, gilt_bis: new Date(b.gilt_bis).toISOString() }));
}

export async function kassenbonGedruckt(pool: pg.Pool, code: string): Promise<void> {
  await pool.query('UPDATE kassen_bons SET druck_offen = false WHERE code = $1', [code]);
}

/**
 * T400: offene Bons aus der Cloud holen, lokal uebernehmen (damit sie auch
 * ohne Internet einloesbar sind), drucken, als gedruckt melden. Alle 5 s.
 */
export function kassenbonDruckdienst(d: {
  pool: pg.Pool; cloud: string; schluessel: string;
  drucken: (code: string, giltBis: Date, von: string) => Promise<void>;
}): void {
  let laeuft = false;
  const fehlerGemeldet = new Set<string>();
  setInterval(async () => {
    if (laeuft) return;
    laeuft = true;
    try {
      const r = await fetch(`${d.cloud}/api/internal/kassenbon/offen`, {
        headers: { 'X-Order-API-Key': d.schluessel }, signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) return;
      for (const b of (await r.json()) as { code: string; erstellt_von: string; gilt_bis: string }[]) {
        await d.pool.query(
          'INSERT INTO kassen_bons (code, erstellt_von, gilt_bis) VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING',
          [b.code, b.erstellt_von, b.gilt_bis]);
        try {
          await d.drucken(b.code, new Date(b.gilt_bis), b.erstellt_von);
        } catch (e: any) {
          if (!fehlerGemeldet.has(b.code)) console.error('Anmeldebon aus der Cloud nicht gedruckt:', e?.message || e);
          fehlerGemeldet.add(b.code);
          continue; // naechster Takt versucht es nochmals
        }
        await fetch(`${d.cloud}/api/internal/kassenbon/gedruckt`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Order-API-Key': d.schluessel },
          body: JSON.stringify({ code: b.code }), signal: AbortSignal.timeout(8000),
        });
        console.log(`Anmeldebon aus der Cloud gedruckt (${b.erstellt_von})`);
      }
    } catch {
      // ohne Internet: spaeter
    } finally {
      laeuft = false;
    }
  }, 5000);
}

// Einloesen und Entwerten in einem Zug (zwei gleichzeitige Scans: nur einer gilt).
// 'ok' | 'verbraucht' (gibt es, aber benutzt/abgelaufen) | 'unbekannt'
export async function kassenbonEinloesen(pool: pg.Pool, code: string): Promise<'ok' | 'verbraucht' | 'unbekannt'> {
  const r = await pool.query(
    `UPDATE kassen_bons SET benutzt_am = now() WHERE code = $1 AND benutzt_am IS NULL AND gilt_bis > now() RETURNING code`,
    [code]);
  if (r.rows.length) return 'ok';
  const da = await pool.query('SELECT 1 FROM kassen_bons WHERE code = $1', [code]);
  return da.rows.length ? 'verbraucht' : 'unbekannt';
}

const xml = (t: string) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ePOS-Inhalt des Bons (ohne Huelle).
export function kassenbonXml(code: string, giltBis: Date, erstelltVon: string, logoXml: string): string {
  const inhalt = JSON.stringify({ v: 1, type: 'fwv-kasse-bon', code });
  const zeit = giltBis.toLocaleTimeString('de-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' });
  return `${logoXml}
      <text align="center"/>
      <text em="true" width="2" height="2"/>
      <text>KASSE ANMELDEN&#10;</text>
      <text em="false" width="1" height="1"/>
      <text>&#10;</text>
      <symbol type="qrcode_model_2" level="level_m" width="7" height="7">${xml(inhalt)}</symbol>
      <text>&#10;An Kasse oder Kueche:&#10;"Mit QR-Code anmelden"&#10;und diesen Code scannen.&#10;&#10;</text>
      <text em="true"/>
      <text>Gilt EINMAL bis ${xml(zeit)} Uhr&#10;</text>
      <text em="false"/>
      <text>&#10;Erstellt von ${xml(erstelltVon || 'Kasse')}&#10;</text>
      <feed line="2"/>
      <cut type="feed"/>`;
}
