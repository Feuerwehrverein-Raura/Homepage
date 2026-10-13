// Verlauf der Messstellen im Roten Schopf, gegen eine nachgebaute Datenbank.

const test = require('node:test');
const assert = require('node:assert/strict');
const { schopfVerlauf, messwerte, grenzenAus } = require('../src/schopf-verlauf');
const { VORGABE } = require('../src/roter-schopf');

const ZEIT = Date.parse('2026-10-13T20:30:00Z');
const stumm = { warn() {}, error() {}, log() {} };

function zustand({ eisWeg = false } = {}) {
    return {
        kuehlung: [
            { messstelle: 'kuehler:eis', erreichbar: !eisWeg, temperatur: eisWeg ? null : -11.9,
                strom_an: eisWeg ? null : true, watt: eisWeg ? null : 90 },
            { messstelle: 'kuehler:landi', erreichbar: true, temperatur: -13.6, strom_an: false, watt: 0 }
        ],
        thermostate: [
            { messstelle: 'heizung:heizkoerper', erreichbar: true, temperatur: 18.5, soll: 20, ventil: 35 }
        ],
        hauptmessung: { messstelle: 'hauptmessung', erreichbar: true, leistung_w: 412,
            scheinleistung_va: 520, strom_a: 2.1, zaehler_kwh: 2118.95, rueckspeisung_kwh: 0.06,
            phasen: ['L1', 'L2', 'L3'].map((name, i) => ({ name, spannung_v: 239, strom_a: 0.7,
                leistung_w: 130 + i, scheinleistung_va: 170, leistungsfaktor: 0.8, frequenz_hz: 50,
                zaehler_kwh: 700 + i, rueckspeisung_kwh: 0 })) }
    };
}

function fakePool(zeilen = []) {
    const aufrufe = [];
    return {
        aufrufe,
        async query(sql, werte) {
            aufrufe.push({ sql, werte });
            if (/^\s*SELECT/.test(sql)) return { rows: zeilen };
            return { rows: [], rowCount: 3 };
        }
    };
}

test('messwerte: jede Messstelle mit ihren Groessen, Relais als 0/1', () => {
    const z = messwerte(zustand());
    const eis = z.filter(r => r.messstelle === 'kuehler:eis');
    assert.deepEqual(eis, [
        { messstelle: 'kuehler:eis', groesse: 'temperatur', wert: -11.9 },
        { messstelle: 'kuehler:eis', groesse: 'watt', wert: 90 },
        { messstelle: 'kuehler:eis', groesse: 'an', wert: 1 }
    ]);
    assert.equal(z.find(r => r.messstelle === 'kuehler:landi' && r.groesse === 'an').wert, 0);
    assert.equal(z.find(r => r.messstelle === 'heizung:heizkoerper' && r.groesse === 'ventil').wert, 35);
    const haupt = Object.fromEntries(z.filter(r => r.messstelle === 'hauptmessung').map(r => [r.groesse, r.wert]));
    assert.equal(haupt.leistung_w, 412);
    assert.equal(haupt.zaehler_kwh, 2118.95);
    assert.equal(haupt.l3_leistung_w, 132);
    assert.equal(haupt.l2_zaehler_kwh, 701);
    assert.equal(haupt.l1_leistungsfaktor, 0.8);
    // Hauptanschluss: 5 Gesamtwerte + 3 Phasen x 8.
    assert.equal(z.length, 3 + 3 + 3 + 5 + 24);
});

test('messwerte: nicht erreichbar ergibt Luecken (null), keine Nullen', () => {
    const eis = messwerte(zustand({ eisWeg: true })).filter(r => r.messstelle === 'kuehler:eis');
    assert.equal(eis.length, 3);
    assert.ok(eis.every(r => r.wert === null));
});

