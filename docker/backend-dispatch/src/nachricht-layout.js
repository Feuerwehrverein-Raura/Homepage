// Brief- und E-Mail-Layout fuer den Nachricht-Versand (Vorstand).
//
// Bisher baute jeder Client das HTML selbst (vorstand.html,
// vorstand-desktop/src/lib/dispatch-letter.ts) - mit kleinen Unterschieden
// und ohne HTML-Escaping. Hier steht es einmal im Backend: die Flutter-App
// schickt nur Betreff, Text und Mitglied, das Backend baut den Brief.
//
// Port von dispatch-letter.ts (einheitliche Brief-Vorlage, 15mm Oberrand,
// Adressfenster CH rechts / DE links) und generateDispatchEmailHTML aus
// vorstand.html. Der Text ist reiner Text mit Absaetzen; Platzhalter wie
// {{vorname}} werden pro Mitglied ersetzt. Ohne Abhaengigkeiten, damit es
// sich ohne node_modules testen laesst (test/nachricht.test.js).

/** Platzhalter, die Brief und E-Mail kennen (wie replacePlaceholders). */
const PLATZHALTER = ['anrede', 'vorname', 'nachname', 'strasse', 'plz', 'ort', 'email'];

/** Seitenrand fuer /dispatch/send-post und die Vorschau (Folgeseiten bleiben
 *  aus Pingens Sperrzone). Wie LETTER_MARGIN in vorstand-desktop. */
const BRIEF_RAND = { top: '15mm', right: '0', bottom: '20mm', left: '0' };

const LOGO = 'https://www.fwv-raura.ch/images/logo.png';

