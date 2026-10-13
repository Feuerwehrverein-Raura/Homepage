// E-Mails zu Anlaessen mit Logo: Hat ein Anlass ein Bild (eigenes oder das
// Logo seiner Reihe, siehe anlass-logo.js), bekommt die Mail zusaetzlich eine
// schlichte HTML-Fassung mit dem Logo oben. Die Textfassung bleibt unveraendert
// und wird weiter mitgeschickt.
//
// api-dispatch (/email/send) nimmt ein fertiges Feld `html` und schickt es neben
// `body` als text/plain. Ohne `html` baut dispatch das HTML selbst aus dem Text
// (escapen, Links klickbar, Zeilenumbrueche) - genau so macht es textZuHtml hier
// auch, damit Mails mit und ohne Logo gleich aussehen.
//
// Bilder nur per absoluter https-URL, keine Anhaenge.

const { anlassLogo } = require('./anlass-logo');

/** Text fuer HTML-Inhalt und -Attribute escapen. */
function escapeHtml(wert) {
    return String(wert ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Mailtext -> HTML wie in api-dispatch: escapen, Links, Zeilenumbrueche. */
function textZuHtml(text) {
    // Erst Links ersetzen, dann Zeilenumbrueche - sonst landet <br> in der URL
    const urlRegex = /(https?:\/\/[^\s<]+)/g;
    return escapeHtml(text)
        .replace(urlRegex, '<a href="$1">$1</a>')
        .replace(/\n/g, '<br>');
}

/**
 * HTML-Fassung einer Anlass-Mail mit Logo oben, oder null, wenn der Anlass
 * kein Logo hat (dann bleibt alles wie bisher).
 */
function anlassMailHtml(event, text) {
    const logo = anlassLogo(event);
    if (!logo) return null;
    const name = escapeHtml(event?.title || 'Anlass');
    return '<!doctype html><html lang="de"><head><meta charset="utf-8">'
        + `<title>${name}</title></head>`
        + '<body style="margin:0;padding:16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#222;">'
        + `<p style="margin:0 0 16px 0;"><img src="${escapeHtml(logo)}" alt="${name}" width="96" height="96"`
        + ' style="display:block;width:96px;height:96px;border:0;"></p>'
        + `<div>${textZuHtml(text)}</div>`
        + '</body></html>';
}

/**
 * Nutzlast fuer /email/send um die HTML-Fassung mit Logo ergaenzen. Ohne Logo
 * (oder wenn schon html gesetzt ist) kommt die Nutzlast unveraendert zurueck.
 */
function mitAnlassLogo(event, nutzlast) {
    if (!nutzlast || nutzlast.html) return nutzlast;
    const html = anlassMailHtml(event, nutzlast.body);
    return html ? { ...nutzlast, html } : nutzlast;
}

module.exports = { escapeHtml, textZuHtml, anlassMailHtml, mitAnlassLogo };
