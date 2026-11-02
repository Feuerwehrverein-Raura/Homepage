// Arbeitsplan nach dem Versand geaendert (src/arbeitsplan-update.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../src/arbeitsplan-update');

const plan = (barNamen, extra = false) => ({
    bereiche: ['Bar', 'Küche'],
    tage: [{
        bezeichnung: 'Samstag, 17.10.2026',
        zeilen: [
            { zeit: '18:00-20:00', zellen: [{ besetzt: barNamen }, { besetzt: ['Paola'] }] },
            ...(extra ? [{ zeit: '20:00-22:00', zellen: [{ besetzt: [] }, null] }] : [])
        ]
    }]
});

test('Stand und Fingerabdruck unabhaengig von der Reihenfolge der Namen', () => {
    const a = U.planSchichten(plan(['Dario', 'Anna']));
    assert.deepEqual(a['Samstag, 17.10.2026 18:00-20:00 Bar'], ['Anna', 'Dario']);
    assert.equal(U.standHash(a), U.standHash(U.planSchichten(plan(['Anna', 'Dario']))));
    assert.notEqual(U.standHash(a), U.standHash(U.planSchichten(plan(['Anna']))));
});

test('Vergleich: wer neu, wer nicht mehr, neue und entfallene Schichten', () => {
    const alt = U.planSchichten(plan(['Anna', 'Dario']));
    const neu = U.planSchichten(plan(['Anna', 'Hans'], true));
    assert.deepEqual(U.planVergleich(alt, neu), [
        'Samstag, 17.10.2026 18:00-20:00 Bar: neu Hans; nicht mehr Dario',
        'Neue Schicht: Samstag, 17.10.2026 20:00-22:00 Bar'
    ]);
    assert.deepEqual(U.planVergleich(neu, alt).slice(-1), ['Schicht entfällt: Samstag, 17.10.2026 20:00-22:00 Bar']);
});

test('Wartezeit und Brief-Frist nach Tagen bis zum Anlass', () => {
    const jetzt = new Date('2026-10-10T08:00:00Z');
    assert.equal(U.wartezeitMinuten('2026-10-17', jetzt), 60);
    assert.equal(U.wartezeitMinuten('2026-10-11', jetzt), 10);
    assert.equal(U.wartezeitMinuten('2026-10-10T18:00', jetzt), 10);
    assert.equal(U.briefNochSinnvoll('2026-10-15', jetzt), true);
    assert.equal(U.briefNochSinnvoll('2026-10-14', jetzt), false);
});

test('Ablauf: anfangen, merken, warten, versenden, zuruecksetzen', () => {
    const stand = U.planSchichten(plan(['Anna']));
    const geaendert = U.planSchichten(plan(['Anna', 'Hans']));
    const h = U.standHash(geaendert);
    const t = new Date('2026-10-01T10:00:00Z');
    const S = (o) => U.naechsterSchritt({ startDatum: '2026-10-17', jetzt: t, ...o }).art;
    assert.equal(S({ standJson: null, aktuell: stand }), 'anfangen');
    assert.equal(S({ standJson: stand, aktuell: stand }), 'nichts');
    assert.equal(S({ standJson: stand, aktuell: geaendert }), 'merken');
    assert.equal(S({ standJson: stand, neuStand: h, neuSeit: '2026-10-01T09:30:00Z', aktuell: geaendert }), 'warten');
    assert.equal(S({ standJson: stand, neuStand: h, neuSeit: '2026-10-01T08:59:00Z', aktuell: geaendert }), 'versenden');
    assert.equal(S({ standJson: stand, neuStand: 'alt', neuSeit: '2026-10-01T08:00:00Z', aktuell: geaendert }), 'merken', 'neue Aenderung: Uhr neu');
    assert.equal(S({ standJson: stand, neuStand: h, neuSeit: t, aktuell: stand }), 'zuruecksetzen', 'zurueckgeaendert');
});
