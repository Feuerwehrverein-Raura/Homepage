// Niemand soll zweimal auf derselben Schicht stehen.
//
// Fuer Helfer-Anmeldungen ist die allgemeine Doppelpruefung bewusst aus:
// Wer schon eine Schicht hat, darf weitere dazubuchen. Dabei wurde aber nie
// geprueft, ob es DIESELBE Schicht ist - so liess sich eine Person zweimal
// auf eine Schicht eintragen, und sie zaehlte doppelt gegen die Plaetze.
//
// Dieselbe Person heisst: dasselbe Mitglied (member_id) oder dieselbe
// Gaeste-Adresse. Zaehlen tun nur offene und bestaetigte Anmeldungen;
// abgelehnte oder stornierte nicht.

const AKTIV = ['pending', 'approved', 'confirmed'];

/** Doppelte Schicht-Ids innerhalb einer Anfrage entfernen, Reihenfolge bleibt. */
function eindeutig(shiftIds) {
    if (!Array.isArray(shiftIds)) return shiftIds;
    return [...new Set(shiftIds.filter(Boolean).map(String))];
}

/**
 * Schichten aus [shiftIds], auf denen dieselbe Person schon steht.
 * [ausser] ist die Anmeldung, die gerade bearbeitet wird.
 * Liefert [{ shift_id, name, date, start_time }] - leer, wenn alles gut ist.
 */
async function schichtKonflikte(db, { eventId, memberId, email, shiftIds, ausser = null }) {
    const ids = eindeutig(shiftIds);
    if (!ids || ids.length === 0 || !eventId) return [];
    const adresse = String(email || '').trim().toLowerCase();
    if (!memberId && !adresse) return [];
    const ergebnis = await db.query(`
        SELECT DISTINCT s.id AS shift_id, s.name, s.date::text AS date, s.start_time::text AS start_time
        FROM registrations r
        JOIN shifts s ON s.id = ANY(r.shift_ids)
        WHERE r.event_id = $1
          AND r.status = ANY($2::text[])
          AND s.id = ANY($3::uuid[])
          AND ($4::uuid IS NULL OR r.id <> $4::uuid)
          AND (($5::uuid IS NOT NULL AND r.member_id = $5::uuid)
               OR ($6 <> '' AND lower(trim(r.guest_email)) = $6))
        ORDER BY 3, 4`,
        [eventId, AKTIV, ids, ausser, memberId || null, adresse]);
    return ergebnis.rows;
}

/** Text fuer Menschen: "Schicht 1 (2026-10-20 12:00)". */
function konfliktText(konflikte) {
    return konflikte
        .map(k => `${k.name}${k.date ? ` (${k.date}${k.start_time ? ' ' + String(k.start_time).slice(0, 5) : ''})` : ''}`)
        .join(', ');
}

module.exports = { schichtKonflikte, eindeutig, konfliktText };
