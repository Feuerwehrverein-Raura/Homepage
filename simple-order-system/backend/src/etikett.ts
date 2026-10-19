// ---------------------------------------------------------------------------
// Kisten-Etiketten (Oktober 2026): ein Bon, quer bedruckt, fuer die
// Beschriftungs-Halterung an den Lagerkisten - z.B. "29 Rugeli". Die
// Beladung aendert sich ab und zu; dann einfach neu drucken.
//
// Seitenmodus des Druckers (<page>, Richtung bottom_to_top): der Text laeuft
// der Laenge nach ueber den Bon, 24 mm hoch (Schrift 8-fach hoch). Lange Texte
// werden schmaler (Breite 7- bis 3-fach), damit das Etikett moeglichst nicht
// laenger als ~15 cm wird. Darunter klein eine zweite Zeile.
// Erprobt am TM-m30III im Schopf am 19.10.2026 ("29 Rugeli" passt genau in
// die Halterung der gruenen Kisten).
// Gedruckt wird wie die Tischkarten am Bar-Drucker ueber den T400.
// ---------------------------------------------------------------------------

export const ETIKETT_MAX = 40;
const PUNKT_BREITE = 12;      // Schrift A: 12 x 24 Punkte
const ZIEL_LAENGE = 1200;     // ~15 cm bei 8 Punkten je mm
const RAND = 24;

function xmlText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Text pruefen: Pflicht, hoechstens ETIKETT_MAX Zeichen, eine Zeile. */
export function etikettPruefen(text: unknown, unten: unknown): { text: string; unten: string } | string {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  const u = String(unten ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return 'Bitte einen Text eingeben';
  if (t.length > ETIKETT_MAX || u.length > 60) return `Höchstens ${ETIKETT_MAX} Zeichen`;
  return { text: t, unten: u };
}

/** Breitenfaktor fuer [zeichen] Zeichen: so breit wie moeglich bis ~15 cm. */
export function etikettBreite(zeichen: number): number {
  for (let w = 7; w > 3; w--) if (zeichen * PUNKT_BREITE * w <= ZIEL_LAENGE) return w;
  return 3;
}

/** ePOS-Inhalt fuer ein Etikett (ohne Huelle), mit Schnitt. */
export function etikettXml(text: string, unten = ''): string {
  const w = etikettBreite(text.length);
  const laenge = Math.max(400,
    text.length * PUNKT_BREITE * w + 2 * RAND,
    unten.length * PUNKT_BREITE * 2 + 2 * RAND);
  return `<page>
      <area x="0" y="0" width="576" height="${laenge}"/>
      <direction dir="bottom_to_top"/>
      <position x="${RAND}" y="300"/>
      <text font="font_a" em="true" width="${w}" height="8">${xmlText(text)}</text>
      ${unten ? `<position x="${RAND}" y="520"/>
      <text em="false" width="2" height="2">${xmlText(unten)}</text>` : ''}
      </page>
      <feed line="2"/>
      <cut type="feed"/>`;
}