test('aufzeichnen: eine Einfuegung mit allen Zeilen zur selben Zeit', async () => {
    const pool = fakePool();
    const v = schopfVerlauf({ pool, zustand: async () => zustand(), jetzt: () => ZEIT, log: stumm });
    assert.equal(await v.aufzeichnen(), 38);
    assert.equal(pool.aufrufe.length, 1);
    const { sql, werte } = pool.aufrufe[0];
    assert.match(sql, /INSERT INTO schopf_messwerte/);
    assert.match(sql, /ON CONFLICT DO NOTHING/);
    assert.equal(werte[0], new Date(ZEIT).toISOString());
    assert.equal(werte.length, 1 + 38 * 3);
    // Platzhalter passen zu den Werten.
    assert.equal(sql.match(/\$\d+/g).map(p => Number(p.slice(1))).reduce((a, b) => Math.max(a, b)), werte.length);
});

test('verlauf: Reihen je Groesse, Grenze des Tiefkuehlers, Luecken bleiben null', async () => {
    const pool = fakePool([
        { t: new Date('2026-10-13T20:00:00Z'), groesse: 'temperatur', mittel: -11.94, min: -12.1, max: -11.8 },
        { t: new Date('2026-10-13T20:00:00Z'), groesse: 'an', mittel: 1, min: 1, max: 1 },
        { t: new Date('2026-10-13T20:05:00Z'), groesse: 'temperatur', mittel: null, min: null, max: null }
    ]);
    const v = schopfVerlauf({ pool, zustand: async () => ({}), grenzen: grenzenAus(VORGABE),
        jetzt: () => ZEIT, log: stumm });
    const r = await v.verlauf('kuehler:eis', '24h');
    assert.equal(r.grenze, -12);
    assert.equal(r.raster_s, 300);
    assert.equal(r.bis, new Date(ZEIT).toISOString());
    assert.deepEqual(r.reihen.temperatur, [
        { t: '2026-10-13T20:00:00.000Z', mittel: -11.94, min: -12.1, max: -11.8 },
        { t: '2026-10-13T20:05:00.000Z', mittel: null, min: null, max: null }
    ]);
    assert.equal(r.reihen.an.length, 1);
    assert.deepEqual(pool.aufrufe[0].werte.slice(0, 2), ['kuehler:eis', '5 minutes']);
});

test('verlauf: Zeitraum bestimmt das Raster; Unbekanntes wird abgewiesen', async () => {
    const pool = fakePool();
    const v = schopfVerlauf({ pool, zustand: async () => ({}), jetzt: () => ZEIT, log: stumm });
    assert.equal((await v.verlauf('hauptmessung', '1j')).raster_s, 86400);
    assert.equal(pool.aufrufe[0].werte[1], '1 day');
    assert.equal((await v.verlauf('hauptmessung', '7d')).grenze, null);
    assert.equal(await v.verlauf('hauptmessung', '2h'), null);
    assert.equal(await v.verlauf("kuehler:eis'; DROP TABLE x;--", '24h'), null);
    assert.equal(await v.verlauf('', '24h'), null);
    assert.equal(pool.aufrufe.length, 2);
});

test('verlauf: Verbrauch je Abschnitt aus dem Zaehlerstand, ueber Luecken hinweg', async () => {
    const zeile = (t, max) => ({ t: new Date(t), groesse: 'zaehler_kwh', mittel: max, min: max, max });
    const pool = fakePool([
        zeile('2026-10-13T18:00:00Z', 2118.0),
        zeile('2026-10-13T18:30:00Z', 2118.25),
        zeile('2026-10-13T19:00:00Z', null),
        zeile('2026-10-13T19:30:00Z', 2118.75)
    ]);
    const v = schopfVerlauf({ pool, zustand: async () => ({}), jetzt: () => ZEIT, log: stumm });
    const r = await v.verlauf('hauptmessung', '7d');
    assert.deepEqual(r.reihen.verbrauch_kwh.map(p => p.mittel), [null, 0.25, null, 0.5]);
    assert.equal(r.reihen.zaehler_kwh.length, 4);
});

test('grenzenAus: Grenzen aus der Einstellung von roter-schopf.js', () => {
    assert.deepEqual(grenzenAus(VORGABE), { 'kuehler:eis': -12, 'kuehler:landi': -12 });
});
