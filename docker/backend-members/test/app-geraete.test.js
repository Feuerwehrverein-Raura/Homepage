// Geraete der Mitglieder-App: Eingaben pruefen, Upsert, Liste fuer den
// Vorstand mit "veraltet" und Push-Tokens ohne Meldung.
//
// Mit einer echten Datenbank zusaetzlich, wenn APP_GERAETE_TEST_DB gesetzt
// ist (z.B. postgres://localhost:55433/fwv) - sonst uebersprungen.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    geraetAusEingabe, geraetAusFcmEingabe, versionsCode, appGeraete, SCHEMA_SQL
} = require('../src/app-geraete');

const stumm = { error() {}, warn() {}, log() {} };
const ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

test('Eingabe: vollstaendig, getrimmt, Kleinbuchstaben', () => {
    const { werte, fehler } = geraetAusEingabe({
        geraet_id: ` ${ID} `, plattform: 'Android', quelle: 'PLAY', app_version: '1.0.23',
        build_nummer: 10023, os_version: 'Android 16\n(SDK 36)', geraet_modell: 'samsung SM-A376B'
    });
    assert.equal(fehler, undefined);
    assert.deepEqual(werte, {
        geraet_id: ID, plattform: 'android', quelle: 'play', app_version: '1.0.23',
        build_nummer: 10023, os_version: 'Android 16 (SDK 36)', geraet_modell: 'samsung SM-A376B'
    });
});

test('Eingabe: Minimum, Build als Text, Freitext gekuerzt', () => {
    const { werte } = geraetAusEingabe({ geraet_id: ID, plattform: 'web', build_nummer: '42',
        geraet_modell: 'x'.repeat(300), os_version: '   ' });
    assert.equal(werte.quelle, 'unbekannt');
    assert.equal(werte.app_version, null);
    assert.equal(werte.build_nummer, 42);
    assert.equal(werte.geraet_modell.length, 100);
    assert.equal(werte.os_version, null);
});

test('Eingabe: Ungueltiges wird abgewiesen', () => {
    const gut = { geraet_id: ID, plattform: 'ios' };
    for (const falsch of [
        {}, { ...gut, geraet_id: 'kurz' }, { ...gut, geraet_id: 'a b c d e f g h' },
        { ...gut, geraet_id: 'x'.repeat(65) }, { ...gut, plattform: 'blackberry' },
        { ...gut, plattform: 7 }, { ...gut, quelle: 'f-droid' }, { ...gut, app_version: 'eins' },
        { ...gut, app_version: '1.0' }, { ...gut, build_nummer: -1 }, { ...gut, build_nummer: 1.5 },
        { ...gut, build_nummer: 'zehn' }, { ...gut, build_nummer: 2 ** 31 }
    ]) {
        assert.ok(geraetAusEingabe(falsch).fehler, JSON.stringify(falsch));
    }
    assert.ok(geraetAusEingabe(null).fehler);
    assert.equal(geraetAusEingabe({ ...gut, app_version: '1.0.23-beta.1' }).fehler, undefined);
});

test('fcm-token: alte App ohne Felder -> keine Meldung; neue mit device_id/platform', () => {
    assert.equal(geraetAusFcmEingabe({ token: 't', device_id: ID, platform: 'android' }), null);
    const w = geraetAusFcmEingabe({ token: 't', device_id: ID, platform: 'android',
        quelle: 'apk', app_version: '1.0.23', build_nummer: 10023 });
    assert.equal(w.geraet_id, ID);
    assert.equal(w.plattform, 'android');
    assert.equal(w.quelle, 'apk');
    // Ungueltig: still keine Meldung (das Token selbst zaehlt).
    assert.equal(geraetAusFcmEingabe({ token: 't', platform: 'android', app_version: '1.0.23' }), null);
});

test('versionsCode wie VCODE im Build', () => {
    assert.equal(versionsCode('1.0.23'), 10023);
    assert.equal(versionsCode('2.1.0'), 20100);
    assert.equal(versionsCode('1.0.23+5'), 10023);
    assert.equal(versionsCode('kaputt'), null);
    assert.equal(versionsCode(undefined), null);
});

