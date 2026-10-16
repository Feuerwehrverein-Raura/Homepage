// ---------------------------------------------------------------------------
// Bon-Bausteine (Oktober 2026)
//
// Reine Funktionen ohne Drucker und Datenbank, damit sie getestet werden
// koennen (npm test): Wortumbruch, XML-Escaping und der Rezept-Bon.
//
// Rezept-Bon: Rezepte, die an einem Anlass dazukommen, aus dem Inventar auf
// den Bondrucker (Kueche/Bar). Zeilenbreiten fuer 80-mm-Drucker, Schrift A:
// 48 Zeichen normal, 24 Zeichen bei doppelter Breite.
// ---------------------------------------------------------------------------

// Bestellnummer fuer Menschen: Der T400 zaehlt ab 500000 (src/vorort.ts),
// angezeigt wird "L-12" (lokal, T400) bzw. "S-7" (Server/Cloud).
export const LOKAL_AB = 500000;
export function bestellNr(id: number | string): string {
  const n = Number(id);
  if (!Number.isFinite(n)) return String(id);
  return n >= LOKAL_AB ? `L-${n - LOKAL_AB}` : `S-${n}`;
}

export const BREITE_NORMAL = 48;
export const BREITE_DOPPELT = 24;
// Obergrenze fuer Beschreibung und Anleitung (je), damit ein versehentlich
// eingefuegter Roman nicht meterweise Papier frisst.
export const TEXT_MAX = 4000;
export const FAKTOR_MAX = 100;

// XML-Sonderzeichen escapen fuer ePOS-Print
export function escapeXml(str: string): string {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Bon-Zeile mit Wortumbruch: "1x " + Name auf Breite [breite]; Folgezeilen
// werden auf die Laenge des Praefixes eingerueckt. Zu lange Woerter werden
// notfalls doch geteilt.
export function bonUmbruch(praefix: string, name: string, breite: number): string[] {
  const einzug = ' '.repeat(praefix.length);
  const zeilen: string[] = [];
  let zeile = praefix;
  let leer = true;
  for (let wort of String(name).split(/\s+/).filter(Boolean)) {
    while (wort.length > breite - einzug.length) {
      // Wort laenger als eine ganze Zeile: hart teilen.
      if (!leer) { zeilen.push(zeile); zeile = einzug; }
      zeilen.push(zeile + wort.slice(0, breite - zeile.length));
      wort = wort.slice(breite - zeile.length);
      zeile = einzug; leer = true;
    }
    if (!wort) continue;
    if (!leer && zeile.length + 1 + wort.length > breite) {
      zeilen.push(zeile); zeile = einzug + wort;
    } else {
      zeile += (leer ? '' : ' ') + wort;
    }
    leer = false;
  }
  zeilen.push(zeile);
  return zeilen;
}

// --- Rezept ----------------------------------------------------------------

export interface RezeptZutat {
  name: string;
  menge: number | null;
  einheit: string | null;
  notiz: string | null;
  optional: boolean;
}

export interface Rezept {
  id: number;
  name: string;
  kategorie: string | null;
  portionen: number | null;       // recipes.servings (Basis des Rezepts)
  zubereitung_min: number | null; // recipes.prep_time_minutes
  beschreibung: string | null;
  anleitung: string | null;
  zutaten: RezeptZutat[];
}

const zahl = (v: any): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const text = (v: any): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
};

// Antwort von GET /api/recipes/:id des Inventars -> Rezept.
export function rezeptAusInventar(r: any): Rezept | null {
  if (!r || r.id === undefined || r.id === null || !text(r.name)) return null;
  const zutaten = (Array.isArray(r.ingredients) ? r.ingredients : []).map((z: any) => ({
    name: text(z?.item_name) || 'Zutat',
    menge: zahl(z?.quantity),
    einheit: text(z?.unit) || text(z?.item_unit),
    notiz: text(z?.notes),
    optional: z?.optional === true,
  }));
  // Pflicht-Zutaten zuerst, sonst wie geliefert (Inventar: nach Name).
  zutaten.sort((a: RezeptZutat, b: RezeptZutat) => Number(a.optional) - Number(b.optional));
  return {
    id: Number(r.id),
    name: text(r.name)!,
    kategorie: text(r.category_name),
    portionen: zahl(r.servings),
    zubereitung_min: zahl(r.prep_time_minutes),
    beschreibung: text(r.description),
    anleitung: text(r.instructions),
    zutaten,
  };
}

