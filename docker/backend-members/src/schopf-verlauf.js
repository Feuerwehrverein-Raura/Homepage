// Verlauf der Messstellen im Roten Schopf fuer die Diagramme in der App:
// Tiefkuehler (Temperatur, Watt, Relais), Heizkoerper (Ist, Soll, Ventil)
// und der Hauptanschluss (alle Messwerte des Pro 3EM, gesamt und je Phase,
// dazu Verbrauch je Abschnitt aus den Zaehlerstaenden).
//
// Alle 5 min ein Durchgang ueber roterSchopf().zustand() - denselben,
// zwischengespeicherten Zustand, den auch die App sieht. So kommt keine
// zusaetzliche Last auf den Range Extender der Zentrale.
//
// Ist ein Geraet nicht erreichbar, wird eine Zeile ohne Wert gespeichert -
// eine Luecke, keine erfundene Null. Faellt der Server selbst aus, fehlen
// die Zeilen ganz; die App erkennt beides am Abstand (raster_s).
//
// Aufbewahrung: 90 Tage alle 5 min, danach ein Wert pro Stunde (der aus
// den ersten 5 min der Stunde). Reicht fuer "1 Jahr" mit Tagesmitteln.
//
// Reine Bausteine mit uebergebenem pool, testbar ohne Datenbank
// (test/schopf-verlauf.test.js).

const TAKT_MS = 5 * 60 * 1000;
const AUFRAEUMEN_MS = 24 * 60 * 60 * 1000;
const VOLL_TAGE = 90;

/** Zeitraum -> wie weit zurueck und in welchem Raster zusammengefasst. */
const ZEITRAEUME = {
    '24h': { dauer: '24 hours', raster: '5 minutes', raster_s: 300 },
    '7d': { dauer: '7 days', raster: '30 minutes', raster_s: 1800 },
    '30d': { dauer: '30 days', raster: '2 hours', raster_s: 7200 },
    '1j': { dauer: '365 days', raster: '1 day', raster_s: 86400 }
};

const zahl = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const janein = v => (typeof v === 'boolean' ? (v ? 1 : 0) : null);

/** Zustand von roterSchopf().zustand() -> [{ messstelle, groesse, wert }]. */
function messwerte(zustand) {
    const zeilen = [];
    const add = (messstelle, erreichbar, werte) => {
        for (const [groesse, wert] of Object.entries(werte)) {
            zeilen.push({ messstelle, groesse, wert: erreichbar ? wert : null });
        }
    };
    for (const k of zustand.kuehlung || []) {
        if (!k.messstelle) continue;
        add(k.messstelle, k.erreichbar, {
            temperatur: zahl(k.temperatur), watt: zahl(k.watt), an: janein(k.strom_an)
        });
    }
    for (const t of zustand.thermostate || []) {
        if (!t.messstelle) continue;
        add(t.messstelle, t.erreichbar, {
            temperatur: zahl(t.temperatur), soll: zahl(t.soll), ventil: zahl(t.ventil)
        });
    }
    // Hauptanschluss: alles, was der Pro 3EM misst - gesamt und je Phase
    // (l1_spannung_v, l2_leistungsfaktor, ...). Zaehlerstaende in kWh; den
    // Verbrauch je Zeitabschnitt rechnet verlauf() daraus.
    const h = zustand.hauptmessung;
    if (h && h.messstelle) {
        const werte = {
            leistung_w: zahl(h.leistung_w), scheinleistung_va: zahl(h.scheinleistung_va),
            strom_a: zahl(h.strom_a), zaehler_kwh: zahl(h.zaehler_kwh),
            rueckspeisung_kwh: zahl(h.rueckspeisung_kwh)
        };
        (h.phasen || []).forEach((p, i) => {
            for (const g of PHASEN_GROESSEN) werte[`l${i + 1}_${g}`] = zahl(p[g]);
        });
        add(h.messstelle, h.erreichbar, werte);
    }
    return zeilen;
}

const MESSSTELLE = /^[a-z]+(:[a-z0-9]+)?$/;
const PHASEN_GROESSEN = ['spannung_v', 'strom_a', 'leistung_w', 'scheinleistung_va',
    'leistungsfaktor', 'frequenz_hz', 'zaehler_kwh', 'rueckspeisung_kwh'];

