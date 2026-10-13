// Schopf-Musik auf den Handys der Schichtleute: Was im Roten Schopf laeuft,
// steht waehrend der Schicht als Benachrichtigung auf dem Handy - mit
// Pause/Abspielen und Weiter, auch bei geschlossener App (wie ein Android-TV
// im gleichen WLAN).
//
// Der Melder laeuft alle 10 s: Wer hat gerade Schicht (src/schicht-zugang.js)?
// Ohne Schichtleute fragt er den Laptop gar nicht erst. Sonst holt er den
// Zustand vom Kiosk-Dienst und schickt eine stille Push-Nachricht (nur
// `data`, die App zeichnet die Benachrichtigung selbst) - aber nur, wenn
// sich fuer diese Person etwas geaendert hat: anderer Titel, Pause, neu in
// der Schicht. Endet die Schicht oder ist der Laptop aus, kommt "weg".
//
// Die Knoepfe der Benachrichtigung brauchen keine Anmeldung der App: Jede
// Nachricht bringt eine Fernbedienungs-Freigabe mit, die nur Musikbefehle
// erlaubt und mit dem Zugang zur Schicht ablaeuft. So muss die App im
// Hintergrund kein Token erneuern (das wuerde die Sitzung im Vordergrund
// stoeren).
//
// Der Zustand (wem was gezeigt wird) liegt nur im Speicher. Nach einem
// Neustart geht an alle einmal "zeigen" - harmlos.

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

function fernSchluessel(geheimnis) {
    if (!geheimnis) throw new Error('JWT_SECRET fehlt');
    return crypto.createHmac('sha256', geheimnis).update('schopf-fernbedienung').digest();
}

function fernFreigabe(geheimnis, memberId, bis) {
    return jwt.sign({ zweck: 'schopf-musik', wer: String(memberId) },
        fernSchluessel(geheimnis), { expiresIn: Math.max(60, Math.round((bis - Date.now()) / 1000)) });
}

/** Mitglieds-Id der Freigabe, oder null. */
function fernFreigabePruefen(geheimnis, token) {
    if (!token || typeof token !== 'string') return null;
    try {
        const inhalt = jwt.verify(token, fernSchluessel(geheimnis));
        return inhalt?.zweck === 'schopf-musik' ? inhalt.wer : null;
    } catch {
        return null;
    }
}

/**
 * aktive():  [{ memberId, schicht: { bis: Date, ... } }]
 * zustand(): { ok, daten: { musik } } wie kioskFernbedienung().zustand()
 * senden(memberIds, data): stille Push-Nachricht an alle Geraete
 */
function schopfMelder({ aktive, zustand, senden, geheimnis, jetzt = () => new Date(), protokoll = console }) {
    const gezeigt = new Map(); // memberId -> Signatur
    let laeuft = false;

    async function takt() {
        if (laeuft) return;
        laeuft = true;
        try {
            const leute = await aktive(jetzt());
            let musik = null;
            if (leute.length) {
                const z = await zustand();
                const m = z.ok ? z.daten?.musik : null;
                if (m?.erreichbar && m.titel && m.titel !== '—') musik = m;
            }
            const jetztAktiv = new Set(leute.map(l => String(l.memberId)));

            for (const l of leute) {
                const id = String(l.memberId);
                if (!musik) {
                    if (gezeigt.has(id)) {
                        await senden([id], { art: 'weg' });
                        gezeigt.delete(id);
                    }
                    continue;
                }
                const signatur = [musik.titel, musik.interpret, musik.laeuft].join('|');
                if (gezeigt.get(id) === signatur) continue;
                await senden([id], {
                    art: 'zeigen',
                    titel: musik.titel,
                    interpret: musik.interpret || '',
                    laeuft: musik.laeuft ? '1' : '0',
                    bis: l.schicht.bis.toISOString(),
                    t: fernFreigabe(geheimnis, id, l.schicht.bis.getTime())
                });
                gezeigt.set(id, signatur);
            }
            for (const id of [...gezeigt.keys()]) {
                if (!jetztAktiv.has(id)) {
                    await senden([id], { art: 'weg' });
                    gezeigt.delete(id);
                }
            }
        } catch (error) {
            protokoll.error('Schopf-Melder:', error.message);
        } finally {
            laeuft = false;
        }
    }

    return {
        takt,
        /** Dieser Person den Stand gleich nochmals schicken (App geoeffnet). */
        nochmals(memberId) {
            gezeigt.delete(String(memberId));
            return takt();
        },
        get gezeigt() { return new Map(gezeigt); }
    };
}

module.exports = { schopfMelder, fernFreigabe, fernFreigabePruefen };
