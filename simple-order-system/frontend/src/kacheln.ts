// ---------------------------------------------------------------------------
// Kacheln der Kasse (Oktober 2026, Chilbi)
//
// Reine Funktionen ohne React - getestet mit frontend/test/kacheln.test.ts.
//
// 1. Kategorien: feste Reihenfolge (Standard oder Einstellung
//    "kategorien_reihenfolge"), danach alle anderen alphabetisch.
// 2. Artikel einer Kategorie: nach Name, natuerlich sortiert ("03A" nach
//    "03" und vor "04", "10" nach "09"). Meistverkaufte zuerst nur, wenn die
//    Einstellung "meistverkauft_zuerst" an ist.
// 3. Untermenues per Namenskonvention "Gruppe | Variante" (Trennzeichen
//    " | " mit Leerzeichen): Artikel derselben Kategorie mit gleicher Gruppe
//    werden zu EINER Kachel; ein Tipp oeffnet die Varianten.
//    Angezeigt/gedruckt wird der Name ohne " | ":
//    "Kaffee Lutz | Zwetschge" -> "Kaffee Lutz Zwetschge".
// ---------------------------------------------------------------------------

export const TRENNER = ' | ';

export const STANDARD_KATEGORIEN = [
  'Softdrinks', 'Bier', 'Essen', 'Kaffee', 'Offenwein', 'Weinkarte', 'Bar',
];

export interface KachelArtikel {
  id: number;
  name: string;
  price: number;
  category: string;
}

export type Kachel<T extends KachelArtikel> =
  | { art: 'einzel'; schluessel: string; artikel: T }
  | { art: 'gruppe'; schluessel: string; gruppe: string; varianten: T[] };

// Anzeigename: " | " (auch mehrfach, auch ohne saubere Leerzeichen) wird zu
// einem Leerzeichen.
export function anzeigeName(name: string | null | undefined): string {
  if (!name) return name ?? '';
  if (!name.includes('|')) return name;
  return name.split('|').map(t => t.trim()).filter(t => t !== '').join(' ');
}

// "Gruppe | Variante" -> { gruppe, variante }; sonst null. Massgebend ist das
// erste " | ".
export function nameTeilen(name: string): { gruppe: string; variante: string } | null {
  const i = name.indexOf(TRENNER);
  if (i < 0) return null;
  const gruppe = name.slice(0, i).trim();
  const variante = name.slice(i + TRENNER.length).trim();
  if (!gruppe || !variante) return null;
  return { gruppe, variante };
}

const sammler = new Intl.Collator('de-CH', { numeric: true, sensitivity: 'base' });
export const nameVergleich = (a: string, b: string): number => sammler.compare(a, b);

// Einstellungstext -> Liste (eine pro Zeile oder komma-getrennt). Leer =
// Standard.
export function reihenfolgeLesen(text: string | null | undefined): string[] {
  const liste = (text || '').split(/[\n,;]/).map(t => t.trim()).filter(t => t !== '');
  return liste.length ? liste : STANDARD_KATEGORIEN;
}

export function kategorienSortieren(kategorien: string[], reihenfolgeText?: string | null): string[] {
  const reihenfolge = reihenfolgeLesen(reihenfolgeText).map(k => k.toLocaleLowerCase('de-CH'));
  const rang = (k: string) => {
    const i = reihenfolge.indexOf((k || '').trim().toLocaleLowerCase('de-CH'));
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...new Set(kategorien)].sort((a, b) => (rang(a) - rang(b)) || nameVergleich(a || '', b || ''));
}

// Kacheln einer Kategorie. beliebtRang: item_id -> Rang (0 = meistverkauft);
// nur wenn meistverkauftZuerst. Eine Gruppe zaehlt mit ihrer besten Variante.
export function kachelnBilden<T extends KachelArtikel>(
  artikel: T[],
  beliebtRang: Record<string, number> = {},
  meistverkauftZuerst = false,
): Kachel<T>[] {
  const rangVon = (a: T) => {
    const r = beliebtRang[String(a.id)];
    return r === undefined ? Number.MAX_SAFE_INTEGER : r;
  };
  const artikelVergleich = (a: T, b: T) =>
    (meistverkauftZuerst ? rangVon(a) - rangVon(b) : 0) || nameVergleich(a.name, b.name) || (a.id - b.id);

  const gruppen = new Map<string, T[]>();
  const kacheln: { kachel: Kachel<T>; sortName: string; rang: number }[] = [];
  for (const a of artikel) {
    const teile = nameTeilen(a.name);
    if (!teile) {
      kacheln.push({ kachel: { art: 'einzel', schluessel: `i${a.id}`, artikel: a }, sortName: a.name, rang: rangVon(a) });
      continue;
    }
    const liste = gruppen.get(teile.gruppe);
    if (liste) liste.push(a); else gruppen.set(teile.gruppe, [a]);
  }
  for (const [gruppe, varianten] of gruppen) {
    varianten.sort(artikelVergleich);
    kacheln.push({
      kachel: { art: 'gruppe', schluessel: `g${gruppe}`, gruppe, varianten },
      sortName: gruppe,
      rang: Math.min(...varianten.map(rangVon)),
    });
  }
  kacheln.sort((a, b) =>
    (meistverkauftZuerst ? a.rang - b.rang : 0) || nameVergleich(a.sortName, b.sortName));
  return kacheln.map(k => k.kachel);
}

// Preisangabe einer Gruppe: "CHF 4.00", wenn alle gleich, sonst "ab CHF x".
export function gruppenPreis(varianten: KachelArtikel[]): string {
  const preise = varianten.map(v => v.price);
  const min = Math.min(...preise);
  const alleGleich = preise.every(p => Math.abs(p - min) < 0.001);
  return `${alleGleich ? '' : 'ab '}CHF ${min.toFixed(2)}`;
}

// Variante ohne Gruppe (fuer die Kachel im Auswahlfenster).
export function variantenName(name: string): string {
  return nameTeilen(name)?.variante ?? name;
}
