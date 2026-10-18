// ---------------------------------------------------------------------------
// Tischkarten (Oktober 2026): Nummernkarten am Bon-Drucker, die man auf die
// Tische stellt - Vereinslogo, "TISCH" und die Nummer so gross es geht,
// jede Karte einzeln abgeschnitten. Kein QR-Code.
// Gedruckt wird am Bar-Drucker (sonst Kueche) ueber den T400; die Cloud
// erreicht den Drucker im Schopf nicht (index.ts: 409 ausserhalb).
// ---------------------------------------------------------------------------

export const TISCHKARTEN_MAX = 60;

/** Bereich pruefen: ganze Zahlen 1..999, von <= bis, hoechstens TISCHKARTEN_MAX. */
export function tischkartenBereich(von: unknown, bis: unknown): { von: number; bis: number } | string {
  const a = Number(von), b = Number(bis ?? von);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b > 999) return 'Tischnummern 1 bis 999';
  if (b < a) return '«bis» muss grösser oder gleich «von» sein';
  if (b - a + 1 > TISCHKARTEN_MAX) return `Höchstens ${TISCHKARTEN_MAX} Karten auf einmal`;
  return { von: a, bis: b };
}

/** ePOS-Inhalt fuer eine Karte (ohne Huelle). */
export function tischkarteXml(nr: number, logoXml: string, anlass?: string | null): string {
  return `${logoXml}
      <text align="center"/>
      ${anlass ? `<text em="false" width="1" height="1"/><text>${anlass.replace(/[<>&"]/g, '')}&#10;</text>` : ''}
      <feed line="1"/>
      <text em="true" width="3" height="3"/>
      <text>TISCH&#10;</text>
      <text em="true" width="8" height="8"/>
      <text>${nr}&#10;</text>
      <text em="false" width="1" height="1"/>
      <feed line="3"/>
      <cut type="feed"/>`;
}
