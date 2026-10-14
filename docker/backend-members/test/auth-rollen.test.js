// requireRole: Gruppen ohne Gross/klein (Authentik "Vorstand", Vorstand-JWT
// "vorstand"). Dieselbe Logik steht in backend-accounting und backend-dispatch.

const test = require('node:test');
const assert = require('node:assert/strict');
const { requireRole } = require('../src/auth-middleware');

function pruefen(groups) {
    let status = null;
    let weiter = false;
    const res = { status(c) { status = c; return { json() {} }; } };
    requireRole('vorstand', 'admin')({ user: groups === undefined ? undefined : { groups } }, res, () => { weiter = true; });
    return weiter ? 'weiter' : status;
}

test('Vorstand gross und klein, admin: durch', () => {
    assert.equal(pruefen(['Vorstand']), 'weiter');
    assert.equal(pruefen(['vorstand']), 'weiter');
    assert.equal(pruefen(['Mitglieder', 'ADMIN']), 'weiter');
});

test('normales Mitglied oder ohne Gruppen: 403, ohne Anmeldung: 401', () => {
    assert.equal(pruefen(['Mitglieder', 'Lager']), 403);
    assert.equal(pruefen([]), 403);
    assert.equal(pruefen(undefined), 401);
});
