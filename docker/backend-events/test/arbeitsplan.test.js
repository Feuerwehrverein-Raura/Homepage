// Tests fuer src/arbeitsplan.js.
//
// 1. Vertrag: aus fixtures/arbeitsplan-schichten.json (Zeilen wie aus der
//    Datenbank) muss genau fixtures/arbeitsplan.json werden — die Datei, gegen
//    die auch Website und Apps testen.
// 2. Mailtext der Anmelde-Mails.
// 3. Mit TEST_DATABASE_URL zusaetzlich gegen ein echtes Postgres (in der CI ein
//    Service-Container): Schema aus init.sql + Migrationen, dann dieselben
//    Daten einfuegen und pruefen, dass das SQL denselben Plan liefert.
//    ACHTUNG: die Datenbank wird geleert — nie auf eine echte zeigen lassen.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildArbeitsplan, registrationDetailsText, bereichLesbar, renderArbeitsplanPdf } = require('../src/arbeitsplan');

const fixtures = path.join(__dirname, 'fixtures');
const lies = name => JSON.parse(fs.readFileSync(path.join(fixtures, name), 'utf8'));
const eingabe = lies('arbeitsplan-schichten.json');
const erwartet = lies('arbeitsplan.json');

// Attrappe: beantwortet die Abfragen nach Tabellenname.
function fakePool(antworten) {
    return {
        query: async sql => {
            for (const [tabelle, rows] of Object.entries(antworten)) {
                if (sql.includes(`FROM ${tabelle}`)) return { rows };
            }
            throw new Error(`Unerwartete Abfrage: ${sql.slice(0, 80)}`);
        }
    };
}

test('Vertrag: Schichten aus der Datenbank ergeben genau arbeitsplan.json', async () => {
    const pool = fakePool({ events: [eingabe.event], shifts: eingabe.schichten });
    assert.deepEqual(await buildArbeitsplan(pool, eingabe.event.id), erwartet);
});

test('Vertrag: unbekannter Anlass ergibt null, Anlass ohne Schichten keine Tage', async () => {
    assert.equal(await buildArbeitsplan(fakePool({ events: [], shifts: [] }), 'x'), null);
    const leer = await buildArbeitsplan(fakePool({ events: [eingabe.event], shifts: [] }), 'x');
    assert.deepEqual(leer.tage, []);
    assert.deepEqual(leer.bereiche, []);
});

test('Bereiche werden lesbar beschriftet', async () => {
    assert.equal(bereichLesbar('Kueche'), 'Küche');
    assert.equal(bereichLesbar('Bar'), 'Bar');
    const pool = fakePool({
        events: [eingabe.event],
        shifts: [{ date: '2026-10-17', start_time: '10:00:00', end_time: '12:00:00', needed: 1, bereich: 'Kueche', besetzt: [] }]
    });
    assert.deepEqual((await buildArbeitsplan(pool, 'x')).bereiche, ['Küche']);
});

test('Mailtext: Anlass, Datum, Ort, Schichten, Kontakt und Link', async () => {
    const pool = fakePool({
        events: [{
            title: 'Chilbi 2026', slug: 'chilbi2026',
            start_date: '2026-10-17 10:00:00', end_date: '2026-10-18 20:00:00',
            location: 'Roter Schopf', organizer_name: 'Erika Muster', organizer_email: 'erika@example.ch'
        }],
        shifts: [
            { name: 'Abendschicht', date: '2026-10-17', start_time: '18:00:00', end_time: '22:00:00', bereich: 'Kueche' },
            { name: 'Aufbau', date: '2026-10-18', start_time: '08:00:00', end_time: null, bereich: null }
        ]
    });
    const text = await registrationDetailsText(pool, 'x', ['a', 'b']);
    assert.equal(text, [
        'Anlass: Chilbi 2026',
        'Datum: Samstag, 17. Oktober 2026 bis Sonntag, 18. Oktober 2026',
        'Ort: Roter Schopf',
        '',
        'Schichten:',
        '- Samstag, 17. Oktober 2026, 18:00–22:00 Uhr · Küche – Abendschicht',
        '- Sonntag, 18. Oktober 2026, 08:00 Uhr · Aufbau',
        '',
        'Fragen an: Erika Muster, erika@example.ch',
        '',
        'Details und aktueller Arbeitsplan: https://fwv-raura.ch/events.html?event=chilbi2026'
    ].join('\n'));
});

test('Mailtext: ohne Schichten keine Schicht-Zeilen', async () => {
    const pool = fakePool({ events: [{ title: 'GV', start_date: '2026-03-01 19:00:00' }], shifts: [] });
    const text = await registrationDetailsText(pool, 'x', null);
    assert.ok(!text.includes('Schicht'));
    assert.ok(text.startsWith('Anlass: GV\nDatum: Sonntag, 1. März 2026'));
});

// Text aus einem unkomprimierten pdfkit-PDF: jede TJ-Anweisung ist eine Zeile,
// die Zeichen stehen hex-kodiert (WinAnsi) in <...>.
function pdfZeilen(buffer) {
    return [...buffer.toString('latin1').matchAll(/\[(.*?)\] TJ/g)]
        .map(m => [...m[1].matchAll(/<([0-9a-f]*)>/g)].map(h => Buffer.from(h[1], 'hex').toString('latin1')).join(''));
}

