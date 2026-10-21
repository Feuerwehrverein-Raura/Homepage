// Mehrere Briefe zu EINEM PDF (z.B. alle Beitragsbriefe zum Drucken): ein
// Browser fuer alle, jeder Brief mit eigenen Seitenzahlen, dann mit pdf-lib
// zusammengefuegt. Rand wie /dispatch/send-post.

const puppeteer = require('puppeteer');
const { PDFDocument } = require('pdf-lib');

async function sammelPdfRendern(htmls, pdf_margin) {
    const margin = (pdf_margin && typeof pdf_margin === 'object')
        ? pdf_margin
        : { top: '0', right: '0', bottom: '20mm', left: '0' };
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    try {
        const gesamt = await PDFDocument.create();
        for (const html of htmls) {
            // Je Brief eine frische Seite: ein zweites setContent auf derselben
            // Seite wartet vergeblich auf networkidle0 (21.10.2026, Timeout).
            const page = await browser.newPage();
            let pdf;
            try {
                await page.setContent(html, { waitUntil: 'networkidle0' });
                pdf = await page.pdf({
                    format: 'A4',
                    printBackground: true,
                    margin,
                    displayHeaderFooter: true,
                    headerTemplate: '<div></div>',
                    footerTemplate: '<div style="width: 100%; font-family: Arial, sans-serif; font-size: 9pt; color: #666; padding: 0 25mm 0 0; text-align: right;">Seite <span class="pageNumber"></span> von <span class="totalPages"></span></div>'
                });
            } finally {
                await page.close();
            }
            const einzeln = await PDFDocument.load(pdf);
            const seiten = await gesamt.copyPages(einzeln, einzeln.getPageIndices());
            seiten.forEach(seite => gesamt.addPage(seite));
        }
        return Buffer.from(await gesamt.save());
    } finally {
        await browser.close();
    }
}

module.exports = { sammelPdfRendern };
