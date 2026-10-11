// Mitglieder-Tokens (QR-Code, Anmeldebon, App-Passwort, Passwort-Reset)
// tragen dieselben Gruppen wie ein Authentik-Token — gelesen ueber die
// Authentik-Admin-API, hier gegen ein nachgebautes Authentik.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const {
    gruppenAbfrage, memberJwtInhalt, mitgliedTokenPruefen, pruefAntwort
} = require('../src/member-gruppen');

const SECRET = 'test-geheim';
const API_TOKEN = 'ak-api-token';
const stumm = { warn() {}, error() {}, log() {} };

// Nachgebautes Authentik: Benutzer 7 mit groups_obj, Benutzer 8 nur ueber die
// Gruppenliste (aeltere/andere Version), Benutzer 9 -> Fehler.
async function fakeAuthentik(t) {
    const abrufe = [];
    let kaputt = false;
    const server = http.createServer((req, res) => {
        abrufe.push(req.url);
        res.setHeader('Content-Type', 'application/json');
        if (req.headers.authorization !== `Bearer ${API_TOKEN}`) {
            res.statusCode = 403;
            return res.end('{"detail":"no"}');
        }
        if (kaputt || req.url === '/api/v3/core/users/9/') {
            res.statusCode = 500;
            return res.end('{}');
        }
        if (req.url === '/api/v3/core/users/7/') {
            return res.end(JSON.stringify({
                pk: 7, groups: ['uuid-m', 'uuid-l'],
                groups_obj: [{ pk: 'uuid-m', name: 'Mitglieder' }, { pk: 'uuid-l', name: ' Lager ' }, { pk: 'x' }]
            }));
        }
        if (req.url === '/api/v3/core/users/8/') {
            return res.end(JSON.stringify({ pk: 8, groups: ['uuid-v'] }));
        }
        if (req.url === '/api/v3/core/groups/?members_by_pk=8&page_size=200') {
            return res.end(JSON.stringify({ results: [{ pk: 'uuid-v', name: 'Vorstand' }] }));
        }
        res.statusCode = 404;
        res.end('{}');
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    t.after(() => server.close());
    return {
        url: `http://127.0.0.1:${server.address().port}`,
        abrufe,
        kaputtMachen(v) { kaputt = v; }
    };
}

test('Gruppen-Namen aus groups_obj, 60 s zwischengespeichert', async (t) => {
    const ak = await fakeAuthentik(t);
    let uhr = 1000;
    const gruppenFuer = gruppenAbfrage({ authentikUrl: ak.url + '/', apiToken: API_TOKEN, jetzt: () => uhr, log: stumm });

    assert.deepEqual(await gruppenFuer('7'), ['Mitglieder', 'Lager']);
    assert.deepEqual(await gruppenFuer(7), ['Mitglieder', 'Lager']);
    assert.equal(ak.abrufe.length, 1, 'zweiter Aufruf aus dem Zwischenspeicher');

    uhr += 60 * 1000 + 1;
    assert.deepEqual(await gruppenFuer('7'), ['Mitglieder', 'Lager']);
    assert.equal(ak.abrufe.length, 2, 'nach 60 s neu gefragt');

    gruppenFuer.vergessen('7');
    await gruppenFuer('7');
    assert.equal(ak.abrufe.length, 3, 'nach vergessen() neu gefragt');
});

test('ohne groups_obj: Gruppenliste members_by_pk', async (t) => {
    const ak = await fakeAuthentik(t);
    const gruppenFuer = gruppenAbfrage({ authentikUrl: ak.url, apiToken: API_TOKEN, log: stumm });
    assert.deepEqual(await gruppenFuer('8'), ['Vorstand']);
    assert.deepEqual(ak.abrufe, ['/api/v3/core/users/8/', '/api/v3/core/groups/?members_by_pk=8&page_size=200']);
});

test('kein Konto, kein API-Token, Fehler -> null (wie bisher keine Gruppen), Fehler nicht gemerkt', async (t) => {
    const ak = await fakeAuthentik(t);
    const fehler = [];
    const log = { warn: (...a) => fehler.push(a.join(' ')), error: (...a) => fehler.push(a.join(' ')) };
    const gruppenFuer = gruppenAbfrage({ authentikUrl: ak.url, apiToken: API_TOKEN, log });

    assert.equal(await gruppenFuer(null), null);
    assert.equal(await gruppenFuer(''), null);
    assert.equal(ak.abrufe.length, 0, 'ohne Konto keine Anfrage');

    assert.equal(await gruppenFuer('9'), null);
    assert.ok(fehler.some(f => /9/.test(f)), 'Fehler wird geloggt');

    ak.kaputtMachen(true);
    assert.equal(await gruppenFuer('7'), null);
    ak.kaputtMachen(false);
    assert.deepEqual(await gruppenFuer('7'), ['Mitglieder', 'Lager'], 'Fehler wird nicht zwischengespeichert');

    const ohneToken = gruppenAbfrage({ authentikUrl: ak.url, apiToken: '', log });
    assert.equal(await ohneToken('7'), null);

    const falschesToken = gruppenAbfrage({ authentikUrl: ak.url, apiToken: 'falsch', log });
    assert.equal(await falschesToken('7'), null);
});

test('Mitglieder-Token: gleiche Form, Gruppen aus Authentik', async (t) => {
    const ak = await fakeAuthentik(t);
    const gruppenFuer = gruppenAbfrage({ authentikUrl: ak.url, apiToken: API_TOKEN, log: stumm });
    const daten = { memberId: 'uuid-erika', email: 'erika@example.ch', name: 'Erika Muster', benutzername: 'erika.muster' };

    const mit = jwt.sign(memberJwtInhalt(daten, await gruppenFuer('7')), SECRET, { expiresIn: '8h' });
    const d = jwt.verify(mit, SECRET);
    assert.equal(d.type, 'member');
    assert.equal(d.sub, 'uuid-erika');
    assert.equal(d.member_id, 'uuid-erika');
    assert.equal(d.email, 'erika@example.ch');
    assert.equal(d.benutzername, 'erika.muster');
    assert.deepEqual(d.groups, ['Mitglieder', 'Lager']);
    assert.equal(d.iss, undefined, 'kein Issuer — bleibt ein Mitglieder-Token');

    // Kein Konto / Fehler -> groups: [] wie frueher.
    assert.deepEqual(memberJwtInhalt(daten, null).groups, []);
    assert.deepEqual(memberJwtInhalt(daten, await gruppenFuer('9')).groups, []);
});

test('mitgliedTokenPruefen: nur gueltige Mitglieder-Tokens', () => {
    const gut = jwt.sign({ type: 'member', sub: 'u1', email: 'e@x.ch', groups: ['Vorstand'] }, SECRET, { expiresIn: '1h' });
    assert.equal(mitgliedTokenPruefen(gut, SECRET).sub, 'u1');

    assert.equal(mitgliedTokenPruefen(gut, 'anderes-geheim'), null, 'falsche Signatur');
    assert.equal(mitgliedTokenPruefen(jwt.sign({ type: 'member', sub: 'u1' }, SECRET, { expiresIn: '-1m' }), SECRET), null, 'abgelaufen');
    assert.equal(mitgliedTokenPruefen(jwt.sign({ type: 'vorstand', email: 'a@x.ch' }, SECRET), SECRET), null, 'Vorstand-Token');
    assert.equal(mitgliedTokenPruefen(jwt.sign({ type: 'event-organizer', event_id: 'e' }, SECRET), SECRET), null, 'Organisator-Token');
    assert.equal(mitgliedTokenPruefen(jwt.sign({ type: 'member' }, SECRET), SECRET), null, 'ohne Kennung');
    const ohneSignatur = jwt.sign({ type: 'member', sub: 'u1' }, null, { algorithm: 'none' });
    assert.equal(mitgliedTokenPruefen(ohneSignatur, SECRET), null, 'alg none');
    assert.equal(mitgliedTokenPruefen('', SECRET), null);
    assert.equal(mitgliedTokenPruefen(gut, ''), null);
});

test('pruefAntwort: aktuelle Gruppen vor denen im Token', () => {
    const inhalt = { sub: 'u1', type: 'member', name: 'Alt', groups: ['Lager'], exp: 1234 };
    const m = { id: 'u1', email: 'e@x.ch', benutzername: 'erika.muster', vorname: 'Erika', nachname: 'Muster' };
    assert.deepEqual(pruefAntwort(inhalt, m, ['Mitglieder', 'Vorstand']), {
        valid: true, member_id: 'u1', email: 'e@x.ch', name: 'Erika Muster',
        benutzername: 'erika.muster', groups: ['Mitglieder', 'Vorstand'], exp: 1234
    });
    assert.deepEqual(pruefAntwort(inhalt, m, null).groups, ['Lager'], 'Authentik weg -> Gruppen aus dem Token');
    assert.equal(pruefAntwort(inhalt, { id: 'u1' }, []).email, null);
});
