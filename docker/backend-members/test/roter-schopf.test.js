// Roter Schopf: Licht und Tiefkuehler, gegen eine nachgebaute Zentrale.
//
// Schreibt ausserdem die Vertragsdatei test/fixtures/roter-schopf-app.json,
// gegen die die Flutter-App testet:
//
//     FIXTURES_SCHREIBEN=1 node --test test/roter-schopf.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { roterSchopf, hatRoterSchopfZugang } = require('../src/roter-schopf');

const stumm = { warn() {}, error() {}, log() {} };
const ZEIT = Date.parse('2026-10-12T18:30:00Z');

// Nachgebautes Vereinslokal. Die Zentrale reicht ihre Klienten ueber Ports
// durch; Regler 4 (.7) ist stromlos und fehlt in der Klientenliste.
function fakeLokal({ zentraleWeg = false, eisWarm = false } = {}) {
    const ports = { '192.168.33.4': 10760, '192.168.33.5': 10432, '192.168.33.6': 12432,
        '192.168.33.8': 12076, '192.168.33.12': 10212, '192.168.33.13': 14092,
        '192.168.33.31': 11416 };
    const geraetZuPort = Object.fromEntries(Object.entries(ports).map(([ip, p]) => [p, ip]));
    const ausgang = { '192.168.33.12:0': true, '192.168.33.4:1': true, '192.168.33.4:0': false };
    const aufrufe = [];

    async function abrufen(url) {
        aufrufe.push(url);
        const u = new URL(url);
        const antwort = (daten, status = 200) => ({
            ok: status === 200, status, text: async () => JSON.stringify(daten)
        });
        if (u.hostname === '192.168.88.84' && !u.port) {
            if (zentraleWeg) throw new Error('weg');
            if (u.pathname === '/rpc/WiFi.ListAPClients') {
                return antwort({ ap_clients: Object.entries(ports).map(([ip, mport]) => ({ ip, mport })) });
            }
            if (u.pathname === '/script/4/gruppe') return antwort('ok');
            if (u.pathname === '/rpc/EM.GetStatus') {
                return antwort({ id: 0, a_current: 0.027, a_voltage: 238.5, a_act_power: 0.0,
                    a_aprt_power: 6.7, a_pf: 0.00, a_freq: 50.0,
                    b_current: 0.935, b_voltage: 238.9, b_act_power: 134.0,
                    b_aprt_power: 227.6, b_pf: 0.60, b_freq: 50.0,
                    c_current: 0.414, c_voltage: 239.2, c_act_power: 93.2,
                    c_aprt_power: 136.2, c_pf: 0.81, c_freq: 49.9,
                    n_current: null, total_current: 1.376, total_act_power: 227.257,
                    total_aprt_power: 370.467 });
            }
            if (u.pathname === '/rpc/EMData.GetStatus') {
                return antwort({ id: 0, a_total_act_energy: 25923.79, a_total_act_ret_energy: 49.58,
                    b_total_act_energy: 1566290.58, b_total_act_ret_energy: 6.70,
                    c_total_act_energy: 526734.05, c_total_act_ret_energy: 0.07,
                    total_act: 2118948.42, total_act_ret: 56.35 });
            }
        }
        if (u.hostname === '192.168.88.84' && u.port) {
            const ip = geraetZuPort[Number(u.port)];
            const kanal = u.searchParams.get('id');
            const k = `${ip}:${kanal}`;
            if (u.pathname === '/rpc/Switch.GetStatus') {
                return antwort({ id: Number(kanal), output: !!ausgang[k], apower: ausgang[k] ? 41.6 : 0 });
            }
            if (u.pathname === '/rpc/Switch.GetConfig') {
                return antwort({ id: Number(kanal), name: `Lampe ${ip.split('.').pop()}/${kanal}` });
            }
            if (u.pathname === '/rpc/Switch.Set') {
                ausgang[k] = u.searchParams.get('on') === 'true';
                return antwort({ was_on: false });
            }
        }
        // BLU Gateway im Hausnetz (seit 14.10.2026), direkt gefragt.
        if (u.hostname === '192.168.88.68' && u.pathname === '/rpc/BluTrv.GetStatus') {
            return antwort({ id: 200, target_C: 21, current_C: 21.3, pos: 0,
                errors: ['not_calibrated'], connected: true, battery: 100 });
        }
        if (u.hostname === '192.168.88.76') {
            return antwort({ 'switch:0': { output: true, apower: 89.6 },
                'temperature:100': { tC: eisWarm ? -7.4 : -18.2 } });
        }
        if (u.hostname === '192.168.88.71') {
            return antwort({ 'switch:0': { output: false, apower: 0 },
                'temperature:100': { tC: null } });
        }
        throw new Error('nicht erreichbar: ' + url);
    }
    return { abrufen, aufrufe, ausgang };
}

