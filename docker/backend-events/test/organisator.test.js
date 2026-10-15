// Organisator-Login und oeffentliche Anmeldung gegen den echten Server:
//  - POST /registrations/public nimmt Titel und Benachrichtigungs-Adresse
//    nie vom Geraet; mit Mitglieder-Token zaehlt das Mitglied aus dem Token.
//  - POST /events/login und alle /events/my-event-Routen gelten nicht mehr,
//    wenn der Anlass vorbei oder abgesagt ist.
//
// Startet src/index.js gegen die Test-Datenbank (TEST_DATABASE_URL, Schema
// frisch; ACHTUNG: leert sie) und einen nachgebauten api-dispatch, der die
// verschickten E-Mails nur mitschreibt.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const DB = process.env.TEST_DATABASE_URL;
const PORT = 55875;
const DISPATCH_PORT = 55876;
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = 'test-geheim';
const JETZT = '2026-10-11T10:00:00+02:00';
const KONTAKT = 'kontakt-test@example.ch';
const PASSWORT = 'fake-passwort-1';

const id = (praefix, n) => `00000000-0000-0000-0000-${praefix}${String(n).padStart(12 - praefix.length, '0')}`;
const ERIKA = id('a', 1), HANS = id('a', 2);
const E = n => id('e', n);

async function seed(pool) {
    const q = (sql, p) => pool.query(sql, p);
    await q(`INSERT INTO members (id, vorname, nachname, email) VALUES
        ($1, 'Erika', 'Muster', 'erika@example.ch'), ($2, 'Hans', 'Helfer', 'hans@example.ch')`, [ERIKA, HANS]);
    const hash = crypto.createHash('sha256').update(PASSWORT).digest('hex');
    const ev = (n, slug, start, extra = {}) => q(
        `INSERT INTO events (id, slug, title, category, start_date, end_date, status, organizer_email,
                             event_email, event_password_hash, registration_required)
         VALUES ($1,$2,$3,'Sonstiges',$4,$5,$6,$7,$8,$9,true)`,
        [E(n), slug, `Anlass ${n}`, start, extra.end || null, extra.status || 'planned',
            extra.organizer_email || null, extra.login || null, extra.login ? hash : null]);
    await ev(1, 'kommend', '2026-10-24 18:00', { login: 'login@example.ch' });
    await ev(2, 'vorbei', '2026-10-01 18:00', { login: 'alt@example.ch' });
    await ev(3, 'abgesagt', '2026-10-24 18:00', { login: 'abgesagt@example.ch', status: 'cancelled' });
    await ev(4, 'mit-organisator', '2026-10-25 18:00', { organizer_email: 'org@example.ch' });
    await ev(5, 'endet-heute', '2026-10-10 18:00', { end: '2026-10-11 16:00', login: 'heute@example.ch' });
    // aelter als 24 Monate: auch mit ?vergangene=true nicht in der Uebersicht
    await ev(6, 'uralt', '2024-09-01 18:00', { organizer_email: 'org@example.ch' });
    await ev(7, 'letztes-jahr', '2025-11-15 18:00');
}