function fakePool({ geraete = [], tokens = [], tokenFehler = null } = {}) {
    const aufrufe = [];
    return {
        aufrufe,
        async query(sql, werte) {
            aufrufe.push({ sql, werte });
            if (/FROM app_geraete g JOIN/.test(sql)) return { rows: geraete };
            if (/FROM fcm_tokens/.test(sql)) {
                if (tokenFehler) throw tokenFehler;
                return { rows: tokens };
            }
            return { rows: [], rowCount: 1 };
        }
    };
}

test('melden: Tabelle einmal anlegen, dann Upsert mit allen Werten', async () => {
    const pool = fakePool();
    const d = appGeraete({ pool, neusteVersion: '', log: stumm });
    const { werte } = geraetAusEingabe({ geraet_id: ID, plattform: 'android', quelle: 'play',
        app_version: '1.0.23', build_nummer: 10023 });
    await d.melden('m1', werte);
    await d.melden('m1', werte);
    const anlegen = pool.aufrufe.filter(a => /CREATE TABLE/.test(a.sql));
    assert.equal(anlegen.length, 1);
    const upserts = pool.aufrufe.filter(a => /INSERT INTO app_geraete/.test(a.sql));
    assert.equal(upserts.length, 2);
    assert.match(upserts[0].sql, /ON CONFLICT \(member_id, geraet_id\) DO UPDATE/);
    assert.match(upserts[0].sql, /zuletzt = NOW\(\)/);
    assert.deepEqual(upserts[0].werte, ['m1', ID, 'android', 'play', '1.0.23', 10023, null, null]);
    assert.equal(SCHEMA_SQL.length, 2);
});

test('leiseMelden wirft nie', async () => {
    const pool = { async query() { throw new Error('weg'); } };
    const d = appGeraete({ pool, log: stumm });
    await d.leiseMelden('m1', { geraet_id: ID, plattform: 'android', quelle: 'unbekannt' });
});

const G = (name, plattform, quelle, version, build, extra = {}) => ({
    member_id: name, vorname: name, nachname: 'Test', plattform, quelle,
    app_version: version, build_nummer: build, os_version: null, geraet_modell: null,
    erstmals: '2026-10-01 10:00:00', zuletzt: '2026-10-15 08:00:00', ...extra
});

test('liste: neuste aus Android-Meldungen, veraltet markiert, Browser nie', async () => {
    const pool = fakePool({
        geraete: [
            G('Desk', 'windows', 'desktop', '1.0.30', 10030),
            G('Anna', 'android', 'play', '1.0.25', 10025),
            G('Beat', 'android', 'apk', '1.0.23', 10023),
            G('Web', 'web', 'web', '1.0.0', 1),
            G('Ios', 'ios', 'unbekannt', '1.0.24', null),
            G('Ohne', 'android', 'apk', null, null)
        ],
        tokens: [{ member_id: 'x', vorname: 'Xaver', nachname: 'Alt', plattform: 'android',
            zuletzt: '2026-09-01 12:00:00' }]
    });
    const l = await appGeraete({ pool, neusteVersion: undefined, log: stumm }).liste();
    assert.deepEqual(l.neuste, { version: '1.0.25', build_nummer: 10025, herkunft: 'geraete' });
    const v = Object.fromEntries(l.geraete.map(g => [g.member_id, g.veraltet]));
    assert.deepEqual(v, { Desk: false, Anna: false, Beat: true, Web: false, Ios: true, Ohne: null });
    assert.equal(l.geraete[1].name, 'Anna Test');
    assert.deepEqual(l.ohne_meldung, [
        { member_id: 'x', name: 'Xaver Alt', plattform: 'android', zuletzt: '2026-09-01 12:00:00' }
    ]);
    // Keine IP, kein Standort in der Antwort.
    assert.ok(!JSON.stringify(l).includes('ip'));
});

test('liste: APP_NEUSTE_VERSION geht vor', async () => {
    const pool = fakePool({ geraete: [G('Anna', 'android', 'play', '1.0.25', 10025)] });
    const l = await appGeraete({ pool, neusteVersion: '1.0.26', log: stumm }).liste();
    assert.deepEqual(l.neuste, { version: '1.0.26', build_nummer: 10026, herkunft: 'env' });
    assert.equal(l.geraete[0].veraltet, true);
});

