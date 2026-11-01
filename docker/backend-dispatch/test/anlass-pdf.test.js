// PDF des Anlasses bei Einladungen (src/anlass-pdf.js), Datenbank nachgebaut.
const test = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');
const A = require('../src/anlass-pdf');

async function pdf(seiten) {
    const d = await PDFDocument.create();
    for (let i = 0; i < seiten; i++) d.addPage();
    return Buffer.from(await d.save());
}

const pool = (zeile) => ({ query: async (sql, p) => ({ rows: zeile && p[0] === 'e1' ? [zeile] : [] }) });

test('anlassPdf: Name und Inhalt, ohne PDF oder event_id null', async () => {
    const roh = (await pdf(1)).toString('base64');
    assert.deepEqual(await A.anlassPdf(pool({ pdf_attachment: roh, pdf_filename: 'Jass.pdf' }), 'e1'),
        { filename: 'Jass.pdf', content: roh, contentType: 'application/pdf' });
    assert.equal(await A.anlassPdf(pool({ pdf_attachment: null, pdf_filename: null }), 'e1'), null);
    assert.equal(await A.anlassPdf(pool(null), 'e1'), null);
    assert.equal(await A.anlassPdf(pool({ pdf_attachment: roh }), undefined), null);
});

test('mitAnlassPdf: dazu, aber nicht doppelt', () => {
    const p = { filename: 'Jass.pdf', content: 'x' };
    assert.deepEqual(A.mitAnlassPdf(undefined, p), [p]);
    assert.deepEqual(A.mitAnlassPdf([], null), []);
    assert.deepEqual(A.mitAnlassPdf([{ filename: 'Jass.pdf', content: 'y' }], p), [{ filename: 'Jass.pdf', content: 'y' }]);
    assert.equal(A.mitAnlassPdf([{ filename: 'a.png', content: 'z' }], p).length, 2);
});

test('seitenAnhaengen: Brief plus PDF-Seiten, Bilder nicht', async () => {
    const brief = await pdf(1);
    const flyer = (await pdf(2)).toString('base64');
    const ganz = await A.seitenAnhaengen(brief, [
        { filename: 'Jass.pdf', content: flyer, contentType: 'application/pdf' },
        { filename: 'bild.png', content: 'abc', contentType: 'image/png' },
    ]);
    assert.equal((await PDFDocument.load(ganz)).getPageCount(), 3);
    assert.equal(await A.seitenAnhaengen(brief, []), brief);
});
