// Voll-Export (GET /dispatch/vollexport.xlsx): die Mappe aus buildWorkbook
// muss sich auch mit leeren Tabellen bauen lassen und alle Blaetter haben.
const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { buildWorkbook } = require('../src/backup-export');

const leer = {
    members: [], fees: [], invoices: [], transactions: [], registrations: [], events: [],
    dispatches: [], audit: [], serviceAccts: [], scheduled: [],
};

test('Voll-Export: Mappe mit allen Blaettern, Verstorbene fehlen', () => {
    const daten = {
        ...leer,
        members: [
            { id: 'a', vorname: 'Anna', nachname: 'Aktiv', status: 'Aktivmitglied' },
            { id: 'b', vorname: 'Berta', nachname: 'Tot', status: 'Verstorben' },
        ],
    };
    const wb = XLSX.read(buildWorkbook(daten), { type: 'buffer' });
    assert.ok(wb.SheetNames.length >= 9, wb.SheetNames.join(','));
    const mitglieder = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    assert.deepEqual(mitglieder.map((m) => m.Vorname), ['Anna']);
});

test('Voll-Export: leere Datenbank gibt trotzdem eine gueltige Datei', () => {
    const buf = buildWorkbook(leer);
    assert.equal(buf.subarray(0, 2).toString(), 'PK'); // xlsx ist ein Zip
});
