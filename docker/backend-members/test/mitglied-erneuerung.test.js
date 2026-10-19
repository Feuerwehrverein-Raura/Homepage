// Erneuern der Mitglieder-Anmeldung (QR-Code, Anmeldebon, Passwort-Reset)
// wie bei Authentik: einmalige, rollende Erneuerungs-Tokens.
//
// Braucht eine echte Datenbank: MITGLIED_ERNEUERUNG_TEST_DB setzen (z.B.
// postgres://user:pw@localhost:55432/db) - sonst uebersprungen. Die Tests
// legen ein eigenes Schema an und raeumen es wieder ab.

const test = require('node:test');
const assert = require('node:assert/strict');
const { mitgliedErneuerung, istEigenes, SCHEMA_SQL, GNADE_SEKUNDEN } = require('../src/mitglied-erneuerung');

const DB = process.env.MITGLIED_ERNEUERUNG_TEST_DB;
const MITGLIED = '11111111-1111-1111-1111-111111111111';
const AUSGETRETEN = '22222222-2222-2222-2222-222222222222';
const QR = '33333333-3333-3333-3333-333333333333';

test('Schema: nur Hash gespeichert, Mitglied mit Loeschweitergabe', () => {
    assert.match(SCHEMA_SQL, /token_hash TEXT NOT NULL UNIQUE/);
    assert.match(SCHEMA_SQL, /REFERENCES members\(id\) ON DELETE CASCADE/);
    assert.ok(GNADE_SEKUNDEN > 0 && GNADE_SEKUNDEN <= 300);
});

test('eigene Tokens von Authentik-Tokens unterscheiden', () => {
    assert.equal(istEigenes('fwvm_abc'), true);
    assert.equal(istEigenes('eyJhbGciOi...'), false);
    assert.equal(istEigenes(''), false);
    assert.equal(istEigenes(undefined), false);
});

test('mit Datenbank', { skip: !DB && 'MITGLIED_ERNEUERUNG_TEST_DB nicht gesetzt' }, async (t) => {
    const { Pool } = require('pg');
    const schema = `erneuerung_test_${process.pid}`;
    const pool = new Pool({ connectionString: DB, options: `-c search_path=${schema}` });
    await pool.query(`CREATE SCHEMA ${schema}`);
    t.after(async () => {
        await pool.query(`DROP SCHEMA ${schema} CASCADE`);
        await pool.end();
    });
    await pool.query(`
        CREATE TABLE members (id UUID PRIMARY KEY, email TEXT, benutzername TEXT,
            vorname TEXT, nachname TEXT, status TEXT);
        CREATE TABLE member_app_tokens (id UUID PRIMARY KEY, member_id UUID, revoked_at TIMESTAMP,
            last_used_at TIMESTAMP);
        INSERT INTO members VALUES ('${MITGLIED}', 'erika@example.ch', 'emuster', 'Erika', 'Muster', 'Aktivmitglied'),
                                   ('${AUSGETRETEN}', 'max@example.ch', 'mmuster', 'Max', 'Muster', 'Aktivmitglied');
        INSERT INTO member_app_tokens (id, member_id) VALUES ('${QR}', '${MITGLIED}');
    `);
    const e = mitgliedErneuerung(pool);

    await t.test('einloesen liefert Mitglied und Quelle, Token rotiert', async () => {
        const a = await e.ausstellen({ memberId: MITGLIED, quelle: 'bon' });
        const stand = await e.einloesen(a);
        assert.equal(stand.mitglied.id, MITGLIED);
        assert.equal(stand.mitglied.benutzername, 'emuster');
        assert.equal(stand.quelle, 'bon');
        assert.equal(stand.qrTokenId, null);
        const b = await e.ausstellen({ memberId: MITGLIED, quelle: stand.quelle });
        assert.notEqual(a, b);
        assert.ok((await e.einloesen(b)).mitglied);
    });

    await t.test('zweimal einloesen: innerhalb der Gnadenfrist ja, danach nein', async () => {
        const a = await e.ausstellen({ memberId: MITGLIED, quelle: 'reset' });
        assert.ok(await e.einloesen(a));
        assert.ok(await e.einloesen(a), 'Antwort verloren - nochmals erlaubt');
        await pool.query(`UPDATE member_refresh_tokens SET benutzt_am = NOW() - INTERVAL '10 minutes'`);
        assert.equal(await e.einloesen(a), null);
    });

    await t.test('abgelaufen, unbekannt, leer', async () => {
        const a = await e.ausstellen({ memberId: MITGLIED, quelle: 'bon' });
        await pool.query(`UPDATE member_refresh_tokens SET gilt_bis = NOW() - INTERVAL '1 second'`);
        assert.equal(await e.einloesen(a), null);
        assert.equal(await e.einloesen('gibt-es-nicht'), null);
        assert.equal(await e.einloesen(''), null);
        assert.equal(await e.einloesen(undefined), null);
    });

    await t.test('gilt 30 Tage ab dem letzten Erneuern', async () => {
        await e.ausstellen({ memberId: MITGLIED, quelle: 'bon' });
        const r = await pool.query(
            `SELECT EXTRACT(EPOCH FROM gilt_bis - erstellt_am) / 86400 AS tage
             FROM member_refresh_tokens ORDER BY id DESC LIMIT 1`);
        assert.equal(Math.round(Number(r.rows[0].tage)), 30);
    });

    await t.test('widerrufener QR-Code beendet auch die Erneuerung', async () => {
        const a = await e.ausstellen({ memberId: MITGLIED, quelle: 'qr', qrTokenId: QR });
        const stand = await e.einloesen(a);
        assert.equal(stand.qrTokenId, QR);
        const b = await e.ausstellen({ memberId: MITGLIED, quelle: 'qr', qrTokenId: QR });
        await pool.query(`UPDATE member_app_tokens SET revoked_at = NOW() WHERE id = '${QR}'`);
        assert.equal(await e.einloesen(b), null);
    });

    await t.test('ausgetretenes Mitglied wird nicht erneuert', async () => {
        const a = await e.ausstellen({ memberId: AUSGETRETEN, quelle: 'bon' });
        await pool.query(`UPDATE members SET status = 'Ausgetreten' WHERE id = '${AUSGETRETEN}'`);
        assert.equal(await e.einloesen(a), null);
    });

    await t.test('ausgestellte Tokens sind als eigene erkennbar', async () => {
        assert.ok(e.istEigenes(await e.ausstellen({ memberId: MITGLIED, quelle: 'bon' })));
    });

    await t.test('in der Datenbank steht nie das Token selbst', async () => {
        const a = await e.ausstellen({ memberId: MITGLIED, quelle: 'bon' });
        const r = await pool.query('SELECT count(*)::int AS n FROM member_refresh_tokens WHERE token_hash = $1', [a]);
        assert.equal(r.rows[0].n, 0);
    });
});
