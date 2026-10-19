/**
 * Speisekarte — druckbare Karte aus den verkaufbaren Artikeln (und Rezepten)
 * der Lagerverwaltung, im Stil der Chilbi-Karte 2026: Herbstgirlande oben,
 * Pilze unten, je zwei A5-Seiten auf einem A4-Blatt quer.
 *
 * Reine Funktionen ohne Datenbank, damit sie sich testen lassen
 * (test/speisekarte.test.mjs). Die Route steht in index.ts.
 *
 * Aus den Artikelnamen wird die Karte so gebaut:
 *   "01 Epesses | 1dl", "01 Epesses | Flasche 50cl" → eine Zeile "01 Epesses"
 *                                                     mit zwei Preisen
 *   "Softdrinks | Cola 3dl", "Softdrinks | Cola 1.5l" → Zwischentitel
 *                                                     "Softdrinks", Zeile "Cola"
 *   "Bier Warteck 3dl"                                → "Bier Warteck", 3 dl
 * Artikel ohne Preis (Glaeser zu 0.00) stehen nicht auf der Karte.
 * Die Beschreibung des Artikels (z.B. Weinbeschrieb) steht klein darunter.
 */

export interface KartenArtikel {
  name: string;
  price: number | string | null;
  category: string | null;
  description?: string | null;
}

export interface Preis {
  groesse: string | null;
  preis: number;
}

export interface KartenZeile {
  nummer: string | null;
  name: string;
  beschreibung: string | null;
  preise: Preis[];
}

export interface KartenGruppe {
  titel: string | null;
  zeilen: KartenZeile[];
}

export interface KartenAbschnitt {
  kategorie: string;
  titel: string;
  hinweis: string | null;
  fussnote: string | null;
  gruppen: KartenGruppe[];
}

// Reihenfolge und Ueberschriften wie auf der gedruckten Karte; unbekannte
// Kategorien folgen alphabetisch mit ihrem Namen als Ueberschrift.
const ABSCHNITTE: Record<string, { titel: string; hinweis?: string; fussnote?: string }> = {
  'Getränke': { titel: 'Mineralwasser & Bier' },
  'Kaffee': { titel: 'Kaffee' },
  'Essen': {
    titel: 'Für den Hunger',
    hinweis: 'Fleisch aus der Schweiz',
    fussnote: 'Unsere Speisen sind nicht speziell auf Allergien abgestimmt'
  },
  'Weinkarte': { titel: 'Weine' },
  'Bar': { titel: 'Bar', hinweis: '4 cl' }
};
const REIHENFOLGE = Object.keys(ABSCHNITTE);

const MASS = String.raw`\d+(?:[.,]\d+)?\s?(?:cl|dl|l)`;
const GROESSE = String.raw`(?:(?:Flasche|Glas)(?:\s+${MASS})?|${MASS})`;
const NUR_GROESSE = new RegExp(`^${GROESSE}$`, 'i');
const GROESSE_AM_ENDE = new RegExp(`\\s+(${GROESSE})$`, 'i');
const NUMMER = /^(\d+[A-Za-z]?)\s+(.+)$/;

/** "3dl" → "3 dl", "Flasche 50cl" → "Flasche 50 cl" */
export function groesseText(g: string): string {
  return g.replace(/(\d)\s?(cl|dl|l)$/i, (_m, z, e) => `${z} ${e.toLowerCase()}`);
}

/** Inhalt in cl zum Sortieren; Flasche ohne Angabe ganz hinten */
function inhaltCl(g: string | null): number {
  if (!g) return 0;
  const m = g.match(/(\d+(?:[.,]\d+)?)\s?(cl|dl|l)$/i);
  if (m) {
    const z = parseFloat(m[1].replace(',', '.'));
    return z * ({ cl: 1, dl: 10, l: 100 } as Record<string, number>)[m[2].toLowerCase()];
  }
  return /^glas/i.test(g) ? 10 : 1000;
}

/** Zerlegt einen Artikelnamen in Zwischentitel, Zeilenname und Groesse. */
export function nameZerlegen(name: string): { gruppe: string | null; basis: string; groesse: string | null } {
  const teile = name.split('|').map((t) => t.trim()).filter(Boolean);
  let gruppe: string | null = null;
  let groesse: string | null = null;
  if (teile.length > 1 && NUR_GROESSE.test(teile[teile.length - 1])) {
    groesse = teile.pop()!;
  } else if (teile.length > 1) {
    gruppe = teile.shift()!;
  }
  let basis = teile.join(' ');
  if (!groesse) {
    const m = basis.match(GROESSE_AM_ENDE);
    if (m) {
      groesse = m[1];
      basis = basis.slice(0, m.index).trim();
    }
  }
  return { gruppe, basis, groesse };
}

