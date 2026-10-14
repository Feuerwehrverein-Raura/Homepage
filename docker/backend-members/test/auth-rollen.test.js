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

// authenticateVorstand: Vorstand-Token wie bisher, sonst persoenliches Login
// mit Gruppe Vorstand/admin (hier mit dem Mitglieder-Token, das ohne Authentik
// pruefbar ist; der Authentik-Weg laeuft durch dieselbe Gruppenpruefung).
const jwt = require('jsonwebtoken');
const { authenticateVorstand } = require('../src/auth-middleware');

function vorstandPruefen(token) {
    process.env.JWT_SECRET = 'test-geheimnis';
    let status = null;
    let user = null;
    const req = { headers: token ? { authorization: `Bearer ${token}` } : {} };
    const res = { status(c) { status = c; return { json() {} }; } };
    authenticateVorstand(req, res, () => { user = req.user; });
    return user ? { weiter: true, user } : { status };
}

test('Vorstand-Token (IMAP/QR) wie bisher, mit Rolle', () => {
    const t = jwt.sign({ email: 'kassier@fwv-raura.ch', role: 'kassier', groups: ['vorstand'], type: 'vorstand' }, 'test-geheimnis');
    const r = vorstandPruefen(t);
    assert.equal(r.weiter, true);
    assert.equal(r.user.role, 'kassier');
});

test('persoenliches Login mit Gruppe Vorstand: durch, ohne: 403, ohne Token: 401', () => {
    const mit = jwt.sign({ type: 'member', email: 'erika@example.ch', groups: ['Mitglieder', 'Vorstand'] }, 'test-geheimnis');
    const ohne = jwt.sign({ type: 'member', email: 'hans@example.ch', groups: ['Mitglieder'] }, 'test-geheimnis');
    assert.equal(vorstandPruefen(mit).weiter, true);
    assert.equal(vorstandPruefen(mit).user.email, 'erika@example.ch');
    assert.equal(vorstandPruefen(ohne).status, 403);
    assert.equal(vorstandPruefen(null).status, 401);
});