test('Organisator-Login und oeffentliche Anmeldung', { skip: !DB && 'TEST_DATABASE_URL nicht gesetzt' }, async (t) => {
    const { Pool } = require('pg');
    const jwt = require('jsonwebtoken');
    const { schemaAufbauen } = require('./datenbank');
    const pool = new Pool({ connectionString: DB });
    await schemaAufbauen(pool);
    await seed(pool);

    // Nachgebauter api-dispatch: schreibt nur mit.
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
               MEMBERS_API_URL: 'http://127.0.0.1:9', ARBEITSPLAN_REMINDER_ENABLED: 'false' },
        stdio: 'ignore'
    });
    t.after(async () => { server.kill(); dispatch.close(); await pool.end(); });
    for (let i = 0; i < 50; i++) {
        try { if ((await fetch(`${BASE}/health`)).ok) break; } catch (_) { /* startet noch */ }
        await new Promise(r => setTimeout(r, 200));
    }

    const erika = jwt.sign({ type: 'member', sub: ERIKA, email: 'erika@example.ch' }, SECRET);
    const hans = jwt.sign({ type: 'member', sub: HANS, email: 'hans@example.ch' }, SECRET);
    const senden = async (pfad, body, token) => {
        const r = await fetch(BASE + pfad, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify(body)
        });
        return { status: r.status, json: await r.json() };
    };
    const an = adresse => mails.filter(m => m.to === adresse);

    await t.test('Mitglied mit Token: Mitglied aus dem Token, Empfaenger aus der Datenbank', async () => {
        mails.length = 0;
        const r = await senden('/registrations/public', {
            type: 'participant', eventId: E(1), eventTitle: 'Falscher Titel', organizerEmail: 'boese@example.com',
            name: 'Falscher Name', email: 'fremd@example.ch', participants: 1
        }, erika);
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.equal(r.json.isMember, true);
        assert.equal(r.json.pending_confirmation, undefined, 'kein Opt-in fuer Mitglieder');
        const reg = (await pool.query('SELECT * FROM registrations WHERE id = $1', [r.json.registrationId])).rows[0];
        assert.equal(reg.member_id, ERIKA);
        assert.equal(reg.guest_name, 'Erika Muster');
        assert.equal(reg.guest_email, 'erika@example.ch');
        assert.equal(an('boese@example.com').length, 0, 'nie an die Adresse vom Geraet');
        assert.equal(an('fremd@example.ch').length, 0);
        assert.equal(an('erika@example.ch').length, 1, 'Bestaetigung ans Mitglied');
        assert.equal(an(KONTAKT).length, 1, 'ohne organizer_email an die Kontaktadresse');
        assert.ok(!JSON.stringify(mails).includes('Falscher Titel'));

        const nochmal = await senden('/registrations/public', { type: 'participant', eventId: E(1), name: 'x', email: 'anders@example.ch' }, erika);
        // Dieselbe Person ueber das Token erkannt: keine zweite Zeile, die
        // bestehende Anmeldung kommt zurueck (src/doppelte-anmeldung.js).
        assert.equal(nochmal.status, 200, 'Doppelte Anmeldung ueber das Token erkannt');
        assert.equal(nochmal.json.bereits_angemeldet, true);
        assert.equal(nochmal.json.registrationId, r.json.registrationId);
    });

    await t.test('organizer_email des Anlasses bekommt die Meldung', async () => {
        mails.length = 0;
        const r = await senden('/registrations/public', {
            type: 'participant', eventId: E(4), organizerEmail: 'boese@example.com', name: 'Hans', email: 'hans@example.ch'
        }, hans);
        assert.equal(r.status, 200);
        assert.equal(an('org@example.ch').length, 1);
        assert.equal(an('boese@example.com').length, 0);
    });

    await t.test('ohne Token wie bisher: Mitglied ueber die E-Mail, Gaeste mit Opt-in', async () => {
        mails.length = 0;
        const mitglied = await senden('/registrations/public', { type: 'participant', eventId: E(4), name: 'Erika', email: 'ERIKA@example.ch' });
        assert.equal(mitglied.json.isMember, true);

        const gast = await senden('/registrations/public', {
            type: 'participant', eventId: E(1), name: 'Gast', email: 'gast@example.ch', organizerEmail: 'boese@example.com'
        });
        assert.equal(gast.json.pending_confirmation, true);
        const c = (await pool.query(`SELECT token, payload FROM registration_confirmations WHERE email = 'gast@example.ch'`)).rows[0];
        assert.equal(c.payload.organizerEmail, undefined, 'wird nicht mehr gespeichert');
        // Aeltere, noch offene Bestaetigung mit organizerEmail im Payload
        await pool.query(`UPDATE registration_confirmations SET payload = payload || '{"organizerEmail":"boese@example.com"}'::jsonb WHERE token = $1`, [c.token]);
        mails.length = 0;
        assert.equal((await fetch(`${BASE}/registrations/confirm?token=${c.token}`)).status, 200);
        assert.equal(an('boese@example.com').length, 0);
        assert.equal(an(KONTAKT).length, 1);
    });

    await t.test('ungueltiges Token: als Gast behandelt, kein Fehler', async () => {
        const r = await senden('/registrations/public', { type: 'participant', eventId: E(4), name: 'Gast 2', email: 'gast2@example.ch' }, 'kaputt');
        assert.equal(r.status, 200);
        assert.equal(r.json.pending_confirmation, true);
    });

    await t.test('Anlass bearbeiten (Organisator): Menue als Liste, nur geschickte Felder aendern', async () => {
        const org = jwt.sign({ type: 'member', sub: 'org-ohne-konto', email: 'org@example.ch' }, SECRET);
        const put = async body => {
            const r = await fetch(`${BASE}/events/${E(4)}/as-organizer`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${org}` },
                body: JSON.stringify(body)
            });
            return { status: r.status, json: await r.json() };
        };
        const erst = await put({ meal_options: ['Fleisch', 'Vegi'], registration_deadline: '2026-10-20 18:00:00' });
        assert.equal(erst.status, 200, JSON.stringify(erst.json));
        assert.deepEqual(erst.json.meal_options, ['Fleisch', 'Vegi']);
        const dann = await put({ title: 'Neuer Titel' });
        assert.equal(dann.status, 200);
        assert.deepEqual(dann.json.meal_options, ['Fleisch', 'Vegi'], 'Menue bleibt');
        assert.equal(dann.json.registration_deadline, '2026-10-20 18:00:00', 'Anmeldeschluss bleibt');
        const leer = await put({ meal_options: null });
        assert.equal(leer.json.meal_options, null);
    });

    await t.test('QR-Login mit Gruppe Vorstand: Rechte wie ueber Authentik, Organisator-Erkennung unveraendert', async () => {
        const anmeldungen = token => fetch(`${BASE}/events/${E(4)}/organizer-registrations`,
            { headers: { Authorization: `Bearer ${token}` } });
        // Hans organisiert Anlass 4 nicht: ohne Gruppe kein Zugriff.
        assert.equal((await anmeldungen(hans)).status, 403);
        const hansVorstand = jwt.sign({ type: 'member', sub: HANS, email: 'hans@example.ch',
            groups: ['Mitglieder', 'Vorstand'] }, SECRET);
        assert.equal((await anmeldungen(hansVorstand)).status, 200, 'Gruppe Vorstand (gross) aus dem Mitglieder-Token');
        const hansAdmin = jwt.sign({ type: 'member', sub: HANS, email: 'hans@example.ch', groups: ['admin'] }, SECRET);
        assert.equal((await anmeldungen(hansAdmin)).status, 200, 'Gruppe admin');
        const hansLager = jwt.sign({ type: 'member', sub: HANS, email: 'hans@example.ch', groups: ['Lager'] }, SECRET);
        assert.equal((await anmeldungen(hansLager)).status, 403, 'Lager ist kein Vorstand');
        // Der Organisator (E-Mail des Anlasses) bleibt Organisator, mit oder ohne Gruppen.
        const org = jwt.sign({ type: 'member', sub: 'org-ohne-konto', email: 'org@example.ch', groups: ['Mitglieder'] }, SECRET);
        assert.equal((await anmeldungen(org)).status, 200);
    });

    await t.test('Organisator-Uebersicht: ?vergangene=true nur fuer Vorstand/Admin', async () => {
        const uebersicht = async (token, abfrage = '') => {
            const r = await fetch(`${BASE}/events/organisator-uebersicht${abfrage}`,
                { headers: { Authorization: `Bearer ${token}` } });
            assert.equal(r.status, 200);
            return r.json();
        };
        const slugs = u => u.anlaesse.map(e => e.slug);
        const vorstand = jwt.sign({ type: 'vorstand', email: 'aktuar@example.ch', groups: ['vorstand'] }, SECRET);

        const ohne = await uebersicht(vorstand);
        assert.equal(ohne.vergangene, false);
        assert.ok(!slugs(ohne).includes('vorbei'), 'ohne Parameter nur aktuelle');

        const mit = await uebersicht(vorstand, '?vergangene=true');
        assert.equal(mit.zugang, 'vorstand');
        assert.equal(mit.vergangene, true);
        // aktuelle wie ohne Parameter vorne, danach die vergangenen, neuste zuerst
        assert.deepEqual(slugs(mit), [...slugs(ohne), 'vorbei', 'letztes-jahr']);
        assert.ok(!slugs(mit).includes('uralt'), 'nur die letzten 24 Monate');
        const vorbei = mit.anlaesse.find(e => e.slug === 'vorbei');
        assert.equal(vorbei.organisator.aktuell, false);
        assert.equal(vorbei.organisator.aktionen.anlass_bearbeiten, true, 'voll verwaltbar');
        assert.equal(vorbei.organisator.aktionen.loeschen, true);
        assert.ok(vorbei.organisator.zahlen);
        assert.ok(Array.isArray(vorbei.organisator.anmeldungen));
        assert.equal(vorbei.app.kann_bearbeiten, true);

        const admin = jwt.sign({ type: 'member', sub: HANS, email: 'hans@example.ch', groups: ['admin'] }, SECRET);
        assert.deepEqual(slugs(await uebersicht(admin, '?vergangene=true')), slugs(mit), 'admin wie Vorstand');

        // Organisator (Mitglied) und Organisator-Login: Parameter wird ignoriert
        const org = jwt.sign({ type: 'member', sub: 'org-ohne-konto', email: 'org@example.ch' }, SECRET);
        assert.deepEqual(await uebersicht(org, '?vergangene=true'), await uebersicht(org));
        assert.ok(!slugs(await uebersicht(org, '?vergangene=true')).includes('uralt'));
        const login = jwt.sign({ type: 'event-organizer', event_id: E(1) }, SECRET);
        assert.deepEqual(slugs(await uebersicht(login, '?vergangene=true')), ['kommend']);
    });

    await t.test('Organisator-Login: vorbei und abgesagt werden abgewiesen', async () => {
        const login = (email, password = PASSWORT) => senden('/events/login', { email, password });
        const ok = await login('login@example.ch');
        assert.equal(ok.status, 200);
        assert.equal(ok.json.event.id, E(1));
        assert.equal((await login('heute@example.ch')).status, 200, 'endet heute: gilt noch');

        const vorbei = await login('alt@example.ch');
        assert.equal(vorbei.status, 403);
        assert.equal(vorbei.json.error, 'Der Anlass ist vorbei – der Organisator-Zugang gilt nicht mehr.');
        const abgesagt = await login('abgesagt@example.ch');
        assert.equal(abgesagt.status, 403);
        assert.match(abgesagt.json.error, /abgesagt/);
        assert.equal((await login('alt@example.ch', 'falsch')).status, 401, 'falsches Passwort verraet nichts');

        const mein = await fetch(`${BASE}/events/my-event`, { headers: { Authorization: `Bearer ${ok.json.token}` } });
        assert.equal(mein.status, 200);
    });

    await t.test('bestehende Organisator-Tokens fuer vergangene/abgesagte Anlaesse gelten nicht mehr', async () => {
        for (const [n, text] of [[2, /vorbei/], [3, /abgesagt/]]) {
            const alt = jwt.sign({ type: 'event-organizer', event_id: E(n) }, SECRET, { expiresIn: '24h' });
            for (const [methode, pfad] of [['GET', '/events/my-event'], ['GET', '/events/my-event/members'],
                ['POST', `/events/my-event/registrations/${id('7', 1)}/approve`], ['GET', '/events/organisator-uebersicht']]) {
                const r = await fetch(BASE + pfad, { method: methode, headers: { Authorization: `Bearer ${alt}` } });
                assert.equal(r.status, 401, `${methode} ${pfad} fuer Anlass ${n}`);
                assert.match((await r.json()).error, text);
            }
        }
    });
});
