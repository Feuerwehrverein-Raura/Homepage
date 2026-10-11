// Vertrag mit der Mitglieder-App: Was die App liest, muss der echte Server
// genau so liefern wie in den Dateien unter fixtures/ — gegen dieselben
// Dateien testet die Flutter-App (flutter/fwv_core).
//
//   fixtures/anlaesse-app.json      GET /events?aktuell=true (anonym)
//   fixtures/meine-anmeldungen.json GET /registrations/mine (Mitglied)
//   fixtures/kalender-app.json      GET /calendar/items (Mitglied)
//
// Startet das echte src/index.js gegen die Test-Datenbank (TEST_DATABASE_URL;
// Schema frisch aus init.sql + Migrationen, feste IDs, festes "jetzt" ueber
// TEST_JETZT). ACHTUNG: leert die Datenbank.
//
// Die Anlass- und Anmelde-Dateien enthalten nur die Felder, die die App
// liest (siehe FELDER unten), die app-Bloecke vollstaendig. Neue Felder im
// Backend brechen den Vertrag also nicht; geaenderte schon.
//
// Dateien nach einer gewollten Aenderung neu schreiben:
//   FIXTURES_SCHREIBEN=1 TEST_DATABASE_URL=... node --test test/app-vertrag.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const DB = process.env.TEST_DATABASE_URL;
const PORT = 55872;
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = 'test-geheim';
const JETZT = '2026-10-11T10:00:00+02:00'; // Sonntag
const FIXTURES = path.join(__dirname, 'fixtures');

const id = (praefix, n) => `00000000-0000-0000-0000-${praefix}${String(n).padStart(12 - praefix.length, '0')}`;
const ERIKA = id('a', 1), HANS = id('a', 2);
const E = n => id('e', n), S = n => id('5', n), R = n => id('7', n);

const FELDER = {
    anlass: ['id', 'slug', 'title', 'category', 'status', 'location', 'start_date', 'end_date',
        'registration_deadline', 'max_participants', 'registration_required', 'app'],
    schicht: ['id', 'name', 'bereich', 'date', 'start_time', 'end_time', 'needed', 'app'],
    anmeldung: ['id', 'event_id', 'event_title', 'event_slug', 'event_location', 'event_start_date',
        'event_end_date', 'status', 'status_text', 'status_farbe', 'event_datum_text'],
    anmeldungSchicht: ['id', 'name', 'bereich', 'date', 'start_time', 'end_time', 'beschriftung']
};
const nimm = (obj, felder) => Object.fromEntries(felder.map(f => [f, obj[f] === undefined ? '<fehlt>' : obj[f]]));
const anlassProjektion = e => ({ ...nimm(e, FELDER.anlass), shifts: e.shifts.map(s => nimm(s, FELDER.schicht)) });
const anmeldungProjektion = r => ({ ...nimm(r, FELDER.anmeldung), shifts: r.shifts.map(s => nimm(s, FELDER.anmeldungSchicht)) });

