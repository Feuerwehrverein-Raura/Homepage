// Tiefkuehler im Roten Schopf: SMS an Vorstand und Gruppe Roter Schopf,
// wenn es kritisch wird.
//
// Der Waechter prueft jede Minute den Zustand, den api-members ohnehin fuer
// die App misst (roter-schopf.js, "kuehlung"). Ein Fall gilt erst als
// kritisch, wenn er eine Weile anhaelt - ein kurzer Aussetzer des Tunnels
// oder ein abgetautes Fach beim Einraeumen soll niemanden wecken:
//
//   warm     waermer als die Grenze (-12 C)         15 min
//   aus      Relais aus (Strom des Geraets aus)      10 min
//   fuehler  Fuehler liefert nichts                  15 min
//   weg      Geraet nicht erreichbar                 30 min
//            (alle weg: EINE SMS "Schopf nicht erreichbar")
//
// Je Fall eine SMS; haelt er an, alle 4 Stunden eine Erinnerung; ist er
// vorbei, eine Entwarnung. 0 W bei eingeschaltetem Relais ist KEIN Fall:
// Der Kompressor taktet.
//
// Verschickt wird nicht von hier: Die SMS kommen in eine Warteschlange, die
// der SMS-Gateway im PJC (pjc-docker/sms-gateway) jede Minute abholt - der
// PJC ist von aussen nicht erreichbar und soll es auch nicht sein.
//
// Reine Bausteine ohne Datenbank und Express (test/kuehler-alarm.test.js).

const MINUTE = 60 * 1000;
const SCHWELLE_MS = { warm: 15 * MINUTE, aus: 10 * MINUTE, fuehler: 15 * MINUTE, weg: 30 * MINUTE };
const ERINNERUNG_MS = 4 * 60 * MINUTE;

function zahl(t) {
    return typeof t === 'number' ? `${Math.round(t * 10) / 10}`.replace('.', ',') : '?';
}

/** Offene Faelle im Zustand: Schluessel -> Text fuer die SMS. */
function faelle(kuehlung) {
    const liste = Array.isArray(kuehlung) ? kuehlung : [];
    const offen = new Map();
    if (liste.length && liste.every(k => !k.erreichbar)) {
        offen.set('schopf:weg', {
            art: 'weg', name: 'Tiefkuehler im Roten Schopf',
            text: 'Tiefkuehler im Roten Schopf nicht erreichbar (Strom oder Internet im Lokal weg?)',
        });
        return offen;
    }
    for (const k of liste) {
        const name = k.name || k.messstelle;
        if (!k.erreichbar) {
            offen.set(`${k.messstelle}:weg`, { art: 'weg', name, text: `${name} nicht erreichbar - Strom an der Steckdose?` });
            continue;
        }
        if (k.strom_an === false) {
            offen.set(`${k.messstelle}:aus`, { art: 'aus', name, text: `${name} ist ausgeschaltet (Relais aus)` });
        }
        if (k.temperatur === null || k.temperatur === undefined) {
            offen.set(`${k.messstelle}:fuehler`, { art: 'fuehler', name, text: `${name}: Temperaturfuehler meldet nichts` });
        } else if (typeof k.grenze === 'number' && k.temperatur > k.grenze) {
            offen.set(`${k.messstelle}:warm`, {
                art: 'warm', name, text: `${name} zu warm: ${zahl(k.temperatur)} C (Grenze ${zahl(k.grenze)} C)`,
            });
        }
    }
    return offen;
}

function dauer(ms) {
    const min = Math.round(ms / MINUTE);
    return min < 90 ? `${min} min` : `${Math.round(min / 60)} h`;
}

/**
 * Der Waechter. pruefen(kuehlung) gibt die Meldungen zurueck, die jetzt
 * hinausgehen sollen: [{ art: 'alarm'|'erinnerung'|'entwarnung', schluessel, text }].
 * [gemeldet]: Faelle, die vor einem Neustart schon gemeldet wurden
 * (Schluessel -> Zeit), damit nach dem Neustart nicht nochmals eine SMS kommt.
 */