function escapeHtml(wert) {
    return String(wert ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** {{platzhalter}} durch Mitgliedsdaten ersetzen (Funktion als Ersatz, damit
 *  $& im Wert nicht ausgewertet wird). Unbekannte Platzhalter bleiben. */
function platzhalterErsetzen(text, mitglied) {
    if (!text) return '';
    return String(text).replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (ganz, name) =>
        PLATZHALTER.includes(name) ? String((mitglied && mitglied[name]) ?? '') : ganz);
}

/** Reiner Text -> Absaetze; HTML wird escaped, Links klickbar. */
function textZuHtml(text) {
    const link = /(https?:\/\/[^\s<]+)/g;
    return String(text || '')
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map(zeile => {
            const sicher = escapeHtml(zeile).replace(link, '<a href="$1">$1</a>');
            return `<p>${sicher || '&nbsp;'}</p>`;
        })
        .join('');
}

/** Deutsche Empfaenger: PLZ beginnt mit "DE" oder ist 5-stellig. */
function istDeutscherEmpfaenger(mitglied) {
    const plz = String(mitglied?.plz ?? '').trim();
    return /^de/i.test(plz) || /^\d{5}/.test(plz);
}

function plzOhneLand(mitglied) {
    return String(mitglied?.plz ?? '').trim().replace(/^de[-\s]?/i, '');
}

/** Adresszeilen fuers Fensterkuvert; DE mit eigener Zeile "Deutschland",
 *  sonst erkennt Pingen das Zielland nicht. */
function adressZeilen(mitglied) {
    const name = `${mitglied.vorname || ''} ${mitglied.nachname || ''}`.trim();
    const zeilen = [name, mitglied.strasse || ''];
    if (mitglied.adresszusatz) zeilen.push(mitglied.adresszusatz);
    zeilen.push(`${plzOhneLand(mitglied)} ${mitglied.ort || ''}`.trim());
    if (istDeutscherEmpfaenger(mitglied)) zeilen.push('Deutschland');
    return zeilen;
}

/** Hat das Mitglied eine Adresse, an die ein Brief gehen kann? */
function hatPostadresse(mitglied) {
    return ['strasse', 'plz', 'ort'].every(f => String(mitglied?.[f] ?? '').trim() !== '');
}

/** Empfaenger fuer /dispatch/send-post. */
function empfaenger(mitglied) {
    return {
        name: `${mitglied.vorname || ''} ${mitglied.nachname || ''}`.trim(),
        street: mitglied.strasse || '',
        zip: plzOhneLand(mitglied),
        city: mitglied.ort || '',
        country: istDeutscherEmpfaenger(mitglied) ? 'DE' : 'CH'
    };
}

/** Absenderzeile aus dem Aktuar ("E. Muster, Weg 1, 4303 Kaiseraugst"). */
function absenderZeile(aktuar) {
    if (!aktuar || !aktuar.strasse) return 'Aktuar des Feuerwehrverein Raura';
    const kurz = `${(aktuar.vorname || '').charAt(0)}. ${aktuar.nachname || ''}`.trim();
    return `${kurz}, ${aktuar.strasse}, ${aktuar.plz || ''} ${aktuar.ort || ''}`.trim();
}

/** TT.MM.JJJJ (ohne Locale-Abhaengigkeit von Node). */
function schweizerDatum(d) {
    const zwei = n => String(n).padStart(2, '0');
    return `${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}.${d.getFullYear()}`;
}

const SCHLUSS = `Mit freundlichen Grüssen<br><br>
        <strong><em>Feuerwehrverein Raura, Kaiseraugst</em></strong><br>
        <em>Der Vorstand</em>`;

/**
 * Brief im offiziellen Layout (Basis: einheitliche Vorlage aus
 * dispatch-letter.ts). Kopf absolut positioniert, Text im Fluss; zusammen mit
 * BRIEF_RAND landet das Adressfenster bei 60mm/118mm (CH) bzw. links (DE).
 *
 * DE (Fenster links, address_position left): Pingens Zonen gespiegelt -
 * Adressbereich 22/60mm (85.5 x 25.5mm), Frankierbereich 20/40mm
 * (89.5 x 47.5mm), darin darf ausser der Adresse nichts stehen. Vorher stand
 * die Adresse bei 55mm und das Logo reichte bis 41mm: Pingen lehnte ab
 * ("protected_stamp_area", Preisjassen 01.11.2026). Darum hier Adresse ab
 * 60mm mit engeren Zeilen (5 Zeilen mit "Deutschland" in 25.5mm) und das
 * Logo 30mm breit (endet bei 37.6mm).
 */
function briefHtml({ betreff, text, mitglied, absender, datum = new Date() }) {
    const titel = platzhalterErsetzen(betreff, mitglied);
    const inhalt = textZuHtml(platzhalterErsetzen(text, mitglied));
    const de = istDeutscherEmpfaenger(mitglied);
    const adresseCss = de
        ? 'top:45mm;left:22mm;width:85.5mm;max-height:25.5mm;overflow:hidden;line-height:1.15;'
        : 'top:45mm;left:118mm;width:85mm;';
    const logoBreite = de ? '30mm' : '35mm';
    const adresse = adressZeilen(mitglied).map(z => `<div>${escapeHtml(z)}</div>`).join('\n        ');
    const kopf = titel
        ? `<div style="font-weight:bold;font-size:13pt;">${escapeHtml(titel)}</div><hr style="border:none;border-top:1px solid #000;margin:4mm 0 6mm 0;">`
        : '';
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  @page { size: A4; }
  body { margin: 0; padding: 0; background: white; font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.4; color: #000; }
  .letter-body p { margin: 0.5em 0; orphans: 3; widows: 3; }
  .letter-closing { page-break-inside: avoid; }
</style></head>
<body>
<div style="position:relative;height:85mm;">
    <div style="position:absolute;top:0;left:25mm;width:${logoBreite};">
        <img src="${LOGO}" alt="FWV Raura" style="width:${logoBreite};height:auto;display:block;">
    </div>
    <div style="position:absolute;top:0;left:118mm;">
        <div style="font-size:20pt;font-weight:bold;line-height:1.2;">Feuerwehrverein Raura</div>
        <div style="font-size:20pt;font-weight:bold;line-height:1.2;">Kaiseraugst</div>
    </div>
    <div style="position:absolute;top:20mm;left:118mm;font-size:8pt;color:#333;">${escapeHtml(absender)}</div>
    <div style="position:absolute;${adresseCss}">
        ${adresse}
    </div>
    <div style="position:absolute;top:77mm;right:25mm;text-align:right;">Kaiseraugst, ${schweizerDatum(datum)}</div>
</div>
<div class="letter-body" style="padding:0 25mm 5mm 25mm;">${kopf}<div>${inhalt}</div>
    <div class="letter-closing" style="margin-top:10mm;">
        ${SCHLUSS}
    </div>
</div>
</body></html>`;
}

/** E-Mail im offiziellen Layout (generateDispatchEmailHTML, vorstand.html). */
function emailHtml({ betreff, text, mitglied, absender, datum = new Date() }) {
    const titel = platzhalterErsetzen(betreff, mitglied);
    const inhalt = textZuHtml(platzhalterErsetzen(text, mitglied));
    const kopf = titel
        ? `<div style="font-weight:bold;font-size:13pt;">${escapeHtml(titel)}</div><hr style="border:none;border-top:1px solid #000;margin:8px 0 15px 0;">`
        : '';
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.4;color:#000;">
<div style="max-width:660px;margin:0 auto;padding:20px;background:white;">
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:15px;">
        <tr>
            <td width="120" valign="top"><img src="${LOGO}" alt="FWV Raura" width="110" style="display:block;"></td>
            <td valign="top" style="padding-left:15px;">
                <div style="font-size:20pt;font-weight:bold;line-height:1.2;">Feuerwehrverein Raura</div>
                <div style="font-size:20pt;font-weight:bold;line-height:1.2;">Kaiseraugst</div>
            </td>
        </tr>
    </table>
    <div style="font-size:8pt;color:#333;margin-bottom:15px;">${escapeHtml(absender)}</div>
    <div style="text-align:right;margin-bottom:20px;">Kaiseraugst, ${schweizerDatum(datum)}</div>
    ${kopf}
    <div>${inhalt}</div>
    <div style="margin-top:25px;">
        ${SCHLUSS}
    </div>
</div>
</body></html>`;
}

module.exports = {
    PLATZHALTER,
    BRIEF_RAND,
    escapeHtml,
    platzhalterErsetzen,
    textZuHtml,
    istDeutscherEmpfaenger,
    adressZeilen,
    hatPostadresse,
    empfaenger,
    absenderZeile,
    schweizerDatum,
    briefHtml,
    emailHtml
};
