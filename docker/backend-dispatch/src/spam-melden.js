// «Als Spam melden» im Mail-Client der App (Vorstand -> Posteingang).
//
// Eine Mail, die ein Vorstandsmitglied als Spam meldet:
//  1. geht unveraendert an spam@fwv-raura.ch (SMTP; sonst direkt in dessen
//     Posteingang) (als "Resent", nicht als
//     Weiterleitung - so sieht der Spam-Manager die Original-Kopfzeilen:
//     Absender, Received, SPF/DKIM/DMARC; Resent-From nennt den Melder),
//  2. wandert im eigenen Postfach in den Junk-Ordner (Mailcow/rspamd lernt
//     beim Verschieben nach Junk, dass das Spam ist),
//  3. wird in ALLEN Funktions-Postfaechern mit hinterlegtem Passwort
//     (shared_mailbox_passwords) ebenfalls nach Junk verschoben - erkannt nur
//     ueber die genaue Message-ID, damit nie eine andere Mail verschwindet.
//     Nach Junk statt loeschen: ein Irrtum laesst sich so zurueckholen.
//
// Reine Bausteine sind ohne IMAP/SMTP testbar (test/spam-melden.test.js).

const SPAM_ADRESSE = (process.env.SPAM_ADDRESS || 'spam@fwv-raura.ch').toLowerCase();

/** Postfaecher, die nie durchsucht werden (Spam-Sammler selbst, DMARC-Berichte). */
const NIE_DURCHSUCHEN = new Set([SPAM_ADRESSE, 'dmarc@fwv-raura.ch']);

const IST_JUNK = /junk|spam/i;
const NICHT_DURCHSUCHEN = /junk|spam|trash|papierkorb|deleted|gel.scht|sent|gesendet|draft|entw/i;

/** Junk-Ordner eines Postfachs aus client.list(): \Junk, sonst Name mit junk/spam, sonst "Junk". */
function junkOrdner(liste) {
    return liste.find(f => f.specialUse === '\\Junk')?.path
        || liste.find(f => IST_JUNK.test(f.name || f.path))?.path
        || 'Junk';
}

/** Ordner, in denen die Spam-Mail gesucht wird: alles Auswaehlbare ausser
 *  Junk, Papierkorb, Gesendet, Entwuerfe. */
function suchOrdner(liste) {
    return liste
        .filter(f => !Array.from(f.flags || []).includes('\\Noselect'))
        .filter(f => !['\\Junk', '\\Trash', '\\Sent', '\\Drafts'].includes(f.specialUse))
        .filter(f => !NICHT_DURCHSUCHEN.test(f.path))
        .map(f => f.path);
}

/** Message-ID mit spitzen Klammern; null, wenn keine brauchbare da ist. */
function messageIdNormal(id) {
    const t = String(id || '').trim();
    if (!t || /\s/.test(t)) return null;
    return t.startsWith('<') ? t : `<${t}>`;
}

/** Original-Mail mit Resent-Kopfzeilen davor (RFC 5322 3.6.6). */
function resentMail(raw, { melder, an = SPAM_ADRESSE, datum = new Date() }) {
    const kopf = [
        `Resent-From: ${melder}`,
        `Resent-To: ${an}`,
        `Resent-Date: ${datum.toUTCString().replace('GMT', '+0000')}`,
        `X-FWV-Spam-Gemeldet-Von: ${melder}`,
    ].join('\r\n') + '\r\n';
    return Buffer.concat([Buffer.from(kopf, 'utf8'), Buffer.isBuffer(raw) ? raw : Buffer.from(raw)]);
}

/**
 * Sucht die Mail [messageId] in [konto] und verschiebt jeden Treffer nach
 * Junk. Gibt die Anzahl verschobener Mails zurueck.
 */
