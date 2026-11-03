// Pingen-Spesen (src/pingen-spesen.js): nur belastete Briefe mit Preis,
// eine Abrechnung an den Kassier, Wartende bleiben offen (Datenbank nachgebaut).
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/pingen-spesen');

function falscheDb(zeilen, { kassier = { vorname: 'Kurt', email: 'kassier@x.ch' } } = {}) {
    const aenderungen = [];
    return {
        aenderungen,
        async query(sql, werte) {
            if (sql.includes('FROM dispatch_log')) return { rows: zeilen };
            if (sql.includes("'%kassier%'")) return { rows: kassier ? [kassier] : [] };
            if (sql.includes("'%aktuar%'")) return { rows: [{ vorname: 'Stefan', nachname: 'Müller' }] };
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
        vormerken: async (_pool, m) => vorgemerkt.push(m),
    });
    assert.deepEqual(r, { abgerechnet: 2, summe: 3, offen: 1 });
    assert.equal(vorgemerkt.length, 1);
    const m = vorgemerkt[0];
    assert.equal(m.to, 'kassier@x.ch');
    assert.equal(m.subject, 'Pingen-Spesen 03.11.2026: 2 Briefe, CHF 3.00');
    assert.match(m.text, /Steve Aerni\s+CHF 1\.63/);
    assert.match(m.text, /Ursula Meyer\s+CHF 1\.37/);
    assert.match(m.text, /Total: CHF 3\.00/);
    assert.match(m.text, /Stefan Müller \(Aktuar\) vorgestreckt/);
    assert.doesNotMatch(m.text, /Tschudin/);
    // abgerechnet: 1 und 2 mit Preis, 4 und 5 mit 0; 3 bleibt offen
    assert.deepEqual(db.aenderungen.map(w => w.join(':')).sort(), ['1:1.63', '2:1.37', '4', '5']);
});

test('Nichts belastet: keine Mail', async () => {
    const db = falscheDb([zeile(1, 'A')]);
    const vorgemerkt = [];
    const r = await P.spesenAbrechnen(db, {
        datum: '03.11.2026',
        briefLesen: async () => ({ status: 'awaiting_credits', preis: 1.63 }),
        vormerken: async (_p, m) => vorgemerkt.push(m),
    });
    assert.deepEqual(r, { abgerechnet: 0, summe: 0, offen: 1 });
    assert.equal(vorgemerkt.length, 0);
    assert.equal(db.aenderungen.length, 0);
});

test('Ohne Kassier bleibt alles offen', async () => {
    const db = falscheDb([zeile(1, 'A')], { kassier: null });
    const r = await P.spesenAbrechnen(db, {
        datum: '03.11.2026',
        briefLesen: async () => ({ status: 'sent', preis: 1.63 }),
        vormerken: async () => { throw new Error('darf nicht'); },
    });
    assert.equal(r.abgerechnet, 0);
    assert.equal(db.aenderungen.length, 0);
});

test('Ein Brief: Einzahl im Betreff', () => {
    const m = P.abrechnungBauen([{ name: 'A', betreff: 'X', kosten: 1.63 }],
        { kassier: { vorname: 'K' }, aktuar: null, datum: '04.11.2026' });
    assert.equal(m.subject, 'Pingen-Spesen 04.11.2026: 1 Brief, CHF 1.63');
    assert.match(m.text, /hat der Aktuar vorgestreckt/);
});
