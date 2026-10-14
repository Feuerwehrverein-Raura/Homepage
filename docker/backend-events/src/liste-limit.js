// ?limit= fuer GET /events (Startseite: "Kommende Termine" zeigt nur die
// naechsten 3). Nur eine positive Ganzzahl gilt; alles andere (leer, 0,
// negativ, Komma, Text) heisst "ohne Limit". Nach oben gedeckelt, damit
// niemand mit limit=1e9 die Schicht-Abfragen pro Anlass aufblaest.

const MAX_LIMIT = 100;

/** Gueltiges Limit (1..MAX_LIMIT) oder null fuer "alle". */
function listenLimit(wert) {
    if (wert === undefined || wert === null) return null;
    const text = String(Array.isArray(wert) ? wert[0] : wert).trim();
    if (!/^\d+$/.test(text)) return null;
    const zahl = parseInt(text, 10);
    if (zahl < 1) return null;
    return Math.min(zahl, MAX_LIMIT);
}

module.exports = { listenLimit, MAX_LIMIT };
