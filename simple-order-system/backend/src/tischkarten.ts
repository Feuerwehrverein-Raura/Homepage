// ---------------------------------------------------------------------------
// Tischkarten (Oktober 2026): Nummernkarten am Bon-Drucker, die man auf die
// Tische stellt - Vereinslogo, "TISCH" und die Nummer 4 cm hoch, jede Karte
// einzeln abgeschnitten. Kein QR-Code.
// Die Nummer ist ein Rasterbild aus fertigen Ziffern (assets/ziffern-bon.json,
// erzeugt mit scripts/ziffern-bon.py): Text geht am Drucker hoechstens 8-fach
// (knapp 2 cm). Dreistellige Nummern in der kleinen Groesse (2,8 cm), damit
// sie in die 72 mm Druckbreite passen.
// Gedruckt wird am Bar-Drucker (sonst Kueche) ueber den T400; die Cloud
// erreicht den Drucker im Schopf nicht (index.ts: 409 ausserhalb).
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';

export const TISCHKARTEN_MAX = 60;

interface Ziffer { width: number; height: number; raster: string }
type Ziffernsatz = Record<string, Ziffer>;

let ziffernCache: { gross: Ziffernsatz; klein: Ziffernsatz } | null | undefined;
function ziffernLaden() {
  if (ziffernCache !== undefined) return ziffernCache;
  try {
    ziffernCache = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'assets', 'ziffern-bon.json'), 'utf8'));
  } catch (err) {
    console.error('Tischkarten-Ziffern nicht lesbar:', err);
    ziffernCache = null;
  }
  return ziffernCache;
}

/**
 * Die Nummer als ein ePOS-Rasterbild (Bit 1 = schwarz, Zeilen auf Bytes
 * aufgefuellt). null, wenn die Ziffern fehlen - dann druckt die Karte Text.
 */
export function nummerBild(nr: number, satz = ziffernLaden()): { width: number; height: number; raster: string } | null {
  if (!satz) return null;
  const text = String(nr);
  const ziffern = (text.length >= 3 ? satz.klein : satz.gross);
  const teile = [...text].map((z) => ziffern[z]);
  if (teile.some((t) => !t)) return null;
  const hoehe = teile[0].height;
  const breite = teile.reduce((s, t) => s + t.width, 0);
  const zeile = Math.ceil(breite / 8);
  const ziel = Buffer.alloc(zeile * hoehe);
  let x0 = 0;
  for (const t of teile) {
    const quelle = Buffer.from(t.raster, 'base64');
    const qZeile = Math.ceil(t.width / 8);
    for (let y = 0; y < hoehe; y++) {
      for (let x = 0; x < t.width; x++) {
        if (quelle[y * qZeile + (x >> 3)] & (0x80 >> (x & 7))) {
          const zx = x0 + x;
          ziel[y * zeile + (zx >> 3)] |= 0x80 >> (zx & 7);
        }
      }
    }
    x0 += t.width;
  }
  return { width: breite, height: hoehe, raster: ziel.toString('base64') };
}

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
      ${(() => {
        const bild = nummerBild(nr);
        return bild
          ? `<image width="${bild.width}" height="${bild.height}" color="color_1" mode="mono">${bild.raster}</image><text>&#10;</text>`
          : `<text em="true" width="8" height="8"/><text>${nr}&#10;</text>`;
      })()}
      <text em="false" width="1" height="1"/>
      <feed line="3"/>
      <cut type="feed"/>`;
}
