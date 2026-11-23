// «Als Spam melden» (src/spam-melden.js): Ordnerwahl, Resent-Kopf, Ablauf.
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/spam-melden');

const LISTE = [
    { path: 'INBOX', name: 'INBOX', flags: new Set() },
    { path: 'Junk', name: 'Junk', specialUse: '\\Junk', flags: new Set() },
    { path: 'Trash', name: 'Trash', specialUse: '\\Trash', flags: new Set() },
    { path: 'Sent', name: 'Sent', specialUse: '\\Sent', flags: new Set() },
    { path: 'Drafts', name: 'Drafts', specialUse: '\\Drafts', flags: new Set() },
    { path: 'Archiv', name: 'Archiv', flags: new Set() },
    { path: 'Ordner', name: 'Ordner', flags: new Set(['\\Noselect']) },
];

test('Junk-Ordner und durchsuchte Ordner', () => {
    assert.equal(S.junkOrdner(LISTE), 'Junk');
    assert.equal(S.junkOrdner([{ path: 'INBOX.Spam', name: 'Spam' }]), 'INBOX.Spam');
    assert.equal(S.junkOrdner([]), 'Junk');
    assert.deepEqual(S.suchOrdner(LISTE), ['INBOX', 'Archiv']);
});

test('Message-ID nur, wenn brauchbar', () => {
    assert.equal(S.messageIdNormal('abc@x.ch'), '<abc@x.ch>');
    assert.equal(S.messageIdNormal('<abc@x.ch>'), '<abc@x.ch>');
    assert.equal(S.messageIdNormal(''), null);
    assert.equal(S.messageIdNormal('a b'), null);
});

test('Resent-Kopf vor dem unveraenderten Original', () => {
    const roh = 'From: boese@spam.example\r\nSubject: Gewinn\r\n\r\nText';
    const r = S.resentMail(roh, { melder: 'aktuar@fwv-raura.ch', datum: new Date('2026-11-23T10:00:00Z') })
        .toString();
    assert.ok(r.startsWith('Resent-From: aktuar@fwv-raura.ch\r\nResent-To: spam@fwv-raura.ch\r\n'));
    assert.ok(r.includes('Resent-Date: Mon, 23 Nov 2026 10:00:00 +0000\r\n'));
    assert.ok(r.endsWith(roh));
});

/** Nachgebautes Postfach: Mails je Ordner als {uid, mid}. */
function postfach(mails) {
    const log = [];
    let offen = null;
    return {
        log,
        mails,
        async getMailboxLock(o) { offen = o; return { release() {} }; },
        async list() { return LISTE; },
        async fetchOne(uid) {
            const m = (mails[offen] || []).find(x => String(x.uid) === uid);
            return m && { source: Buffer.from(`Message-ID: ${m.mid}\r\n\r\nx`),
                envelope: { messageId: m.mid, from: [{ address: 'Boese@Spam.example' }] } };
        },
        async search(q) {
            return (mails[offen] || []).filter(x => x.mid === q.header['message-id']).map(x => x.uid);
        },
        async messageMove(uids, ziel) {
            const liste = [].concat(uids).map(String);
            const bleiben = (mails[offen] || []).filter(x => !liste.includes(String(x.uid)));
            const weg = (mails[offen] || []).filter(x => liste.includes(String(x.uid)));
            mails[offen] = bleiben;
            mails[ziel] = [...(mails[ziel] || []), ...weg];
            log.push(`move ${offen} -> ${ziel}`);
        },
        async append(o) { log.push(`append ${o}`); },
        async logout() {},
    };
}

test('Ablauf: gemeldet, eigenes Postfach und alle anderen nach Junk', async () => {
    const boxen = {
        'aktuar@fwv-raura.ch': postfach({ INBOX: [{ uid: 7, mid: '<s1@spam>' }, { uid: 8, mid: '<gut@x>' }] }),
        'kassier@fwv-raura.ch': postfach({ INBOX: [{ uid: 3, mid: '<s1@spam>' }], Archiv: [{ uid: 4, mid: '<s1@spam>' }] }),
        'praesident@fwv-raura.ch': postfach({ INBOX: [{ uid: 1, mid: '<gut@x>' }] }),
        'spam@fwv-raura.ch': postfach({ INBOX: [{ uid: 9, mid: '<s1@spam>' }] }),
    };
    const gesendet = [];
    const e = await S.spamMelden({
        konto: 'aktuar@fwv-raura.ch', ordner: 'INBOX', uid: 7,
        verbinden: async k => boxen[k],
        senden: async m => gesendet.push(m),
        alleKonten: async () => Object.keys(boxen),
    });
    assert.equal(gesendet.length, 1);
    assert.equal(gesendet[0].to, 'spam@fwv-raura.ch');
    assert.ok(gesendet[0].raw.toString().startsWith('Resent-From: aktuar@fwv-raura.ch'));
    assert.equal(e.gemeldet, true);
    assert.equal(e.absender, 'boese@spam.example');
    assert.deepEqual(e.entfernt, [
        { konto: 'aktuar@fwv-raura.ch', anzahl: 1 },
        { konto: 'kassier@fwv-raura.ch', anzahl: 2 },
    ]);
    assert.deepEqual(boxen['aktuar@fwv-raura.ch'].mails.INBOX.map(m => m.uid), [8], 'gute Mail bleibt');
    assert.deepEqual(boxen['kassier@fwv-raura.ch'].mails.Junk.map(m => m.uid), [3, 4]);
    assert.deepEqual(boxen['praesident@fwv-raura.ch'].log, [], 'nichts angefasst');
    assert.deepEqual(boxen['spam@fwv-raura.ch'].log, [], 'spam@ nie durchsucht');
});

test('Versand abgelehnt: direkt bei spam@ ablegen; fremdes Postfach kaputt: weiter', async () => {
    const boxen = {
        'aktuar@fwv-raura.ch': postfach({ INBOX: [{ uid: 7, mid: '<s1@spam>' }] }),
        'spam@fwv-raura.ch': postfach({}),
    };
    const e = await S.spamMelden({
        konto: 'aktuar@fwv-raura.ch', ordner: 'INBOX', uid: 7,
        verbinden: async k => {
            if (k === 'kassier@fwv-raura.ch') throw new Error('Login fehlgeschlagen');
            return boxen[k];
        },
        senden: async () => { throw new Error('554 spam message rejected'); },
        alleKonten: async () => ['aktuar@fwv-raura.ch', 'kassier@fwv-raura.ch', 'spam@fwv-raura.ch'],
    });
    assert.equal(e.gemeldet, true);
    assert.deepEqual(boxen['spam@fwv-raura.ch'].log, ['append INBOX']);
    assert.deepEqual(e.fehler, [{ konto: 'kassier@fwv-raura.ch', fehler: 'Login fehlgeschlagen' }]);
    assert.deepEqual(boxen['aktuar@fwv-raura.ch'].mails.Junk.map(m => m.uid), [7]);
});

test('Mail weg: 404, nichts gesendet', async () => {
    const gesendet = [];
    await assert.rejects(S.spamMelden({
        konto: 'aktuar@fwv-raura.ch', ordner: 'INBOX', uid: 99,
        verbinden: async () => postfach({ INBOX: [] }),
        senden: async m => gesendet.push(m),
        alleKonten: async () => [],
    }), e => e.status === 404);
    assert.equal(gesendet.length, 0);
});
