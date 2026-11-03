// Pingen-Spesen (src/pingen-spesen.js): nur belastete Briefe mit Preis,
// eine eigene Mail an den Kassier, Wartende bleiben offen (Datenbank nachgebaut).
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/pingen-spesen');

function falscheDb(zeilen, { kassier = { vorname: 'Kurt' } } = {}) {
    const aenderungen = [];
    return {
        aenderungen,
        async query(sql, werte) {
            if (sql.includes('FROM dispatch_log')) return { rows: zeilen };
            if (sql.includes("'%kassier%'")) return { rows: kassier ? [kassier] : [] };
            if (sql.includes("'%aktuar%'")) return { rows: [{ vorname: 'Stefan', nachname: 'Müller' }] };
            if (sql.includes('FROM pingen_abrechnungen WHERE spesen_id IS NULL')) return { rows: [] };
            if (sql.includes('INSERT INTO pingen_abrechnungen')) { aenderungen.push(['abrechnung:' + werte[2] + ':' + werte[4].join(',')]); return { rows: [] }; }
            if (sql.includes('INSERT INTO dispatch_log')) { aenderungen.push(['mail']); return { rows: [] }; }
            if (sql.startsWith('UPDATE dispatch_log')) { aenderungen.push(werte); return { rows: [] }; }
            throw new Error('unerwartet: ' + sql);
        }
    };
}

const zeile = (id, name) => ({
    id, external_id: 'L' + id, subject: 'Einladung: Preisjassen 2026',
    recipient_address: JSON.stringify({ name })
});

test('Belastete Briefe mit Preis in eine Abrechnung, Wartende bleiben offen', async () => {
    const db = falscheDb([zeile(1, 'Steve Aerni'), zeile(2, 'Ursula Meyer'), zeile(3, 'Peter Tschudin'),
        zeile(4, 'Alt Storniert'), zeile(5, 'Weg')]);
    const pingen = {
        L1: { status: 'submitted', preis: 1.63 },
        L2: { status: 'sent', preis: 1.37 },
        L3: { status: 'awaiting_credits', preis: 1.63 },
        L4: { status: 'cancelled', preis: 0 },
    };
    const vorgemerkt = [];
    const r = await P.spesenAbrechnen(db, {
        datum: '03.11.2026',
        briefLesen: async (id) => {
            if (id === 'L5') throw Object.assign(new Error('weg'), { response: { status: 404 } });
            return pingen[id];
        },
        senden: async (m) => vorgemerkt.push(m),
    });
    assert.deepEqual(r, { abgerechnet: 2, summe: 3, offen: 1 });
    assert.equal(vorgemerkt.length, 1);
    const m = vorgemerkt[0];
    assert.equal(m.to, 'kassier@fwv-raura.ch');
    assert.match(m.text, /^Hallo Kurt/);
    assert.equal(m.subject, 'Spesenabrechnung Pingen 03.11.2026: 2 Briefe, CHF 3.00');
    assert.match(m.text, /Steve Aerni\s+CHF 1\.63/);
    assert.match(m.text, /Ursula Meyer\s+CHF 1\.37/);
    assert.match(m.text, /Total: CHF 3\.00/);
    assert.match(m.text, /Stefan Müller \(Aktuar\) vorgestreckt/);
    assert.doesNotMatch(m.text, /Tschudin/);
    // abgerechnet: 1 und 2 mit Preis, 4 und 5 mit 0; 3 bleibt offen
    assert.deepEqual(db.aenderungen.map(w => w.join(':')).sort(), ['1:1.63', '2:1.37', '4', '5', 'abrechnung:2:L1,L2', 'mail']);
});

test('Nichts belastet: keine Mail', async () => {
    const db = falscheDb([zeile(1, 'A')]);
    const vorgemerkt = [];
    const r = await P.spesenAbrechnen(db, {
        datum: '03.11.2026',
        briefLesen: async () => ({ status: 'awaiting_credits', preis: 1.63 }),
        senden: async (m) => vorgemerkt.push(m),
    });
    assert.deepEqual(r, { abgerechnet: 0, summe: 0, offen: 1 });
    assert.equal(vorgemerkt.length, 0);
    assert.equal(db.aenderungen.length, 0);
});

test('Ohne Kassier im Mitgliederverzeichnis: trotzdem ans Postfach', async () => {
    const db = falscheDb([zeile(1, 'A')], { kassier: null });
    const vorgemerkt = [];
    const r = await P.spesenAbrechnen(db, {
        datum: '03.11.2026',
        briefLesen: async () => ({ status: 'sent', preis: 1.63 }),
        senden: async (m) => vorgemerkt.push(m),
    });
    assert.equal(r.abgerechnet, 1);
    assert.equal(vorgemerkt[0].to, 'kassier@fwv-raura.ch');
    assert.match(vorgemerkt[0].text, /^Hallo Kassier/);
});

test('Ein Brief: Einzahl im Betreff', () => {
    const m = P.abrechnungBauen([{ name: 'A', betreff: 'X', kosten: 1.63 }],
        { kassier: { vorname: 'K' }, aktuar: null, datum: '04.11.2026' });
    assert.equal(m.subject, 'Spesenabrechnung Pingen 04.11.2026: 1 Brief, CHF 1.63');
    assert.match(m.text, /hat der Aktuar vorgestreckt/);
});

test('Uebersicht: Monate, abgerechnet (Nachtrag vor AB und taeglich), offen, wartend', () => {
    const briefe = [
        { id: 'a', erstellt: '2026-01-22T10:00:00+0100', status: 'sent', preis: 1.48 },
        { id: 'b', erstellt: '2026-01-22T10:01:00+0100', status: 'undeliverable', preis: 1.48 },
        { id: 'c', erstellt: '2026-01-23T10:00:00+0100', status: 'cancelled', preis: 0 },
        { id: 'd', erstellt: '2026-11-03T15:44:00+0100', status: 'sent', preis: 1.63 },
        { id: 'e', erstellt: '2026-11-04T09:00:00+0100', status: 'submitted', preis: 1.63 },
        { id: 'f', erstellt: '2026-11-04T09:01:00+0100', status: 'awaiting_credits', preis: 1.37 },
        { id: 'g', erstellt: '2025-01-10T09:00:00+0100', status: 'sent', preis: 1.5 },
    ];
    const abrechnungen = [
        { art: 'taeglich', titel: 'T', empfaenger: 'kassier@fwv-raura.ch', briefe: 1, summe: '1.63',
            letter_ids: ['d'], erstellt_am: '2026-11-03T17:00:00Z' },
        { art: 'nachtrag', titel: 'N', empfaenger: 'kassier@fwv-raura.ch', briefe: 89, summe: '146.06',
            letter_ids: [], erstellt_am: '2026-11-03T15:50:00Z' },
    ];
    const u = P.spesenUebersicht({ briefe, abrechnungen, jahr: '2026' });
    assert.deepEqual(u.monate, [
        { monat: '2026-01', briefe: 2, summe: 2.96, abgerechnet: 2.96, offen: 0 },
        { monat: '2026-11', briefe: 2, summe: 3.26, abgerechnet: 1.63, offen: 1.63 },
    ]);
    assert.deepEqual(u.total, { briefe: 4, summe: 6.22, abgerechnet: 4.59, offen: 1.63 });
    assert.deepEqual(u.wartet, { briefe: 1, summe: 1.37 });
    assert.equal(u.abrechnungen.length, 2);
    assert.equal(u.abrechnungen[0].summe, 1.63);
});
