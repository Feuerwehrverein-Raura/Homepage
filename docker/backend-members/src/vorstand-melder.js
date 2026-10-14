// Push-Mitteilungen an den Vorstand bei Dingen, die er bearbeiten muss.
//
// Ersetzt den AuditNotificationWorker der alten vorstand-android-App, der
// alle 15 Minuten GET /audit abfragte. Jetzt meldet das Backend selbst, im
// Moment, in dem es passiert:
//
//   antrag     neuer Mitgliedschaftsantrag (api-dispatch, nach Bestaetigung
//              der E-Mail-Adresse)           -> Bereich "Antraege"
//   austritt   Mitglied beantragt den Austritt (members/me/austritt)
//                                             -> Bereich "Mitglieder"
//   loeschung  Vorstand stoesst eine Loeschung an (4-Augen: Aktuar und
//              Kassier bestaetigen per Link)  -> Bereich "Mitglieder"
//   anmeldung  neue Anmeldung zu einem Anlass (api-events, Status
//              "pending", wartet auf Bestaetigung) -> Bereich "Anlaesse"
//
// Wer zum Vorstand gehoert, steht in der Funktion des Mitglieds
// (members.funktion). Aus genau dieser Funktion setzt das Backend auch die
// Authentik-Gruppen Vorstand und admin (syncMemberAuthentikGroups,
// FUNCTION_TO_GROUPS) - die Funktion ist also die Quelle, die Gruppen sind
// davon abgeleitet. Sie liegt in der eigenen Datenbank: kein Abruf bei
// Authentik pro Meldung, und sie stimmt auch, wenn Authentik gerade nicht
// erreichbar ist. Von Hand in Authentik gesetzte Gruppen (ohne Funktion)
// zaehlen nicht - der naechste Abgleich wuerde sie ohnehin entfernen.
//
// Regeln:
//  - Wer die Meldung ausgeloest hat, bekommt sie nicht (z.B. der Vorstand,
//    der selbst eine Loeschung anstoesst, oder selbst austritt).
//  - Wer "Vorstand-Mitteilungen" abgeschaltet hat (notification_preferences,
//    Art vorstand_mitteilungen), bekommt keine.
//  - Dieselbe Sache (Art + Kennung) nur einmal je Sperrfrist. Anmeldungen
//    zum selben Anlass werden gebuendelt: die erste sofort, alle weiteren in
//    der Sperrfrist am Ende als eine Mitteilung ("3 weitere Anmeldungen").
//  - Nie die eigentliche Anfrage aufhalten: [melden] wirft nie, Fehler
//    landen im Log.
//
// Reine Bausteine ohne Express, Datenbank und Firebase, damit sie sich
// testen lassen (test/vorstand-melder.test.js).

/** Abschalter in den Benachrichtigungs-Einstellungen der App. */
const ABSCHALT_ART = 'vorstand_mitteilungen';

/** Android-Kanal in der App (flutter/mitglieder/lib/push/push_dienst.dart). */
const ANDROID_KANAL = 'fwv_vorstand';

/**
 * Funktionen, die in die Authentik-Gruppe Vorstand oder admin fuehren -
 * dieselben Teilwoerter wie FUNCTION_TO_GROUPS in src/index.js.
 */
const VORSTAND_FUNKTIONEN = [
    'präsident', 'praesident', 'aktuar', 'kassier', 'materialwart', 'beisitzer', 'vorstand', 'admin'
];

const ARTEN = {
    antrag: { notificationType: 'vorstand_antrag', bereich: 'antraege' },
    austritt: { notificationType: 'vorstand_austritt', bereich: 'mitglieder' },
    loeschung: { notificationType: 'vorstand_loeschung', bereich: 'mitglieder' },
    anmeldung: { notificationType: 'vorstand_anmeldung', bereich: 'anlaesse', buendeln: true }
};

