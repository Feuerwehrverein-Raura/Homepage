// Tiefkuehler-Alarm per SMS: Schwellen, Erinnerung, Entwarnung, Empfaenger.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    faelle, kuehlerAlarm, smsNummer, alarmBenutzer, alarmEmpfaenger,
} = require('../src/kuehler-alarm');

const MIN = 60 * 1000;
const gut = (kennung, name) => ({
    messstelle: `kuehler:${kennung}`, name, erreichbar: true,
    temperatur: -18.2, grenze: -12, zu_warm: false, strom_an: true, watt: 0,
});
const EIS = gut('eis', 'Tiefkühlschrank Eis');
const LANDI = gut('landi', 'Tiefkühlschrank Landi');

function uhr() {
    let t = Date.parse('2026-10-31T20:00:00Z');
    return { jetzt: () => t, weiter: (ms) => { t += ms; } };
}

test('Faelle: 0 W bei eingeschaltetem Relais ist normal; alle weg = ein Fall', () => {
    assert.deepEqual([...faelle([EIS, LANDI]).keys()], []);
    assert.deepEqual([...faelle([{ ...EIS, temperatur: -8.5 }, { ...LANDI, strom_an: false, temperatur: null }]).keys()],
        ['kuehler:eis:warm', 'kuehler:landi:aus', 'kuehler:landi:fuehler']);
    assert.deepEqual([...faelle([{ ...EIS, erreichbar: false }, LANDI]).keys()], ['kuehler:eis:weg']);
    assert.deepEqual([...faelle([{ ...EIS, erreichbar: false }, { ...LANDI, erreichbar: false }]).keys()], ['schopf:weg']);
    assert.match(faelle([{ ...EIS, temperatur: -8.54 }]).get('kuehler:eis:warm').text, /-8,5 C \(Grenze -12 C\)/);
});

test('Zu warm: erst nach 15 min eine SMS, nach 4 h Erinnerung, dann Entwarnung', () => {
    const u = uhr();
    const w = kuehlerAlarm({ jetzt: u.jetzt });
    const warm = [{ ...EIS, temperatur: -9 }, LANDI];
    assert.deepEqual(w.pruefen(warm), []);
    u.weiter(14 * MIN);
    assert.deepEqual(w.pruefen(warm), []);
    u.weiter(1 * MIN);
    const [a] = w.pruefen(warm);
    assert.equal(a.art, 'alarm');
    assert.equal(a.text, 'FWV Schopf: Tiefkühlschrank Eis zu warm: -9 C (Grenze -12 C), seit 15 min');
    u.weiter(60 * MIN);
    assert.deepEqual(w.pruefen(warm), [], 'keine SMS im Minutentakt');
    u.weiter(3 * 60 * MIN);
    assert.equal(w.pruefen(warm)[0].art, 'erinnerung');
    u.weiter(MIN);
    const [e] = w.pruefen([EIS, LANDI]);
    assert.deepEqual(e, { art: 'entwarnung', schluessel: 'kuehler:eis:warm', text: 'FWV Schopf: Tiefkühlschrank Eis wieder in Ordnung' });
});

test('Kurzer Aussetzer meldet nichts, auch keine Entwarnung', () => {
    const u = uhr();
    const w = kuehlerAlarm({ jetzt: u.jetzt });
    w.pruefen([{ ...EIS, erreichbar: false }, { ...LANDI, erreichbar: false }]);
    u.weiter(20 * MIN);
    assert.deepEqual(w.pruefen([{ ...EIS, erreichbar: false }, { ...LANDI, erreichbar: false }]), []);
    u.weiter(MIN);
    assert.deepEqual(w.pruefen([EIS, LANDI]), []);
});

test('Relais aus: nach 10 min; Schopf weg nach 30 min mit einer SMS', () => {
    const u = uhr();
    const w = kuehlerAlarm({ jetzt: u.jetzt });
    w.pruefen([EIS, { ...LANDI, strom_an: false }]);
    u.weiter(10 * MIN);
    assert.equal(w.pruefen([EIS, { ...LANDI, strom_an: false }])[0].text,
        'FWV Schopf: Tiefkühlschrank Landi ist ausgeschaltet (Relais aus), seit 10 min');

    const weg = [{ ...EIS, erreichbar: false }, { ...LANDI, erreichbar: false }];
    const v = kuehlerAlarm({ jetzt: u.jetzt });
    v.pruefen(weg);
    u.weiter(30 * MIN);
    const m = v.pruefen(weg);
    assert.equal(m.length, 1);
    assert.match(m[0].text, /nicht erreichbar \(Strom oder Internet im Lokal weg\?\), seit 30 min/);
    u.weiter(MIN);
    assert.equal(v.pruefen([EIS, LANDI])[0].text, 'FWV Schopf: Tiefkuehler im Roten Schopf wieder erreichbar');
});

test('Nach einem Neustart keine zweite SMS fuer einen gemeldeten Fall', () => {
    const u = uhr();
    const w = kuehlerAlarm({ jetzt: u.jetzt, gemeldet: new Map([['kuehler:eis:warm', u.jetzt() - 30 * MIN]]) });
    assert.deepEqual(w.pruefen([{ ...EIS, temperatur: -5 }, LANDI]), []);
    u.weiter(MIN);
    assert.equal(w.pruefen([EIS, LANDI])[0].text, 'FWV Schopf: Tiefkühlschrank Eis wieder in Ordnung');
});