export function karteAufbauen(artikel: KartenArtikel[]): KartenAbschnitt[] {
  const abschnitte = new Map<string, Map<string, Map<string, KartenZeile>>>();

  for (const a of artikel) {
    const preis = Number(a.price);
    if (!Number.isFinite(preis) || preis <= 0) continue;
    const kategorie = (a.category || '').trim() || 'Weiteres';
    const { gruppe, basis, groesse } = nameZerlegen(a.name);
    const n = basis.match(NUMMER);

    const gruppen = abschnitte.get(kategorie) ?? new Map();
    abschnitte.set(kategorie, gruppen);
    const zeilen = gruppen.get(gruppe ?? '') ?? new Map();
    gruppen.set(gruppe ?? '', zeilen);

    const zeile: KartenZeile = zeilen.get(basis) ?? {
      nummer: n ? n[1] : null,
      name: n ? n[2] : basis,
      beschreibung: null,
      preise: []
    };
    zeilen.set(basis, zeile);
    zeile.preise.push({ groesse: groesse ? groesseText(groesse) : null, preis });
    const beschreibung = (a.description || '').trim();
    if (beschreibung && !zeile.beschreibung) zeile.beschreibung = beschreibung;
  }

  const rang = (k: string) => {
    const i = REIHENFOLGE.indexOf(k);
    return i < 0 ? REIHENFOLGE.length : i;
  };
  const sortName = (z: KartenZeile) => `${z.nummer ?? ''} ${z.name}`;

  return [...abschnitte.entries()]
    .sort(([a], [b]) => rang(a) - rang(b) || a.localeCompare(b, 'de'))
    .map(([kategorie, gruppen]) => {
      const vorlage = ABSCHNITTE[kategorie];
      return {
        kategorie,
        titel: vorlage?.titel ?? kategorie,
        hinweis: vorlage?.hinweis ?? null,
        fussnote: vorlage?.fussnote ?? null,
        gruppen: [...gruppen.entries()]
          // Zeilen ohne Zwischentitel zuerst
          .sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b, 'de')))
          .map(([titel, zeilen]) => ({
            titel: titel || null,
            zeilen: [...zeilen.values()]
              .map((z) => ({ ...z, preise: [...z.preise].sort((p, q) => inhaltCl(p.groesse) - inhaltCl(q.groesse)) }))
              .sort((a, b) => sortName(a).localeCompare(sortName(b), 'de', { numeric: true }))
          }))
      };
    });
}

function htmlText(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function preisText(n: number): string {
  return n.toFixed(2);
}

// Sprueche fuer leeren Platz, wie auf der Karte 2026
const SPRUECHE: [string, string][] = [
  ['Ein Mädchen und ein Gläschen Wein sind die Retter in der Not, denn wer nicht trinkt und wer nicht küsst, der ist so gut wie tot.', 'Johann Wolfgang von Goethe'],
  ['Der Wein steigt in das Gehirn, macht es sinnig, schnell und erfinderisch, voll von feurigen und schönen Bildern.', 'Shakespeare'],
  ['Ein Trinkgefäss, sobald es leer ist, macht keine rechte Freude mehr.', 'Wilhelm Busch'],
  ['Der liebe Gott hat nicht gewollt, dass edler Wein verderben sollt, drum hat er auch zum Saft der Reben den nötigen Durst dazu gegeben.', 'Johann Wolfgang von Goethe'],
  ['Am Rausch ist nicht der Wein schuld, sondern der Trinker.', 'Konfuzius'],
  ['Wozu die Wahrheit im Kaffeesatz suchen, da sie doch so angenehm im Wein untergebracht ist.', 'André Brie']
];

function zeileHtml(z: KartenZeile): string {
  // Feste Zellbreite, groesster Inhalt rechts: so stehen 1 dl / 2 dl / Flasche
  // auch ohne Tabelle untereinander
  const preise = z.preise.map((p) => `<span class="preis${/^flasche/i.test(p.groesse ?? '') ? ' breit' : ''}"><small>${htmlText(p.groesse ?? '')}</small>${preisText(p.preis)}</span>`).join('');
  return `<div class="block zeile${z.beschreibung ? ' mitText' : ''}">
    <div class="kopfzeile"><span class="name">${z.nummer ? `<b>${htmlText(z.nummer)})</b> ` : ''}${htmlText(z.name)}</span><span class="preise">${preise}</span></div>
    ${z.beschreibung ? `<div class="text">${htmlText(z.beschreibung)}</div>` : ''}
  </div>`;
}

