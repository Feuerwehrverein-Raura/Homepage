// Roter Schopf: Licht und Tiefkuehler fuer die Mitglieder-App.
//
// Der Server erreicht das Vereinslokal ueber den WireGuard-Tunnel
// (192.168.88.0/24), so wie schon den Bondrucker und den Kiosk-Laptop.
//
// Licht: Die Lampen haengen nicht am Hausnetz, sondern am eigenen
// Zugangspunkt der Zentrale (Shelly Pro 3EM, 192.168.88.84). Erreichbar
// sind sie ueber deren Range Extender: jeder Klient unter einem eigenen
// Port auf der Hausnetz-Adresse. Die Ports vergibt die Zentrale selbst und
// kann sie beim Neuverbinden aendern, deshalb werden sie jedes Mal erfragt
// (WiFi.ListAPClients) statt notiert.
//
// Gruppen werden NICHT Lampe fuer Lampe geschaltet, sondern ueber den
// Endpunkt des Skripts "Lichtgruppen" auf der Zentrale - denselben Weg wie
// der Taster an der Wand und der Kiosk. So gibt es nur eine Stelle, die
// weiss, was zur Gruppe gehoert, und nur eine, die schaltet.
//
// Hauptmessung: Die Zentrale (Pro 3EM) misst den Strom des Lokals auf drei
// Phasen. Nur Anzeige.
//
// Tiefkuehler: je ein Shelly 1PM Gen4 im Hausnetz mit DS18B20 am Addon.
// Nur Anzeige. Die Grenze ist dieselbe wie im Skript "Tiefkuehl-Waechter"
// auf dem Geraet.
//
// Thermostate: Shelly BLU TRV am Heizkoerper, per Bluetooth am BLU Gateway.
// Das Gateway haengt seit 14.10.2026 im Hausnetz (WLAN FWV-Raura) und wird
// direkt gefragt (`adresse`, wie die Tiefkuehler); `geraet` waere der Weg
// ueber die Zentrale (Port-Durchgang, wie die Lampen). Nur Anzeige.
//
// Quelle der Zuordnungen: roterschopf-kiosk/zentrale/ (lichtgruppen.js,
// README.md). Aendert sich dort etwas, muss es hier nachgezogen werden.
//
// Reine Bausteine ohne Express und ohne Datenbank, damit sie sich gegen eine
// nachgebaute Zentrale testen lassen (test/roter-schopf.test.js).

/** Wer den Bereich sieht und schaltet. Vergleich ohne Gross/klein. */
const ROTER_SCHOPF_GRUPPEN = ['roter schopf', 'vorstand', 'admin'];

function hatRoterSchopfZugang(gruppen) {
    if (!Array.isArray(gruppen)) return false;
    return gruppen.some(g => typeof g === 'string' &&
        ROTER_SCHOPF_GRUPPEN.includes(g.trim().toLowerCase()));
}

const VORGABE = {
    zentrale: '192.168.88.84',
    skript: 4,
    gruppen: [
        {
            kennung: 'spots', name: 'Spots', schalter: 200,
            // Die Girlanden laufen mit den Spots: Am Taster ist das eine
            // Stimmung und kein zweiter Handgriff.
            lampen: ['192.168.33.12:0', '192.168.33.13:0', '192.168.33.4:1',
                '192.168.33.5:0', '192.168.33.5:1', '192.168.33.6:0',
                '192.168.33.7:0', '192.168.33.8:1']
        },
        {
            kennung: 'arbeitsleuchten', name: 'Arbeitsleuchten', schalter: 201,
            lampen: ['192.168.33.4:0', '192.168.33.6:1', '192.168.33.7:1',
                '192.168.33.8:0']
        }
    ],
    kuehlung: [
        { kennung: 'eis', name: 'Tiefkühlschrank Eis', adresse: '192.168.88.76', grenze: -12 },
        { kennung: 'landi', name: 'Tiefkühlschrank Landi', adresse: '192.168.88.71', grenze: -12 }
    ],
    thermostate: [
        { kennung: 'heizkoerper', name: 'Heizkörper', adresse: '192.168.88.68', id: 200 }
    ]
};

