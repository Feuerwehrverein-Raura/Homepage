// Vorstand als Organisator, wenn keiner eingetragen ist (organisator-standard.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { STANDARD_ORGANISATOR, ohneOrganisator, istStandardOrganisator } = require('../src/organisator-standard');

test('ohne Mitglied, Name und E-Mail organisiert der Vorstand', () => {
    assert.equal(ohneOrganisator({}), true);
    assert.equal(ohneOrganisator({ organizer_id: null, organizer_name: ' ', organizer_email: '' }), true);
    assert.equal(ohneOrganisator({ organizer_id: 'a1b2' }), false);
    assert.equal(ohneOrganisator({ organizer_name: 'Brigitte' }), false);
    assert.equal(ohneOrganisator({ organizer_email: 'x@y.ch' }), false);
    assert.deepEqual({ ...STANDARD_ORGANISATOR }, { organizer_name: 'Vorstand', organizer_email: 'vorstand@fwv-raura.ch' });
});

test('nur die genaue Vorgabe gilt als Standard (keine Organisator-Mail)', () => {
    assert.equal(istStandardOrganisator({ organizer_name: 'Vorstand', organizer_email: 'Vorstand@fwv-raura.ch' }), true);
    assert.equal(istStandardOrganisator({ organizer_name: 'Vorstand', organizer_email: 'vorstand@fwv-raura.ch', organizer_id: 'm1' }), false);
    assert.equal(istStandardOrganisator({ organizer_name: 'René', organizer_email: 'vorstand@fwv-raura.ch' }), false);
});

test('vorstand@ steht in beiden Listen, die keinen Event-Zugang anlegen', () => {
    const quelle = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
    const listen = quelle.match(/vorstandEmails = \[[^\]]*\]/g) || [];
    assert.ok(listen.length >= 2, 'POST und PUT /events');
    for (const l of listen) assert.match(l, /'vorstand@fwv-raura\.ch'/);
});