test('PDF: Aushang mit Logo, Tabelle pro Tag, nur Bereiche dieses Tages', async () => {
    const pdf = await renderArbeitsplanPdf(erwartet, { compress: false });
    const zeilen = pdfZeilen(pdf).map(z => z.trim());
    assert.ok(pdf.toString('latin1').includes('/Subtype /Image'), 'Logo fehlt');
    assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 1, 'keine Leerseiten');
    assert.ok(zeilen.includes('Feuerwehrverein Raura, Kaiseraugst'));
    assert.ok(zeilen.includes('Arbeitsplan Chilbi'));
    assert.ok(zeilen.includes('Samstag, 17.10.2026'));
    // Stand im Kopf und auf jeder Seite unten, damit man die Fassung erkennt
    assert.ok(zeilen.some(z => /^Stand: \d\d\.\d\d\.\d{4}, \d\d:\d\d Uhr$/.test(z)), 'Stand im Kopf fehlt');
    assert.ok(zeilen.some(z => /^Stand: .*·\s+Seite 1 von 1$/.test(z)), 'Fusszeile fehlt');

    // 17.10.: Spalten Zeit, Bar, Grill (Allgemein hat dort keine Schicht)
    const sa = zeilen.indexOf('Samstag, 17.10.2026');
    assert.deepEqual(zeilen.slice(sa + 1, sa + 4), ['Zeit', 'Bar', 'Grill']);
    // 18.10.: nur Allgemein
    const so = zeilen.indexOf('Sonntag, 18.10.2026');
    assert.deepEqual(zeilen.slice(so + 1, so + 3), ['Zeit', 'Allgemein']);

    // Helfer und offene Plaetze
    for (const name of ['- Anna A', '- Bea B', '- Cem C']) assert.ok(zeilen.includes(name), name);
    // offene Plaetze: Grill 1 + Bar 1 = 2 Striche, ueberbucht 0
    assert.equal(zeilen.filter(z => z === '-').length, 2);
    assert.ok(!zeilen.some(z => z.includes('¬')));
});

test('PDF: Seitenumbruch mitten im Tag wiederholt den Tag', async () => {
    // ein Tag mit so vielen Zeitfenstern, dass er nicht auf eine Seite passt
    const zeilen = Array.from({ length: 30 }, (_, n) => ({
        zeit: `${String(n % 24).padStart(2, '0')}:00-${String((n + 1) % 24).padStart(2, '0')}:00`,
        zellen: [{ besetzt: ['Anna A', 'Bea B'], gebraucht: 3, offen: 1 }]
    }));
    const plan = { ...erwartet, bereiche: ['Bar'], tage: [{ datum: '2026-10-17', bezeichnung: 'Samstag, 17.10.2026', zeilen }] };
    const pdf = await renderArbeitsplanPdf(plan, { compress: false });
    const text = pdfZeilen(pdf).map(z => z.trim());
    assert.ok((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length >= 2);
    assert.ok(text.includes('Samstag, 17.10.2026 (Fortsetzung)'));
});

test('Echte Datenbank: SQL liefert denselben Plan', { skip: !process.env.TEST_DATABASE_URL && 'TEST_DATABASE_URL nicht gesetzt' }, async () => {
    const { Pool, types } = require('pg');
    // wie in src/index.js: Datum/Zeit als Text, nicht als Date
    for (const oid of [1082, 1083, 1114, 1184]) types.setTypeParser(oid, v => v);
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    try {
        await schemaAufbauen(pool);
        const e = eingabe.event;
        await pool.query(
            `INSERT INTO events (id, slug, title, start_date) VALUES ($1, 'test-chilbi', $2, '2026-10-17 10:00')`,
            [e.id, e.title]);
        let n = 0;
        for (const s of eingabe.schichten) {
            const shift = await pool.query(
                `INSERT INTO shifts (event_id, name, date, start_time, end_time, needed, bereich)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
                [e.id, `Schicht ${++n}`, s.date, s.start_time, s.end_time, s.needed, s.bereich]);
            for (const [i, name] of s.besetzt.entries()) {
                await pool.query(
                    `INSERT INTO registrations (event_id, guest_name, shift_ids, status, created_at)
                     VALUES ($1, $2, $3, 'approved', NOW() + $4 * INTERVAL '1 second')`,
                    [e.id, name, [shift.rows[0].id], i]);
            }
            // Wartende und Abgelehnte stehen nicht im Plan
            await pool.query(
                `INSERT INTO registrations (event_id, guest_name, shift_ids, status)
                 VALUES ($1, 'Wartet Noch', $2, 'pending'), ($1, 'Abgelehnt', $2, 'rejected')`,
                [e.id, [shift.rows[0].id]]);
        }
        assert.deepEqual(await buildArbeitsplan(pool, e.id), erwartet);
    } finally {
        await pool.end();
    }
});

async function schemaAufbauen(pool) {
    const pg = path.join(__dirname, '..', '..', 'postgres');
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await pool.query(fs.readFileSync(path.join(pg, 'init.sql'), 'utf8'));
    const migrationen = fs.readdirSync(path.join(pg, 'migrations')).filter(f => f.endsWith('.sql')).sort();
    for (const datei of migrationen) {
        await pool.query(fs.readFileSync(path.join(pg, 'migrations', datei), 'utf8'));
    }
}
