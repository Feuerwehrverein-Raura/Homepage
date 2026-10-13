// DEUTSCH: Texte aus der API sicher ins HTML schreiben — gemeinsam fuer
// Startseite, Anlass-Seite, Kalender, Mitgliederbereich, Event-Dashboard und
// Vorstand.
//
// Titel, Ort, Beschreibung, Namen, Notizen usw. kommen aus der Datenbank und
// koennen von Mitgliedern (Anlass-Vorschlaege) oder externen Organisatoren
// stammen. Wer solche Werte per Template-String in innerHTML schreibt, muss
// sie mit escapeHtml() maskieren — sonst laeuft eingeschleustes HTML/JS im
// Browser des Vorstands oder der Besucher.
//
// escapeHtml() ist fuer Text-Inhalt UND Attributwerte in Anfuehrungszeichen
// gedacht (maskiert auch " und '). Fuer href/src zusaetzlich sichereUrl(),
// damit kein javascript:- oder data:-Link entsteht.

// DEUTSCH: & < > " ' maskieren; null/undefined werden zu ''
function escapeHtml(wert) {
    return String(wert ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

// DEUTSCH: Adresse fuer href/src pruefen. Erlaubt sind http(s), mailto und tel
// sowie relative Pfade der eigenen Website ("/...", "./...", "events.html?...").
// Alles andere (javascript:, data:, vbscript: ...) wird zu ersatz ('#').
// Das Ergebnis ist schon fuer das Attribut maskiert.
function sichereUrl(wert, ersatz = '#') {
    const roh = String(wert ?? '').trim();
    if (!roh) return ersatz;
    let url;
    try {
        url = new URL(roh, window.location.href);
    } catch (e) {
        return ersatz;
    }
    if (!['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) return ersatz;
    return escapeHtml(roh);
}

// DEUTSCH: Wert fuer ein onclick="fn('...')" in einfachen Anfuehrungszeichen:
// zuerst als JS-String maskieren, dann fuer das HTML-Attribut.
function escapeJsAttr(wert) {
    return escapeHtml(String(wert ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r?\n/g, '\\n')
        .replace(/</g, '\\x3c'));
}
