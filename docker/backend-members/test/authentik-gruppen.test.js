// Authentik-Gruppen verwalten: gegen ein nachgebautes Authentik mit den
// Gruppen, die es beim Verein tatsaechlich gibt (Stand 12.10.2026).
//
// Schreibt ausserdem die Vertragsdatei test/fixtures/gruppen-app.json fuer
// die Flutter-App:
//
//     FIXTURES_SCHREIBEN=1 node --test test/authentik-gruppen.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gruppenVerwaltung, gruppenAnsicht, darfGruppenVerwalten, istGesperrt } = require('../src/authentik-gruppen');

const stumm = { warn() {}, error() {}, log() {} };

function fakeAuthentik() {
    const gruppen = [
        { pk: 'g-lager', name: 'Lager', is_superuser: false, users: [] },
        { pk: 'g-mitgl', name: 'Mitglieder', is_superuser: false, users: [7, 8, 9] },
        { pk: 'g-rs', name: 'Roter Schopf', is_superuser: false, users: [8] },
        { pk: 'g-svc', name: 'Service Accounts', is_superuser: false, users: [99] },
        { pk: 'g-vor', name: 'Vorstand', is_superuser: false, users: [7] },
        { pk: 'g-admin', name: 'admin', is_superuser: false, users: [] },
        { pk: 'g-akadm', name: 'authentik Admins', is_superuser: true, users: [1] },
        { pk: 'g-ro', name: 'authentik Read-only', is_superuser: false, users: [] },
        { pk: 'g-ldap', name: 'ldap-suche', is_superuser: false, users: [98] },
        { pk: 'g-sm', name: 'social-media', is_superuser: false, users: [9] },
        { pk: 'g-geheim', name: 'Kasse', is_superuser: true, users: [] }
    ];
    const aufrufe = [];
    async function abrufen(url, opt = {}) {
        const u = new URL(url);
        aufrufe.push(`${opt.method || 'GET'} ${u.pathname}`);
        const antwort = (d, status = 200) => ({ ok: status < 300, status, text: async () => JSON.stringify(d) });
        if (opt.headers.Authorization !== 'Bearer tok') return antwort({}, 403);
        if (u.pathname === '/api/v3/core/groups/') {
            return antwort({ pagination: { next: 0 }, results: gruppen });
        }
        const m = u.pathname.match(/^\/api\/v3\/core\/groups\/([^/]+)\/(?:(add_user|remove_user)\/)?$/);
        if (m) {
            const g = gruppen.find(x => x.pk === m[1]);
            if (!g) return antwort({ detail: 'Not found.' }, 404);
            if (!m[2]) return antwort(g);
            const pk = JSON.parse(opt.body).pk;
            if (m[2] === 'add_user' && !g.users.includes(pk)) g.users.push(pk);
            if (m[2] === 'remove_user') g.users = g.users.filter(x => x !== pk);
            return antwort({}, 204);
        }
        return antwort({}, 404);
    }
    return { abrufen, aufrufe, gruppen };
}

function verwaltung(fake) {
    return gruppenVerwaltung({ authentikUrl: 'https://auth.test/', apiToken: 'tok', abrufen: fake.abrufen, log: stumm });
}

test('Wer verwalten darf: Vorstand oder admin, ohne Gross/klein', () => {
    assert.equal(darfGruppenVerwalten(['Vorstand']), true);
    assert.equal(darfGruppenVerwalten(['vorstand']), true);
    assert.equal(darfGruppenVerwalten(['admin']), true);
    assert.equal(darfGruppenVerwalten(['Roter Schopf', 'Lager']), false);
    assert.equal(darfGruppenVerwalten(undefined), false);
});

test('Liste: ohne admin, Superuser und technische Gruppen; automatische markiert', async () => {
    const fake = fakeAuthentik();
    const liste = await verwaltung(fake).liste();
    assert.deepEqual(liste.map(g => g.name), ['Lager', 'Mitglieder', 'Roter Schopf', 'social-media', 'Vorstand']);
    assert.deepEqual(liste.filter(g => g.automatisch).map(g => g.name), ['Mitglieder', 'social-media', 'Vorstand']);
    assert.deepEqual(liste.find(g => g.name === 'Roter Schopf').benutzer, [8]);
});

test('Aufnehmen und entfernen ueber add_user/remove_user', async () => {
    const fake = fakeAuthentik();
    const v = verwaltung(fake);
    assert.deepEqual(await v.hinzufuegen('g-rs', 7), { name: 'Roter Schopf' });
    assert.deepEqual(fake.gruppen.find(g => g.pk === 'g-rs').users, [8, 7]);
    assert.ok(fake.aufrufe.includes('POST /api/v3/core/groups/g-rs/add_user/'));
    await v.entfernen('g-rs', 8);
    assert.deepEqual(fake.gruppen.find(g => g.pk === 'g-rs').users, [7]);
});

test('Gesperrte Gruppen lassen sich auch direkt nicht aendern', async () => {
    const fake = fakeAuthentik();
    const v = verwaltung(fake);
    for (const pk of ['g-admin', 'g-akadm', 'g-ro', 'g-svc', 'g-ldap', 'g-geheim']) {
        await assert.rejects(v.hinzufuegen(pk, 7), e => e.status === 403, pk);
    }
    await assert.rejects(v.hinzufuegen('gibts-nicht', 7), e => e.status === 404);
    assert.ok(!fake.aufrufe.some(a => a.includes('add_user')), 'nie bei Authentik angekommen');
});

test('istGesperrt', () => {
    assert.equal(istGesperrt({ name: 'Admin' }), true);
    assert.equal(istGesperrt({ name: 'authentik Neu' }), true);
    assert.equal(istGesperrt({ name: 'Roter Schopf', is_superuser: false }), false);
    assert.equal(istGesperrt(null), true);
});

test('Ansicht fuer die App: Mitgliedernamen, fremde Konten nur gezaehlt', async () => {
    const liste = await verwaltung(fakeAuthentik()).liste();
    const mitglieder = [
        { id: 'm-7', vorname: 'Erika', nachname: 'Muster', authentik_user_id: 7 },
        { id: 'm-8', vorname: 'Hans', nachname: 'Beispiel', authentik_user_id: '8' },
        { id: 'm-x', vorname: 'Ohne', nachname: 'Konto', authentik_user_id: null }
    ];
    const a = gruppenAnsicht(liste, mitglieder);
    const mitgl = a.gruppen.find(g => g.name === 'Mitglieder');
    assert.deepEqual(mitgl.mitglieder.map(m => m.nachname), ['Beispiel', 'Muster']);
    assert.equal(mitgl.weitere_konten, 1);
    assert.deepEqual(a.gruppen.find(g => g.name === 'Roter Schopf').mitglieder,
        [{ id: 'm-8', vorname: 'Hans', nachname: 'Beispiel' }]);

    if (process.env.FIXTURES_SCHREIBEN) {
        const ziel = path.join(__dirname, 'fixtures', 'gruppen-app.json');
        fs.writeFileSync(ziel, JSON.stringify({
            gruppen: a,
            kandidaten: [
                { id: 'm-7', vorname: 'Erika', nachname: 'Muster', hat_konto: true },
                { id: 'm-x', vorname: 'Ohne', nachname: 'Konto', hat_konto: false }
            ]
        }, null, 2) + '\n');
    }
});