test('SMS-Nummern: Schweizer Schreibweisen, kein Festnetz', () => {
    assert.equal(smsNummer('079 123 45 67'), '+41791234567');
    assert.equal(smsNummer('+41 (0)76 519 99 70'), '+41765199970');
    assert.equal(smsNummer('0041.78.123.45.67'), '+41781234567');
    assert.equal(smsNummer('+49 171 1234567'), '+491711234567');
    assert.equal(smsNummer('061 811 22 33'), null);
    assert.equal(smsNummer(''), null);
    assert.equal(smsNummer(null), null);
});

test('Empfaenger: Vorstand und Roter Schopf, jede Nummer einmal, ohne Ausgetretene', () => {
    assert.deepEqual(alarmBenutzer([
        { name: 'Vorstand', benutzer: [1, 2] }, { name: 'Roter Schopf', benutzer: [2, 3] },
        { name: 'Lager', benutzer: [9] },
    ]).sort(), [1, 2, 3]);
    assert.deepEqual(alarmEmpfaenger([
        { vorname: 'Erika', nachname: 'Muster', mobile: '079 123 45 67' },
        { vorname: 'Erika', nachname: 'Doppelt', mobile: '+41791234567' },
        { vorname: 'Hans', nachname: 'Fest', mobile: '', telefon: '061 811 22 33' },
        { vorname: 'Ida', nachname: 'Weg', mobile: '078 000 00 00', status: 'Ausgetreten' },
        { vorname: 'Max', nachname: 'Tel', mobile: null, telefon: '076 111 22 33' },
    ]), [
        { nummer: '+41791234567', name: 'Erika Muster' },
        { nummer: '+41761112233', name: 'Max Tel' },
    ]);
});

test('Push-Titel je Meldung: Alarm, Erinnerung, Entwarnung', () => {
    const { pushTitel } = require('../src/kuehler-alarm');
    assert.equal(pushTitel('alarm'), 'Tiefkühler-Alarm');
    assert.equal(pushTitel('erinnerung'), 'Tiefkühler-Alarm (Erinnerung)');
    assert.equal(pushTitel('entwarnung'), 'Tiefkühler: Entwarnung');
});

test('Vor Ort: Erinnerung erst 12 h danach; nur schauen gehen laesst die 4 h', () => {
    const { mitSchauer, schauenText } = require('../src/kuehler-alarm');
    const u = uhr();
    const w = kuehlerAlarm({ jetzt: u.jetzt });
    const warm = [{ ...EIS, temperatur: -9 }, LANDI];
    w.pruefen(warm);
    u.weiter(15 * MIN);
    assert.equal(w.pruefen(warm)[0].art, 'alarm');
    u.weiter(4 * 60 * MIN);
    assert.equal(w.pruefen(warm)[0].art, 'erinnerung', 'ohne vor Ort: nach 4 h');
    u.weiter(30 * MIN);
    const vorOrt = new Map([['kuehler:eis:warm', u.jetzt()]]);
    u.weiter(4 * 60 * MIN);
    assert.deepEqual(w.pruefen(warm, vorOrt), [], 'jemand war vor Ort: keine Erinnerung nach 4 h');
    u.weiter(8 * 60 * MIN - MIN);
    assert.deepEqual(w.pruefen(warm, vorOrt), []);
    u.weiter(MIN);
    assert.equal(w.pruefen(warm, vorOrt)[0].art, 'erinnerung', '12 h nach vor Ort wieder');

    assert.equal(mitSchauer('FWV Schopf, noch immer: X', { name: 'Hans Muster', zeit: '2026-11-02T13:05:00Z' }),
        'FWV Schopf, noch immer: X - Hans Muster schaut nach (seit 14:05)');
    assert.equal(mitSchauer('X', { name: 'Hans Muster', zeit: '2026-11-02T13:05:00Z', vor_ort: true }),
        'X - Hans Muster war vor Ort (seit 14:05)');
    assert.equal(mitSchauer('T', null), 'T');
    assert.equal(schauenText('Hans Muster', 'FWV Schopf: Tiefkühlschrank Eis zu warm: -9 C (Grenze -12 C), seit 15 min'),
        'FWV Schopf: Hans Muster geht schauen (Tiefkühlschrank Eis zu warm: -9 C (Grenze -12 C), seit 15 min)');
    assert.equal(schauenText('Hans Muster', 'FWV Schopf: Eis zu warm', true), 'FWV Schopf: Hans Muster ist vor Ort (Eis zu warm)');
});

test('Vor-Ort-Sticker: nur echte Codes, nur fuer das betroffene Geraet', () => {
    const { stickerInhalt, stickerPruefen, stickerPasst } = require('../src/kuehler-alarm');
    const g = 'a'.repeat(48);
    const eis = stickerInhalt(g, 'kuehler:eis');
    assert.match(eis, /^fwv-vor-ort:kuehler:eis:[0-9a-f]{20}$/);
    assert.equal(stickerPruefen(g, eis), 'kuehler:eis');
    assert.equal(stickerPruefen(g, ` ${eis}\n`), 'kuehler:eis');
    assert.equal(stickerPruefen('b'.repeat(48), eis), null, 'anderes Geheimnis');
    assert.equal(stickerPruefen(g, eis.replace('kuehler:eis', 'kuehler:landi')), null, 'Code eines anderen Geraets');
    assert.equal(stickerPruefen(g, 'fwv-vor-ort:kuehler:eis:00000000000000000000'), null);
    assert.equal(stickerPruefen(g, 'https://example.com'), null);
    assert.equal(stickerPruefen(null, eis), null);
    assert.equal(stickerPasst('kuehler:eis', 'kuehler:eis:warm'), true);
    assert.equal(stickerPasst('kuehler:eis', 'kuehler:eisberg:warm'), false);
    assert.equal(stickerPasst('kuehler:eis', 'kuehler:landi:aus'), false);
    assert.equal(stickerPasst('kuehler:landi', 'schopf:weg'), true);
});