test('liste: ohne Meldungen und ohne fcm_tokens-Tabelle', async () => {
    const fehlt = Object.assign(new Error('relation "fcm_tokens" does not exist'), { code: '42P01' });
    const l = await appGeraete({ pool: fakePool({ tokenFehler: fehlt }), log: stumm }).liste();
    assert.deepEqual(l, {
        neuste: { version: null, build_nummer: null, herkunft: null }, geraete: [], ohne_meldung: []
    });
    const anderer = Object.assign(new Error('kaputt'), { code: 'XX000' });
    await assert.rejects(appGeraete({ pool: fakePool({ tokenFehler: anderer }), log: stumm }).liste());
});

// ---------------------------------------------------------------------------
// Gegen eine echte Datenbank (optional).

const DB = process.env.APP_GERAETE_TEST_DB;

test('echte Datenbank: Upsert, Token ohne Meldung, Loeschen kaskadiert', { skip: !DB && 'APP_GERAETE_TEST_DB nicht gesetzt' }, async () => {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: DB });
    try {
        await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
        await pool.query('DROP TABLE IF EXISTS app_geraete, fcm_tokens, members CASCADE');
        await pool.query(`CREATE TABLE members (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            vorname TEXT, nachname TEXT)`);
        await pool.query(`CREATE TABLE fcm_tokens (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            member_id UUID REFERENCES members(id) ON DELETE CASCADE, token TEXT NOT NULL,
            device_id VARCHAR(255), platform VARCHAR(20) DEFAULT 'android',
            created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(member_id, token))`);
        const anna = (await pool.query(`INSERT INTO members (vorname, nachname) VALUES ('Anna','A') RETURNING id`)).rows[0].id;
        const beat = (await pool.query(`INSERT INTO members (vorname, nachname) VALUES ('Beat','B') RETURNING id`)).rows[0].id;
        const d = appGeraete({ pool, neusteVersion: '', log: stumm });

        await d.melden(anna, geraetAusEingabe({ geraet_id: ID, plattform: 'android', quelle: 'play',
            app_version: '1.0.23', build_nummer: 10023, geraet_modell: 'samsung SM-A376B' }).werte);
        // Zweite Meldung ohne Modell/Quelle: Version neu, Modell und Quelle bleiben.
        await d.melden(anna, geraetAusEingabe({ geraet_id: ID, plattform: 'android',
            app_version: '1.0.24', build_nummer: 10024 }).werte);
        await d.melden(beat, geraetAusEingabe({ geraet_id: 'beat-telefon-1', plattform: 'android',
            quelle: 'apk', app_version: '1.0.23', build_nummer: 10023 }).werte);
        // Anna: Token zum gemeldeten Geraet; Beat: zusaetzlich ein altes Tablet.
        await pool.query(`INSERT INTO fcm_tokens (member_id, token, device_id) VALUES
            ($1, 't1', $2), ($3, 't2', 'beat-telefon-1'), ($3, 't3', 'beat-tablet-alt')`, [anna, ID, beat]);

        const l = await d.liste();
        assert.equal(l.geraete.length, 2);
        const a = l.geraete.find(g => g.name === 'Anna A');
        assert.equal(a.app_version, '1.0.24');
        assert.equal(a.quelle, 'play');
        assert.equal(a.geraet_modell, 'samsung SM-A376B');
        assert.equal(a.veraltet, false);
        assert.equal(l.geraete.find(g => g.name === 'Beat B').veraltet, true);
        assert.deepEqual(l.neuste, { version: '1.0.24', build_nummer: 10024, herkunft: 'geraete' });
        assert.deepEqual(l.ohne_meldung.map(z => z.name), ['Beat B']);

        await pool.query('DELETE FROM members WHERE id = $1', [anna]);
        assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM app_geraete')).rows[0].n, 1);
    } finally {
        await pool.query('DROP TABLE IF EXISTS app_geraete, fcm_tokens, members CASCADE').catch(() => {});
        await pool.end();
    }
});
