// Niemand gleichzeitig auf zwei Schichten (doppelte-schicht.js: zeitPaare,
// zeitKonflikte, zeitText).
const test = require('node:test');
const assert = require('node:assert/strict');
const { zeitPaare, zeitKonflikte, zeitText } = require('../src/doppelte-schicht');

const s = (id, date, start, end, extra = {}) =>
    ({ shift_id: id, name: 'Schicht', bereich: extra.bereich || null, date, start_time: start, end_time: end, anlass: extra.anlass || 'Chilbi 2026' });

test('Bar und Kueche zur selben Zeit (ueber Mitternacht) ueberschneiden sich', () => {
    const bar = s('b', '2026-10-17', '22:00:00', '02:00:00', { bereich: 'Bar' });
    const kueche = s('k', '2026-10-17', '22:00:00', '02:00:00', { bereich: 'Kueche' });
    const paare = zeitPaare([kueche], [bar]);
    assert.equal(paare.length, 1);
    assert.match(zeitText(paare), /Kueche Schicht am 17\.10\.2026 22:00–02:00 überschneidet sich mit Bar Schicht 22:00–02:00/);
});

test('direkt anschliessend ist erlaubt, teilweise Ueberlappung nicht', () => {
    const a = s('a', '2026-10-17', '16:00:00', '18:00:00');
    assert.equal(zeitPaare([s('b', '2026-10-17', '18:00:00', '20:00:00')], [a]).length, 0);
    assert.equal(zeitPaare([s('c', '2026-10-17', '17:00:00', '19:00:00')], [a]).length, 1);
    assert.equal(zeitPaare([s('d', '2026-10-18', '16:00:00', '18:00:00')], [a]).length, 0, 'anderer Tag');
});

test('Nachtschicht reicht in den Folgetag', () => {
    const nacht = s('n', '2026-10-17', '22:00:00', '02:00:00');
    assert.equal(zeitPaare([s('f', '2026-10-18', '01:00:00', '03:00:00')], [nacht]).length, 1);
    assert.equal(zeitPaare([s('g', '2026-10-18', '02:00:00', '04:00:00')], [nacht]).length, 0);
});

test('mehrere Schichten in derselben Anfrage, dieselbe Schicht nicht doppelt gezaehlt', () => {
    const x = s('x', '2026-10-17', '14:00:00', '16:00:00');
    const y = s('y', '2026-10-17', '15:00:00', '17:00:00');
    assert.equal(zeitPaare([x, y], []).length, 1);
    assert.equal(zeitPaare([x], [x]).length, 0, 'gleiche Schicht prueft schichtKonflikte');
    assert.equal(zeitPaare([s('o', '2026-10-17', null, null)], [x]).length, 0, 'ohne Zeit keine Aussage');
});

test('zeitKonflikte fragt Schichten und Anmeldungen der Person ab', async () => {
    const aufrufe = [];
    const db = {
        async query(sql, werte) {
            aufrufe.push({ sql, werte });
            if (sql.includes('FROM shifts s LEFT JOIN')) return { rows: [s('k', '2026-10-17', '22:00:00', '02:00:00', { bereich: 'Kueche' })] };
            return { rows: [s('b', '2026-10-17', '22:00:00', '02:00:00', { bereich: 'Bar' })] };
        }
    };
    const paare = await zeitKonflikte(db, { memberId: '11111111-1111-1111-1111-111111111111', shiftIds: ['k', 'k'], ausser: null });
    assert.equal(paare.length, 1);
    assert.deepEqual(aufrufe[0].werte, [['k']]);
    assert.equal(aufrufe[1].werte[4], '2026-10-17');
    // Ohne Person (kein Mitglied, keine Adresse): nur die Anfrage selbst.
    aufrufe.length = 0;
    assert.equal((await zeitKonflikte(db, { shiftIds: ['k'] })).length, 0);
    assert.equal(aufrufe.length, 1);
});
