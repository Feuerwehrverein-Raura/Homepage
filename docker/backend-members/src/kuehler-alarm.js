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
// vorbei, eine Entwarnung. Ist jemand vor Ort, ruht die Erinnerung 12 h. 0 W bei eingeschaltetem Relais ist KEIN Fall:
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
// "Ich gehe schauen" aendert nichts an den 4 h (die Erinnerung nennt nur
// den Namen). Erst wer "Ich bin vor Ort" bestaetigt, verschiebt die naechste
// Erinnerung auf 12 h danach (Stefan, 02.11.2026).
const VOR_ORT_MS = 12 * 60 * MINUTE;

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
 * [vorOrt]: Schluessel -> Zeit (ms), seit der jemand vor Ort bestaetigt hat.
 * [gemeldet]: Faelle, die vor einem Neustart schon gemeldet wurden
 * (Schluessel -> Zeit), damit nach dem Neustart nicht nochmals eine SMS kommt.
 */
function kuehlerAlarm({ jetzt = Date.now, gemeldet = new Map() } = {}) {
    const stand = new Map(); // schluessel -> { seit, gemeldet: Zeit|null, fall }
    for (const [schluessel, zeit] of gemeldet) {
        stand.set(schluessel, { seit: zeit, gemeldet: zeit, fall: null });
    }

    function pruefen(kuehlung, vorOrt = new Map()) {
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
            } else if (t - s.gemeldet >= ERINNERUNG_MS
                       && !(t - (vorOrt.get(schluessel) ?? -Infinity) < VOR_ORT_MS)) {
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

// Sticker am Geraet: "Ich bin vor Ort" nur mit dem gescannten Code des
// betroffenen Tiefkuehlers - so schummelt niemand vom Sofa aus. Der Code ist
// ein HMAC der Messstelle mit dem Geheimnis aus kiosk_alarm_einstellung.
const STICKER_PRAEFIX = 'fwv-vor-ort:';

function stickerCode(geheimnis, messstelle) {
    return require('crypto').createHmac('sha256', geheimnis).update(messstelle).digest('hex').slice(0, 20);
}

/** Inhalt des QR-Codes: "fwv-vor-ort:kuehler:eis:<code>". */
function stickerInhalt(geheimnis, messstelle) {
    return `${STICKER_PRAEFIX}${messstelle}:${stickerCode(geheimnis, messstelle)}`;
}

/** Messstelle eines gescannten Stickers, oder null, wenn er nicht echt ist. */
function stickerPruefen(geheimnis, inhalt) {
    const m = /^fwv-vor-ort:(.+):([0-9a-f]{20})$/.exec(String(inhalt || '').trim());
    if (!m || !geheimnis) return null;
    const soll = Buffer.from(stickerCode(geheimnis, m[1]));
    const ist = Buffer.from(m[2]);
    return soll.length === ist.length && require('crypto').timingSafeEqual(soll, ist) ? m[1] : null;
}

/** Gehoert der Fall zu diesem Geraet? "Schopf nicht erreichbar" passt zu jedem. */
function stickerPasst(messstelle, schluessel) {
    return schluessel === 'schopf:weg' || String(schluessel).startsWith(`${messstelle}:`);
}

/** "Hans Muster geht schauen (...)" bzw. "... ist vor Ort (...)" - an alle anderen. */
function schauenText(name, falltext, vorOrt = false) {
    return `FWV Schopf: ${name || 'Jemand'} ${vorOrt ? 'ist vor Ort' : 'geht schauen'}${falltext ? ` (${falltext.replace(/^FWV Schopf[^:]*: /, '')})` : ''}`;
}

/** Erinnerung mit dem, der nachschaut: "... - Hans Muster schaut nach (seit 14:05)". */
function mitSchauer(text, schauer) {
    if (!schauer) return text;
    const zeit = new Date(schauer.zeit).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' });
    return `${text} - ${schauer.name} ${schauer.vor_ort ? 'war vor Ort' : 'schaut nach'} (seit ${zeit})`;
}

/** Titel des App-Pushs zur Meldung (der Text ist derselbe wie in der SMS). */
function pushTitel(art) {
    if (art === 'entwarnung') return 'Tiefkühler: Entwarnung';
    if (art === 'erinnerung') return 'Tiefkühler-Alarm (Erinnerung)';
    return 'Tiefkühler-Alarm';
}

module.exports = {
    VOR_ORT_MS, pushTitel, stickerInhalt, stickerPruefen, stickerPasst, schauenText, mitSchauer,
    faelle, kuehlerAlarm, smsNummer, alarmBenutzer, alarmEmpfaenger,
    SCHWELLE_MS, ERINNERUNG_MS, ALARM_GRUPPEN,
};
