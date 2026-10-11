/**
 * Ausleihe: Tabellen, Routen, Benachrichtigungen, Erinnerungen. Die Regeln
 * (Verfuegbarkeit, Texte, Rueckgabe, Erinnerungen) stehen in ausleihe.ts.
 *
 * Wer darf was (authenticateAusleihe in auth.ts):
 *  - jedes Mitglied (Authentik-Token der Mitglieder-App/-Web): Angebot
 *    sehen, fuer sich ausleihen (ohne Freigabe), eigene Ausleihen sehen und
 *    absagen, solange reserviert
 *  - Gruppe Lager/Vorstand/admin (und die Inventar-PWA): alle Ausleihen,
 *    Externe erfassen, ausgeben, zuruecknehmen, Fotos, "ausleihbar" setzen
 *
 * Routen (alle unter /api):
 *   GET  ausleihe/angebot?von=&bis=      ausleihbare Artikel und Kisten, frei
 *   POST ausleihe                        neue Ausleihe (409 bei Ueberbuchung)
 *   GET  ausleihe/meine                  eigene Ausleihen
 *   GET  ausleihe?filter=                Lager: aktuell|kommend|ausgegeben|
 *                                        ueberfaellig|erledigt
 *   GET  ausleihe/ueberfaellig           Lager: ueberfaellige
 *   GET  ausleihe/:id                    eigene oder Lager
 *   POST ausleihe/:id/absagen            eigene (reserviert) oder Lager
 *   POST ausleihe/:id/ausgeben           Lager: bucht aus ("Ausleihe #id")
 *   POST ausleihe/:id/zuruecknehmen      Lager: bucht Zurueckgekommenes ein
 *   POST ausleihe/:id/fotos              Lager: Schadenfoto (multipart image)
 *   DELETE ausleihe/:id/fotos/:fotoId    Lager
 *   PATCH items/:id/ausleihbar           Lager {ausleihbar}
 *   PATCH locations/:id/ausleihbar       Lager {ausleihbar}
 *   POST ausleihe/erinnerungen           intern (x-order-api-key): Job jetzt
 *
 * Umgebung (alle optional; ohne Key wird nichts verschickt):
 *   DISPATCH_API_URL   (http://api-dispatch:3000)  E-Mail: POST /email/send
 *   DISPATCH_API_KEY   = API_KEY des Haupt-Stacks (x-api-key)
 *   MEMBERS_API_URL    (http://api-members:3000)   Push an Mitglieder
 *   INTERNAL_API_KEY   = INTERNAL_API_KEY des Haupt-Stacks (X-Internal-Key)
 *   LAGER_EMAIL        (lager@fwv-raura.ch)        Meldungen ans Lager
 *   AUSLEIHE_ERINNERUNG_ENABLED  (false)           taegliche Erinnerungen
 */

import type { Express, NextFunction, RequestHandler, Response } from 'express';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { authenticateAusleihe, authenticateToken, AuthenticatedRequest } from './auth.js';
import {
  anfragePruefen, appBlock, ArtikelBestand, AusleiheZeile, Bedarf, Belegung,
  datumText, ErinnerungsZeile, faelligeErinnerungen, heuteZuerich, istDatum, mengeText,
  rueckgabePruefen, verfuegbarkeit, Zustand, ZUSTAND_TEXT, zeitraumText
} from './ausleihe.js';

type Pool = pg.Pool;
type Client = pg.PoolClient;

/** Ein Schluessel fuer pg_advisory_xact_lock: Anlegen/Ausgeben nacheinander. */
const SPERRE = 4_711_2026;

// ---------------------------------------------------------------------------
// Tabellen