test('Zugang: Roter Schopf, Vorstand, admin - ohne Gross/klein', () => {
    assert.equal(hatRoterSchopfZugang(['Roter Schopf']), true);
    assert.equal(hatRoterSchopfZugang([' roter schopf ']), true);
    assert.equal(hatRoterSchopfZugang(['Mitglieder', 'Vorstand']), true);
    assert.equal(hatRoterSchopfZugang(['admin']), true);
    assert.equal(hatRoterSchopfZugang(['Lager', 'Mitglieder']), false);
    assert.equal(hatRoterSchopfZugang(undefined), false);
});

test('Zustand: Gruppen aus den Lampen, stromlose Regler, Tiefkuehler', async () => {
    const lokal = fakeLokal();
    const rs = roterSchopf({ abrufen: lokal.abrufen, jetzt: () => ZEIT, log: stumm });
    const z = await rs.zustand();

    assert.equal(z.zentrale, true);
    assert.equal(z.lampen.length, 12);
    const spots = z.gruppen.find(g => g.kennung === 'spots');
    // Regler 4 (.7) ist stromlos: seine Spot-Lampe zaehlt als ausgesteckt.
    assert.deepEqual([spots.anzahl, spots.anzahl_an, spots.an, spots.teilweise, spots.anzahl_aus_gesteckt],
        [7, 2, false, true, 1]);
    const arbeit = z.gruppen.find(g => g.kennung === 'arbeitsleuchten');
    assert.deepEqual([arbeit.anzahl_an, arbeit.an, arbeit.teilweise], [0, false, false]);

    const regler4 = z.lampen.find(l => l.kennung === '192.168.33.7:0');
    assert.equal(regler4.erreichbar, false);
    assert.equal(z.lampen.find(l => l.kennung === '192.168.33.12:0').watt, 42);

    const eis = z.kuehlung.find(k => k.name === 'Tiefkühlschrank Eis');
    assert.deepEqual([eis.temperatur, eis.zu_warm, eis.strom_an, eis.watt], [-18.2, false, true, 90]);
    const landi = z.kuehlung.find(k => k.name === 'Tiefkühlschrank Landi');
    assert.equal(landi.zu_warm, true, 'Fuehler ohne Wert gilt als zu warm');

    assert.equal(eis.messstelle, 'kuehler:eis');
    assert.equal(landi.messstelle, 'kuehler:landi');

    // Hauptanschluss: alles, was der Pro 3EM misst.
    const h = z.hauptmessung;
    assert.equal(h.messstelle, 'hauptmessung');
    assert.deepEqual([h.leistung_w, h.scheinleistung_va, h.strom_a, h.zaehler_kwh, h.rueckspeisung_kwh],
        [227, 370, 1.38, 2118.95, 0.06]);
    assert.deepEqual(h.phasen[1], { name: 'L2', spannung_v: 238.9, strom_a: 0.94, leistung_w: 134,
        scheinleistung_va: 228, leistungsfaktor: 0.6, frequenz_hz: 50, zaehler_kwh: 1566.29,
        rueckspeisung_kwh: 0.01 });

    assert.deepEqual(z.thermostate, [{ messstelle: 'heizung:heizkoerper', name: 'Heizkörper', erreichbar: true, temperatur: 21.3,
        soll: 21, ventil: 0, batterie: 100, fehler: ['not_calibrated'] }]);

    if (process.env.FIXTURES_SCHREIBEN) {
        const ziel = path.join(__dirname, 'fixtures', 'roter-schopf-app.json');
        fs.mkdirSync(path.dirname(ziel), { recursive: true });
        fs.writeFileSync(ziel, JSON.stringify(z, null, 2) + '\n');
    }
});