async function seed(pool) {
    const q = (sql, p) => pool.query(sql, p);
    await q(`INSERT INTO members (id, vorname, nachname, email) VALUES
        ($1, 'Erika', 'Muster', 'erika@example.ch'), ($2, 'Hans', 'Helfer', 'hans@example.ch')`, [ERIKA, HANS]);

    const ev = (n, slug, title, category, start, end, extra = {}) => q(
        `INSERT INTO events (id, slug, title, category, start_date, end_date, location, status,
                             registration_required, registration_deadline, max_participants, organizer_id,
                             datum_offen, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'2026-09-01 12:00:00','2026-09-01 12:00:00')`,
        [E(n), slug, title, category, start, end, extra.location || null, extra.status || 'planned',
            extra.registration_required || false, extra.deadline || null, extra.max || null, extra.organizer || null,
            extra.datum_offen || false]);
    await ev(1, 'chilbi-2026', 'Chilbi 2026', 'Dorffest', '2026-10-17 10:00', '2026-10-18 20:00',
        { location: 'Roter Schopf', deadline: '2026-10-15 23:59', organizer: ERIKA });
    await ev(2, 'ausflug-2026', 'Vereinsausflug', 'Ausflug mit Anmeldung', '2026-10-24 09:00', '2026-10-24 18:00',
        { deadline: '2026-10-10 18:00', max: 10 });
    await ev(3, 'grillabend', 'Grillabend', 'Sonstiges', '2026-11-07 18:00', null, { location: 'Feuerwehrmagazin' });
    await ev(4, 'helferessen', 'Helferessen', 'GV', '2026-10-31 19:00', '2026-10-31 23:00', { max: 2 });
    await ev(5, 'abgesagt', 'Abgesagter Anlass', 'Sonstiges', '2026-10-20 19:00', null, { status: 'cancelled' });
    await ev(6, 'vergangen', 'Vergangener Anlass', 'Sonstiges', '2026-10-01 19:00', null, { registration_required: true });
    await ev(7, 'laeuft-noch', 'Herbstmarkt', 'Sonstiges', '2026-10-10 18:00', '2026-10-11 16:00', { registration_required: true });
    // "Datum noch offen" (datum_offen), Platzhalter 31.12. — auch einer vom
    // Vorjahr darf nicht als "vorbei" herausfallen
    await ev(8, 'idee-rega', 'Rega Besichtigung', 'Ausflug', '2026-12-31 00:00', null, { status: 'draft', datum_offen: true });
    await ev(9, 'idee-alt', 'Bäckerei-Besuch', 'Ausflug', '2025-12-31 00:00', null, { status: 'draft', datum_offen: true });

    const sh = (n, event, name, bereich, date, von, bis, needed) => q(
        `INSERT INTO shifts (id, event_id, name, bereich, date, start_time, end_time, needed, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'2026-09-01 12:00:00')`, [S(n), E(event), name, bereich, date, von, bis, needed]);
    await sh(1, 1, 'Aufbau', 'Allgemein', '2026-10-16', '08:00', null, 4);
    await sh(2, 1, 'Schicht 1', 'Bar', '2026-10-17', '12:00', '14:00', 2);
    await sh(3, 1, 'Schicht 2', 'Kueche', '2026-10-17', '17:00', '20:00', 2);

    const reg = (n, event, member, guest, shifts, status, notes = null) => q(
        `INSERT INTO registrations (id, event_id, member_id, guest_name, guest_email, shift_ids, status, notes, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'2026-09-15 12:00:00')`,
        [R(n), E(event), member, guest && guest[0], guest && guest[1], shifts, status, notes]);
    await reg(1, 1, ERIKA, null, [S(1), S(2)], 'approved');
    await reg(2, 1, HANS, null, [S(2)], 'approved');
    await reg(3, 1, null, ['Gast Koch', 'koch@example.ch'], [S(3)], 'approved');
    await reg(4, 1, null, ['Gast Neu', 'neu@example.ch'], [S(3)], 'pending');
    await reg(5, 2, ERIKA, null, null, 'pending');
    await reg(6, 4, null, ['Paar Gast', 'paar@example.ch'], null, 'pending', '{"participants":2}');
    await reg(7, 4, ERIKA, null, null, 'rejected');
    await reg(8, 6, ERIKA, null, null, 'approved');

    await q(`INSERT INTO membership_fee_settings (year, amount, due_date) VALUES (2027, 50, '2027-03-31')`);
    await q(`INSERT INTO membership_fee_payments (member_id, year, amount, status, paid_date)
             VALUES ($1, 2026, 50, 'paid', '2026-04-15')`, [ERIKA]);
    await q(`INSERT INTO dispatch_log (id, type, member_id, subject, status, sent_at)
             VALUES ($1, 'email', $2, 'Einladung Chilbi', 'sent', '2026-10-05 09:00:00')`, [id('d', 1), ERIKA]);
}

function vergleiche(datei, ist) {
    const pfad = path.join(FIXTURES, datei);
    if (process.env.FIXTURES_SCHREIBEN) fs.writeFileSync(pfad, JSON.stringify(ist, null, 2) + '\n');
    assert.deepEqual(ist, JSON.parse(fs.readFileSync(pfad, 'utf8')), `${datei} weicht ab`);
}

