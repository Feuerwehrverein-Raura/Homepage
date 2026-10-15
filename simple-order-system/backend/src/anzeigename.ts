// ---------------------------------------------------------------------------
// Anzeigename eines Artikels (Oktober 2026, Chilbi)
//
// Artikel im Inventar duerfen "Gruppe | Variante" heissen (z.B.
// "Kaffee Lutz | Zwetschge"); die Kasse zeigt dann eine Kachel "Kaffee Lutz"
// mit einem Untermenue (frontend/src/kacheln.ts). Auf Bon, Kuechenanzeige,
// History und Tagesbericht steht der Name ohne " | ":
// "Kaffee Lutz Zwetschge".
//
// Die Kasse speichert schon den sauberen Namen in order_items. Hier zusaetzlich
// beim Anlegen und beim Drucken - fuer aeltere Kassen und alte Daten.
// ---------------------------------------------------------------------------

export function anzeigeName(name: string | null | undefined): string {
  if (!name) return name ?? '';
  if (!name.includes('|')) return name;
  return name.split('|').map(t => t.trim()).filter(t => t !== '').join(' ');
}

// SQL-Ausdruck fuer Berichte (alte Zeilen mit " | " gruppieren mit neuen).
export function anzeigeNameSql(spalte: string): string {
  return `REPLACE(${spalte}, ' | ', ' ')`;
}