/** Gehoert eine Person mit dieser Funktion zum Vorstand (oder ist admin)? */
function istVorstandFunktion(funktion) {
    if (typeof funktion !== 'string') return false;
    // Wie syncMemberAuthentikGroups: Komma-Liste, Teilwort, ohne Gross/klein.
    return funktion.split(',')
        .map(f => f.trim().toLowerCase())
        .filter(Boolean)
        .some(f => VORSTAND_FUNKTIONEN.some(k => f.includes(k)));
}

/**
 * Wer bekommt die Mitteilung? [kandidaten]: Zeilen
 * { id, funktion, status, abgeschaltet } aus der Mitgliederdatenbank.
 * [ausser]: Mitglieds-Id der Person, die die Meldung ausgeloest hat.
 */
function vorstandEmpfaenger(kandidaten, { ausser } = {}) {
    const ohne = ausser === null || ausser === undefined ? null : String(ausser);
    const ids = new Set();
    for (const k of kandidaten || []) {
        if (!k || k.id === null || k.id === undefined) continue;
        if (!istVorstandFunktion(k.funktion)) continue;
        if (k.status === 'Ausgetreten') continue;
        if (k.abgeschaltet === true) continue;
        if (ohne !== null && String(k.id) === ohne) continue;
        ids.add(String(k.id));
    }
    return [...ids];
}

function text(wert, ersatz = '') {
    const t = wert === null || wert === undefined ? '' : String(wert).trim();
    return t || ersatz;
}

/**
 * Titel, Text und Daten der Mitteilung. [anzahl] > 1 nur bei gebuendelten
 * Anmeldungen (so viele kamen nach der ersten Mitteilung noch dazu).
 */
function vorstandNachricht(art, angaben = {}, anzahl = 1) {
    const a = ARTEN[art];
    if (!a) throw new Error(`Unbekannte Vorstand-Meldung: ${art}`);
    const name = text(angaben.name, 'Jemand');
    let title;
    let body;
    switch (art) {
        case 'antrag':
            title = 'Neuer Mitgliedschaftsantrag';
            body = `${name} möchte Mitglied werden. Bitte im Vorstand-Bereich prüfen.`;
            break;
        case 'austritt':
            title = 'Austritt beantragt';
            body = `${name} hat den Austritt aus dem Verein beantragt` +
                (text(angaben.datum) ? ` (gewünscht auf ${text(angaben.datum)}).` : '.');
            break;
        case 'loeschung':
            title = 'Löschung beantragt';
            body = `${name} soll gelöscht werden` +
                (text(angaben.von) ? ` (angestossen von ${text(angaben.von)})` : '') +
                '. Aktuar und Kassier müssen bestätigen.';
            break;
        case 'anmeldung': {
            const anlass = text(angaben.anlass, 'einen Anlass');
            if (anzahl > 1) {
                title = `${anzahl} weitere Anmeldungen`;
                body = `Für ${anlass} sind ${anzahl} weitere Anmeldungen eingegangen.`;
            } else {
                title = 'Neue Anmeldung';
                body = `${name} hat sich für ${anlass} angemeldet.`;
            }
            break;
        }
    }
    const data = { bereich: a.bereich };
    if (text(angaben.id)) data.id = text(angaben.id);
    return { notificationType: a.notificationType, title, body, data };
}

/**
 * FCM-Nachricht (sendEachForMulticast) fuer [tokens]: sichtbare Mitteilung
 * im Android-Kanal "Vorstand", Daten fuer das Antippen (alles Strings).
 */
function fcmNachricht(nachricht, tokens) {
    const data = Object.fromEntries(
        Object.entries({ notificationType: nachricht.notificationType, ...nachricht.data })
            .map(([k, v]) => [k, String(v ?? '')])
    );
    return {
        notification: { title: nachricht.title, body: nachricht.body },
        data,
        android: { notification: { channelId: ANDROID_KANAL } },
        tokens
    };
}

