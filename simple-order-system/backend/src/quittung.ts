// ---------------------------------------------------------------------------
// Quittung fuer einen Tisch (Oktober 2026): fasst die Positionen der
// gewaehlten Bestellungen zusammen und druckt sie am Bar-Drucker - mit
// Total, bereits Bezahltem und noch Offenem. Ausloesen: Web-Kasse
// (Tischkarte "Quittung") und App (Tisch-Ansicht) ueber POST /api/quittung.
// ---------------------------------------------------------------------------

export interface QuittungPosten { name: string; preis: number; menge: number }

const BREITE = 42;
const xml = (t: string) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const kurzName = (n: string) => n.replace(/^Softdrinks \| /, '').replace(/ \| /, ' ');

/** Zeile "links ....... rechts" auf Bonbreite */
export function zeile(links: string, rechts: string): string {
  const l = links.slice(0, BREITE - rechts.length - 1);
  return l.padEnd(BREITE - rechts.length) + rechts;
}

/** Gleiche Artikel zum gleichen Preis zusammenfassen, nach Name sortiert. */
export function postenZusammenfassen(liste: QuittungPosten[]): QuittungPosten[] {
  const m = new Map<string, QuittungPosten>();
  for (const p of liste) {
    const k = `${p.name}|${p.preis.toFixed(2)}`;
    const da = m.get(k);
    if (da) da.menge += p.menge; else m.set(k, { ...p });
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

export function quittungXml(o: {
  tisch: number; posten: QuittungPosten[]; bezahlt: number; zeit: Date; anlass?: string | null; logoXml: string;
}): string {
  const posten = postenZusammenfassen(o.posten);
  const total = posten.reduce((s, p) => s + p.preis * p.menge, 0);
  const offen = Math.max(0, total - o.bezahlt);
  const zeit = o.zeit.toLocaleString('de-CH', { timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const zeilen = posten.map((p) => `<text>${xml(zeile(`${p.menge}x ${kurzName(p.name)}`, (p.preis * p.menge).toFixed(2)))}&#10;</text>`).join('');
  const rest = o.bezahlt > 0.009
    ? `<text>${xml(zeile('Bereits bezahlt', `-${o.bezahlt.toFixed(2)}`))}&#10;</text>
       <text em="true"/><text>${xml(zeile(offen > 0.009 ? 'OFFEN CHF' : 'BEZAHLT', offen.toFixed(2)))}&#10;</text><text em="false"/>`
    : '';
  return `${o.logoXml}
      <text align="center"/><text em="true" width="2" height="2"/><text>QUITTUNG&#10;</text>
      <text em="false" width="1" height="1"/>
      <text>Feuerwehrverein Raura${o.anlass ? ` - ${xml(o.anlass)}` : ''}&#10;Tisch ${o.tisch} - ${xml(zeit)}&#10;&#10;</text>
      <text align="left"/>${zeilen}
      <text>${'-'.repeat(BREITE)}&#10;</text>
      <text em="true"/><text>${xml(zeile('TOTAL CHF', total.toFixed(2)))}&#10;</text><text em="false"/>
      ${rest}
      <text align="center"/><text>&#10;Vielen Dank fuer Ihren Besuch!&#10;</text>
      <feed line="3"/>
      <cut type="feed"/>`;
}
