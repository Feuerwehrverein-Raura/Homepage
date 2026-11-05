const { test } = require('node:test');
const assert = require('node:assert');
const { pushVersand, sichtbar } = require('../src/push-versand');

/** Kleine Datenbank: merkt sich Abfragen, beantwortet die bekannten. */
function fakePool() {
    const p = { abfragen: [], postfach: [], geloescht: [], tokens: [{ member_id: 'm1', token: 'd1', platform: 'desktop' }] };
    p.query = async (sql, werte = []) => {
        p.abfragen.push(sql);
        if (sql.includes('FROM push_schluessel')) return { rows: [{ oeffentlich: 'OEF', privat: 'PRIV' }] };
        if (sql.includes('INSERT INTO push_postfach')) {
            for (const t of werte[0]) p.postfach.push({ id: p.postfach.length + 1, token: t, titel: werte[1], text: werte[2], daten: JSON.parse(werte[3]) });
            return { rows: [] };
        }
        if (sql.includes('DELETE FROM fcm_tokens')) { p.geloescht.push(...werte[0]); return { rows: [] }; }
        if (sql.includes('UPDATE fcm_tokens SET updated_at')) {
            return { rows: p.tokens.filter(t => t.member_id === werte[0] && t.token === werte[1]) };
        }
        if (sql.includes('DELETE FROM push_postfach WHERE token')) {
            const raus = p.postfach.filter(x => x.token === werte[0]);
            p.postfach = p.postfach.filter(x => x.token !== werte[0]);
            return { rows: raus };
        }
        return { rows: [] };
    };
    return p;
}

function fakeFcm(ergebnis = {}) {
    const gesendet = [];
    return {
        gesendet,
        sendEachForMulticast: async (m) => {
            gesendet.push(m);
            return {
                successCount: m.tokens.filter(t => !ergebnis[t]).length,
                responses: m.tokens.map(t => (ergebnis[t] ? { success: false, error: { code: ergebnis[t] } } : { success: true })),
            };
        },
    };
}

function fakeWebpush(fehler = {}) {
    const gesendet = [];
    return {
        gesendet,
        generateVAPIDKeys: () => ({ publicKey: 'OEF', privateKey: 'PRIV' }),
        sendNotification: async (abo, inhalt, opt) => {
            if (fehler[abo.endpoint]) { const e = new Error('weg'); e.statusCode = fehler[abo.endpoint]; throw e; }
            gesendet.push({ abo, inhalt: JSON.parse(inhalt), opt });
        },
    };
}

const abo = e => JSON.stringify({ endpoint: e, keys: { p256dh: 'p', auth: 'a' } });

test('verteilt nach Plattform: Handy FCM, Browser Web-Push, Desktop Postfach', async () => {
    const pool = fakePool(); const fcm = fakeFcm(); const wp = fakeWebpush();
    const v = pushVersand({ pool, fcm: () => fcm, webpush: wp, log: {} });
    const r = await v.senden([
        { token: 'a1', platform: 'android' }, { token: 'i1', platform: 'ios' }, { token: 'alt' },
        { token: abo('https://push/1'), platform: 'web' }, { token: 'd1', platform: 'desktop' },
    ], { notification: { title: 'Hallo', body: 'Welt' }, data: { notificationType: 'general', ziel: 'profil' } });
    assert.equal(r.gesendet, 5);
    assert.deepEqual(fcm.gesendet[0].tokens, ['a1', 'i1', 'alt']);
    assert.deepEqual(wp.gesendet[0].inhalt, { titel: 'Hallo', text: 'Welt', daten: { notificationType: 'general', ziel: 'profil' } });
    assert.equal(wp.gesendet[0].opt.vapidDetails.publicKey, 'OEF');
    assert.deepEqual(pool.postfach.map(x => [x.token, x.titel, x.text]), [['d1', 'Hallo', 'Welt']]);
});

test('reiner Daten-Push ohne Titel geht nur ans Handy', async () => {
    const pool = fakePool(); const fcm = fakeFcm(); const wp = fakeWebpush();
    const v = pushVersand({ pool, fcm: () => fcm, webpush: wp, log: {} });
    await v.senden([{ token: 'a1', platform: 'android' }, { token: abo('x'), platform: 'web' }, { token: 'd1', platform: 'desktop' }],
        { data: { notificationType: 'schopf_musik' } });
    assert.equal(fcm.gesendet.length, 1);
    assert.equal(wp.gesendet.length, 0);
    assert.equal(pool.postfach.length, 0);
});

test('Alarm als Daten-Push: Titel und Text aus data auch fuer Browser/Desktop', () => {
    assert.deepEqual(sichtbar({ data: { title: 'Tiefkühler', body: 'zu warm' } }), { titel: 'Tiefkühler', text: 'zu warm' });
});

test('abgelaufene Geraete werden geloescht (FCM und Browser 410)', async () => {
    const pool = fakePool();
    const fcm = fakeFcm({ a2: 'messaging/registration-token-not-registered' });
    const wp = fakeWebpush({ 'https://push/weg': 410, 'https://push/kaputt': 500 });
    const v = pushVersand({ pool, fcm: () => fcm, webpush: wp, log: {} });
    await v.senden([{ token: 'a1', platform: 'android' }, { token: 'a2', platform: 'android' },
        { token: abo('https://push/weg'), platform: 'web' }, { token: abo('https://push/kaputt'), platform: 'web' }],
    { notification: { title: 'T', body: 'B' }, data: {} });
    assert.deepEqual(pool.geloescht, ['a2', abo('https://push/weg')]);
});

test('ohne Firebase: Browser und Desktop bekommen es trotzdem', async () => {
    const pool = fakePool(); const wp = fakeWebpush();
    const v = pushVersand({ pool, fcm: () => null, webpush: wp, log: {} });
    const r = await v.senden([{ token: 'a1', platform: 'android' }, { token: abo('w'), platform: 'web' }, { token: 'd1', platform: 'desktop' }],
        { notification: { title: 'T', body: 'B' }, data: {} });
    assert.equal(r.gesendet, 2);
});

test('Postfach abholen: nur eigenes Desktop-Geraet, danach leer', async () => {
    const pool = fakePool(); const v = pushVersand({ pool, fcm: () => null, webpush: fakeWebpush(), log: {} });
    await v.senden([{ token: 'd1', platform: 'desktop' }], { notification: { title: 'Eins', body: '' }, data: {} });
    await v.senden([{ token: 'd1', platform: 'desktop' }], { notification: { title: 'Zwei', body: '' }, data: {} });
    assert.equal(await v.abholen('m2', 'd1'), null);
    assert.deepEqual((await v.abholen('m1', 'd1')).map(x => x.titel), ['Eins', 'Zwei']);
    assert.deepEqual(await v.abholen('m1', 'd1'), []);
});
