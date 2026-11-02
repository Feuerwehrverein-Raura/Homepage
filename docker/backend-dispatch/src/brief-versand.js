// Ein Weg fuer jeden Brief an Pingen (Versandkern): HTML rendern, Beilagen
// und PDF des Anlasses als weitere Seiten, Fenster CH rechts / DE links, bei
// Pingen anlegen und deren Pruefung abwarten, protokollieren, Kostenmeldung
// an den Kassier.
//
// Vorher hatte jeder Brief-Endpunkt seinen eigenen Ablauf (send-post,
// send-pdf-post, send-bulk-pdf, send-manual, send-arbeitsplan): Adresse mal im
// HTML, mal mit pdf-lib aufgedruckt, Pruefung mal abgewartet, mal nicht,
// Protokoll und Kostenmeldung mal da, mal nicht. Lehnte Pingen einen Brief ab
// (Preisjassen 01.11.2026: "protected_stamp_area"), stand im Protokoll
// trotzdem "gesendet".
//
// Abhaengigkeiten kommen von aussen (Rendern mit Puppeteer, Pingen-API,
// Datenbank), damit die Tests ohne sie laufen (test/brief-versand.test.js).

const L = require('./nachricht-layout');
const { mitAnlassPdf, seitenAnhaengen } = require('./anlass-pdf');

// Standardrand (wie bisher send-post ohne pdf_margin): unten Platz fuer die
// Seitenzahl.
const STANDARD_RAND = { top: '0', right: '0', bottom: '20mm', left: '0' };

/** Pingen-Status, bei denen die Pruefung noch laeuft. */
const PRUEFUNG_LAEUFT = ['created', 'uploaded', 'validating', 'processing'];

/** Dateiname fuer Pingen: Betrag und Empfaenger, ohne Sonderzeichen. */
function dateiname(betreff, name) {
    return `${String(betreff || 'Brief').replace(/[^a-zA-Z0-9äöüÄÖÜ]/g, '_')}_${String(name || '').replace(/\s+/g, '_')}.pdf`;
}

/** Deckblatt fuer ein beigelegtes PDF (PDF per Post, Arbeitsplan) im
 *  Vereinslayout - mit Adresse im richtigen Fenster. */
function deckblattHtml({ betreff, hinweis, mitglied, absender }) {
    const text = hinweis || `Beiliegend erhalten Sie «${betreff || 'Unterlagen'}».`;
    return L.briefHtml({ betreff, text, mitglied, absender });
}

/**
 * versenden({ html, rand, recipient, memberId, subject, staging, eventId,
 *             anhaenge, pruefen }) -> { letterId, status }
 * Wirft mit status 422, wenn Pingen den Brief ablehnt (action_required) -
 * der Brief bleibt dann in Pingen liegen und wird nicht gedruckt.
 */
function briefVersand({ rendern, pingen, protokollieren, kostenMelden, anlassPdfLaden, log = () => {} }) {
    // anlassPdfMit: das PDF des Anlasses (eventId) als weitere Seiten - bei
    // Einladungen ja, bei Mitteilungen an Angemeldete nicht (eventId dann nur
    // fuers Protokoll).
    return async function versenden({ html, rand, recipient, memberId, subject, staging = false, eventId,
        anhaenge, pruefen = true, anlassPdfMit = true }) {
        if (!html || !recipient || !recipient.name) {
            throw Object.assign(new Error('html und recipient erforderlich'), { status: 400 });
        }
        const pdf = await rendern(html, rand && typeof rand === 'object' ? rand : STANDARD_RAND);
        const beilagen = mitAnlassPdf(anhaenge, eventId && anlassPdfMit ? await anlassPdfLaden(eventId) : null);
        const ganz = await seitenAnhaengen(pdf, beilagen);
        const brief = await pingen({
            pdf: ganz,
            dateiname: dateiname(subject, recipient.name),
            links: recipient.country === 'DE',
            staging,
            pruefen
        });
        const abgelehnt = brief.status === 'action_required';
        await protokollieren({
            memberId, recipient, subject, letterId: brief.letterId, staging, eventId,
            status: abgelehnt ? 'failed' : 'sent', fehler: abgelehnt ? brief.grund : null
        });
        if (abgelehnt) {
            log('Pingen lehnt Brief ab', { name: recipient.name, grund: brief.grund });
            throw Object.assign(new Error(`Pingen lehnt den Brief an ${recipient.name} ab: ${brief.grund || 'Pruefung fehlgeschlagen'}`),
                { status: 422, letterId: brief.letterId });
        }
        if (!staging) await kostenMelden(recipient.name, brief.letterId, subject);
        return { letterId: brief.letterId, status: brief.status };
    };
}

module.exports = { STANDARD_RAND, PRUEFUNG_LAEUFT, dateiname, deckblattHtml, briefVersand };
