// Musik im Roten Schopf fuer die Mitglieder-App: Hoeren auf dem Handy und
// den Laptop im Lokal fernbedienen.
//
// Hoeren: Der Player der App streamt Titel direkt (ExoPlayer/AVPlayer) und
// kann dabei keine Anmelde-Kopfzeile mitschicken. Er bekommt deshalb eine
// Hoer-Freigabe, die in der Adresse steht. Sie taugt NUR zum Hoeren:
// signiert mit einem eigenen, aus JWT_SECRET abgeleiteten Schluessel, damit
// sie nie als Anmeldung durchgeht, und nach 12 Stunden abgelaufen.
//
// Fernbedienung: Der Kiosk-Dienst auf dem T400 (roterschopf-kiosk,
// dienst/kiosk.py) nimmt auf Port 8081 Musikbefehle an - nur vom Server
// (10.10.0.1 ueber WireGuard) und nur mit KIOSK_KEY. Wer hier steuern darf,
// prueft die Route (Gruppe Roter Schopf, Vorstand, admin).
//
// Reine Bausteine ohne Express und ohne Datenbank, testbar mit einem
// nachgebauten Laptop (test/kiosk-musik.test.js).

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const HOER_DAUER_S = 12 * 3600;

function hoerSchluessel(geheimnis) {
    if (!geheimnis) throw new Error('JWT_SECRET fehlt');
    return crypto.createHmac('sha256', geheimnis).update('kiosk-hoeren').digest();
}

/** Freigabe zum Hoeren fuer ein Mitglied. */
function hoerFreigabe(geheimnis, wer, jetztMs = Date.now()) {
    const iat = Math.floor(jetztMs / 1000);
    const token = jwt.sign({ zweck: 'hoeren', wer: String(wer || ''), iat },
        hoerSchluessel(geheimnis), { expiresIn: HOER_DAUER_S });
    return { token, gueltig_bis: new Date((iat + HOER_DAUER_S) * 1000).toISOString() };
}

/** true, wenn das Token eine gueltige Hoer-Freigabe ist. */
function hoerFreigabeGueltig(geheimnis, token, jetztMs = Date.now()) {
    if (!token || typeof token !== 'string') return false;
    try {
        const inhalt = jwt.verify(token, hoerSchluessel(geheimnis), {
            clockTimestamp: Math.floor(jetztMs / 1000)
        });
        return inhalt?.zweck === 'hoeren';
    } catch {
        return false;
    }
}

const AKTIONEN = ['umschalten', 'weiter', 'zurueck', 'lautstaerke', 'playlist', 'radio'];

/** Prueft einen Befehl und gibt die Daten bereinigt zurueck - oder einen Fehlertext. */
function befehlPruefen(aktion, daten = {}) {
    if (!AKTIONEN.includes(aktion)) return { fehler: 'unbekannter Befehl' };
    if (aktion === 'lautstaerke') {
        const wert = Number(daten.wert);
        if (!Number.isFinite(wert)) return { fehler: 'wert (0-100) noetig' };
        return { daten: { wert: Math.max(0, Math.min(100, Math.round(wert))) } };
    }
    if (aktion === 'playlist') {
        const name = String(daten.name || '').trim();
        if (!name) return { fehler: 'name noetig' };
        return { daten: { name } };
    }
    if (aktion === 'radio') {
        const url = String(daten.url || '').trim();
        if (!/^https?:\/\//i.test(url)) return { fehler: 'url (http/https) noetig' };
        return { daten: { url } };
    }
    return { daten: {} };
}

function kioskFernbedienung({
    adresse = 'http://192.168.88.10:8081', schluessel, abrufen = globalThis.fetch,
    zeitlimitMs = 4000
} = {}) {
    async function rufen(pfad, daten) {
        if (!schluessel) return { ok: false, grund: 'Fernbedienung ist nicht eingerichtet' };
        let r;
        try {
            r = await abrufen(adresse + pfad, {
                method: daten ? 'POST' : 'GET',
                headers: { 'X-Kiosk-Key': schluessel, 'Content-Type': 'application/json' },
                body: daten ? JSON.stringify(daten) : undefined,
                signal: AbortSignal.timeout(zeitlimitMs)
            });
        } catch {
            return { ok: false, grund: 'Der Laptop im Roten Schopf antwortet nicht' };
        }
        if (!r.ok) return { ok: false, grund: `Der Laptop meldet Fehler ${r.status}` };
        return { ok: true, daten: await r.json() };
    }

    return {
        /** { musik, playlists: [Name], sender: [{name, url}] } */
        zustand: () => rufen('/musik'),
        async befehl(aktion, daten) {
            const g = befehlPruefen(aktion, daten);
            if (g.fehler) return { ok: false, grund: g.fehler, ungueltig: true };
            return rufen(`/musik/${aktion}`, g.daten);
        }
    };
}

// Wie viel Platz die Titel [pfade] brauchen - damit die Desktop-App vor dem
// Speichern sagen kann, was auf den Computer kommt. Nur Pfade innerhalb von
// [wurzel]; was fehlt oder ausserhalb liegt, zaehlt nicht.
async function dateienGroesse(wurzel, pfade) {
    const path = require('path');
    const fs = require('fs/promises');
    const basis = path.resolve(wurzel) + path.sep;
    let bytes = 0;
    let gefunden = 0;
    for (const pfad of pfade) {
        const ziel = path.resolve(wurzel, String(pfad));
        if (!ziel.startsWith(basis)) continue;
        try {
            const info = await fs.stat(ziel);
            if (!info.isFile()) continue;
            bytes += info.size;
            gefunden++;
        } catch {
            // Datei weg: zaehlt nicht.
        }
    }
    return { bytes, anzahl: pfade.length, gefunden };
}

module.exports = {
    hoerFreigabe, hoerFreigabeGueltig, befehlPruefen, kioskFernbedienung, dateienGroesse,
    AKTIONEN, HOER_DAUER_S
};