/** Wie lange ein gemessener Zustand fuer alle Aufrufer gilt (ms). */
const ZUSTAND_CACHE_MS = 10 * 1000;
/** Wie lange ein Befehl der Messung vorgeht (ms) - wie im Kiosk. */
const BEFEHL_GILT_MS = 15 * 1000;
/** Lampennamen aendern sich fast nie (ms). */
const NAMEN_CACHE_MS = 10 * 60 * 1000;

/**
 * Liefert { zustand(), schalteGruppe(kennung, an), schalteLampe(kennung, an) }.
 *
 * Der Zustand wird fuer [cacheMs] geteilt: Jede Abfrage schickt rund
 * fuenfzehn Anfragen durch den Range Extender der Zentrale - und durch
 * denselben Engpass gehen ihre Schaltbefehle. Oeffnen fuenf Leute die App,
 * soll das nicht fuenfmal passieren.
 */
function roterSchopf({
    einstellung = VORGABE, abrufen = globalThis.fetch, jetzt = Date.now,
    cacheMs = ZUSTAND_CACHE_MS, befehlGiltMs = BEFEHL_GILT_MS,
    zeitlimitMs = 4000, log = console
} = {}) {
    const zentrale = einstellung.zentrale;
    let zwischenstand = null;   // { daten, zeit }
    let laufend = null;         // Promise der gerade laufenden Messung
    const befehle = new Map();  // Lampen-Kennung -> { an, zeit }
    const namen = new Map();    // Lampen-Kennung -> { name, zeit }

    const alleLampen = [];
    for (const g of einstellung.gruppen) {
        for (const k of g.lampen) alleLampen.push({ kennung: k, gruppe: g.kennung });
    }

    async function holen(url) {
        try {
            const r = await abrufen(url, { signal: AbortSignal.timeout(zeitlimitMs) });
            if (!r.ok) return null;
            const roh = await r.text();
            // Boolean.Set & Co. antworten mit "null" - geantwortet ist
            // geantwortet, None gibt es nur, wenn das Geraet schweigt.
            if (!roh.trim()) return {};
            const daten = JSON.parse(roh);
            return daten === null ? {} : daten;
        } catch {
            return null;
        }
    }

    function rpc(host, methode, werte = {}) {
        const teile = Object.entries(werte).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
        return holen(`http://${host}/rpc/${methode}${teile.length ? '?' + teile.join('&') : ''}`);
    }

    async function ports() {
        const k = await rpc(zentrale, 'WiFi.ListAPClients');
        if (!k || !Array.isArray(k.ap_clients)) return null;
        const karte = new Map();
        for (const c of k.ap_clients) {
            if (c && c.ip && c.mport) karte.set(c.ip, c.mport);
        }
        return karte;
    }

    // Hoechstens zwei gleichzeitig: Der Range Extender laesst bei acht
    // parallelen Verbindungen die Haelfte fallen.
    async function nacheinander(eintraege, arbeit, gleichzeitig = 2) {
        const ergebnis = new Array(eintraege.length);
        let naechster = 0;
        async function arbeiter() {
            while (naechster < eintraege.length) {
                const i = naechster++;
                ergebnis[i] = await arbeit(eintraege[i]);
            }
        }
        await Promise.all(Array.from({ length: Math.min(gleichzeitig, eintraege.length) }, arbeiter));
        return ergebnis;
    }

    async function lampeMessen(lampe, karte) {
        const [ip, kanal] = lampe.kennung.split(':');
        const port = karte ? karte.get(ip) : null;
        const leer = { kennung: lampe.kennung, gruppe: lampe.gruppe, name: null,
            erreichbar: false, an: false, watt: null };
        if (!port) return leer;
        const host = `${zentrale}:${port}`;
        const st = await rpc(host, 'Switch.GetStatus', { id: kanal });
        if (!st) return leer;
        let name = namen.get(lampe.kennung);
        if (!name || jetzt() - name.zeit > NAMEN_CACHE_MS) {
            const cfg = await rpc(host, 'Switch.GetConfig', { id: kanal });
            name = { name: (cfg && cfg.name) || null, zeit: jetzt() };
            if (cfg) namen.set(lampe.kennung, name);
        }
        return {
            kennung: lampe.kennung, gruppe: lampe.gruppe,
            name: name.name || `Gerät .${ip.split('.').pop()} · Kanal ${Number(kanal) + 1}`,
            erreichbar: true, an: !!st.output,
            watt: typeof st.apower === 'number' ? Math.round(st.apower) : null
        };
    }

    async function kuehlerMessen(g) {
        const st = await rpc(g.adresse, 'Shelly.GetStatus');
        const sw = (st && st['switch:0']) || {};
        const temp = st && st['temperature:100'] ? st['temperature:100'].tC : null;
        const t = typeof temp === 'number' ? temp : null;
        return {
            // Fuer den Verlauf: GET /kiosk/roter-schopf/verlauf?messstelle=kuehler:<kennung>
            messstelle: `kuehler:${g.kennung}`,
            name: g.name,
            erreichbar: !!st,
            temperatur: t,
            grenze: g.grenze,
            // Zu warm heisst auch: Fuehler liefert nichts. Das Skript auf dem
            // Geraet schaltet dann schon ein - aber jemand soll nachsehen.
            zu_warm: !!st && (t === null || t > g.grenze),
            strom_an: st ? !!sw.output : null,
            watt: st && typeof sw.apower === 'number' ? Math.round(sw.apower) : null
        };
    }

    // Hauptmessung: der Pro 3EM ist zugleich der Stromzaehler des Lokals
    // (drei Phasen). Leistung jetzt und Zaehlerstand, nur Anzeige.
    async function hauptmessungMessen() {
        const em = await rpc(zentrale, 'EM.GetStatus', { id: 0 });
        const daten = em ? await rpc(zentrale, 'EMData.GetStatus', { id: 0 }) : null;
        const zahl = (v, stellen = 0) => (typeof v === 'number' ? Number(v.toFixed(stellen)) : null);
        if (!em) return { messstelle: 'hauptmessung', erreichbar: false, leistung_w: null, phasen: [], zaehler_kwh: null };
        const kwh = v => (daten && typeof daten[v] === 'number' ? zahl(daten[v] / 1000, 2) : null);
        return {
            messstelle: 'hauptmessung',
            erreichbar: true,
            leistung_w: zahl(em.total_act_power),
            scheinleistung_va: zahl(em.total_aprt_power),
            strom_a: zahl(em.total_current, 2),
            phasen: ['a', 'b', 'c'].map((p, i) => ({
                name: `L${i + 1}`,
                spannung_v: zahl(em[`${p}_voltage`], 1),
                strom_a: zahl(em[`${p}_current`], 2),
                leistung_w: zahl(em[`${p}_act_power`]),
                scheinleistung_va: zahl(em[`${p}_aprt_power`]),
                leistungsfaktor: zahl(em[`${p}_pf`], 2),
                frequenz_hz: zahl(em[`${p}_freq`], 1),
                zaehler_kwh: kwh(`${p}_total_act_energy`),
                rueckspeisung_kwh: kwh(`${p}_total_act_ret_energy`)
            })),
            zaehler_kwh: kwh('total_act'),
            rueckspeisung_kwh: kwh('total_act_ret')
        };
    }

    async function thermostatMessen(t, karte) {
        let ziel = t.adresse || null;
        if (!ziel && karte && karte.get(t.geraet)) ziel = `${zentrale}:${karte.get(t.geraet)}`;
        const st = ziel ? await rpc(ziel, 'BluTrv.GetStatus', { id: t.id }) : null;
        const zahl = v => (typeof v === 'number' ? v : null);
        return {
            messstelle: `heizung:${t.kennung}`,
            name: t.name,
            // Gateway antwortet UND das Thermostat ist per Bluetooth verbunden.
            erreichbar: !!st && st.connected !== false,
            temperatur: st ? zahl(st.current_C) : null,
            soll: st ? zahl(st.target_C) : null,
            ventil: st ? zahl(st.pos) : null,
            batterie: st ? zahl(st.battery) : null,
            fehler: st && Array.isArray(st.errors) ? st.errors.map(String) : []
        };
    }

    async function messen() {
        const karte = await ports();
        const lampen = karte
            ? await nacheinander(alleLampen, l => lampeMessen(l, karte))
            : alleLampen.map(l => ({ kennung: l.kennung, gruppe: l.gruppe, name: null,
                erreichbar: false, an: false, watt: null }));
        const kuehlung = await Promise.all(einstellung.kuehlung.map(kuehlerMessen));
        const thermostate = [];
        for (const t of einstellung.thermostate || []) thermostate.push(await thermostatMessen(t, karte));
        const hauptmessung = await hauptmessungMessen();
        return { zentrale: !!karte, lampen, kuehlung, thermostate, hauptmessung, zeit: jetzt() };
    }

    function befehleAnwenden(lampen) {
        const t = jetzt();
        return lampen.map(l => {
            const b = befehle.get(l.kennung);
            return b && t - b.zeit < befehlGiltMs && l.erreichbar ? { ...l, an: b.an } : { ...l };
        });
    }

    function aufbereiten(messung) {
        const lampen = befehleAnwenden(messung.lampen);
        const gruppen = einstellung.gruppen.map(g => {
            const teile = lampen.filter(l => l.gruppe === g.kennung);
            const anzahlAn = teile.filter(l => l.an).length;
            return {
                kennung: g.kennung,
                name: g.name,
                anzahl: teile.length,
                anzahl_an: anzahlAn,
                // Der Zustand kommt aus den Lampen, nicht aus dem Schalter der
                // Zentrale: Der ist ein Wunsch, die Lampen sind die Wahrheit.
                an: teile.length > 0 && anzahlAn === teile.length,
                teilweise: anzahlAn > 0 && anzahlAn < teile.length,
                erreichbar: teile.some(l => l.erreichbar)
            };
        });
        return {
            stand: new Date(messung.zeit).toISOString(),
            zentrale: messung.zentrale,
            gruppen,
            lampen: lampen.map(({ kennung, gruppe, name, erreichbar, an, watt }) =>
                ({ kennung, gruppe, name, erreichbar, an, watt })),
            kuehlung: messung.kuehlung,
            thermostate: messung.thermostate,
            hauptmessung: messung.hauptmessung
        };
    }

    async function zustand() {
        if (!zwischenstand || jetzt() - zwischenstand.zeit >= cacheMs) {
            if (!laufend) {
                laufend = messen()
                    .then(m => { zwischenstand = { daten: m, zeit: m.zeit }; return m; })
                    .finally(() => { laufend = null; });
            }
            await laufend;
        }
        return aufbereiten(zwischenstand.daten);
    }

    function vormerken(kennungen, an) {
        const t = jetzt();
        for (const k of kennungen) befehle.set(k, { an: !!an, zeit: t });
    }

    async function schalteGruppe(kennung, an) {
        const g = einstellung.gruppen.find(x => x.kennung === kennung);
        if (!g) return { ok: false, grund: 'unbekannte Gruppe' };
        const antwort = await holen(`http://${zentrale}/script/${einstellung.skript}/gruppe?id=${g.schalter}&an=${an ? 'true' : 'false'}`);
        if (antwort === null) {
            log.warn(`Roter Schopf: Gruppe ${kennung} nicht geschaltet - Zentrale antwortet nicht`);
            return { ok: false, grund: 'Zentrale nicht erreichbar' };
        }
        vormerken(g.lampen, an);
        return { ok: true };
    }

    async function schalteLampe(kennung, an) {
        // Nur Lampen aus der Einstellung: Die Kennung kommt aus der App, und
        // dieser Dienst soll nicht das Werkzeug sein, mit dem sich beliebige
        // Adressen im Vereinslokal ansprechen lassen.
        const lampe = alleLampen.find(l => l.kennung === kennung);
        if (!lampe) return { ok: false, grund: 'unbekannte Lampe' };
        const karte = await ports();
        const [ip, kanal] = kennung.split(':');
        const port = karte ? karte.get(ip) : null;
        if (!port) return { ok: false, grund: 'Lampe nicht erreichbar' };
        const antwort = await rpc(`${zentrale}:${port}`, 'Switch.Set', { id: kanal, on: an ? 'true' : 'false' });
        if (antwort === null) return { ok: false, grund: 'Lampe antwortet nicht' };
        vormerken([kennung], an);
        return { ok: true };
    }

    return { zustand, schalteGruppe, schalteLampe };
}

module.exports = { roterSchopf, hatRoterSchopfZugang, ROTER_SCHOPF_GRUPPEN, VORGABE };
