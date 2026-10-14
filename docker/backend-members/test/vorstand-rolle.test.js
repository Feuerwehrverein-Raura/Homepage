const test = require('node:test');
const assert = require('node:assert/strict');
const { vorstandsRollen } = require('../src/vorstand-rolle');

test('Rollen aus der Funktion, mehrere moeglich', () => {
    assert.deepEqual(vorstandsRollen('Aktuar, Social Media'), ['aktuar']);
    assert.deepEqual(vorstandsRollen('Präsidentin'), ['praesident']);
    assert.deepEqual(vorstandsRollen('Praesident'), ['praesident']);
    assert.deepEqual(vorstandsRollen('Kassier / Beisitzer'), ['kassier', 'beisitzer']);
    assert.deepEqual(vorstandsRollen('Materialwartin'), ['materialwart']);
});

test('ohne Vorstandsfunktion: leer', () => {
    assert.deepEqual(vorstandsRollen('Social Media'), []);
    assert.deepEqual(vorstandsRollen(''), []);
    assert.deepEqual(vorstandsRollen(null), []);
});