function schopfVerlauf({ pool, zustand, grenzen = {}, jetzt = Date.now, log = console }) {
    async function tabelleAnlegen() {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS schopf_messwerte (
                zeit TIMESTAMPTZ NOT NULL,
                messstelle TEXT NOT NULL,
                groesse TEXT NOT NULL,
                wert DOUBLE PRECISION,
                PRIMARY KEY (messstelle, groesse, zeit)
            )
        `);
    }

    async function aufzeichnen() {
        const z = await zustand();
        const zeilen = messwerte(z);
        if (!zeilen.length) return 0;
        const zeit = new Date(jetzt()).toISOString();
        const werte = [];
        const platz = zeilen.map((r, i) => {
            werte.push(r.messstelle, r.groesse, r.wert);
            return `($1, $${i * 3 + 2}, $${i * 3 + 3}, $${i * 3 + 4})`;
        });
        await pool.query(
            `INSERT INTO schopf_messwerte (zeit, messstelle, groesse, wert) VALUES ${platz.join(', ')}
             ON CONFLICT DO NOTHING`,
            [zeit, ...werte]
        );
        return zeilen.length;
    }

    async function aufraeumen() {
        const r = await pool.query(
            `DELETE FROM schopf_messwerte
             WHERE zeit < NOW() - make_interval(days => $1) AND EXTRACT(MINUTE FROM zeit) >= 5`,
            [VOLL_TAGE]
        );
        return r.rowCount || 0;
    }

    /**
     * { messstelle, zeitraum, raster_s, von, bis, grenze, reihen: { groesse: [{ t, mittel, min, max }] } }
     * oder null bei unbekanntem Zeitraum / unzulaessiger Messstelle.
     * Ein Eintrag ohne Wert (mittel null) ist eine Luecke.
     */
    async function verlauf(messstelle, zeitraum) {
        const z = ZEITRAEUME[zeitraum];
        if (!z || typeof messstelle !== 'string' || !MESSSTELLE.test(messstelle)) return null;
        const bis = new Date(jetzt());
        const r = await pool.query(
            `SELECT date_bin($2::interval, zeit, TIMESTAMPTZ '2026-01-01 00:00:00+00') AS t,
                    groesse, AVG(wert) AS mittel, MIN(wert) AS min, MAX(wert) AS max
             FROM schopf_messwerte
             WHERE messstelle = $1 AND zeit > $3::timestamptz - $4::interval AND zeit <= $3::timestamptz
             GROUP BY 1, 2 ORDER BY 1`,
            [messstelle, z.raster, bis.toISOString(), z.dauer]
        );
        const reihen = {};
        const runden = v => (v === null || v === undefined ? null : Math.round(Number(v) * 100) / 100);
        for (const z2 of r.rows) {
            (reihen[z2.groesse] ||= []).push({
                t: new Date(z2.t).toISOString(),
                mittel: runden(z2.mittel), min: runden(z2.min), max: runden(z2.max)
            });
        }
        // Verbrauch je Abschnitt aus den Zaehlerstaenden: Stand am Ende des
        // Abschnitts minus Stand am Ende des vorigen. Ueber eine Luecke
        // hinweg landet der ganze Verbrauch im ersten Abschnitt danach.
        for (const g of Object.keys(reihen)) {
            if (!g.endsWith('zaehler_kwh')) continue;
            const verbrauch = [];
            let vorher = null;
            for (const p of reihen[g]) {
                const wert = p.max !== null && vorher !== null ? Math.max(0, runden(p.max - vorher)) : null;
                verbrauch.push({ t: p.t, mittel: wert, min: wert, max: wert });
                if (p.max !== null) vorher = p.max;
            }
            reihen[g.replace('zaehler_kwh', 'verbrauch_kwh')] = verbrauch;
        }
        const von = new Date(bis.getTime() - ZEITRAEUME_MS[zeitraum]);
        return {
            messstelle, zeitraum, raster_s: z.raster_s,
            von: von.toISOString(), bis: bis.toISOString(),
            grenze: grenzen[messstelle] ?? null,
            reihen
        };
    }

    function starten() {
        const sicher = (name, f) => () => f().catch(e => log.error(`Schopf-Verlauf ${name}:`, e.message));
        tabelleAnlegen()
            .then(() => {
                setTimeout(sicher('aufzeichnen', aufzeichnen), 30e3).unref();
                setInterval(sicher('aufzeichnen', aufzeichnen), TAKT_MS).unref();
                setInterval(sicher('aufraeumen', aufraeumen), AUFRAEUMEN_MS).unref();
            })
            .catch(e => log.error('Schopf-Verlauf: Tabelle nicht angelegt:', e.message));
    }

    return { tabelleAnlegen, aufzeichnen, aufraeumen, verlauf, starten };
}

const ZEITRAEUME_MS = { '24h': 864e5, '7d': 7 * 864e5, '30d': 30 * 864e5, '1j': 365 * 864e5 };

/** Grenzen der Tiefkuehler aus der Einstellung von roter-schopf.js. */
function grenzenAus(einstellung) {
    const g = {};
    for (const k of einstellung.kuehlung || []) {
        if (k.kennung && typeof k.grenze === 'number') g[`kuehler:${k.kennung}`] = k.grenze;
    }
    return g;
}

module.exports = { schopfVerlauf, messwerte, grenzenAus, ZEITRAEUME };
