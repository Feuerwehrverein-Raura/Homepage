// PDF eines Anlasses (Flyer, Programm; events.pdf_attachment, Base64) bei
// Einladungen mitschicken: als Anhang der E-Mail und als weitere Seiten des
// Briefs. Vorher kam es nie mit - die App gab den Anlass gar nicht weiter,
// die Website schickte attachments: [] (Preisjassen 2026, 01.11.2026).
//
// Ausloeser ist event_id in /email/bulk und /dispatch/send-post; ohne
// event_id bleibt alles wie bisher.

const { PDFDocument } = require('pdf-lib');

/** { filename, content (Base64), contentType } oder null. */
async function anlassPdf(pool, eventId) {
    if (!eventId) return null;
    const r = await pool.query(
        'SELECT pdf_attachment, pdf_filename FROM events WHERE id::text = $1', [String(eventId)]);
    const zeile = r.rows[0];
    if (!zeile || !zeile.pdf_attachment) return null;
    return {
        filename: zeile.pdf_filename || 'Anlass.pdf',
        content: zeile.pdf_attachment,
        contentType: 'application/pdf',
    };
}

/** Anhaenge fuer die E-Mail: was der Aufrufer schickt, dazu das PDF des
 * Anlasses (nicht doppelt, falls der Aufrufer es schon beigelegt hat). */
function mitAnlassPdf(anhaenge, pdf) {
    const liste = Array.isArray(anhaenge) ? anhaenge.filter((a) => a && a.content) : [];
    if (pdf && !liste.some((a) => a.filename === pdf.filename)) liste.push(pdf);
    return liste;
}

/** Brief-PDF und angehaengte PDFs (Base64) zu einem PDF. */
async function seitenAnhaengen(briefPdf, anhaenge) {
    const pdfs = (anhaenge || []).filter((a) => a && a.content
        && (!a.contentType || a.contentType === 'application/pdf')
        && /\.pdf$/i.test(a.filename || '.pdf'));
    if (!pdfs.length) return briefPdf;
    const ganz = await PDFDocument.load(briefPdf);
    for (const a of pdfs) {
        const doc = await PDFDocument.load(Buffer.from(a.content, 'base64'), { ignoreEncryption: true });
        const seiten = await ganz.copyPages(doc, doc.getPageIndices());
        seiten.forEach((s) => ganz.addPage(s));
    }
    return Buffer.from(await ganz.save());
}

module.exports = { anlassPdf, mitAnlassPdf, seitenAnhaengen };
