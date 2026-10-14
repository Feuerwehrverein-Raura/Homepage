// Schichten beim Eintragen durch Organisator oder Vorstand.
//
// Meldet sich jemand muendlich fuer eine Schicht, traegt der Organisator ihn
// ueber "Person hinzufuegen" ein (POST /events/:id/registrations-as-organizer,
// POST /events/my-event/registrations) oder aendert eine bestehende Anmeldung
// (PUT /events/:eventId/registrations/:regId/as-organizer). Diese Routen
// nehmen optional shift_ids an; hier wird geprueft:
//  - shift_ids ist eine Liste von Schicht-IDs, Doppelte fallen weg
//  - alle Schichten gehoeren zu DIESEM Anlass (sonst 400)
//  - dieselbe Person steht nicht schon auf der Schicht (409, wie
//    PUT /registrations/:id, siehe doppelte-schicht.js)
//  - volle Schicht: nicht blockieren (der Organisator weiss, was er tut),
//    aber einen Hinweis (warnung) zurueckgeben.
//
// Belegung wie ueberall im Backend: bestaetigte Anmeldungen ('approved',
// 'confirmed') gegen shifts.needed.

const { schichtKonflikte, eindeutig, konfliktText, zeitKonflikte, zeitText } = require('./doppelte-schicht');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Text fuer Menschen: "Bar (2026-10-17 18:00) 3/3". */
function vollText(schichten) {
    return schichten
        .map(s => `${konfliktText([s])} ${s.belegt}/${s.needed}`)
        .join(', ');
}

/**
 * Prueft shift_ids aus dem Body.
 *  - shiftIds undefined: nichts angegeben -> { angegeben: false }
 *  - sonst { angegeben: true, shiftIds: [...] | null, warnung: string|null }
 *    (leere Liste -> null: Anmeldung ohne Schicht)
 *  - bei Fehlern { fehler: { status, body } }
 * [ausser] ist die Anmeldung, die gerade bearbeitet wird (zaehlt weder als
 * Doppel noch zur Belegung).
 */
async function schichtenPruefen(db, { eventId, shiftIds, memberId, email, ausser = null }) {
    if (shiftIds === undefined) return { angegeben: false };
    if (shiftIds !== null && !Array.isArray(shiftIds)) {
        return { fehler: { status: 400, body: { error: 'shift_ids muss eine Liste von Schicht-IDs sein' } } };
    }
    const ids = eindeutig(shiftIds || []);
    if (ids.length === 0) return { angegeben: true, shiftIds: null, warnung: null };
    if (!ids.every(id => UUID.test(id))) {
        return { fehler: { status: 400, body: { error: 'Ungueltige Schicht-ID', code: 'schicht_fremd' } } };
    }

    const r = await db.query(`
        SELECT s.id, s.name, s.date::text AS date, s.start_time::text AS start_time, s.needed,
               (SELECT COUNT(*) FROM registrations r
                 WHERE s.id = ANY(r.shift_ids)
                   AND r.status IN ('approved', 'confirmed')
                   AND ($3::uuid IS NULL OR r.id <> $3::uuid))::int AS belegt
          FROM shifts s
         WHERE s.event_id = $1 AND s.id = ANY($2::uuid[])`,
    [eventId, ids, ausser]);
    const gefunden = new Map(r.rows.map(s => [String(s.id), s]));
    if (ids.some(id => !gefunden.has(id))) {
        return {
            fehler: {
                status: 400,
                body: { error: 'Schicht gehoert nicht zu diesem Anlass', code: 'schicht_fremd' }
            }
        };
    }

    const doppelt = await schichtKonflikte(db, { eventId, memberId, email, shiftIds: ids, ausser });
    if (doppelt.length > 0) {
        return {
            fehler: {
                status: 409,
                body: {
                    error: `Bereits auf dieser Schicht eingetragen: ${konfliktText(doppelt)}`,
                    code: 'schicht_doppelt'
                }
            }
        };
    }

    const gleichzeitig = await zeitKonflikte(db, { memberId, email, shiftIds: ids, ausser });
    if (gleichzeitig.length > 0) {
        return {
            fehler: {
                status: 409,
                body: { error: `Gleichzeitig schon eingeteilt: ${zeitText(gleichzeitig)}`, code: 'schicht_gleichzeitig' }
            }
        };
    }

    // Reihenfolge wie angefragt.
    const voll = ids.map(id => gefunden.get(id))
        .filter(s => Number(s.needed) > 0 && Number(s.belegt) >= Number(s.needed));
    const warnung = voll.length > 0
        ? `Schicht bereits voll, trotzdem eingetragen: ${vollText(voll)}`
        : null;
    return { angegeben: true, shiftIds: ids, warnung };
}

module.exports = { schichtenPruefen, vollText };