async function ausPostfachEntfernen(client, messageId) {
    const liste = await client.list();
    const junk = junkOrdner(liste);
    let anzahl = 0;
    for (const ordner of suchOrdner(liste)) {
        const lock = await client.getMailboxLock(ordner);
        try {
            const uids = await client.search({ header: { 'message-id': messageId } }, { uid: true });
            if (uids && uids.length) {
                await client.messageMove(uids, junk, { uid: true });
                anzahl += uids.length;
            }
        } finally {
            lock.release();
        }
    }
    return anzahl;
}

/**
 * Der ganze Ablauf. [verbinden](konto) -> ImapFlow-Client, [senden]({from,
 * to, raw}) verschickt per SMTP, [alleKonten]() -> alle Postfaecher mit
 * Passwort. Fehler in fremden Postfaechern brechen nicht ab, sie stehen in
 * `fehler`.
 */
async function spamMelden({ konto, ordner, uid, verbinden, senden, alleKonten, log = () => {} }) {
    let raw;
    let messageId = null;
    let absender = null;
    let gemeldet = true;
    let meldungFehler = null;
    const eigen = await verbinden(konto);
    try {
        const lock = await eigen.getMailboxLock(ordner);
        try {
            const msg = await eigen.fetchOne(String(uid), { source: true, envelope: true }, { uid: true });
            if (!msg || !msg.source) throw Object.assign(new Error('Mail nicht gefunden'), { status: 404 });
            raw = msg.source;
            messageId = messageIdNormal(msg.envelope?.messageId);
            absender = msg.envelope?.from?.[0]?.address?.toLowerCase() || null;

            // 1. An spam@. Lehnt der Mailserver den Versand ab (rspamd prueft
            //    auch ausgehende Mails - echter Spam faellt da durch), legt
            //    der Dienst die Mail direkt in den Posteingang von spam@,
            //    sofern dessen Passwort hinterlegt ist. Klappt beides nicht,
            //    wird trotzdem aufgeraeumt; `gemeldet` ist dann false.
            const resent = resentMail(raw, { melder: konto });
            try {
                await senden({ from: konto, to: SPAM_ADRESSE, raw: resent });
            } catch (e) {
                log('Versand an spam@ abgelehnt, lege direkt ab', { fehler: e.message });
                try {
                    const spam = await verbinden(SPAM_ADRESSE);
                    try {
                        await spam.append('INBOX', resent);
                    } finally {
                        await spam.logout().catch(() => {});
                    }
                } catch (e2) {
                    gemeldet = false;
                    meldungFehler = `${e.message}; direkt ablegen: ${e2.message}`;
                    log('Nicht an spam@ gemeldet', { fehler: meldungFehler });
                }
            }

            // 2. Im eigenen Postfach nach Junk.
            if (!IST_JUNK.test(ordner)) {
                await eigen.messageMove(String(uid), junkOrdner(await eigen.list()), { uid: true });
            }
        } finally {
            lock.release();
        }
    } finally {
        await eigen.logout().catch(() => {});
    }

    // 3. Dieselbe Mail aus allen anderen Funktions-Postfaechern.
    const entfernt = [{ konto, anzahl: 1 }];
    const fehler = [];
    if (messageId) {
        for (const anderes of (await alleKonten()).map(k => k.toLowerCase())) {
            if (anderes === konto || NIE_DURCHSUCHEN.has(anderes)) continue;
            let client;
            try {
                client = await verbinden(anderes);
                const anzahl = await ausPostfachEntfernen(client, messageId);
                if (anzahl) entfernt.push({ konto: anderes, anzahl });
            } catch (e) {
                fehler.push({ konto: anderes, fehler: e.message });
                log('Postfach nicht bereinigt', { konto: anderes, fehler: e.message });
            } finally {
                if (client) await client.logout().catch(() => {});
            }
        }
    }
    return { gemeldet, meldung_fehler: meldungFehler, absender, message_id: messageId, entfernt, fehler };
}

module.exports = {
    SPAM_ADRESSE, junkOrdner, suchOrdner, messageIdNormal, resentMail, ausPostfachEntfernen, spamMelden,
};
