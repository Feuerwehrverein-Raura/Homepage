// Mitorganisatoren (src/mitorganisatoren.js, GET/POST/DELETE /events/:id/organizers):
//  - reine Funktionen: Passwort (scrypt mit Salz), Empfaengerliste, Ansicht
//  - gegen den echten Server: Zugriffsmatrix (Haupt-Organisator, Mitglied als
//    Mitorganisator, externer Mitorganisator, anderes Mitglied, Vorstand),
//    wer hinzufuegen/entfernen darf, Login des externen Mitorganisators,
//    organized-by-me / organisator-uebersicht, Benachrichtigungen, Widerruf.
//
// Der Server-Teil braucht TEST_DATABASE_URL (Schema frisch; ACHTUNG: leert
// die Datenbank) und einen nachgebauten api-dispatch, der Mails mitschreibt.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const m = require('../src/mitorganisatoren');

test('Passwort: scrypt mit Salz, falsches Passwort und fremde Formate abgelehnt', () => {
    const h = m.passwortHashen('geheim-123');
    assert.match(h, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    assert.notEqual(h, m.passwortHashen('geheim-123'), 'eigenes Salz pro Hash');
    assert.equal(m.passwortPruefen('geheim-123', h), true);
    assert.equal(m.passwortPruefen('geheim-124', h), false);
    const sha = crypto.createHash('sha256').update('geheim-123').digest('hex');
    assert.equal(m.passwortPruefen('geheim-123', sha), false, 'kein ungesalzenes SHA-256');
    assert.equal(m.passwortPruefen('geheim-123', null), false);
    assert.equal(m.passwortPruefen(undefined, h), false);
    assert.equal(m.neuesPasswort().length, 16);
});

test('Empfaenger: ohne Doppelte, ohne den Ausloeser, Reihenfolge bleibt', () => {
    assert.deepEqual(m.empfaengerListe('org@x.ch', ['A@x.ch', 'org@X.ch', '', null, 'a@x.ch', 'b@x.ch'], ['b@x.ch']),
        ['org@x.ch', 'A@x.ch']);
    assert.deepEqual(m.empfaengerListe([], ['a@x.ch'], ['A@X.CH']), []);
});

test('Ansicht eines Eintrags: Mitglied mit Namen aus members, extern mit Ablauf', () => {
    assert.deepEqual(m.eintragAnsicht({
        id: 'o1', member_id: 'm1', member_vorname: 'Hans', member_nachname: 'Helfer',
        member_email: 'hans@x.ch', email: null, password_hash: 'scrypt$x$y', created_by: 'erika@x.ch',
        created_at: '2026-10-14 10:00:00'
    }), {
        id: 'o1', art: 'mitglied', member_id: 'm1', name: 'Hans Helfer', email: 'hans@x.ch',
        zugang_bis: null, hinzugefuegt_von: 'erika@x.ch', hinzugefuegt_am: '2026-10-14 10:00:00'
    });
    const extern = m.eintragAnsicht({ id: 'o2', member_id: null, name: 'Eva Extern', email: 'eva@x.ch',
        password_hash: 'scrypt$a$b', access_expires: '2027-01-24 18:00:00' });
    assert.equal(extern.art, 'extern');
    assert.equal(extern.zugang_bis, '2027-01-24 18:00:00');
    assert.ok(!('password_hash' in extern), 'Hash nie in der Antwort');
});

test('Zugangsdaten-Mail: gleicher Text wie beim externen Haupt-Organisator', () => {
    const mail = m.zugangsdatenMail({ name: 'Eva', titel: 'Chilbi', loginEmail: 'eva@x.ch', passwort: 'pw',
        gueltigBis: new Date('2027-01-24T12:00:00Z'), rolle: 'Mitorganisator' });
    assert.equal(mail.subject, 'Ihre Zugangsdaten fuer Chilbi');
    assert.match(mail.body, /^Guten Tag Eva,\n\nSie wurden als Mitorganisator fuer das Event "Chilbi" eingetragen\./);
    assert.match(mail.body, /URL: https:\/\/fwv-raura\.ch\/event-dashboard\.html\nE-Mail: eva@x\.ch\nPasswort: pw\n/);
    assert.match(mail.body, /gueltig bis 24\.1\.2027\./);
    assert.match(m.zugangsdatenMail({ titel: 'X', loginEmail: 'a', passwort: 'b', gueltigBis: new Date() }).body,
        /^Guten Tag Organisator,\n\nSie wurden als Organisator fuer/);
});

const DB = process.env.TEST_DATABASE_URL;
const PORT = 61878;
const DISPATCH_PORT = 61879;
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = 'test-geheim';
const JETZT = '2026-10-11T10:00:00+02:00';
const KONTAKT = 'kontakt-test@example.ch';
const HAUPT_PASSWORT = 'haupt-passwort-1';

const id = (praefix, n) => `00000000-0000-0000-0000-${praefix}${String(n).padStart(12 - praefix.length, '0')}`;
const ERIKA = id('a', 1), HANS = id('a', 2), OTTO = id('a', 3);
const E = n => id('e', n);

async function seed(pool) {
    const q = (sql, p) => pool.query(sql, p);
    await q(`INSERT INTO members (id, vorname, nachname, email) VALUES
        ($1, 'Erika', 'Muster', 'erika@example.ch'), ($2, 'Hans', 'Helfer', 'hans@example.ch'),
        ($3, 'Otto', 'Andere', 'otto@example.ch')`, [ERIKA, HANS, OTTO]);
    // Anlass 1: Erika ist Haupt-Organisatorin (Mitglied)
    await q(`INSERT INTO events (id, slug, title, category, start_date, status, organizer_id, organizer_name,
                                 registration_required)
             VALUES ($1, 'chilbi', 'Chilbi', 'Sonstiges', '2026-10-24 18:00', 'planned', $2, 'Erika Muster', true)`,
    [E(1), ERIKA]);
    // Anlass 2: externer Haupt-Organisator mit dem bisherigen Login (SHA-256)
    await q(`INSERT INTO events (id, slug, title, category, start_date, status, organizer_name, organizer_email,
                                 event_email, event_password_hash, registration_required)
             VALUES ($1, 'grill', 'Grillfest', 'Sonstiges', '2026-10-25 18:00', 'planned', 'Gaby Grill',
                     'gaby@example.ch', 'grill@fwv-raura.ch', $2, true)`,
    [E(2), crypto.createHash('sha256').update(HAUPT_PASSWORT).digest('hex')]);
}

test('Mitorganisatoren gegen den echten Server', { skip: !DB && 'TEST_DATABASE_URL nicht gesetzt' }, async (t) => {
    const { Pool } = require('pg');
    const jwt = require('jsonwebtoken');
    const { schemaAufbauen } = require('./datenbank');
    const pool = new Pool({ connectionString: DB });
    await schemaAufbauen(pool);
    await seed(pool);

    const mails = [];
    const dispatch = http.createServer((req, res) => {
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
            if (req.url === '/email/send') mails.push(JSON.parse(body || '{}'));
            res.setHeader('Content-Type', 'application/json');
            res.end('{"success":true}');
        });
    });
    await new Promise(r => dispatch.listen(DISPATCH_PORT, '127.0.0.1', r));

    const server = spawn('node', [path.join(__dirname, '..', 'src', 'index.js')], {
        env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, JWT_SECRET: SECRET, TEST_JETZT: JETZT,
               DISPATCH_API_URL: `http://127.0.0.1:${DISPATCH_PORT}`, CONTACT_EMAIL: KONTAKT,
               MEMBERS_API_URL: 'http://127.0.0.1:9', INTERNAL_API_KEY: '', ARBEITSPLAN_REMINDER_ENABLED: 'false' },
        stdio: 'ignore'
    });
    t.after(async () => { server.kill(); dispatch.close(); await pool.end(); });
    for (let i = 0; i < 50; i++) {
        try { if ((await fetch(`${BASE}/health`)).ok) break; } catch (_) { /* startet noch */ }
        await new Promise(r => setTimeout(r, 200));
    }
    // Schema legt der Server beim Start an
    for (let i = 0; i < 50; i++) {
        const r = await pool.query(`SELECT to_regclass('public.event_organizers') AS t`);
        if (r.rows[0].t) break;
        await new Promise(r => setTimeout(r, 100));
    }

    const token = {
        erika: jwt.sign({ type: 'member', sub: ERIKA, email: 'erika@example.ch' }, SECRET),
        hans: jwt.sign({ type: 'member', sub: HANS, email: 'hans@example.ch' }, SECRET),
        otto: jwt.sign({ type: 'member', sub: OTTO, email: 'otto@example.ch' }, SECRET),
        vorstand: jwt.sign({ type: 'vorstand', email: 'praesident@fwv-raura.ch', role: 'praesident',
            groups: ['vorstand'] }, SECRET)
    };
    const anfrage = async (methode, pfad, wer, body) => {
        const tok = token[wer] || wer;
        const r = await fetch(BASE + pfad, {
            method: methode,
            headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        const text = await r.text();
        let json = null;
        try { json = JSON.parse(text); } catch (_) { /* kein JSON */ }
        return { status: r.status, json };
    };
    const zugriff = async wer => (await anfrage('GET', `/events/${E(1)}/organizer-registrations`, wer)).status;
    const bearbeiten = async wer => (await anfrage('PUT', `/events/${E(1)}/as-organizer`, wer,
        { description: `von ${wer}` })).status;
    const an = adresse => mails.filter(x => (x.to || '').toLowerCase() === adresse.toLowerCase());
    let hansEintrag, externEintrag, externPasswort;

    await t.test('vorher: nur Haupt-Organisatorin und Vorstand', async () => {
        assert.equal(await zugriff('erika'), 200);
        assert.equal(await zugriff('vorstand'), 200);
        assert.equal(await zugriff('hans'), 403);
        assert.equal(await zugriff('otto'), 403);
        const liste = await anfrage('GET', `/events/${E(1)}/organizers`, 'erika');
        assert.equal(liste.status, 200);
        assert.deepEqual(liste.json.hauptorganisator, { member_id: ERIKA, name: 'Erika Muster', email: 'erika@example.ch' });
        assert.deepEqual(liste.json.mitorganisatoren, []);
        assert.equal(liste.json.darf_verwalten, true);
        assert.equal((await anfrage('GET', `/events/${E(1)}/organizers`, 'otto')).status, 403);
    });

    await t.test('Haupt-Organisatorin fuegt ein Mitglied hinzu; Doppelte und sich selbst abgelehnt', async () => {
        mails.length = 0;
        const r = await anfrage('POST', `/events/${E(1)}/organizers`, 'erika', { member_id: HANS });
        assert.equal(r.status, 201, JSON.stringify(r.json));
        hansEintrag = r.json;
        assert.equal(r.json.art, 'mitglied');
        assert.equal(r.json.name, 'Hans Helfer');
        assert.equal(r.json.hinzugefuegt_von, 'erika@example.ch');
        await new Promise(res => setTimeout(res, 200));
        assert.equal(an('hans@example.ch').length, 1, 'Info-Mail ans Mitglied');
        assert.match(an('hans@example.ch')[0].subject, /Mitorganisator\/in: Chilbi/);

        assert.equal((await anfrage('POST', `/events/${E(1)}/organizers`, 'erika', { member_id: HANS })).status, 409);
        assert.equal((await anfrage('POST', `/events/${E(1)}/organizers`, 'erika', { member_id: ERIKA })).status, 409);
        assert.equal((await anfrage('POST', `/events/${E(1)}/organizers`, 'erika', { member_id: id('a', 99) })).status, 404);
        assert.equal((await anfrage('POST', `/events/${E(1)}/organizers`, 'erika', { name: 'Ohne Mail' })).status, 400);
    });

    await t.test('Mitglied als Mitorganisator: gleiche Rechte, verwaltet aber keine Organisatoren', async () => {
        assert.equal(await zugriff('hans'), 200);
        assert.equal(await bearbeiten('hans'), 200);
        assert.equal(await bearbeiten('otto'), 403);
        const schicht = await anfrage('POST', `/events/${E(1)}/shifts-as-organizer`, 'hans',
            { name: 'Bar', date: '2026-10-24', start_time: '18:00', end_time: '20:00', needed: 2 });
        assert.equal(schicht.status, 201, JSON.stringify(schicht.json));
        const notiz = await anfrage('POST', `/events/${E(1)}/organizer-notes`, 'hans', { content: 'Bier bestellen' });
        assert.equal(notiz.status, 201);

        const meine = await anfrage('GET', '/events/organized-by-me', 'hans');
        assert.deepEqual(meine.json.map(e => e.id), [E(1)]);
        assert.deepEqual((await anfrage('GET', '/events/organized-by-me', 'otto')).json, []);

        const uebersicht = await anfrage('GET', '/events/organisator-uebersicht', 'hans');
        assert.equal(uebersicht.json.zugang, 'mitglied');
        assert.deepEqual(uebersicht.json.anlaesse.map(a => a.id), [E(1)]);
        const aktionen = uebersicht.json.anlaesse[0].organisator.aktionen;
        assert.equal(aktionen.anlass_bearbeiten, true);
        assert.equal(aktionen.organisatoren_verwalten, false);
        assert.equal((await anfrage('GET', '/events/organisator-uebersicht', 'erika'))
            .json.anlaesse[0].organisator.aktionen.organisatoren_verwalten, true);
        const vorstand = await anfrage('GET', '/events/organisator-uebersicht', 'vorstand');
        assert.ok(vorstand.json.anlaesse.every(a => a.organisator.aktionen.organisatoren_verwalten));

        // GET /events: kann_bearbeiten fuer den Mitorganisator
        const ev = await anfrage('GET', `/events/${E(1)}`, 'hans');
        assert.equal(ev.json.app.kann_bearbeiten, true);

        // Liste sehen ja, verwalten nein
        const liste = await anfrage('GET', `/events/${E(1)}/organizers`, 'hans');
        assert.equal(liste.status, 200);
        assert.equal(liste.json.darf_verwalten, false);
        assert.equal((await anfrage('POST', `/events/${E(1)}/organizers`, 'hans', { member_id: OTTO })).status, 403);
        assert.equal((await anfrage('DELETE', `/events/${E(1)}/organizers/${hansEintrag.id}`, 'hans')).status, 403);
        assert.equal((await anfrage('POST', `/events/${E(1)}/organizers`, 'otto', { member_id: OTTO })).status, 403);
        // Anlass loeschen bleibt Vorstand
        assert.equal((await anfrage('DELETE', `/events/${E(1)}`, 'hans')).status, 403);
    });

    await t.test('Vorstand fuegt einen Externen hinzu: eigener Login per E-Mail', async () => {
        mails.length = 0;
        const r = await anfrage('POST', `/events/${E(1)}/organizers`, 'vorstand',
            { name: 'Eva Extern', email: 'Eva.Extern@Example.ch' });
        assert.equal(r.status, 201, JSON.stringify(r.json));
        externEintrag = r.json;
        assert.equal(r.json.art, 'extern');
        assert.equal(r.json.email, 'eva.extern@example.ch');
        assert.equal(r.json.zugang_gesendet, true);
        assert.ok(r.json.zugang_bis, 'Ablaufdatum gesetzt');
        assert.ok(!JSON.stringify(r.json).includes('scrypt'), 'kein Hash in der Antwort');
        const mail = an('Eva.Extern@Example.ch');
        assert.equal(mail.length, 1);
        assert.match(mail[0].body, /Sie wurden als Mitorganisator fuer das Event "Chilbi" eingetragen/);
        assert.match(mail[0].body, /E-Mail: eva\.extern@example\.ch/);
        externPasswort = mail[0].body.match(/Passwort: (\S+)/)[1];
        const db = (await pool.query('SELECT password_hash FROM event_organizers WHERE id = $1', [externEintrag.id])).rows[0];
        assert.match(db.password_hash, /^scrypt\$/);
        assert.ok(!db.password_hash.includes(externPasswort));

        assert.equal((await anfrage('POST', `/events/${E(1)}/organizers`, 'erika',
            { name: 'Nochmal', email: 'EVA.extern@example.ch' })).status, 409, 'E-Mail pro Anlass nur einmal');
        assert.equal((await anfrage('POST', `/events/${E(2)}/organizers`, 'vorstand',
            { name: 'Gaby', email: 'gaby@example.ch' })).status, 409, 'nicht die Haupt-Organisatorin');
    });

    await t.test('Login des externen Mitorganisators; Haupt-Login unveraendert', async () => {
        const falsch = await anfrage('POST', '/events/login', null, { email: 'eva.extern@example.ch', password: 'falsch' });
        assert.equal(falsch.status, 401);
        const login = await anfrage('POST', '/events/login', null, { email: 'EVA.extern@example.ch', password: externPasswort });
        assert.equal(login.status, 200, JSON.stringify(login.json));
        assert.equal(login.json.event.id, E(1));
        assert.equal(login.json.event.organizer_name, 'Eva Extern');
        const evaTok = login.json.token;
        token.eva = evaTok;
        const inhalt = jwt.verify(evaTok, SECRET);
        assert.equal(inhalt.type, 'event-organizer');
        assert.equal(inhalt.organisator_id, externEintrag.id);

        const mein = await anfrage('GET', '/events/my-event', 'eva');
        assert.equal(mein.status, 200);
        assert.equal(mein.json.id, E(1));
        assert.equal(mein.json.angemeldet_als, 'Eva Extern');
        assert.equal(mein.json.event_password_hash, undefined);
        assert.equal(mein.json.event_email, undefined);
        const u = await anfrage('GET', '/events/organisator-uebersicht', 'eva');
        assert.equal(u.status, 200);
        assert.equal(u.json.zugang, 'organisator-login');
        assert.equal(u.json.anlaesse[0].organisator.aktionen.organisatoren_verwalten, false);
        // Mit dem Event-Login keine Organisatoren-Verwaltung und kein fremder Anlass
        assert.equal((await anfrage('POST', `/events/${E(1)}/organizers`, 'eva', { member_id: OTTO })).status, 403);

        // Haupt-Organisator von Anlass 2 wie bisher
        const haupt = await anfrage('POST', '/events/login', null, { email: 'grill@fwv-raura.ch', password: HAUPT_PASSWORT });
        assert.equal(haupt.status, 200);
        assert.equal(haupt.json.event.id, E(2));
        assert.equal(jwt.verify(haupt.json.token, SECRET).organisator_id, undefined);
        assert.equal((await anfrage('POST', '/events/login', null, { email: 'grill@fwv-raura.ch', password: externPasswort })).status, 401);
    });

    await t.test('neue Anmeldung: Mitorganisatoren bekommen die Meldung auch', async () => {
        mails.length = 0;
        const r = await anfrage('POST', '/registrations/public', 'otto',
            { type: 'participant', eventId: E(1), name: 'Otto', email: 'otto@example.ch', participants: 1 });
        assert.equal(r.status, 200, JSON.stringify(r.json));
        const meldung = x => x.filter(mail => /Neue Anmeldung/.test(mail.subject || ''));
        assert.equal(meldung(an(KONTAKT)).length, 1, 'ohne organizer_email an die Kontaktadresse');
        assert.equal(meldung(an('hans@example.ch')).length, 1);
        assert.equal(meldung(an('eva.extern@example.ch')).length, 1);
        assert.equal(meldung(mails).length, 3, 'jede Adresse genau einmal');
    });

    await t.test('entfernen: Haupt-Organisatorin und Vorstand; Zugang sofort weg', async () => {
        assert.equal((await anfrage('DELETE', `/events/${E(1)}/organizers/${externEintrag.id}`, 'otto')).status, 403);
        assert.equal((await anfrage('DELETE', `/events/${E(1)}/organizers/${externEintrag.id}`, 'erika')).status, 200);
        assert.equal((await anfrage('DELETE', `/events/${E(1)}/organizers/${externEintrag.id}`, 'erika')).status, 404);
        for (const [methode, pfad] of [['GET', '/events/my-event'], ['GET', '/events/organisator-uebersicht'],
            ['GET', '/events/my-event/members']]) {
            const r = await anfrage(methode, pfad, 'eva');
            assert.equal(r.status, 401, `${methode} ${pfad}`);
        }
        assert.equal((await anfrage('GET', `/events/${E(1)}`, 'eva')).json.app.kann_bearbeiten, false);
        assert.equal((await anfrage('POST', '/events/login', null,
            { email: 'eva.extern@example.ch', password: externPasswort })).status, 401);

        assert.equal((await anfrage('DELETE', `/events/${E(1)}/organizers/${hansEintrag.id}`, 'vorstand')).status, 200);
        assert.equal(await zugriff('hans'), 403);
        assert.deepEqual((await anfrage('GET', '/events/organized-by-me', 'hans')).json, []);
    });

    await t.test('abgelaufener Zugang: Login abgewiesen', async () => {
        const r = await anfrage('POST', `/events/${E(1)}/organizers`, 'vorstand', { name: 'Alt', email: 'alt@example.ch' });
        const pw = an('alt@example.ch').at(-1).body.match(/Passwort: (\S+)/)[1];
        await pool.query(`UPDATE event_organizers SET access_expires = NOW() - INTERVAL '1 day' WHERE id = $1`, [r.json.id]);
        const login = await anfrage('POST', '/events/login', null, { email: 'alt@example.ch', password: pw });
        assert.equal(login.status, 401);
        assert.match(login.json.error, /abgelaufen/);
    });
});