test('Gruppe ist an, wenn alle erreichbaren Lampen brennen (ausgesteckte zaehlen nicht)', async () => {
    const lokal = fakeLokal();
    for (const k of ['192.168.33.12:0', '192.168.33.13:0', '192.168.33.4:1', '192.168.33.5:0',
        '192.168.33.5:1', '192.168.33.6:0', '192.168.33.8:1']) lokal.ausgang[k] = true;
    const rs = roterSchopf({ abrufen: lokal.abrufen, jetzt: () => ZEIT, log: stumm });
    const spots = (await rs.zustand()).gruppen.find(g => g.kennung === 'spots');
    assert.deepEqual([spots.an, spots.teilweise, spots.anzahl, spots.anzahl_an, spots.anzahl_aus_gesteckt],
        [true, false, 7, 7, 1]);
});

test('Zustand wird geteilt: zweiter Aufruf fragt die Zentrale nicht erneut', async () => {
    const lokal = fakeLokal();
    let t = ZEIT;
    const rs = roterSchopf({ abrufen: lokal.abrufen, jetzt: () => t, log: stumm });
    await Promise.all([rs.zustand(), rs.zustand(), rs.zustand()]);
    const nachErstem = lokal.aufrufe.length;
    await rs.zustand();
    assert.equal(lokal.aufrufe.length, nachErstem);
    t += 11 * 1000;
    await rs.zustand();
    assert.ok(lokal.aufrufe.length > nachErstem);
    // Namen werden nicht bei jeder Messung neu gelesen.
    const namensAbfragen = lokal.aufrufe.filter(u => u.includes('Switch.GetConfig')).length;
    assert.equal(namensAbfragen, 10, "12 Lampen, davon 2 am stromlosen Regler 4");
});

test('Zentrale weg: alle Lampen nicht erreichbar, Tiefkuehler trotzdem da', async () => {
    const lokal = fakeLokal({ zentraleWeg: true });
    const rs = roterSchopf({ abrufen: lokal.abrufen, jetzt: () => ZEIT, log: stumm });
    const z = await rs.zustand();
    assert.equal(z.zentrale, false);
    assert.ok(z.lampen.every(l => !l.erreichbar));
    assert.ok(z.gruppen.every(g => !g.erreichbar));
    assert.equal(z.kuehlung[0].erreichbar, true);
    assert.equal(z.thermostate[0].erreichbar, true, 'Gateway haengt im Hausnetz, nicht hinter der Zentrale');
});

test('Gruppe schalten geht ueber das Skript der Zentrale und wird vorgemerkt', async () => {
    const lokal = fakeLokal();
    const rs = roterSchopf({ abrufen: lokal.abrufen, jetzt: () => ZEIT, log: stumm });
    await rs.zustand();
    assert.deepEqual(await rs.schalteGruppe('arbeitsleuchten', true), { ok: true });
    assert.ok(lokal.aufrufe.includes('http://192.168.88.84/script/4/gruppe?id=201&an=true'));
    const z = await rs.zustand();
    const arbeit = z.gruppen.find(g => g.kennung === 'arbeitsleuchten');
    assert.equal(arbeit.anzahl_an, 3, 'vorgemerkt nur fuer erreichbare Lampen');
    assert.deepEqual(await rs.schalteGruppe('alles', true), { ok: false, grund: 'unbekannte Gruppe' });
});

test('Lampe schalten: nur bekannte Kennungen, ueber den Port der Zentrale', async () => {
    const lokal = fakeLokal();
    const rs = roterSchopf({ abrufen: lokal.abrufen, jetzt: () => ZEIT, log: stumm });
    assert.deepEqual(await rs.schalteLampe('192.168.33.6:1', true), { ok: true });
    assert.equal(lokal.ausgang['192.168.33.6:1'], true);
    assert.ok(lokal.aufrufe.some(u => u.startsWith('http://192.168.88.84:12432/rpc/Switch.Set?id=1&on=true')));
    assert.deepEqual(await rs.schalteLampe('192.168.33.7:1', true), { ok: false, grund: 'Lampe nicht erreichbar' });
    assert.deepEqual(await rs.schalteLampe('192.168.88.1:0', true), { ok: false, grund: 'unbekannte Lampe' });
    assert.deepEqual(await rs.schalteLampe('192.168.33.31:0', true), { ok: false, grund: 'unbekannte Lampe' });
});

test('Tiefkuehler zu warm', async () => {
    const lokal = fakeLokal({ eisWarm: true });
    const rs = roterSchopf({ abrufen: lokal.abrufen, jetzt: () => ZEIT, log: stumm });
    const z = await rs.zustand();
    assert.equal(z.kuehlung[0].zu_warm, true);
});