// Faktor aus dem Request: Standard 1, sonst > 0 und hoechstens FAKTOR_MAX,
// auf zwei Stellen gerundet. Unsinn -> null.
export function faktorPruefen(v: any): number | null {
  if (v === undefined || v === null || v === '') return 1;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > FAKTOR_MAX) return null;
  const r = Math.round(n * 100) / 100;
  return r > 0 ? r : null;
}

// Zahl lesbar: ab 100 ganz, ab 10 eine Stelle, sonst zwei Stellen,
// ohne Nullen am Ende ("1.5", "250", "0.33").
export function zahlText(n: number): string {
  const stellen = Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 10 ? 1 : 2;
  const f = 10 ** stellen;
  const r = Math.round(n * f) / f;
  return String(Object.is(r, -0) ? 0 : r);
}

// "500 g", "3 Stk", "" (ohne Menge)
export function mengeText(menge: number | null, einheit: string | null, faktor: number): string {
  if (menge === null) return einheit || '';
  return [zahlText(menge * faktor), einheit].filter(Boolean).join(' ');
}

function kuerzen(t: string, max = TEXT_MAX): string {
  return t.length > max ? t.slice(0, max).trimEnd() + ' ...' : t;
}

// Fliesstext mit Absaetzen: jede Zeile fuer sich umbrechen, Leerzeilen bleiben
// (hoechstens eine hintereinander).
export function textUmbruch(t: string, breite = BREITE_NORMAL): string[] {
  const aus: string[] = [];
  for (const absatz of kuerzen(t).replace(/\r\n?/g, '\n').split('\n')) {
    if (!absatz.trim()) {
      if (aus.length && aus[aus.length - 1] !== '') aus.push('');
      continue;
    }
    aus.push(...bonUmbruch('', absatz.replace(/\t/g, ' '), breite));
  }
  while (aus.length && aus[aus.length - 1] === '') aus.pop();
  return aus;
}

export interface RezeptBonTeile {
  titel: string[];   // Rezeptname, doppelte Breite (24)
  info: string[];    // Kategorie, Portionen, Zeit (48)
  zutaten: string[]; // "- 500 g Mehl (Notiz)" (48)
  texte: { ueberschrift: string; zeilen: string[] }[];
  fuss: string[];    // Datum/Uhrzeit, Anlass
}

export interface RezeptBonOptionen {
  anlass?: string | null;
  jetzt?: Date;
}