/**
 * kandidaten(): Promise<[{ id, funktion, status, abgeschaltet }]>
 * senden(memberIds, nachricht): verschickt an alle Geraete dieser Mitglieder
 * planen(fn, ms): wie setTimeout (Tests: von Hand ausloesen)
 */
function vorstandMelder({
    kandidaten, senden, sperreMs = 10 * 60e3,
    jetzt = Date.now, planen = (fn, ms) => setTimeout(fn, ms).unref(), protokoll = console
}) {
    // schluessel -> { bis, art, angaben, weitere, ausloeser: Set }
    const offen = new Map();

    async function verschicken(art, angaben, anzahl, ausser) {
        const nachricht = vorstandNachricht(art, angaben, anzahl);
        const empfaenger = vorstandEmpfaenger(await kandidaten(), { ausser });
        if (!empfaenger.length) return 0;
        await senden(empfaenger, nachricht);
        protokoll.log(`Vorstand-Push (${nachricht.notificationType}) an ${empfaenger.length} Mitglied(er)`);
        return empfaenger.length;
    }

    function aufraeumen() {
        const t = jetzt();
        for (const [s, e] of offen) {
            if (e.bis <= t && !e.weitere) offen.delete(s);
        }
    }

    /** Am Ende der Sperrfrist: gebuendelte Anmeldungen als eine Mitteilung. */
    async function nachziehen(schluessel, e) {
        if (offen.get(schluessel) === e) offen.delete(schluessel);
        const anzahl = e.weitere;
        e.weitere = 0;
        if (!anzahl) return;
        // Nur wenn alle nachgezogenen von derselben Person kamen, sie
        // auslassen - sonst betrifft die Sammelmitteilung auch andere.
        const ausser = e.ausloeser.size === 1 ? [...e.ausloeser][0] : null;
        try {
            await verschicken(e.art, e.angaben, anzahl, ausser);
        } catch (fehler) {
            protokoll.error('Vorstand-Push (gebuendelt) fehlgeschlagen:', fehler.message);
        }
    }

    /**
     * Meldet etwas an den Vorstand. [angaben]: { id, name, ... } je nach Art
     * (siehe vorstandNachricht). [ausloeser]: Mitglieds-Id der Person, die
     * es ausgeloest hat (bekommt nichts), oder null. Wirft nie.
     */
    async function melden(art, angaben = {}, { ausloeser = null } = {}) {
        try {
            const a = ARTEN[art];
            if (!a) throw new Error(`Unbekannte Vorstand-Meldung: ${art}`);
            aufraeumen();
            const schluessel = `${art}:${text(angaben.id)}`;
            const ausser = ausloeser === null || ausloeser === undefined || ausloeser === ''
                ? null : String(ausloeser);
            const e = offen.get(schluessel);
            if (e && e.bis > jetzt()) {
                if (a.buendeln) {
                    e.weitere++;
                    e.angaben = angaben;
                    e.ausloeser.add(ausser);
                }
                return 0;
            }
            // Sperrfrist um, der Wecker aber noch nicht gelaufen: zuerst
            // das Gebuendelte verschicken.
            if (e && e.weitere) nachziehen(schluessel, e);
            const neu = { bis: jetzt() + sperreMs, art, angaben, weitere: 0, ausloeser: new Set() };
            offen.set(schluessel, neu);
            if (a.buendeln) planen(() => nachziehen(schluessel, neu), sperreMs);
            return await verschicken(art, angaben, 1, ausser);
        } catch (fehler) {
            protokoll.error(`Vorstand-Push (${art}) fehlgeschlagen:`, fehler.message);
            return 0;
        }
    }

    return { melden, get offen() { return new Map(offen); } };
}

module.exports = {
    ABSCHALT_ART, ANDROID_KANAL, ARTEN,
    istVorstandFunktion, vorstandEmpfaenger, vorstandNachricht, fcmNachricht, vorstandMelder
};
