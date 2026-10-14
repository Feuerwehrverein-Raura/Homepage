// Wohin das Antippen einer App-Push-Mitteilung in der Mitglieder-App fuehrt
// (flutter/mitglieder/lib/push/push_dienst.dart, PushZiel.ausDaten).
//
// Schluessel in den FCM-Daten (api-members macht daraus Strings):
//  - ziel:    'anlass' | 'profil' | 'beitraege'; fehlt er, zeigt die App die
//             Mitteilung nach dem Oeffnen nochmals als Dialog.
//  - eventId: UUID des Anlasses (bei ziel 'anlass').
// event_update und shift_reminder fuehren immer zum Anlass (eventId).

const ZIELE = ['anlass', 'profil', 'beitraege'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ziel aus dem Body von POST /push/broadcast bzw. /push/to-members
 * ({ ziel, eventId }) als FCM-Daten. Ohne Ziel (oder 'keins') leer.
 * Wirft { status: 400, error } bei unbekanntem Ziel oder fehlender eventId.
 */
function pushZielDaten(eingabe) {
    const { ziel, eventId } = eingabe || {};
    if (ziel == null || ziel === '' || ziel === 'keins') return {};
    if (!ZIELE.includes(ziel)) {
        throw { status: 400, error: `Unbekanntes Ziel: ${ziel} (erlaubt: ${ZIELE.join(', ')})` };
    }
    if (ziel === 'anlass') {
        if (!eventId || !UUID.test(String(eventId))) {
            throw { status: 400, error: 'Für das Ziel «Anlass» braucht es eine eventId (UUID).' };
        }
        return { ziel, eventId: String(eventId) };
    }
    return { ziel };
}

/**
 * Daten eines Pushs vervollstaendigen: Anlass-Mitteilungen (event_update,
 * shift_reminder) mit eventId bekommen ziel 'anlass', sofern nichts anderes
 * gesetzt ist.
 */
function mitZiel(notificationType, data = {}) {
    const d = { ...(data || {}) };
    if (!d.ziel && d.eventId && (notificationType === 'event_update' || notificationType === 'shift_reminder')) {
        d.ziel = 'anlass';
    }
    return d;
}

module.exports = { pushZielDaten, mitZiel, ZIELE };
