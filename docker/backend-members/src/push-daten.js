// FCM-Daten eines Pushs: FCM verlangt Strings als Werte. Leere Werte (null,
// undefined) fallen weg - sonst kaeme in der App "undefined" als eventId an.
// Welche Schluessel die Mitglieder-App liest (notificationType, ziel,
// eventId, bereich, ...): flutter/mitglieder/lib/push/push_dienst.dart
// (PushZiel.ausDaten) und docker/backend-events/src/push-ziel.js.

/**
 * @param {string} notificationType 'event_update' | 'shift_reminder' | 'general' | ...
 * @param {object} data             weitere Schluessel (z.B. ziel, eventId)
 * @returns {Record<string, string>}
 */
function fcmDaten(notificationType, data = {}) {
    return Object.fromEntries(
        Object.entries({ notificationType, ...(data || {}) })
            .filter(([, v]) => v !== null && v !== undefined)
            .map(([k, v]) => [k, String(v)])
    );
}

/** Ziel fuer Mitteilungen aus Vorlagen (sendNotificationEmail): Antippen
 *  fuehrt bei Datenaenderungen ins Profil; sonst kein Ziel (Dialog). */
function vorlageZiel(templateName) {
    return templateName === 'Datenänderung bestätigt' ? 'profil' : null;
}

module.exports = { fcmDaten, vorlageZiel };