export async function ausleiheTabellen(pool: Pool) {
  await pool.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS ausleihbar BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS ausleihbar BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ausleihen (
      id SERIAL PRIMARY KEY,
      status VARCHAR(20) NOT NULL DEFAULT 'reserviert'
        CHECK (status IN ('reserviert', 'ausgegeben', 'zurueckgegeben', 'abgesagt')),
      von DATE NOT NULL,
      bis DATE NOT NULL,
      art VARCHAR(10) NOT NULL CHECK (art IN ('mitglied', 'extern')),
      mitglied_email VARCHAR(255),
      mitglied_name VARCHAR(255),
      extern_name VARCHAR(255),
      extern_organisation VARCHAR(255),
      extern_telefon VARCHAR(100),
      extern_email VARCHAR(255),
      notizen TEXT,
      rueckgabe_notiz TEXT,
      erstellt_von VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ausgegeben_at TIMESTAMP,
      ausgegeben_von VARCHAR(255),
      zurueckgegeben_at TIMESTAMP,
      zurueckgegeben_von VARCHAR(255),
      abgesagt_at TIMESTAMP,
      abgesagt_von VARCHAR(255),
      erinnert_vorher_am DATE,
      erinnert_ueberfaellig_am DATE,
      CHECK (bis >= von)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ausleihen_status ON ausleihen(status, von, bis)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ausleihen_mitglied ON ausleihen(LOWER(mitglied_email))`);
  // Eine Position: Artikel mit Menge oder ganze Kiste (Lagerort). Name und
  // Einheit werden beim Anlegen festgehalten (Artikel koennen umbenannt
  // oder deaktiviert werden).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ausleihe_positionen (
      id SERIAL PRIMARY KEY,
      ausleihe_id INTEGER NOT NULL REFERENCES ausleihen(id) ON DELETE CASCADE,
      art VARCHAR(10) NOT NULL CHECK (art IN ('artikel', 'kiste')),
      item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
      location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
      name VARCHAR(255) NOT NULL,
      einheit VARCHAR(50),
      menge INTEGER NOT NULL DEFAULT 1 CHECK (menge > 0),
      zurueck_menge INTEGER,
      zustand VARCHAR(20) CHECK (zustand IN ('ok', 'beschaedigt', 'fehlt')),
      schaden TEXT,
      zurueck_at TIMESTAMP
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ausleihe_pos ON ausleihe_positionen(ausleihe_id)`);
  // Inhalt einer Kiste, festgehalten beim Ausgeben, mit Rueckgabe je Zeile.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ausleihe_kisten_inhalt (
      id SERIAL PRIMARY KEY,
      position_id INTEGER NOT NULL REFERENCES ausleihe_positionen(id) ON DELETE CASCADE,
      item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
      name VARCHAR(255) NOT NULL,
      einheit VARCHAR(50),
      menge INTEGER NOT NULL CHECK (menge > 0),
      zurueck_menge INTEGER,
      zustand VARCHAR(20) CHECK (zustand IN ('ok', 'beschaedigt', 'fehlt')),
      schaden TEXT
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ausleihe_inhalt ON ausleihe_kisten_inhalt(position_id)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ausleihe_fotos (
      id SERIAL PRIMARY KEY,
      ausleihe_id INTEGER NOT NULL REFERENCES ausleihen(id) ON DELETE CASCADE,
      position_id INTEGER REFERENCES ausleihe_positionen(id) ON DELETE SET NULL,
      image_url TEXT NOT NULL,
      hochgeladen_von VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// ---------------------------------------------------------------------------
// Benachrichtigungen (Fehler nur loggen — die Ausleihe gilt trotzdem)

function env(name: string, standard = ''): string {
  return (process.env[name] || standard).trim();
}

export const lagerEmail = () => env('LAGER_EMAIL', 'lager@fwv-raura.ch');

async function mailSenden(to: string | null | undefined, subject: string, body: string) {
  const key = env('DISPATCH_API_KEY');
  if (!to) return;
  if (!key) {
    console.warn(`Ausleihe: DISPATCH_API_KEY fehlt — keine E-Mail an ${to} ("${subject}")`);
    return;
  }
  try {
    const r = await fetch(`${env('DISPATCH_API_URL', 'http://api-dispatch:3000')}/email/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      body: JSON.stringify({ to, subject, body }),
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) console.error(`Ausleihe: E-Mail an ${to} fehlgeschlagen (${r.status})`);
  } catch (e: any) {
    console.error('Ausleihe: E-Mail fehlgeschlagen:', e?.message);
  }
}

/** Push an ein Mitglied ueber api-members (Mitglied per E-Mail gesucht). */
async function pushAnMitglied(email: string | null | undefined, title: string, body: string, ausleiheId: number) {
  const key = env('INTERNAL_API_KEY');
  if (!email || !key) return;
  const basis = env('MEMBERS_API_URL', 'http://api-members:3000');
  try {
    const r = await fetch(`${basis}/internal/member-id-by-email?email=${encodeURIComponent(email)}`, {
      headers: { 'X-Internal-Key': key },
      signal: AbortSignal.timeout(5000)
    });
    if (!r.ok) return;
    const memberId = (await r.json() as any)?.memberId;
    if (!memberId) return;
    await fetch(`${basis}/internal/push-to-member`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Key': key },
      body: JSON.stringify({
        memberId, notificationType: 'general', title, body,
        data: { typ: 'ausleihe', ausleiheId: String(ausleiheId) }
      }),
      signal: AbortSignal.timeout(5000)
    });
  } catch (e: any) {
    console.error('Ausleihe: Push fehlgeschlagen:', e?.message);
  }
}

const GRUSS = '\n\nMit freundlichen Grüssen\nFeuerwehrverein Raura';

function positionenListe(a: AusleiheJson): string {
  return a.positionen.map((p) => `- ${p.menge_text}`).join('\n');
}

function empfaenger(a: AusleiheJson): { email: string | null; name: string } {
  return a.art === 'extern'
    ? { email: a.extern_email, name: a.extern_name || '' }
    : { email: a.mitglied_email, name: a.mitglied_name || '' };
}

function neueAusleiheMelden(a: AusleiheJson) {
  const wer = a.app.ausleiher_text;
  const notiz = a.notizen ? `\n\nNotiz: ${a.notizen}` : '';
  void mailSenden(
    lagerEmail(),
    `Neue Ausleihe #${a.id}: ${wer}, ${a.app.zeitraum_text}`,
    `Guten Tag\n\n${wer}${a.mitglied_email ? ` (${a.mitglied_email})` : ''} hat in der App ausgeliehen:\n\n` +
    `Zeitraum: ${a.app.zeitraum_text}\n${positionenListe(a)}${notiz}\n\n` +
    `Ausgeben und Zurücknehmen in der Mitglieder-App unter Lager → Ausleihen.${GRUSS}`
  );
  if (a.art !== 'mitglied') return;
  const titel = `Ausleihe #${a.id} reserviert`;
  void mailSenden(
    a.mitglied_email,
    `Bestätigung: ${titel}`,
    `Guten Tag ${a.mitglied_name || ''}\n\nIhre Ausleihe ist reserviert:\n\n` +
    `Zeitraum: ${a.app.zeitraum_text}\n${positionenListe(a)}${notiz}\n\n` +
    `Abholen und Zurückbringen bitte nach Absprache mit dem Lager (${lagerEmail()}). ` +
    `Absagen können Sie in der App unter «Meine Ausleihen», solange nichts abgeholt ist.${GRUSS}`
  );
  void pushAnMitglied(a.mitglied_email, titel, `${a.app.zeitraum_text}: ${a.positionen.map((p) => p.menge_text).join(', ')}`, a.id);
}

function absageMelden(a: AusleiheJson, von: string) {
  void mailSenden(
    lagerEmail(),
    `Ausleihe #${a.id} abgesagt: ${a.app.ausleiher_text}, ${a.app.zeitraum_text}`,
    `Guten Tag\n\n${von} hat die Ausleihe #${a.id} abgesagt:\n\n${positionenListe(a)}${GRUSS}`
  );
}

// ---------------------------------------------------------------------------
// Laden und Anzeige

export type AusleiheJson = AusleiheZeile & {
  extern_telefon: string | null;
  extern_email: string | null;
  notizen: string | null;
  rueckgabe_notiz: string | null;
  erstellt_von: string | null;
  positionen: any[];
  fotos: any[];
  app: ReturnType<typeof appBlock>;
  [k: string]: any;
};

const AUSLEIHE_SPALTEN = `
  id, status, von::text AS von, bis::text AS bis, art, mitglied_email, mitglied_name,
  extern_name, extern_organisation, extern_telefon, extern_email, notizen, rueckgabe_notiz,
  erstellt_von, created_at, ausgegeben_at, ausgegeben_von, zurueckgegeben_at, zurueckgegeben_von,
  abgesagt_at, abgesagt_von`;

function eigene(a: { art: string; mitglied_email: string | null }, email: string | undefined): boolean {
  return a.art === 'mitglied' && !!email && (a.mitglied_email || '').toLowerCase() === email.toLowerCase();
}

/** Ausleihen mit Positionen, Kisten-Inhalt, Fotos und app-Block. */
async function ausleihenLaden(
  db: Pool | Client,
  where: string,
  params: any[],
  sicht: { lager: boolean; email?: string },
  ordnung = 'von, id'
): Promise<AusleiheJson[]> {
  const heute = heuteZuerich();
  const r = await db.query(`SELECT ${AUSLEIHE_SPALTEN} FROM ausleihen WHERE ${where} ORDER BY ${ordnung}`, params);
  if (r.rows.length === 0) return [];
  const ids = r.rows.map((a) => a.id);
  const pos = await db.query(
    `SELECT id, ausleihe_id, art, item_id, location_id, name, einheit, menge, zurueck_menge, zustand, schaden, zurueck_at
     FROM ausleihe_positionen WHERE ausleihe_id = ANY($1::int[]) ORDER BY art, name, id`, [ids]);
  const posIds = pos.rows.map((p) => p.id);
  const inhalt = posIds.length === 0 ? { rows: [] as any[] } : await db.query(
    `SELECT id, position_id, item_id, name, einheit, menge, zurueck_menge, zustand, schaden
     FROM ausleihe_kisten_inhalt WHERE position_id = ANY($1::int[]) ORDER BY name, id`, [posIds]);
  // Reservierte Kisten: heutigen Inhalt zeigen (festgehalten wird beim Ausgeben).
  const kistenIds = pos.rows.filter((p) => p.art === 'kiste' && p.location_id != null).map((p) => p.location_id);
  const heutig = kistenIds.length === 0 ? { rows: [] as any[] } : await db.query(
    `SELECT il.location_id, il.item_id, i.name, i.unit AS einheit, il.quantity AS menge
     FROM item_locations il JOIN items i ON i.id = il.item_id AND i.active = true
     WHERE il.location_id = ANY($1::int[]) AND il.quantity > 0 ORDER BY i.name, il.id`, [kistenIds]);
  const fotos = await db.query(
    `SELECT id, ausleihe_id, position_id, image_url, hochgeladen_von, created_at
     FROM ausleihe_fotos WHERE ausleihe_id = ANY($1::int[]) ORDER BY id`, [ids]);

  return r.rows.map((a) => {
    const positionen = pos.rows.filter((p) => p.ausleihe_id === a.id).map((p) => {
      const festgehalten = inhalt.rows.filter((i) => i.position_id === p.id);
      const zeilen = p.art === 'kiste'
        ? (festgehalten.length > 0 || a.status !== 'reserviert'
          ? festgehalten
          : heutig.rows.filter((h) => h.location_id === p.location_id).map((h) => ({
            id: null, position_id: p.id, item_id: h.item_id, name: h.name, einheit: h.einheit,
            menge: h.menge, zurueck_menge: null, zustand: null, schaden: null
          })))
        : [];
      const { ausleihe_id: _x, ...rest } = p;
      return {
        ...rest,
        menge_text: p.art === 'kiste' ? p.name : `${mengeText(p.menge, p.einheit)} ${p.name}`,
        zustand_text: p.zustand ? ZUSTAND_TEXT[p.zustand as Zustand] : null,
        inhalt: zeilen.map((z) => ({
          ...z,
          menge_text: `${mengeText(z.menge, z.einheit)} ${z.name}`,
          zustand_text: z.zustand ? ZUSTAND_TEXT[z.zustand as Zustand] : null
        }))
      };
    });
    return {
      ...a,
      positionen,
      fotos: fotos.rows.filter((f) => f.ausleihe_id === a.id).map(({ ausleihe_id: _y, ...f }) => f),
      app: appBlock(a, heute, { lager: sicht.lager, eigene: eigene(a, sicht.email) })
    } as AusleiheJson;
  });
}

async function eineLaden(db: Pool | Client, id: number, req: AuthenticatedRequest): Promise<AusleiheJson | null> {
  const [a] = await ausleihenLaden(db, 'id = $1', [id], { lager: !!req.lager, email: req.user?.email });
  return a ?? null;
}

// ---------------------------------------------------------------------------
// Verfuegbarkeit aus der Datenbank

async function verfuegbarkeitLaden(db: Pool | Client, von: string, bis: string, heute: string) {
  const artikel = await db.query(`
    SELECT i.id, i.quantity AS bestand, COALESCE(u.menge, 0)::int AS unterwegs
    FROM items i
    LEFT JOIN (
      SELECT item_id, SUM(menge) AS menge FROM (
        SELECT p.item_id, p.menge FROM ausleihe_positionen p
          JOIN ausleihen a ON a.id = p.ausleihe_id
          WHERE a.status = 'ausgegeben' AND p.art = 'artikel' AND p.item_id IS NOT NULL
        UNION ALL
        SELECT ki.item_id, ki.menge FROM ausleihe_kisten_inhalt ki
          JOIN ausleihe_positionen p ON p.id = ki.position_id
          JOIN ausleihen a ON a.id = p.ausleihe_id
          WHERE a.status = 'ausgegeben' AND ki.item_id IS NOT NULL
      ) t GROUP BY item_id
    ) u ON u.item_id = i.id
    WHERE i.active = true`);
  const belegungen = await db.query(`
    WITH a AS (
      SELECT id, status FROM ausleihen
      WHERE status IN ('reserviert', 'ausgegeben')
        AND von <= $2::date
        AND (CASE WHEN status = 'ausgegeben' AND bis < $3::date THEN $3::date ELSE bis END) >= $1::date
    )
    SELECT p.item_id, NULL::int AS location_id, p.menge FROM ausleihe_positionen p
      JOIN a ON a.id = p.ausleihe_id WHERE p.art = 'artikel' AND p.item_id IS NOT NULL
    UNION ALL
    SELECT NULL, p.location_id, 1 FROM ausleihe_positionen p
      JOIN a ON a.id = p.ausleihe_id WHERE p.art = 'kiste' AND p.location_id IS NOT NULL
    UNION ALL
    SELECT ki.item_id, NULL, ki.menge FROM ausleihe_kisten_inhalt ki
      JOIN ausleihe_positionen p ON p.id = ki.position_id
      JOIN a ON a.id = p.ausleihe_id WHERE a.status = 'ausgegeben' AND ki.item_id IS NOT NULL
    UNION ALL
    SELECT il.item_id, NULL, il.quantity FROM item_locations il
      JOIN ausleihe_positionen p ON p.art = 'kiste' AND p.location_id = il.location_id
      JOIN a ON a.id = p.ausleihe_id WHERE a.status = 'reserviert' AND il.quantity > 0`,
  [von, bis, heute]);
  return verfuegbarkeit(
    artikel.rows.map((r) => ({ id: r.id, bestand: Number(r.bestand) || 0, unterwegs: Number(r.unterwegs) || 0 }) as ArtikelBestand),
    belegungen.rows as Belegung[]
  );
}

/** Zeitraum aus Abfrage/Koerper pruefen. */
function zeitraumLesen(von: unknown, bis: unknown, heute: string): { von: string; bis: string } | string {
  if (!istDatum(von) || !istDatum(bis)) return 'Bitte einen Zeitraum wählen (von und bis, JJJJ-MM-TT).';
  if (bis < von) return 'Das Rückgabedatum liegt vor dem Abholdatum.';
  if (von < heute) return 'Der Zeitraum liegt in der Vergangenheit.';
  return { von, bis };
}

// ---------------------------------------------------------------------------
// Erinnerungen

export async function erinnerungenSenden(pool: Pool): Promise<{ id: number; art: string }[]> {
  const heute = heuteZuerich();
  const r = await pool.query(`
    SELECT id, status, bis::text AS bis, erinnert_vorher_am::text AS erinnert_vorher_am,
           erinnert_ueberfaellig_am::text AS erinnert_ueberfaellig_am
    FROM ausleihen WHERE status = 'ausgegeben' ORDER BY id`);
  const faellig = faelligeErinnerungen(r.rows as ErinnerungsZeile[], heute);
  const gesendet: { id: number; art: string }[] = [];
  for (const f of faellig) {
    // Zuerst merken (hoechstens einmal pro Tag, auch wenn der Versand hakt).
    const spalte = f.art === 'vorher' ? 'erinnert_vorher_am' : 'erinnert_ueberfaellig_am';
    const upd = await pool.query(
      `UPDATE ausleihen SET ${spalte} = $2::date WHERE id = $1 AND status = 'ausgegeben'
         AND (${spalte} IS NULL OR ${spalte} < $2::date) RETURNING id`, [f.id, heute]);
    if (upd.rowCount === 0) continue;
    const [a] = await ausleihenLaden(pool, 'id = $1', [f.id], { lager: false });
    if (!a) continue;
    const an = empfaenger(a);
    const liste = positionenListe(a);
    if (f.art === 'vorher') {
      const titel = `Erinnerung: Ausleihe #${a.id} morgen zurückbringen`;
      await mailSenden(an.email, titel,
        `Guten Tag ${an.name}\n\nBitte bringen Sie das Ausgeliehene morgen, ${datumText(a.bis)}, zurück:\n\n` +
        `${liste}\n\nFragen ans Lager: ${lagerEmail()}${GRUSS}`);
      if (a.art === 'mitglied') await pushAnMitglied(a.mitglied_email, titel, `Rückgabe bis ${datumText(a.bis)}`, a.id);
    } else {
      const titel = `Ausleihe #${a.id} ist überfällig`;
      await mailSenden(an.email, titel,
        `Guten Tag ${an.name}\n\nDie Rückgabe war am ${datumText(a.bis)} fällig. ` +
        `Bitte bringen Sie das Ausgeliehene so bald wie möglich zurück oder melden Sie sich beim Lager (${lagerEmail()}):\n\n` +
        `${liste}${GRUSS}`);
      if (a.art === 'mitglied') await pushAnMitglied(a.mitglied_email, titel, `Rückgabe war am ${datumText(a.bis)} fällig`, a.id);
      if (f.erstes) {
        await mailSenden(lagerEmail(), `Überfällig: Ausleihe #${a.id} (${a.app.ausleiher_text})`,
          `Guten Tag\n\nDie Ausleihe #${a.id} von ${a.app.ausleiher_text} war am ${datumText(a.bis)} zurück fällig:\n\n` +
          `${liste}\n\nKontakt: ${[an.email, a.extern_telefon].filter(Boolean).join(', ') || '–'}${GRUSS}`);
      }
    }
    gesendet.push({ id: a.id, art: f.art });
  }
  return gesendet;
}

export function erinnerungenAktiv(): boolean {
  return env('AUSLEIHE_ERINNERUNG_ENABLED').toLowerCase() === 'true';
}

/** Taeglicher Job (stuendlich geprueft; gemerkt wird pro Tag). Nur mit AUSLEIHE_ERINNERUNG_ENABLED=true. */
export function erinnerungenPlanen(pool: Pool) {
  if (!erinnerungenAktiv()) {
    console.log('Ausleihe-Erinnerungen aus (AUSLEIHE_ERINNERUNG_ENABLED)');
    return;
  }
  const lauf = () => erinnerungenSenden(pool).catch((e) => console.error('Ausleihe-Erinnerungen:', e));
  setInterval(lauf, 60 * 60 * 1000);
  setTimeout(lauf, 60 * 1000);
  console.log('Ausleihe-Erinnerungen aktiv');
}

// ---------------------------------------------------------------------------
// Routen

interface Einrichtung {
  app: Express;
  pool: Pool;
  upload: { single(feld: string): RequestHandler };
  uploadDir: string;
  broadcast: (data: any) => void;
  orderApiKey: string;
}

function nurLager(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.lager) {
    return res.status(403).json({ error: 'Das darf nur die Gruppe Lager (oder der Vorstand).' });
  }
  next();
}

const t = (v: unknown, max = 255): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
};

function idAus(wert: string): number | null {
  const n = Number(wert);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function ausleiheEinrichten({ app, pool, upload, uploadDir, broadcast, orderApiKey }: Einrichtung) {
  const fehler = (res: Response, e: unknown, wo: string) => {
    console.error(`Ausleihe ${wo}:`, e);
    res.status(500).json({ error: 'Database error' });
  };

  // ---- ausleihbar setzen (Lager) ------------------------------------------
  for (const [pfad, tabelle] of [['/api/items/:id/ausleihbar', 'items'], ['/api/locations/:id/ausleihbar', 'locations']] as const) {
    app.patch(pfad, authenticateToken, async (req: AuthenticatedRequest, res) => {
      try {
        const id = idAus(req.params.id);
        if (!id) return res.status(400).json({ error: 'Ungültige id' });
        if (typeof req.body?.ausleihbar !== 'boolean') return res.status(400).json({ error: 'ausleihbar muss true oder false sein.' });
        const r = await pool.query(`UPDATE ${tabelle} SET ausleihbar = $2 WHERE id = $1 RETURNING *`, [id, req.body.ausleihbar]);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Nicht gefunden' });
        broadcast({ type: tabelle === 'items' ? 'item_updated' : 'location_updated', id });
        res.json(r.rows[0]);
      } catch (e) { fehler(res, e, 'ausleihbar'); }
    });
  }

  // ---- Angebot -------------------------------------------------------------
  app.get('/api/ausleihe/angebot', authenticateAusleihe, async (req: AuthenticatedRequest, res) => {
    try {
      const heute = heuteZuerich();
      const z = zeitraumLesen(req.query.von, req.query.bis, heute);
      if (typeof z === 'string') return res.status(400).json({ error: z });
      const v = await verfuegbarkeitLaden(pool, z.von, z.bis, heute);
      const artikel = await pool.query(`
        SELECT i.id, i.name, i.unit AS einheit, i.description AS beschreibung, i.image_url,
               c.name AS kategorie
        FROM items i LEFT JOIN categories c ON c.id = i.category_id
        WHERE i.active = true AND i.ausleihbar = true
        ORDER BY c.name NULLS LAST, i.name`);
      const kisten = await pool.query(`
        SELECT id, name, description AS beschreibung FROM locations WHERE ausleihbar = true ORDER BY name`);
      const inhalt = await pool.query(`
        SELECT il.location_id, il.item_id, i.name, i.unit AS einheit, il.quantity AS menge
        FROM item_locations il JOIN items i ON i.id = il.item_id AND i.active = true
        JOIN locations l ON l.id = il.location_id AND l.ausleihbar = true
        WHERE il.quantity > 0 ORDER BY i.name`);
      res.json({
        von: z.von,
        bis: z.bis,
        zeitraum_text: zeitraumText(z.von, z.bis),
        artikel: artikel.rows.map((a) => {
          const frei = v.frei.get(a.id) ?? 0;
          return { ...a, frei, frei_text: frei > 0 ? `${mengeText(frei, a.einheit)} frei` : 'Ausgebucht' };
        }),
        kisten: kisten.rows.map((k) => {
          const frei = !v.kistenBelegt.has(k.id);
          return {
            ...k,
            frei,
            frei_text: frei ? 'Frei' : 'Schon ausgeliehen',
            inhalt: inhalt.rows.filter((i) => i.location_id === k.id).map(({ location_id: _l, ...i }) => ({
              ...i, menge_text: `${mengeText(i.menge, i.einheit)} ${i.name}`
            }))
          };
        })
      });
    } catch (e) { fehler(res, e, 'angebot'); }
  });

  // ---- Neue Ausleihe -------------------------------------------------------
  app.post('/api/ausleihe', authenticateAusleihe, async (req: AuthenticatedRequest, res) => {
    const heute = heuteZuerich();
    const b = req.body || {};
    const z = zeitraumLesen(b.von, b.bis, heute);
    if (typeof z === 'string') return res.status(400).json({ error: z });
    const extern = b.extern && typeof b.extern === 'object' ? b.extern : null;
    if (extern && !req.lager) return res.status(403).json({ error: 'Ausleihen für Externe erfasst die Gruppe Lager.' });
    if (extern && !t(extern.name)) return res.status(400).json({ error: 'Bei Externen braucht es einen Namen.' });
    const email = t(req.user?.email);
    if (!extern && !email) return res.status(400).json({ error: 'In Ihrem Konto fehlt die E-Mail-Adresse.' });

    // Positionen zusammenfassen
    const artikelMengen = new Map<number, number>();
    const kistenIds = new Set<number>();
    for (const p of Array.isArray(b.positionen) ? b.positionen : []) {
      if (p?.location_id != null) {
        const id = Number(p.location_id);
        if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Ungültige Kiste.' });
        kistenIds.add(id);
      } else {
        const id = Number(p?.item_id);
        const menge = Number(p?.menge);
        if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Ungültiger Artikel.' });
        if (!Number.isInteger(menge) || menge <= 0) return res.status(400).json({ error: 'Die Menge muss eine ganze Zahl über 0 sein.' });
        artikelMengen.set(id, (artikelMengen.get(id) ?? 0) + menge);
      }
    }
    if (artikelMengen.size === 0 && kistenIds.size === 0) {
      return res.status(400).json({ error: 'Bitte mindestens einen Artikel oder eine Kiste wählen.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [SPERRE]);
      const artikel = await client.query(
        `SELECT id, name, unit AS einheit, ausleihbar FROM items WHERE id = ANY($1::int[]) AND active = true`,
        [[...artikelMengen.keys()]]);
      const kisten = await client.query(
        `SELECT id, name, ausleihbar FROM locations WHERE id = ANY($1::int[])`, [[...kistenIds]]);
      if (artikel.rows.length !== artikelMengen.size || kisten.rows.length !== kistenIds.size) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Ein Artikel oder eine Kiste wurde nicht gefunden.' });
      }
      const inhalt = await client.query(`
        SELECT il.location_id, il.item_id, i.name, i.unit AS einheit, il.quantity AS menge
        FROM item_locations il JOIN items i ON i.id = il.item_id AND i.active = true
        WHERE il.location_id = ANY($1::int[]) AND il.quantity > 0`, [[...kistenIds]]);
      const bedarf: Bedarf = {
        artikel: artikel.rows.map((a) => ({ item_id: a.id, menge: artikelMengen.get(a.id)!, name: a.name, einheit: a.einheit, ausleihbar: a.ausleihbar })),
        kisten: kisten.rows.map((k) => ({
          location_id: k.id, name: k.name, ausleihbar: k.ausleihbar,
          inhalt: inhalt.rows.filter((i) => i.location_id === k.id)
        }))
      };
      const v = await verfuegbarkeitLaden(client, z.von, z.bis, heute);
      const problem = anfragePruefen(bedarf, v, zeitraumText(z.von, z.bis));
      if (problem) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: problem });
      }
      const neu = await client.query(`
        INSERT INTO ausleihen (von, bis, art, mitglied_email, mitglied_name, extern_name, extern_organisation,
                               extern_telefon, extern_email, notizen, erstellt_von)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`, [
        z.von, z.bis, extern ? 'extern' : 'mitglied',
        extern ? null : email, extern ? null : t(req.user?.name) ?? email,
        extern ? t(extern.name) : null, extern ? t(extern.organisation) : null,
        extern ? t(extern.telefon, 100) : null, extern ? t(extern.email) : null,
        t(b.notizen, 2000), email
      ]);
      const id = neu.rows[0].id;
      for (const a of bedarf.artikel) {
        await client.query(
          `INSERT INTO ausleihe_positionen (ausleihe_id, art, item_id, name, einheit, menge) VALUES ($1, 'artikel', $2, $3, $4, $5)`,
          [id, a.item_id, a.name, a.einheit, a.menge]);
      }
      for (const k of bedarf.kisten) {
        await client.query(
          `INSERT INTO ausleihe_positionen (ausleihe_id, art, location_id, name, menge) VALUES ($1, 'kiste', $2, $3, 1)`,
          [id, k.location_id, k.name]);
      }
      await client.query('COMMIT');
      const a = (await eineLaden(pool, id, req))!;
      broadcast({ type: 'ausleihe', id });
      // Externe erfasst das Lager selbst — dann keine Meldung.
      if (a.art === 'mitglied') neueAusleiheMelden(a);
      res.status(201).json(a);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      fehler(res, e, 'anlegen');
    } finally {
      client.release();
    }
  });

  // ---- Listen --------------------------------------------------------------
  app.get('/api/ausleihe/meine', authenticateAusleihe, async (req: AuthenticatedRequest, res) => {
    try {
      const email = t(req.user?.email);
      if (!email) return res.json([]);
      res.json(await ausleihenLaden(pool,
        `art = 'mitglied' AND LOWER(mitglied_email) = LOWER($1)
         AND (status IN ('reserviert', 'ausgegeben') OR von >= CURRENT_DATE - 365)`,
        [email], { lager: !!req.lager, email },
        `CASE WHEN status IN ('reserviert', 'ausgegeben') THEN 0 ELSE 1 END,
         CASE WHEN status IN ('reserviert', 'ausgegeben') THEN von END ASC, von DESC, id DESC`));
    } catch (e) { fehler(res, e, 'meine'); }
  });

  const FILTER: Record<string, { where: string; ordnung: string }> = {
    aktuell: { where: `status IN ('reserviert', 'ausgegeben')`, ordnung: 'von, id' },
    kommend: { where: `status = 'reserviert'`, ordnung: 'von, id' },
    ausgegeben: { where: `status = 'ausgegeben'`, ordnung: 'bis, id' },
    ueberfaellig: { where: `status = 'ausgegeben' AND bis < $1::date`, ordnung: 'bis, id' },
    erledigt: {
      where: `status IN ('zurueckgegeben', 'abgesagt') AND COALESCE(zurueckgegeben_at, abgesagt_at, created_at) > NOW() - INTERVAL '1 year'`,
      ordnung: 'COALESCE(zurueckgegeben_at, abgesagt_at, created_at) DESC, id DESC'
    }
  };

  const liste = async (req: AuthenticatedRequest, res: Response, filter: string) => {
    const f = FILTER[filter];
    if (!f) return res.status(400).json({ error: `Unbekannter Filter. Möglich: ${Object.keys(FILTER).join(', ')}` });
    try {
      const params = f.where.includes('$1') ? [heuteZuerich()] : [];
      res.json(await ausleihenLaden(pool, f.where, params, { lager: true, email: req.user?.email }, f.ordnung));
    } catch (e) { fehler(res, e, 'liste'); }
  };

  app.get('/api/ausleihe', authenticateAusleihe, nurLager, (req: AuthenticatedRequest, res) =>
    liste(req, res, typeof req.query.filter === 'string' ? req.query.filter : 'aktuell'));
  app.get('/api/ausleihe/ueberfaellig', authenticateAusleihe, nurLager, (req: AuthenticatedRequest, res) =>
    liste(req, res, 'ueberfaellig'));

  // ---- Erinnerungen jetzt (intern) ----------------------------------------
  app.post('/api/ausleihe/erinnerungen', async (req, res) => {
    if (!orderApiKey || req.headers['x-order-api-key'] !== orderApiKey) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    if (!erinnerungenAktiv()) return res.json({ aktiv: false, gesendet: [] });
    try {
      res.json({ aktiv: true, gesendet: await erinnerungenSenden(pool) });
    } catch (e) { fehler(res, e, 'erinnerungen'); }
  });

  // ---- Eine Ausleihe -------------------------------------------------------
  app.get('/api/ausleihe/:id(\\d+)', authenticateAusleihe, async (req: AuthenticatedRequest, res) => {
    try {
      const a = await eineLaden(pool, Number(req.params.id), req);
      if (!a || (!req.lager && !eigene(a, req.user?.email))) return res.status(404).json({ error: 'Ausleihe nicht gefunden' });
      res.json(a);
    } catch (e) { fehler(res, e, 'detail'); }
  });

  app.post('/api/ausleihe/:id(\\d+)/absagen', authenticateAusleihe, async (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      const vorher = await eineLaden(pool, id, req);
      if (!vorher || (!req.lager && !eigene(vorher, req.user?.email))) return res.status(404).json({ error: 'Ausleihe nicht gefunden' });
      if (vorher.status !== 'reserviert') {
        return res.status(409).json({ error: vorher.status === 'ausgegeben'
          ? 'Schon ausgegeben — bitte beim Lager zurückgeben.'
          : `Die Ausleihe ist schon ${vorher.app.status_text.toLowerCase()}.` });
      }
      const r = await pool.query(
        `UPDATE ausleihen SET status = 'abgesagt', abgesagt_at = NOW(), abgesagt_von = $2
         WHERE id = $1 AND status = 'reserviert' RETURNING id`, [id, req.user?.email || null]);
      if (r.rowCount === 0) return res.status(409).json({ error: 'Die Ausleihe hat sich inzwischen geändert.' });
      const a = (await eineLaden(pool, id, req))!;
      broadcast({ type: 'ausleihe', id });
      if (!req.lager) absageMelden(a, a.app.ausleiher_text);
      res.json(a);
    } catch (e) { fehler(res, e, 'absagen'); }
  });

  // ---- Ausgeben (Lager) ----------------------------------------------------
  app.post('/api/ausleihe/:id(\\d+)/ausgeben', authenticateAusleihe, nurLager, async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [SPERRE]);
      const a = await client.query(`SELECT id, status FROM ausleihen WHERE id = $1 FOR UPDATE`, [id]);
      if (a.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Ausleihe nicht gefunden' }); }
      if (a.rows[0].status !== 'reserviert') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Nur reservierte Ausleihen lassen sich ausgeben.' });
      }
      const pos = await client.query(`SELECT * FROM ausleihe_positionen WHERE ausleihe_id = $1 ORDER BY id`, [id]);
      // Kisten-Inhalt jetzt festhalten
      const buchen: { item_id: number; menge: number; name: string }[] = [];
      for (const p of pos.rows) {
        if (p.art === 'artikel') {
          if (p.item_id != null) buchen.push({ item_id: p.item_id, menge: p.menge, name: p.name });
          continue;
        }
        if (p.location_id == null) continue;
        await client.query(`DELETE FROM ausleihe_kisten_inhalt WHERE position_id = $1`, [p.id]);
        const inhalt = await client.query(`
          SELECT il.item_id, i.name, i.unit AS einheit, il.quantity AS menge
          FROM item_locations il JOIN items i ON i.id = il.item_id AND i.active = true
          WHERE il.location_id = $1 AND il.quantity > 0 ORDER BY i.name`, [p.location_id]);
        for (const i of inhalt.rows) {
          await client.query(
            `INSERT INTO ausleihe_kisten_inhalt (position_id, item_id, name, einheit, menge) VALUES ($1, $2, $3, $4, $5)`,
            [p.id, i.item_id, i.name, i.einheit, i.menge]);
          buchen.push({ item_id: i.item_id, menge: i.menge, name: i.name });
        }
      }
      for (const b of buchen) {
        const it = await client.query(`SELECT quantity FROM items WHERE id = $1 FOR UPDATE`, [b.item_id]);
        const vorher = Number(it.rows[0]?.quantity ?? 0);
        if (vorher < b.menge) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: `Nicht genug an Lager: «${b.name}» (Bestand: ${vorher}, gebraucht: ${b.menge}).` });
        }
        await client.query(`UPDATE items SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [vorher - b.menge, b.item_id]);
        await client.query(`
          INSERT INTO transactions (item_id, type, quantity, previous_quantity, new_quantity, reason, user_email)
          VALUES ($1, 'out', $2, $3, $4, $5, $6)`,
        [b.item_id, b.menge, vorher, vorher - b.menge, `Ausleihe #${id}`, req.user?.email || null]);
      }
      await client.query(
        `UPDATE ausleihen SET status = 'ausgegeben', ausgegeben_at = NOW(), ausgegeben_von = $2 WHERE id = $1`,
        [id, req.user?.email || null]);
      await client.query('COMMIT');
      for (const b of buchen) broadcast({ type: 'stock_updated', item_id: b.item_id });
      broadcast({ type: 'ausleihe', id });
      res.json(await eineLaden(pool, id, req));
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      fehler(res, e, 'ausgeben');
    } finally {
      client.release();
    }
  });

  // ---- Zuruecknehmen (Lager) -----------------------------------------------
  // Koerper: { positionen: [{ id, zurueck, zustand, schaden,
  //            inhalt: [{ id, zurueck, zustand, schaden }] }], notiz }
  // Fehlende Positionen/Zeilen: alles zurueck, in Ordnung.
  app.post('/api/ausleihe/:id(\\d+)/zuruecknehmen', authenticateAusleihe, nurLager, async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    const eingabe = new Map<number, any>();
    for (const p of Array.isArray(req.body?.positionen) ? req.body.positionen : []) {
      if (p && Number.isInteger(Number(p.id))) eingabe.set(Number(p.id), p);
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const a = await client.query(`SELECT id, status FROM ausleihen WHERE id = $1 FOR UPDATE`, [id]);
      if (a.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Ausleihe nicht gefunden' }); }
      if (a.rows[0].status !== 'ausgegeben') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Nur ausgegebene Ausleihen lassen sich zurücknehmen.' });
      }
      const pos = await client.query(`SELECT * FROM ausleihe_positionen WHERE ausleihe_id = $1 ORDER BY id`, [id]);
      const inhalt = await client.query(
        `SELECT * FROM ausleihe_kisten_inhalt WHERE position_id = ANY($1::int[]) ORDER BY id`,
        [pos.rows.map((p) => p.id)]);

      type Zeile = { tabelle: 'ausleihe_positionen' | 'ausleihe_kisten_inhalt'; id: number; item_id: number | null;
        location_id: number | null; name: string; menge: number; zurueck: number; zustand: Zustand; schaden: string | null };
      const zeilen: Zeile[] = [];
      const kistenZustand: { id: number; zustand: Zustand; schaden: string | null }[] = [];
      const lesen = (roh: any, menge: number, name: string): { zurueck: number; zustand: Zustand; schaden: string | null } | string => {
        const e = roh ?? { zurueck: menge, zustand: 'ok' };
        const zurueck = e.zurueck ?? menge;
        const zustand = e.zustand ?? (Number(zurueck) === menge ? 'ok' : undefined);
        const problem = rueckgabePruefen({ menge, zurueck, zustand }, name);
        return problem ?? { zurueck: Number(zurueck), zustand, schaden: t(e.schaden, 2000) };
      };
      for (const p of pos.rows) {
        const e = eingabe.get(p.id);
        if (p.art === 'artikel') {
          const r = lesen(e, p.menge, p.name);
          if (typeof r === 'string') { await client.query('ROLLBACK'); return res.status(400).json({ error: r }); }
          zeilen.push({ tabelle: 'ausleihe_positionen', id: p.id, item_id: p.item_id, location_id: null, name: p.name, menge: p.menge, ...r });
          continue;
        }
        const roheZeilen = new Map<number, any>();
        for (const z of Array.isArray(e?.inhalt) ? e.inhalt : []) {
          if (z && Number.isInteger(Number(z.id))) roheZeilen.set(Number(z.id), z);
        }
        let schlimmst: Zustand = 'ok';
        for (const i of inhalt.rows.filter((x) => x.position_id === p.id)) {
          const r = lesen(roheZeilen.get(i.id), i.menge, i.name);
          if (typeof r === 'string') { await client.query('ROLLBACK'); return res.status(400).json({ error: r }); }
          zeilen.push({ tabelle: 'ausleihe_kisten_inhalt', id: i.id, item_id: i.item_id, location_id: p.location_id, name: i.name, menge: i.menge, ...r });
          if (r.zustand === 'fehlt' || (r.zustand === 'beschaedigt' && schlimmst === 'ok')) schlimmst = r.zustand;
        }
        // Die Kiste selbst: Zustand aus der Eingabe (z.B. Kiste kaputt), sonst
        // der schlimmste ihres Inhalts.
        const eigen = ['ok', 'beschaedigt', 'fehlt'].includes(e?.zustand) ? e.zustand as Zustand : 'ok';
        const rang = { ok: 0, beschaedigt: 1, fehlt: 2 } as const;
        kistenZustand.push({ id: p.id, zustand: rang[eigen] > rang[schlimmst] ? eigen : schlimmst, schaden: t(e?.schaden, 2000) });
      }

      const geaendert = new Set<number>();
      for (const z of zeilen) {
        await client.query(
          `UPDATE ${z.tabelle} SET zurueck_menge = $2, zustand = $3, schaden = $4${z.tabelle === 'ausleihe_positionen' ? ', zurueck_at = NOW()' : ''} WHERE id = $1`,
          [z.id, z.zurueck, z.zustand, z.schaden]);
        if (z.item_id == null) continue;
        const it = await client.query(`SELECT quantity FROM items WHERE id = $1 FOR UPDATE`, [z.item_id]);
        if (it.rows.length === 0) continue;
        let bestand = Number(it.rows[0].quantity) || 0;
        if (z.zurueck > 0) {
          await client.query(`UPDATE items SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [bestand + z.zurueck, z.item_id]);
          await client.query(`
            INSERT INTO transactions (item_id, type, quantity, previous_quantity, new_quantity, reason, user_email)
            VALUES ($1, 'in', $2, $3, $4, $5, $6)`,
          [z.item_id, z.zurueck, bestand, bestand + z.zurueck, `Rückgabe Ausleihe #${id}`, req.user?.email || null]);
          bestand += z.zurueck;
          geaendert.add(z.item_id);
        }
        const weg = z.menge - z.zurueck;
        if (weg > 0) {
          // Bleibt ausgebucht (wurde beim Ausgeben schon abgezogen) — im
          // Verlauf festhalten, warum.
          const was = z.zustand === 'fehlt' ? 'fehlt' : 'beschädigt';
          await client.query(`
            INSERT INTO transactions (item_id, type, quantity, previous_quantity, new_quantity, reason, user_email)
            VALUES ($1, 'correction', $2, $2, $2, $3, $4)`,
          [z.item_id, bestand, `Ausleihe #${id}: ${weg} ${was}${z.schaden ? ` (${z.schaden})` : ''} — bleibt ausgebucht`, req.user?.email || null]);
          if (z.location_id != null) {
            // Aus der Kiste ist es weg.
            await client.query(
              `UPDATE item_locations SET quantity = GREATEST(0, quantity - $3) WHERE location_id = $1 AND item_id = $2`,
              [z.location_id, z.item_id, weg]);
          }
          geaendert.add(z.item_id);
        }
      }
      for (const k of kistenZustand) {
        await client.query(
          `UPDATE ausleihe_positionen SET zurueck_menge = 1, zustand = $2, schaden = $3, zurueck_at = NOW() WHERE id = $1`,
          [k.id, k.zustand, k.schaden]);
      }
      await client.query(
        `UPDATE ausleihen SET status = 'zurueckgegeben', zurueckgegeben_at = NOW(), zurueckgegeben_von = $2,
           rueckgabe_notiz = $3 WHERE id = $1`,
        [id, req.user?.email || null, t(req.body?.notiz, 2000)]);
      await client.query('COMMIT');
      for (const i of geaendert) broadcast({ type: 'stock_updated', item_id: i });
      broadcast({ type: 'ausleihe', id });
      res.json(await eineLaden(pool, id, req));
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      fehler(res, e, 'zuruecknehmen');
    } finally {
      client.release();
    }
  });

  // ---- Fotos (Schaeden) ----------------------------------------------------
  const fotoPruefen = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const r = await pool.query(`SELECT id FROM ausleihen WHERE id = $1`, [Number(req.params.id)]).catch(() => null);
    if (!r || r.rows.length === 0) return res.status(404).json({ error: 'Ausleihe nicht gefunden' });
    next();
  };

  app.post('/api/ausleihe/:id(\\d+)/fotos', authenticateAusleihe, nurLager, fotoPruefen, upload.single('image'),
    async (req: AuthenticatedRequest, res) => {
      try {
        if (!req.file) return res.status(400).json({ error: 'Kein Foto' });
        const id = Number(req.params.id);
        let positionId: number | null = null;
        if (req.body?.position_id) {
          const p = await pool.query(`SELECT id FROM ausleihe_positionen WHERE id = $1 AND ausleihe_id = $2`, [Number(req.body.position_id), id]);
          positionId = p.rows[0]?.id ?? null;
        }
        const r = await pool.query(
          `INSERT INTO ausleihe_fotos (ausleihe_id, position_id, image_url, hochgeladen_von)
           VALUES ($1, $2, $3, $4) RETURNING id, position_id, image_url, hochgeladen_von, created_at`,
          [id, positionId, `/api/uploads/${req.file.filename}`, req.user?.email || null]);
        broadcast({ type: 'ausleihe', id });
        res.status(201).json(r.rows[0]);
      } catch (e) { fehler(res, e, 'foto'); }
    });

  app.delete('/api/ausleihe/:id(\\d+)/fotos/:fotoId(\\d+)', authenticateAusleihe, nurLager, async (req: AuthenticatedRequest, res) => {
    try {
      const r = await pool.query(
        `DELETE FROM ausleihe_fotos WHERE id = $1 AND ausleihe_id = $2 RETURNING image_url`,
        [Number(req.params.fotoId), Number(req.params.id)]);
      if (r.rows.length === 0) return res.status(404).json({ error: 'Foto nicht gefunden' });
      const url: string = r.rows[0].image_url;
      if (url.startsWith('/api/uploads/')) {
        const datei = path.join(uploadDir, path.basename(url));
        fs.promises.unlink(datei).catch(() => {});
      }
      res.json({ success: true });
    } catch (e) { fehler(res, e, 'foto loeschen'); }
  });
}
