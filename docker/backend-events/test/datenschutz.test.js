// Datenschutz: die oeffentlichen Anlass-Listen duerfen keine Kontaktdaten der
// Angemeldeten enthalten (E-Mail, Telefon, Bemerkungen). Bis Oktober 2026
// lieferte GET /events sie an jeden aus. Der Vorstand bekommt sie weiterhin.
// Die Organisator-Uebersicht liefert sie nur dem Organisator des Anlasses.
//
// Startet das echte src/index.js gegen die Test-Datenbank (TEST_DATABASE_URL;
// das Schema wird hier frisch aus init.sql + Migrationen aufgebaut).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');

const DB = process.env.TEST_DATABASE_URL;
const PORT = 61871;
const BASE = `http://127.0.0.1:${PORT}`;
const EVENT = '00000000-0000-0000-0000-0000000000d5';

test('oeffentliche Anlass-Listen ohne Kontaktdaten', { skip: !DB && 'TEST_DATABASE_URL nicht gesetzt' }, async (t) => {
    const { Pool } = require('pg');
    const jwt = require('jsonwebtoken');
    const { schemaAufbauen } = require('./datenbank');
    const pool = new Pool({ connectionString: DB });

    await schemaAufbauen(pool);
    await pool.query(
        `INSERT INTO events (id, slug, title, start_date, event_email, event_password_hash)
         VALUES ($1, 'test-datenschutz', 'Datenschutz-Test', NOW() + INTERVAL '30 days',
                 'login-geheim@example.ch', 'deadbeefhash0123456789')`,
        [EVENT]);
    const shift = (await pool.query(
        `INSERT INTO shifts (event_id, name, date, start_time, end_time, needed, bereich)
         VALUES ($1, 'Bar', CURRENT_DATE + 30, '18:00', '22:00', 2, 'Bar') RETURNING id`, [EVENT])).rows[0].id;
    await pool.query(
        `INSERT INTO registrations (event_id, guest_name, guest_email, shift_ids, notes, status)
         VALUES ($1, 'Gast Helfer', 'gast@example.ch', $2, 'Allergie: Nüsse', 'approved'),
                ($1, 'Teilnehmer Direkt', 'direkt@example.ch', NULL, 'vegetarisch', 'pending')`,
        [EVENT, [shift]]);

    const server = spawn('node', [path.join(__dirname, '..', 'src', 'index.js')], {
        env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, JWT_SECRET: 'test-geheim',
               DISPATCH_API_URL: 'http://127.0.0.1:9', ARBEITSPLAN_REMINDER_ENABLED: 'false' },
        stdio: 'ignore'
    });
    t.after(async () => { server.kill(); await pool.end(); });

    // warten, bis der Server antwortet
    for (let i = 0; i < 50; i++) {
        try { if ((await fetch(`${BASE}/events/${EVENT}`)).ok) break; } catch (_) { /* startet noch */ }
        await new Promise(r => setTimeout(r, 200));
    }

    // Kontaktdaten der Angemeldeten und Zugangsdaten des Organisator-Logins
    const kontaktdaten = text => /gast@example\.ch|direkt@example\.ch|Nüsse|vegetarisch|login-geheim|deadbeefhash/.test(text);

    for (const url of [`${BASE}/events`, `${BASE}/events/${EVENT}`, `${BASE}/events/test-datenschutz`]) {
        const ohne = await (await fetch(url)).text();
        assert.ok(ohne.includes('Gast Helfer'), `${url}: Namen muessen bleiben`);
        assert.ok(!kontaktdaten(ohne), `${url}: ohne Anmeldung keine Kontaktdaten`);

        const falsch = await fetch(url, { headers: { Authorization: 'Bearer kaputt' } });
        assert.equal(falsch.status, 200, `${url}: ungueltiges Token -> trotzdem oeffentliche Liste`);
        assert.ok(!kontaktdaten(await falsch.text()), `${url}: ungueltiges Token -> keine Kontaktdaten`);

        const vorstand = jwt.sign({ type: 'vorstand', email: 'aktuar@example.ch', groups: ['vorstand'] }, 'test-geheim');
        const mit = await (await fetch(url, { headers: { Authorization: `Bearer ${vorstand}` } })).text();
        assert.ok(kontaktdaten(mit), `${url}: Vorstand bekommt die Kontaktdaten weiterhin`);

        // QR-Code/Anmeldebon/App-Passwort: Mitglieder-Token mit den
        // Authentik-Gruppen — "Vorstand" wie bei Authentik gross geschrieben.
        const qrVorstand = jwt.sign({ type: 'member', sub: 'qr-vorstand', email: 'qr-vorstand@example.ch',
            groups: ['Mitglieder', 'Vorstand'] }, 'test-geheim');
        const mitQr = await (await fetch(url, { headers: { Authorization: `Bearer ${qrVorstand}` } })).text();
        assert.ok(kontaktdaten(mitQr), `${url}: QR-Login mit Gruppe Vorstand = Vorstand`);
        const qrMitglied = jwt.sign({ type: 'member', sub: 'qr-mitglied', email: 'qr-mitglied@example.ch',
            groups: ['Mitglieder'] }, 'test-geheim');
        const ohneQr = await (await fetch(url, { headers: { Authorization: `Bearer ${qrMitglied}` } })).text();
        assert.ok(!kontaktdaten(ohneQr), `${url}: QR-Login ohne Gruppe Vorstand bekommt keine Kontaktdaten`);
        const gefaelscht = jwt.sign({ type: 'member', sub: 'boese', email: 'boese@example.ch',
            groups: ['Vorstand'] }, 'falsches-geheim');
        const ohneFalsch = await (await fetch(url, { headers: { Authorization: `Bearer ${gefaelscht}` } })).text();
        assert.ok(!kontaktdaten(ohneFalsch), `${url}: selbst signierte Gruppen zaehlen nicht`);
    }

    // Organisator-Uebersicht: Kontaktdaten nur fuer den, der den Anlass
    // organisiert (bzw. den Vorstand) — nie fuer andere Mitglieder.
    const UEBERSICHT = `${BASE}/events/organisator-uebersicht`;
    const mit = token => fetch(UEBERSICHT, token ? { headers: { Authorization: `Bearer ${token}` } } : {});

    assert.equal((await mit()).status, 401, 'Uebersicht: ohne Anmeldung gesperrt');
    const kaputt = await mit('kaputt');
    assert.ok([401, 403].includes(kaputt.status), 'Uebersicht: ungueltiges Token gesperrt');
    assert.ok(!kontaktdaten(await kaputt.text()));

    const fremd = jwt.sign({ type: 'member', sub: 'fremd', email: 'fremd@example.ch' }, 'test-geheim');
    const fremdText = await (await mit(fremd)).text();
    assert.deepEqual(JSON.parse(fremdText), { zugang: 'mitglied', anlaesse: [] }, 'fremdes Mitglied sieht nichts');
    assert.ok(!kontaktdaten(fremdText));

    const qrVorstand = jwt.sign({ type: 'member', sub: 'qr-vorstand', email: 'qr-vorstand@example.ch',
        groups: ['Vorstand'] }, 'test-geheim');
    const qrText = await (await mit(qrVorstand)).text();
    assert.equal(JSON.parse(qrText).zugang, 'vorstand', 'QR-Login mit Gruppe Vorstand: Vorstand-Uebersicht');
    assert.ok(kontaktdaten(qrText.replace(/login-geheim|deadbeefhash/g, '')), 'QR-Vorstand sieht die Kontakte');
    const qrOhne = jwt.sign({ type: 'member', sub: 'qr-mitglied', email: 'qr-mitglied@example.ch',
        groups: ['Mitglieder'] }, 'test-geheim');
    const qrOhneText = await (await mit(qrOhne)).text();
    assert.deepEqual(JSON.parse(qrOhneText), { zugang: 'mitglied', anlaesse: [] }, 'QR-Login ohne Gruppe: wie jedes Mitglied');

    const login = jwt.sign({ type: 'event-organizer', event_id: EVENT }, 'test-geheim');
    const loginText = await (await mit(login)).text();
    assert.ok(/gast@example\.ch/.test(loginText), 'Organisator-Login sieht die Kontakte seines Anlasses');
    assert.ok(!/login-geheim|deadbeefhash/.test(loginText), 'nie die Zugangsdaten des Logins');
    const anderer = jwt.sign({ type: 'event-organizer', event_id: '00000000-0000-0000-0000-0000000000d6' }, 'test-geheim');
    const andererAntwort = await mit(anderer);
    assert.equal(andererAntwort.status, 401, 'Login fuer einen anderen (nicht vorhandenen) Anlass');
    assert.ok(!kontaktdaten(await andererAntwort.text()));

    // Teilnehmerliste als PDF enthaelt Kontaktdaten — bis Oktober 2026 frei
    // abrufbar. Nur Vorstand und Organisator dieses Anlasses.
    const LISTE = `${BASE}/events/${EVENT}/pdf/teilnehmerliste`;
    const pdf = token => fetch(LISTE, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
    assert.equal((await pdf()).status, 401, 'Teilnehmerliste: ohne Anmeldung gesperrt');
    assert.equal((await pdf('kaputt')).status, 401, 'Teilnehmerliste: ungueltiges Token gesperrt');
    assert.equal((await pdf(fremd)).status, 403, 'Teilnehmerliste: fremdes Mitglied gesperrt');
    const vorstandPdf = await pdf(jwt.sign({ type: 'vorstand', email: 'aktuar@example.ch', groups: ['vorstand'] }, 'test-geheim'));
    assert.equal(vorstandPdf.status, 200, 'Teilnehmerliste: Vorstand darf');
    assert.match(vorstandPdf.headers.get('content-type') || '', /pdf/);
    assert.equal((await pdf(login)).status, 200, 'Teilnehmerliste: Organisator-Login seines Anlasses darf');
    assert.equal((await pdf(qrVorstand)).status, 200, 'Teilnehmerliste: QR-Login mit Gruppe Vorstand darf');
    assert.equal((await pdf(qrOhne)).status, 403, 'Teilnehmerliste: QR-Login ohne Gruppe nicht');
});
