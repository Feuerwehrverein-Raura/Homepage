// Webmail: welche Funktions-Postfaecher darf die Anmeldung sehen?
const test = require('node:test');
const assert = require('node:assert/strict');
const { allowedAccounts, rollenErgaenzen } = require('../src/imap-mail');

test('Vorstand-Token: das Postfach der Rolle', () => {
    assert.deepEqual(allowedAccounts({ user: { role: 'kassier' } }), ['kassier@fwv-raura.ch']);
    assert.deepEqual(allowedAccounts({ user: { role: 'admin' } }), []);
});

test('persoenliches Login: Rollen aus der Funktion, nur eindeutig', async () => {
    const pool = (rows) => ({ query: async () => ({ rows }) });
    const req = { user: { email: 'erika@example.ch', groups: ['Vorstand'] } };
    await new Promise(r => rollenErgaenzen(pool([{ funktion: 'Aktuar, Kassier' }]))(req, {}, r));
    assert.deepEqual(allowedAccounts(req), ['aktuar@fwv-raura.ch', 'kassier@fwv-raura.ch']);

    const geteilt = { user: { email: 'familie@example.ch' } };
    await new Promise(r => rollenErgaenzen(pool([{ funktion: 'Aktuar' }, { funktion: 'Kassier' }]))(geteilt, {}, r));
    assert.deepEqual(allowedAccounts(geteilt), []);
});
