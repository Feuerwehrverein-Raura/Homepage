// ---------------------------------------------------------------------------
// Kassen-Anmeldebon (Oktober 2026)
//
// Ein Bon vom Bondrucker mit QR-Code, der ein Geraet als Kasse anmeldet -
// ohne persoenliches Konto. Gilt EINMAL und eine Stunde (wie der Anmeldebon
// fuer Mitglieder); ein liegengebliebener Bon ist danach wertlos.
// QR-Inhalt: {"v":1,"type":"fwv-kasse-bon","code":"..."} (src/qrcode.ts).
//
// Drucken: in der Kasse (Einstellungen) und im Vorstandsbereich (ueber
// api-members -> /api/internal/kassenbon). Die Bons liegen in der Cloud; der
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
}

export async function kassenbonAnlegen(pool: pg.Pool, erstelltVon: string): Promise<{ code: string; giltBis: Date }> {
  const code = crypto.randomBytes(24).toString('base64url');
  const giltBis = new Date(Date.now() + KASSENBON_MINUTEN * 60000);
  await pool.query('INSERT INTO kassen_bons (code, erstellt_von, gilt_bis) VALUES ($1, $2, $3)',
    [code, erstelltVon.slice(0, 200), giltBis]);
  return { code, giltBis };
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
