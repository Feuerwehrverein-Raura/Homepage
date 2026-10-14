// Vorstand-Push: wer zum Vorstand zaehlt, wer ausgelassen wird, Inhalt der
// Mitteilung, Sperrfrist und Buendeln von Anmeldungen, nie werfen.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    ABSCHALT_ART, istVorstandFunktion, vorstandEmpfaenger, vorstandNachricht, fcmNachricht, vorstandMelder
} = require('../src/vorstand-melder');

const LEUTE = [
    { id: 'p', funktion: 'Präsident', status: 'Aktivmitglied' },
    { id: 'a', funktion: 'Aktuar, Social Media', status: 'Aktivmitglied' },
    { id: 'k', funktion: 'kassier', status: 'Ehrenmitglied' },
    { id: 'x', funktion: 'Admin', status: 'Passivmitglied' },
    { id: 's', funktion: 'Social Media', status: 'Aktivmitglied' },
    { id: 'm', funktion: null, status: 'Aktivmitglied' },
    { id: 'alt', funktion: 'Beisitzer', status: 'Ausgetreten' },
    { id: 'still', funktion: 'Materialwart', status: 'Aktivmitglied', abgeschaltet: true }
];

test('Vorstand nach Funktion wie die Authentik-Gruppen Vorstand/admin', () => {
    for (const f of ['Präsident', 'Praesident', 'Vize-Präsident', 'Aktuar, Social Media',
        'KASSIER', 'Materialwart', 'Beisitzer', 'Vorstand', 'admin']) {
        assert.equal(istVorstandFunktion(f), true, f);
    }
    for (const f of ['Social Media', 'Revisor', '', null, undefined, 42]) {
        assert.equal(istVorstandFunktion(f), false, String(f));
    }
});

test('Empfaenger: nur Vorstand, ohne Ausgetretene, Abgeschaltete und Ausloeser', () => {
    assert.deepEqual(vorstandEmpfaenger(LEUTE), ['p', 'a', 'k', 'x']);
    assert.deepEqual(vorstandEmpfaenger(LEUTE, { ausser: 'a' }), ['p', 'k', 'x']);
    assert.deepEqual(vorstandEmpfaenger([{ id: 7, funktion: 'Aktuar' }], { ausser: 7 }), []);
    assert.deepEqual(vorstandEmpfaenger([...LEUTE, LEUTE[0]]), ['p', 'a', 'k', 'x'], 'doppelt nur einmal');
    assert.deepEqual(vorstandEmpfaenger(null), []);
    assert.equal(ABSCHALT_ART, 'vorstand_mitteilungen');
});

test('Nachrichten je Art mit Bereich und Kennung fuers Antippen', () => {
    const antrag = vorstandNachricht('antrag', { id: 12, name: 'Hans Muster' });
    assert.equal(antrag.notificationType, 'vorstand_antrag');
    assert.match(antrag.body, /Hans Muster möchte Mitglied werden/);
    assert.deepEqual(antrag.data, { bereich: 'antraege', id: '12' });

    const austritt = vorstandNachricht('austritt', { id: 'u1', name: 'Eva', datum: '2026-12-31' });
    assert.equal(austritt.notificationType, 'vorstand_austritt');
    assert.match(austritt.body, /gewünscht auf 2026-12-31/);
    assert.deepEqual(austritt.data, { bereich: 'mitglieder', id: 'u1' });

    const loeschung = vorstandNachricht('loeschung', { id: 'u2', name: 'Max', von: 'Anna Aktuar' });
    assert.equal(loeschung.notificationType, 'vorstand_loeschung');
    assert.match(loeschung.body, /angestossen von Anna Aktuar.*Aktuar und Kassier/);

    const anm = vorstandNachricht('anmeldung', { id: 'e1', name: 'Gast', anlass: 'Chilbi' });
    assert.equal(anm.notificationType, 'vorstand_anmeldung');
    assert.equal(anm.title, 'Neue Anmeldung');
    assert.deepEqual(anm.data, { bereich: 'anlaesse', id: 'e1' });
    const mehr = vorstandNachricht('anmeldung', { id: 'e1', anlass: 'Chilbi' }, 3);
    assert.equal(mehr.title, '3 weitere Anmeldungen');

    assert.equal(vorstandNachricht('antrag', {}).data.id, undefined, 'ohne Kennung kein id');
    assert.throws(() => vorstandNachricht('quatsch'));
});

test('FCM-Nachricht: Kanal Vorstand, Daten nur Strings', () => {
    const n = fcmNachricht(vorstandNachricht('antrag', { id: 5, name: 'X' }), ['t1', 't2']);
    assert.deepEqual(n.tokens, ['t1', 't2']);
    assert.equal(n.android.notification.channelId, 'fwv_vorstand');
    assert.equal(n.notification.title, 'Neuer Mitgliedschaftsantrag');
    assert.deepEqual(n.data, { notificationType: 'vorstand_antrag', bereich: 'antraege', id: '5' });
    for (const v of Object.values(n.data)) assert.equal(typeof v, 'string');
});

