// Speicherplatz der Postfaecher im Vorstand (scripts/mailcow-groesse.js):
// Mailcow liefert Bytes, nimmt beim Schreiben MB.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');
const sandbox = {};
vm.runInNewContext(fs.readFileSync(
    path.join(root, 'docker/frontend-website/scripts/mailcow-groesse.js'), 'utf8'), sandbox);
const { mailcowGroesse, mailcowBelegung, mailcowBytesZuMb, mailcowMbAusEingabe } = sandbox;

const MB = 1024 * 1024;

test('Bytes lesbar', () => {
    assert.equal(mailcowGroesse(0), '0 B');
    assert.equal(mailcowGroesse(500), '500 B');
    assert.equal(mailcowGroesse(12 * 1024), '12 KB');
    assert.equal(mailcowGroesse(72 * MB), '72 MB');
    assert.equal(mailcowGroesse(1073741824), '1.0 GB');
    assert.equal(mailcowGroesse(1.5 * 1024 * MB), '1.5 GB');
    assert.equal(mailcowGroesse(20 * 1024 * MB), '20 GB');
    assert.equal(mailcowGroesse('3145728'), '3 MB');
});

test('Belegung: der Live-Befund "72 / 1073741824 MB" wird lesbar', () => {
    assert.equal(mailcowBelegung(72 * MB, 1073741824), '72 MB / 1.0 GB');
    assert.equal(mailcowBelegung(72 * MB, 0), '72 MB / unbegrenzt');
    assert.equal(mailcowBelegung(undefined, '0'), '0 B / unbegrenzt');
});

test('Formular: Bytes -> MB vorbefuellen, MB zurueckschreiben', () => {
    assert.equal(mailcowBytesZuMb(1073741824), 1024);
    assert.equal(mailcowBytesZuMb(0), 0);
    assert.equal(mailcowBytesZuMb('3221225472'), 3072);
    assert.equal(mailcowMbAusEingabe('1024'), 1024);
    assert.equal(mailcowMbAusEingabe(' 0 '), 0);
    assert.equal(mailcowMbAusEingabe('-5'), 0);
    assert.equal(mailcowMbAusEingabe(''), null);
    assert.equal(mailcowMbAusEingabe('1.5'), null);
    // Rundreise: was gelesen wird, wird unveraendert als MB geschrieben
    assert.equal(mailcowMbAusEingabe(String(mailcowBytesZuMb(2048 * MB))), 2048);
});