export function speisekarteHtml(
  abschnitte: KartenAbschnitt[],
  opt: { titel: string; hintergrund: string; logo: string; stand: string }
): string {
  const titel = htmlText(opt.titel);
  // Grossbuchstaben am Wortanfang rot wie "Feuerwehrverein Raura" auf der Vorlage
  const verein = '<span class="rot">F</span>euerwehrverein <span class="rot">R</span>aura';

  // Alle Bloecke in einer Quelle; das Skript verteilt sie auf A5-Seiten.
  // data-titel: Ueberschrift, die nie allein unten auf einer Seite bleibt.
  const quelle = abschnitte.map((a) => `
    <div class="block titel" data-titel><h2>${htmlText(a.titel)}</h2>${a.hinweis ? `<span class="hinweis">${htmlText(a.hinweis)}</span>` : ''}</div>
    ${a.gruppen.map((g) => `
      ${g.titel ? `<div class="block gruppe" data-titel>${htmlText(g.titel)}</div>` : ''}
      ${g.zeilen.map(zeileHtml).join('')}`).join('')}
    ${a.fussnote ? `<div class="block fussnote">*${htmlText(a.fussnote)}</div>` : ''}
    <div class="block abstand"></div>`).join('');

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Speisekarte ${titel}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Kalam&family=Open+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    @page { size: A4 landscape; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: 'Open Sans', Calibri, Arial, sans-serif; color: #111; background: #e5e5e5; }
    .rot { color: #c00000; }
    .blatt { width: 297mm; height: 210mm; display: flex; background: #fff; margin: 0 auto 8mm; box-shadow: 0 2px 10px rgba(0,0,0,.2); overflow: hidden; break-after: page; }
    .seite { position: relative; width: 148.5mm; height: 210mm; overflow: hidden; }
    .seite > .bg { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 0; }
    .kopf { position: relative; z-index: 1; height: 44mm; padding: 5mm 8mm 0 8mm; }
    .kopf img { position: absolute; left: 8mm; top: 4mm; width: 27mm; }
    .kopf .haus { position: absolute; left: 40mm; right: 6mm; top: 6mm; text-align: center; color: #c00000; font-weight: 700; font-size: 19pt; font-variant: small-caps; letter-spacing: .02em; }
    .kopf .verein { position: absolute; left: 34mm; right: 6mm; top: 16mm; text-align: center; font-size: 15pt; font-variant: small-caps; }
    .kopf .linie { position: absolute; left: 5mm; right: 5mm; top: 26mm; border-top: 1px solid #222; }
    .inhalt { position: absolute; z-index: 1; left: 9mm; right: 9mm; top: 40mm; bottom: 9mm; }
    .block.titel { display: flex; align-items: baseline; justify-content: center; gap: 3mm; margin: 0 0 3mm; }
    .block.titel h2 { font-size: 17pt; font-weight: 800; font-variant: small-caps; letter-spacing: .01em; text-shadow: 0 0 4px #fff, 0 0 8px #fff; }
    .block.titel .hinweis { font-size: 7.5pt; text-transform: uppercase; }
    .block.gruppe { font-weight: 700; font-style: italic; text-decoration: underline; font-size: 11pt; margin: 2mm 0 1mm; }
    .zeile { margin: 0 0 1.6mm; }
    .zeile.mitText { margin-bottom: 2.6mm; }
    .kopfzeile { display: flex; align-items: baseline; gap: 2mm; font-weight: 700; font-size: 10.5pt; text-transform: uppercase; }
    .zeile, .gruppe, .fussnote { text-shadow: 0 0 3px #fff, 0 0 6px #fff, 0 0 9px #fff; }
    .kopfzeile .name { flex: 1; min-width: 0; }
    .kopfzeile .preise { display: flex; justify-content: flex-end; gap: 2mm; white-space: nowrap; }
    .preis { display: inline-flex; justify-content: space-between; align-items: baseline; gap: 1mm; width: 19mm; }
    .preis.breit { width: 27mm; }
    .preis small { font-size: 7.5pt; font-weight: 600; }
    .text { font-size: 7.6pt; line-height: 1.3; margin-top: .4mm; color: #222; }
    .fussnote { font-size: 7.5pt; text-align: center; margin-top: 1mm; }
    .abstand { height: 5mm; }
    .spruch { position: absolute; left: 6mm; right: 6mm; z-index: 1; text-align: center; font-family: 'Kalam', 'Segoe Print', 'Bradley Hand', cursive; font-size: 11pt; line-height: 1.35; text-shadow: 0 0 4px #fff, 0 0 8px #fff; }
    .spruch small { display: block; font-size: 9.5pt; }
    #quelle { position: absolute; left: -9999px; top: 0; width: 130.5mm; }
    .knopf { position: sticky; top: 0; z-index: 5; padding: 10px; text-align: center; background: #f5f5f5; border-bottom: 1px solid #ddd; font-family: Arial, sans-serif; font-size: 13px; color: #444; }
    .knopf button { padding: 10px 20px; font-size: 14px; border: 0; border-radius: 6px; background: #2563eb; color: #fff; margin: 0 4px 4px; cursor: pointer; }
    .knopf button.zweit { background: #6b7280; }
    #karte { padding: 8mm 0; overflow-x: auto; }
    @media print {
      body { background: #fff; }
      .knopf { display: none; }
      #karte { padding: 0; }
      .blatt { margin: 0; box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="knopf">
    <button onclick="window.print()">🖨️ Drucken (A4 quer)</button>
    <button class="zweit" onclick="window.close()">Schliessen</button>
    <div>Im Druckdialog «Ränder: keine» wählen. Stand ${htmlText(opt.stand)} — Preise und Artikel aus der Lagerverwaltung (verkaufbar).</div>
  </div>
  <div id="karte"></div>
  <div id="quelle" class="inhalt">${quelle}</div>
  <template id="seite">
    <div class="seite">
      <img class="bg" src="${opt.hintergrund}" alt="">
      <div class="kopf">
        <img src="${opt.logo}" alt="Feuerwehrverein Raura">
        <div class="haus">${titel}</div>
        <div class="verein">${verein}</div>
        <div class="linie"></div>
      </div>
      <div class="inhalt"></div>
    </div>
  </template>
  <script>
    const SPRUECHE = ${JSON.stringify(SPRUECHE).replace(/</g, '\\u003c')};
    const MM = 96 / 25.4;

    function neueSeite(seiten) {
      const s = document.getElementById('seite').content.firstElementChild.cloneNode(true);
      seiten.push(s);
      document.getElementById('karte').appendChild(s);
      return s.querySelector('.inhalt');
    }

    function verteilen() {
      const karte = document.getElementById('karte');
      const bloecke = [...document.getElementById('quelle').children];
      const seiten = [];
      let ziel = neueSeite(seiten);
      for (const b of bloecke) {
        if (b.classList.contains('abstand') && ziel.children.length === 0) continue;
        ziel.appendChild(b);
        if (ziel.scrollHeight <= ziel.clientHeight + 1 || ziel.children.length === 1) continue;
        // Passt nicht mehr: Block und davor haengende Ueberschriften mitnehmen
        const mit = [b];
        ziel.removeChild(b);
        while (ziel.lastElementChild && ziel.lastElementChild.hasAttribute('data-titel')) {
          mit.unshift(ziel.lastElementChild);
          ziel.removeChild(ziel.lastElementChild);
        }
        ziel = neueSeite(seiten);
        if (b.classList.contains('abstand')) continue;
        mit.forEach((m) => ziel.appendChild(m));
      }
      // Gerade Anzahl Seiten fuer A4 quer
      if (seiten.length % 2) neueSeite(seiten);

      // Leeren Platz unten mit einem Spruch fuellen
      let n = 0;
      for (const s of seiten) {
        const inhalt = s.querySelector('.inhalt');
        const belegt = [...inhalt.children].reduce((h, c) => Math.max(h, c.offsetTop + c.offsetHeight), 0);
        const frei = inhalt.clientHeight - belegt;
        if (frei < 38 * MM) continue;
        const [text, wer] = SPRUECHE[n++ % SPRUECHE.length];
        const sp = document.createElement('div');
        sp.className = 'spruch';
        sp.append('„' + text + '“');
        const k = document.createElement('small');
        k.textContent = '(' + wer + ')';
        sp.appendChild(k);
        s.appendChild(sp);
        // Mitte des freien Platzes, aber nicht tiefer als die Pilzhuete
        const oben = inhalt.offsetTop + belegt;
        const mitte = oben + Math.min(frei / 2, 60 * MM);
        sp.style.top = Math.max(oben + 4 * MM, mitte - sp.offsetHeight / 2) + 'px';
      }

      // Je zwei Seiten auf ein A4-Blatt
      for (let i = 0; i < seiten.length; i += 2) {
        const blatt = document.createElement('div');
        blatt.className = 'blatt';
        blatt.append(seiten[i], seiten[i + 1]);
        karte.appendChild(blatt);
      }
      document.getElementById('quelle').remove();
    }

    (document.fonts ? document.fonts.ready : Promise.resolve()).then(verteilen);
  </script>
</body>
</html>`;
}