test('Vertrag Mitglieder-App gegen den echten Server', { skip: !DB && 'TEST_DATABASE_URL nicht gesetzt' }, async (t) => {
    const { Pool } = require('pg');
    const jwt = require('jsonwebtoken');
    const { schemaAufbauen } = require('./datenbank');
    const pool = new Pool({ connectionString: DB });
    await schemaAufbauen(pool);
    await seed(pool);

    const server = spawn('node', [path.join(__dirname, '..', 'src', 'index.js')], {
        env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB, JWT_SECRET: SECRET, TEST_JETZT: JETZT,
               DISPATCH_API_URL: 'http://127.0.0.1:9', ARBEITSPLAN_REMINDER_ENABLED: 'false' },
        stdio: 'ignore'
    });
    t.after(async () => { server.kill(); await pool.end(); });
    for (let i = 0; i < 50; i++) {
        try { if ((await fetch(`${BASE}/health`)).ok) break; } catch (_) { /* startet noch */ }
        await new Promise(r => setTimeout(r, 200));
    }

    const token = {
        erika: jwt.sign({ type: 'member', sub: ERIKA, email: 'erika@example.ch' }, SECRET),
        hans: jwt.sign({ type: 'member', sub: HANS, email: 'hans@example.ch' }, SECRET),
        vorstand: jwt.sign({ type: 'vorstand', email: 'aktuar@example.ch', groups: ['vorstand'] }, SECRET),
        organisator2: jwt.sign({ type: 'event-organizer', event_id: E(2) }, SECRET)
    };
    const hole = async (pfad, wer) => {
        const r = await fetch(BASE + pfad, wer ? { headers: { Authorization: `Bearer ${token[wer]}` } } : {});
        assert.equal(r.status, 200, `${pfad} (${wer || 'anonym'}): HTTP ${r.status}`);
        return r.json();
    };

    await t.test('anlaesse-app.json: GET /events?aktuell=true', async () => {
        const anlaesse = await hole('/events?aktuell=true');
        vergleiche('anlaesse-app.json', anlaesse.map(anlassProjektion));
        assert.ok(!anlaesse.some(e => [E(5), E(6)].includes(e.id)), 'abgesagt und vergangen fehlen');
        // bestehende Felder bleiben, Kontaktdaten weiterhin nur fuer den Vorstand
        const chilbi = anlaesse.find(e => e.id === E(1));
        assert.equal(chilbi.shifts[1].registrations.approvedCount, 2);
        assert.deepEqual(Object.keys(chilbi.shifts[1].registrations.approved[0]), ['id', 'name']);
    });

    await t.test('kann_bearbeiten je nach Anfragendem', async () => {
        const darf = async wer => Object.fromEntries((await hole('/events?aktuell=true', wer))
            .map(e => [e.slug, e.app.kann_bearbeiten]));
        assert.ok(Object.values(await darf()).every(v => v === false), 'anonym nie');
        assert.deepEqual(Object.entries(await darf('erika')).filter(([, v]) => v).map(([k]) => k), ['chilbi-2026']);
        assert.ok(Object.values(await darf('hans')).every(v => v === false));
        assert.deepEqual(Object.entries(await darf('organisator2')).filter(([, v]) => v).map(([k]) => k), ['ausflug-2026']);
        const vorstand = await hole('/events?aktuell=true', 'vorstand');
        assert.ok(vorstand.every(e => e.app.kann_bearbeiten));
        assert.ok(vorstand.find(e => e.id === E(1)).shifts[1].registrations.approved[0].email, 'Vorstand: Kontaktdaten');
        assert.equal((await hole(`/events/${E(1)}`, 'erika')).app.kann_bearbeiten, true);
        assert.equal((await hole(`/events/chilbi-2026`)).app.kann_bearbeiten, false);
    });

    await t.test('GET /events ohne aktuell: alle wie bisher, mit app-Block', async () => {
        const alle = await hole('/events');
        assert.equal(alle.length, 9);
        assert.equal(alle.find(e => e.id === E(5)).app.anmeldung.grund, 'Anlass abgesagt');
        assert.equal(alle.find(e => e.id === E(6)).app.anmeldung.grund, 'Anlass ist vorbei');
        const einzeln = await hole(`/events/${E(1)}`);
        const ausListe = (await hole('/events?aktuell=true')).find(e => e.id === E(1));
        assert.deepEqual(einzeln.app, ausListe.app, '/events/:id liefert denselben app-Block');
        assert.deepEqual(einzeln.shifts.map(s => s.app), ausListe.shifts.map(s => s.app));
    });

    await t.test('meine-anmeldungen.json: GET /registrations/mine', async () => {
        vergleiche('meine-anmeldungen.json', (await hole('/registrations/mine', 'erika')).map(anmeldungProjektion));
    });

    await t.test('kalender-app.json: GET /calendar/items (Mitglied)', async () => {
        const kalender = await hole('/calendar/items', 'erika');
        vergleiche('kalender-app.json', kalender);
        assert.ok(!kalender.some(i => ['email', 'letter'].includes(i.type)));
        const vorstand = await hole('/calendar/items', 'vorstand');
        assert.ok(vorstand.some(i => i.type === 'email'), 'Vorstand sieht E-Mails weiterhin');
    });

    await t.test('GET /event-optionen', async () => {
        const o = await hole('/event-optionen');
        assert.ok(o.anmeldepflichtige_kategorien.includes('Ausflug mit Anmeldung'));
        assert.deepEqual(o.bereiche.find(b => b.wert === 'Kueche'), { wert: 'Kueche', text: 'Küche' });
    });
});