function datumZeit(d: Date): string {
  const datum = d.toLocaleDateString('de-CH', { timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', year: 'numeric' });
  const zeit = d.toLocaleTimeString('de-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' });
  return `${datum} ${zeit}`;
}

// Inhalt des Rezept-Bons, unabhaengig vom Drucker-Protokoll.
export function rezeptBonTeile(rezept: Rezept, faktor: number, opt: RezeptBonOptionen = {}): RezeptBonTeile {
  const info: string[] = [];
  if (rezept.kategorie) info.push(`Kategorie: ${rezept.kategorie}`);
  if (faktor !== 1) {
    const p = rezept.portionen ? ` = ${zahlText(rezept.portionen * faktor)} Portionen` : '';
    info.push(`Menge: ${zahlText(faktor)}x Rezept${p}`);
  } else if (rezept.portionen) {
    info.push(`Portionen: ${zahlText(rezept.portionen)}`);
  }
  if (rezept.zubereitung_min) info.push(`Zubereitung: ${zahlText(rezept.zubereitung_min)} Min.`);

  const zutaten: string[] = [];
  for (const z of rezept.zutaten) {
    const teile = [mengeText(z.menge, z.einheit, faktor), z.name];
    if (z.notiz) teile.push(`(${z.notiz})`);
    if (z.optional) teile.push('(optional)');
    zutaten.push(...bonUmbruch('- ', teile.filter(Boolean).join(' '), BREITE_NORMAL));
  }

  const texte: RezeptBonTeile['texte'] = [];
  if (rezept.beschreibung) texte.push({ ueberschrift: 'Beschreibung', zeilen: textUmbruch(rezept.beschreibung) });
  if (rezept.anleitung) texte.push({ ueberschrift: 'Anleitung', zeilen: textUmbruch(rezept.anleitung) });

  const fuss = [datumZeit(opt.jetzt || new Date())];
  if (opt.anlass) fuss.push(...bonUmbruch('', opt.anlass, BREITE_NORMAL));

  return { titel: bonUmbruch('', rezept.name, BREITE_DOPPELT), info, zutaten, texte, fuss };
}

const LINIE = '='.repeat(BREITE_NORMAL);
const STRICH = '-'.repeat(BREITE_NORMAL);
const xmlZeilen = (zeilen: string[]) => `<text>${zeilen.map(escapeXml).join('&#10;')}&#10;</text>`;

// ePOS-Print-XML (ohne SOAP-Huelle) fuer den Rezept-Bon.
export function rezeptBonXml(rezept: Rezept, faktor: number, opt: RezeptBonOptionen & { logoXml?: string } = {}): string {
  const t = rezeptBonTeile(rezept, faktor, opt);
  const teile: string[] = [];
  if (opt.logoXml) teile.push(opt.logoXml);
  teile.push('<text align="center" font="font_a" em="true" width="3" height="3"/><text>REZEPT&#10;</text>');
  teile.push('<text align="left" em="true" width="2" height="2"/>' + xmlZeilen(t.titel));
  teile.push('<text em="false" width="1" height="1"/>');
  if (t.info.length) teile.push(xmlZeilen(t.info));
  teile.push(xmlZeilen([LINIE]));
  if (t.zutaten.length) {
    teile.push('<text em="true"/>' + xmlZeilen(['Zutaten']) + '<text em="false"/>');
    teile.push(xmlZeilen(t.zutaten));
  }
  for (const block of t.texte) {
    teile.push(xmlZeilen([STRICH]));
    teile.push('<text em="true"/>' + xmlZeilen([block.ueberschrift]) + '<text em="false"/>');
    teile.push(xmlZeilen(block.zeilen));
  }
  teile.push(xmlZeilen([LINIE]));
  teile.push('<text font="font_b"/>' + xmlZeilen(t.fuss) + '<text font="font_a"/>');
  teile.push('<feed line="3"/>');
  teile.push('<cut type="feed"/>');
  return teile.join('\n');
}

// Reine Textfassung (raw/ESC-POS-Drucker und Vorschau).
export function rezeptBonText(rezept: Rezept, faktor: number, opt: RezeptBonOptionen = {}): string[] {
  const t = rezeptBonTeile(rezept, faktor, opt);
  const z: string[] = ['REZEPT', ...t.titel, ...t.info, LINIE];
  if (t.zutaten.length) z.push('Zutaten', ...t.zutaten);
  for (const block of t.texte) z.push(STRICH, block.ueberschrift, ...block.zeilen);
  z.push(LINIE, ...t.fuss);
  return z;
}

// Eintrag fuer die Rezeptliste der Kasse (aus GET /api/events/:slug/recipes).
export interface RezeptEintrag {
  id: number;
  name: string;
  kategorie: string | null;
  anzahl_zutaten: number | null;
}

export function rezeptListe(rows: any): RezeptEintrag[] {
  if (!Array.isArray(rows)) return [];
  const gesehen = new Set<number>();
  const aus: RezeptEintrag[] = [];
  for (const r of rows) {
    const id = Number(r?.id);
    if (!Number.isInteger(id) || id <= 0 || gesehen.has(id) || !text(r?.name)) continue;
    gesehen.add(id);
    aus.push({
      id,
      name: text(r.name)!,
      kategorie: text(r.category_name),
      anzahl_zutaten: zahl(r.ingredient_count),
    });
  }
  return aus;
}
