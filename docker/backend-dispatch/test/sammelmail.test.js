// Sammelmail (src/sammelmail.js): Stichzeit 18:00 Zuerich, was gesammelt
// wird, Aufbau der Mail und Versand je Empfaenger (Datenbank nachgebaut).
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/sammelmail');

test('Stichzeit: letztes 18:00 in Zuerich, Sommer- und Winterzeit', () => {
    // Sommerzeit (UTC+2): 18:00 Zuerich = 16:00 UTC
    assert.equal(S.stichzeit(new Date('2026-10-19T15:59:00Z')).toISOString(), '2026-10-18T16:00:00.000Z');
    assert.equal(S.stichzeit(new Date('2026-10-19T16:00:00Z')).toISOString(), '2026-10-19T16:00:00.000Z');
    // Winterzeit (UTC+1): 18:00 Zuerich = 17:00 UTC
    assert.equal(S.stichzeit(new Date('2026-12-01T18:30:00Z')).toISOString(), '2026-12-01T17:00:00.000Z');
    // Kurz nach Mitternacht Zuerich (22:30 UTC Vortag): gilt der Vortag 18:00
    assert.equal(S.stichzeit(new Date('2026-12-01T23:30:00Z')).toISOString(), '2026-12-01T17:00:00.000Z');
    // Umstellungstag 25.10.2026
    assert.equal(S.stichzeit(new Date('2026-10-25T20:00:00Z')).toISOString(), '2026-10-25T17:00:00.000Z');
});

test('Gesammelt wird nur mit sammeln, ohne Anhang, Cc oder mehrere Empfaenger', () => {
    assert.ok(S.kannSammeln({ to: 'a@x.ch', sammeln: true }));
    assert.ok(!S.kannSammeln({ to: 'a@x.ch' }));
    assert.ok(!S.kannSammeln({ to: 'a@x.ch', sammeln: true, cc: 'b@x.ch' }));
    assert.ok(!S.kannSammeln({ to: 'a@x.ch', sammeln: true, attachments: [{}] }));
    assert.ok(!S.kannSammeln({ to: 'a@x.ch, b@x.ch', sammeln: true }));
});

test('Mail: einzeln unveraendert, mehrere als Sammelmail', () => {
    const e1 = { betreff: 'Schicht geändert - Chilbi', text: 'Neu 18-20 Uhr', html: '<b>x</b>', erstellt_am: '2026-10-19T08:00:00Z' };
    const e2 = { betreff: 'Anmeldung bestaetigt: Chilbi', text: 'Bestaetigt <ok>', html: null, erstellt_am: '2026-10-19T09:30:00Z' };
    assert.deepEqual(S.sammelmailBauen([e1]), { subject: e1.betreff, text: e1.text, html: '<b>x</b>' });
    const m = S.sammelmailBauen([e1, e2], new Date('2026-10-19T16:00:00Z'));
    assert.equal(m.subject, 'Feuerwehrverein Raura: 2 Benachrichtigungen (19.10.2026)');
    assert.match(m.text, /1\. Schicht geändert - Chilbi  \(19\.10\., 10:00\)/);
    assert.match(m.text, /2\. Anmeldung bestaetigt: Chilbi/);
    assert.ok(m.html.includes('Bestaetigt &lt;ok&gt;'));
});

function nachgebautePool(zeilen) {
    const log = [], zurueck = [];
    return {
        log, zurueck,
        async query(sql, p) {
            if (sql.includes('UPDATE email_sammlung SET gesendet_am = NOW()')) {
                return { rows: zeilen.filter(z => new Date(z.erstellt_am) < p[0]) };
            }
            if (sql.includes('INSERT INTO dispatch_log')) { log.push(p); return { rows: [] }; }
            if (sql.includes('gesendet_am = NULL')) { zurueck.push(...p[0]); return { rows: [] }; }
            throw new Error('unerwartet: ' + sql);
        }
    };
}

test('Versand: eine Mail je Empfaenger, Gross/Klein egal, Fehler zurueck in die Warteschlange', async () => {
    const z = (id, empfaenger, erstellt_am) => ({ id, empfaenger, betreff: 'B' + id, text: 'T' + id, erstellt_am });
    const pool = nachgebautePool([
        z(1, 'anna@x.ch', '2026-10-19T07:00:00Z'),
        z(2, 'Anna@x.ch', '2026-10-19T12:00:00Z'),
        z(3, 'kaputt@x.ch', '2026-10-19T12:00:00Z'),
        z(4, 'anna@x.ch', '2026-10-19T16:30:00Z')   // nach 18:00 -> morgen
    ]);
    const gesendet = [];
    const r = await S.faelligeVersenden(pool, async (m) => {
        if (m.to === 'kaputt@x.ch') throw new Error('SMTP weg');
        gesendet.push(m);
        return { messageId: 'id' + gesendet.length };
    }, new Date('2026-10-19T16:05:00Z'));
    assert.deepEqual(r, { mails: 1, eintraege: 3 });
    assert.equal(gesendet.length, 1);
    assert.match(gesendet[0].subject, /2 Benachrichtigungen/);
    assert.equal(pool.log.length, 2, 'jede Benachrichtigung im Protokoll');
    assert.deepEqual(pool.zurueck, [3]);
});