function aufbau({ kandidaten = async () => LEUTE, senden } = {}) {
    let uhr = 1_000_000;
    const wecker = [];
    const gesendet = [];
    const fehler = [];
    const melder = vorstandMelder({
        kandidaten,
        senden: senden || (async (ids, n) => gesendet.push({ ids, ...n })),
        sperreMs: 1000,
        jetzt: () => uhr,
        planen: (fn, ms) => wecker.push({ fn, ms }),
        protokoll: { log() {}, error: (...a) => fehler.push(a.join(' ')) }
    });
    return { melder, gesendet, wecker, fehler, vor: (ms) => { uhr += ms; } };
}

test('Melder: Ausloeser bekommt nichts, gleiche Sache nur einmal je Sperrfrist', async () => {
    const { melder, gesendet, vor } = aufbau();
    assert.equal(await melder.melden('loeschung', { id: 'u9', name: 'Max' }, { ausloeser: 'p' }), 3);
    assert.deepEqual(gesendet[0].ids, ['a', 'k', 'x']);
    assert.equal(gesendet[0].notificationType, 'vorstand_loeschung');

    assert.equal(await melder.melden('loeschung', { id: 'u9', name: 'Max' }), 0, 'doppelt');
    assert.equal(gesendet.length, 1);
    await melder.melden('loeschung', { id: 'u10', name: 'Moritz' });
    assert.equal(gesendet.length, 2, 'andere Kennung geht');

    vor(1001);
    await melder.melden('loeschung', { id: 'u9', name: 'Max' });
    assert.equal(gesendet.length, 3, 'nach der Sperrfrist wieder');
});

test('Melder: Anmeldungen zum selben Anlass werden gebuendelt', async () => {
    const { melder, gesendet, wecker, vor } = aufbau();
    await melder.melden('anmeldung', { id: 'e1', name: 'A', anlass: 'Chilbi' });
    assert.equal(gesendet.length, 1);
    assert.equal(wecker.length, 1);
    await melder.melden('anmeldung', { id: 'e1', name: 'B', anlass: 'Chilbi' }, { ausloeser: 'k' });
    await melder.melden('anmeldung', { id: 'e1', name: 'C', anlass: 'Chilbi' }, { ausloeser: 'k' });
    await melder.melden('anmeldung', { id: 'e2', name: 'D', anlass: 'GV' });
    assert.equal(gesendet.length, 2, 'anderer Anlass sofort');

    vor(1000);
    await wecker[0].fn();
    assert.equal(gesendet.length, 3);
    assert.equal(gesendet[2].title, '2 weitere Anmeldungen');
    assert.deepEqual(gesendet[2].ids, ['p', 'a', 'x'], 'beide von k: k ausgelassen');

    await melder.melden('anmeldung', { id: 'e1', name: 'E', anlass: 'Chilbi' });
    assert.equal(gesendet.length, 4, 'neue Frist beginnt sofort');
    await wecker[0].fn();
    assert.equal(gesendet.length, 4, 'alter Wecker zieht nichts doppelt nach');
});

test('Melder: ohne Weiteres in der Frist keine Sammelmitteilung', async () => {
    const { melder, gesendet, wecker } = aufbau();
    await melder.melden('anmeldung', { id: 'e1', name: 'A', anlass: 'Chilbi' });
    await wecker[0].fn();
    assert.equal(gesendet.length, 1);
});

test('Melder wirft nie: Fehler beim Senden, in der Datenbank, unbekannte Art', async () => {
    const kaputt = aufbau({ senden: async () => { throw new Error('FCM weg'); } });
    assert.equal(await kaputt.melder.melden('antrag', { id: 1 }), 0);
    assert.match(kaputt.fehler[0], /FCM weg/);

    const db = aufbau({ kandidaten: async () => { throw new Error('DB weg'); } });
    assert.equal(await db.melder.melden('austritt', { id: 1 }), 0);
    assert.match(db.fehler[0], /DB weg/);

    const art = aufbau();
    assert.equal(await art.melder.melden('quatsch', {}), 0);
    assert.equal(art.gesendet.length, 0);
});

test('Melder: niemand im Vorstand mit App -> nichts senden', async () => {
    const { melder, gesendet } = aufbau({ kandidaten: async () => [{ id: 'm', funktion: 'Revisor' }] });
    assert.equal(await melder.melden('antrag', { id: 3 }), 0);
    assert.equal(gesendet.length, 0);
});