function kuehlerAlarm({ jetzt = Date.now, gemeldet = new Map() } = {}) {
    const stand = new Map(); // schluessel -> { seit, gemeldet: Zeit|null, fall }
    for (const [schluessel, zeit] of gemeldet) {
        stand.set(schluessel, { seit: zeit, gemeldet: zeit, fall: null });
    }

    function pruefen(kuehlung) {
        const t = jetzt();
        const offen = faelle(kuehlung);
        const meldungen = [];
        for (const [schluessel, fall] of offen) {
            const s = stand.get(schluessel) || { seit: t, gemeldet: null };
            s.fall = fall;
            stand.set(schluessel, s);
            if (s.gemeldet === null) {
                if (t - s.seit >= SCHWELLE_MS[fall.art]) {
                    s.gemeldet = t;
                    meldungen.push({ art: 'alarm', schluessel, text: `FWV Schopf: ${fall.text}, seit ${dauer(t - s.seit)}` });
                }
            } else if (t - s.gemeldet >= ERINNERUNG_MS) {
                s.gemeldet = t;
                meldungen.push({ art: 'erinnerung', schluessel, text: `FWV Schopf, noch immer: ${fall.text} (seit ${dauer(t - s.seit)})` });
            }
        }
        for (const [schluessel, s] of stand) {
            if (offen.has(schluessel)) continue;
            stand.delete(schluessel);
            if (s.gemeldet !== null) {
                // Nach einem Neustart kennt der Waechter nur den Schluessel.
                const name = s.fall?.name || 'Tiefkuehler';
                const wie = (s.fall?.art || schluessel.split(':').pop()) === 'weg' ? 'wieder erreichbar' : 'wieder in Ordnung';
                meldungen.push({ art: 'entwarnung', schluessel, text: `FWV Schopf: ${name} ${wie}` });
            }
        }
        return meldungen;
    }

    return { pruefen, offen: () => new Map(stand) };
}

/**
 * Mobilnummer fuer den SMS-Gateway: +41791234567. Schweizer Schreibweisen
 * (079 123 45 67, 0041 79 ..., +41 (0)79 ...) werden umgeschrieben; null,
 * wenn es keine Mobilnummer ist.
 */
function smsNummer(roh) {
    let n = String(roh || '').replace(/\(0\)/g, '').replace(/[\s.\-/()]/g, '');
    if (n.startsWith('00')) n = '+' + n.slice(2);
    else if (n.startsWith('0')) n = '+41' + n.slice(1);
    if (!/^\+\d{9,15}$/.test(n)) return null;
    // Schweizer Festnetz bekommt keine SMS: Mobil sind 075-079.
    if (n.startsWith('+41') && !/^\+417[5-9]/.test(n)) return null;
    return n;
}

/** Empfaenger: Gruppen Vorstand und Roter Schopf, jede Nummer einmal. */
const ALARM_GRUPPEN = ['vorstand', 'roter schopf'];

function alarmBenutzer(gruppen) {
    const pks = new Set();
    for (const g of gruppen || []) {
        if (ALARM_GRUPPEN.includes(String(g.name || '').trim().toLowerCase())) {
            for (const b of g.benutzer || []) pks.add(Number(b));
        }
    }
    return [...pks];
}

function alarmEmpfaenger(mitglieder) {
    const nummern = new Map();
    for (const m of mitglieder || []) {
        if (m.status === 'Ausgetreten') continue;
        const n = smsNummer(m.mobile) || smsNummer(m.telefon);
        if (n && !nummern.has(n)) nummern.set(n, `${m.vorname || ''} ${m.nachname || ''}`.trim());
    }
    return [...nummern].map(([nummer, name]) => ({ nummer, name }));
}

module.exports = {
    faelle, kuehlerAlarm, smsNummer, alarmBenutzer, alarmEmpfaenger,
    SCHWELLE_MS, ERINNERUNG_MS, ALARM_GRUPPEN,
};
