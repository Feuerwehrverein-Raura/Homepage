// Wohin das Antippen einer App-Push-Mitteilung fuehrt (src/push-ziel.js):
//  - Vorstand-Push (an alle / Benachrichtigen) mit optionalem Ziel.
//  - Jeder event_update- und shift_reminder-Push in src/index.js schickt
//    die Anlass-ID (eventId) mit - sonst fuehrt das Antippen nirgends hin.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pushZielDaten, mitZiel } = require('../src/push-ziel');

const ANLASS = '00000000-0000-0000-0000-e00000000001';

test('pushZielDaten: ohne Ziel leer', () => {
    assert.deepEqual(pushZielDaten(undefined), {});
    assert.deepEqual(pushZielDaten({}), {});
    assert.deepEqual(pushZielDaten({ ziel: '' }), {});
    assert.deepEqual(pushZielDaten({ ziel: 'keins', eventId: ANLASS }), {});
});

test('pushZielDaten: Anlass, Profil, Beitraege', () => {
    assert.deepEqual(pushZielDaten({ ziel: 'anlass', eventId: ANLASS }), { ziel: 'anlass', eventId: ANLASS });
    assert.deepEqual(pushZielDaten({ ziel: 'profil', eventId: ANLASS }), { ziel: 'profil' });
    assert.deepEqual(pushZielDaten({ ziel: 'beitraege' }), { ziel: 'beitraege' });
});

test('pushZielDaten: unbekanntes Ziel oder Anlass ohne UUID -> 400', () => {
    assert.throws(() => pushZielDaten({ ziel: 'lager' }), e => e.status === 400);
    assert.throws(() => pushZielDaten({ ziel: 'anlass' }), e => e.status === 400);
    assert.throws(() => pushZielDaten({ ziel: 'anlass', eventId: 'x; DROP' }), e => e.status === 400);
});

test('mitZiel: Anlass-Mitteilungen mit eventId fuehren zum Anlass', () => {
    assert.deepEqual(mitZiel('event_update', { eventId: ANLASS }), { eventId: ANLASS, ziel: 'anlass' });
    assert.deepEqual(mitZiel('shift_reminder', { eventId: ANLASS }), { eventId: ANLASS, ziel: 'anlass' });
    assert.deepEqual(mitZiel('general', { eventId: ANLASS }), { eventId: ANLASS });
    assert.deepEqual(mitZiel('event_update', {}), {});
    assert.deepEqual(mitZiel('event_update', { eventId: ANLASS, ziel: 'profil' }), { eventId: ANLASS, ziel: 'profil' });
    assert.deepEqual(mitZiel('general'), {});
});

/** Alle Aufrufe `name(...)` im Quelltext, mit vollstaendigen Argumenten. */
function aufrufe(quelle, name) {
    const treffer = [];
    let i = 0;
    while ((i = quelle.indexOf(`${name}(`, i)) !== -1) {
        const start = i + name.length + 1;
        let tiefe = 1, j = start;
        while (j < quelle.length && tiefe > 0) {
            if (quelle[j] === '(') tiefe++;
            else if (quelle[j] === ')') tiefe--;
            j++;
        }
        treffer.push(quelle.slice(start, j - 1));
        i = j;
    }
    return treffer;
}

test('jeder Anlass-Push in src/index.js schickt die eventId mit', () => {
    const quelle = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
    const anlassPush = aufrufe(quelle, 'pushToMember')
        .filter(a => /'(event_update|shift_reminder)'/.test(a));
    assert.ok(anlassPush.length >= 10, `nur ${anlassPush.length} Anlass-Pushs gefunden`);
    for (const a of anlassPush) {
        assert.match(a, /\beventId\b/, `ohne eventId: pushToMember(${a.slice(0, 120)} ...)`);
    }
    // Broadcasts an alle (neuer Anlass, Platz frei) ebenso.
    const broadcasts = quelle.split("notificationType: 'event_update'").slice(1);
    assert.ok(broadcasts.length >= 2);
    for (const b of broadcasts) assert.match(b.slice(0, 200), /data: mitZiel\('event_update', \{ eventId/);
});
