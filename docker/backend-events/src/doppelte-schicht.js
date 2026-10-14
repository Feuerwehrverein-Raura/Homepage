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

// ---------------------------------------------------------------------------
// Niemand soll gleichzeitig auf zwei Schichten stehen (Entscheid 14.10.2026:
// Stefan stand an der Chilbi Sa 22-02 bei Bar UND Kueche). Gilt ueber alle
// Anlaesse und auch fuer mehrere Schichten in derselben Anfrage. Schichten,
// die direkt aneinander anschliessen (16-18 und 18-20), sind erlaubt.
// Ende <= Beginn heisst: endet am Folgetag (22:00-02:00).

const MIN = 60 * 1000;

/** Zeitraum einer Schicht in ms (Ortszeit egal - nur Vergleiche), oder null. */
function zeitraum(s) {
    if (!s || !s.date || !s.start_time || !s.end_time) return null;
    const tag = Date.parse(`${String(s.date).slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(tag)) return null;
    const min = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
    const a = tag + min(s.start_time) * MIN;
    let b = tag + min(s.end_time) * MIN;
    if (b <= a) b += 24 * 60 * MIN;
    return { a, b };
}

function ueberschneiden(x, y) {
    const p = zeitraum(x), q = zeitraum(y);
    return !!p && !!q && p.a < q.b && q.a < p.b;
}

/** Paare (neu, bestehend), die sich zeitlich ueberschneiden - reine Logik. */
function zeitPaare(neu, bestehend) {
    const paare = [];
    for (let i = 0; i < neu.length; i++) {
        for (let j = i + 1; j < neu.length; j++) {
            if (ueberschneiden(neu[i], neu[j])) paare.push({ neu: neu[j], mit: neu[i] });
        }
        for (const b of bestehend) {
            if (String(b.shift_id) === String(neu[i].shift_id)) continue; // gleiche Schicht: schichtKonflikte
            if (ueberschneiden(neu[i], b)) paare.push({ neu: neu[i], mit: b });
        }
    }
    return paare;
}

/**
 * Schichten aus [shiftIds], die sich mit einer anderen Schicht derselben
 * Person ueberschneiden (bestehende aktive Anmeldungen ausser [ausser],
 * oder eine andere Schicht derselben Anfrage).
 * Liefert [{ neu, mit }] mit je { shift_id, name, bereich, date, start_time, end_time, anlass }.
 */
async function zeitKonflikte(db, { memberId, email, shiftIds, ausser = null }) {
    const ids = eindeutig(shiftIds);
    if (!ids || ids.length === 0) return [];
    const felder = `s.id AS shift_id, s.name, s.bereich, s.date::text AS date,
        s.start_time::text AS start_time, s.end_time::text AS end_time, e.title AS anlass`;
    const neu = (await db.query(`
        SELECT ${felder} FROM shifts s LEFT JOIN events e ON e.id = s.event_id
         WHERE s.id = ANY($1::uuid[])`, [ids])).rows;
    if (neu.length === 0) return [];
    const adresse = String(email || '').trim().toLowerCase();
    let bestehend = [];
    if (memberId || adresse) {
        const tage = neu.map(s => String(s.date).slice(0, 10)).sort();
        bestehend = (await db.query(`
            SELECT DISTINCT ${felder}
              FROM registrations r
              JOIN shifts s ON s.id = ANY(r.shift_ids)
              LEFT JOIN events e ON e.id = s.event_id
             WHERE r.status = ANY($1::text[])
               AND ($2::uuid IS NULL OR r.id <> $2::uuid)
               AND (($3::uuid IS NOT NULL AND r.member_id = $3::uuid)
                    OR ($4 <> '' AND lower(trim(r.guest_email)) = $4))
               AND s.date BETWEEN ($5::date - 1) AND ($6::date + 1)`,
        [AKTIV, ausser, memberId || null, adresse, tage[0], tage[tage.length - 1]])).rows;
    }
    return zeitPaare(neu, bestehend);
}

/** "Kueche Sa 17.10. 22:00-02:00 gleichzeitig mit Bar 22:00-02:00 (Chilbi 2026)" */
function zeitText(paare) {
    const zeit = s => `${String(s.start_time || '').slice(0, 5)}–${String(s.end_time || '').slice(0, 5)}`;
    const tag = s => { const [j, m, t] = String(s.date).slice(0, 10).split('-'); return `${t}.${m}.${j}`; };
    const schicht = s => [s.bereich, s.name].filter(Boolean).join(' ');
    return paare.map(({ neu, mit }) =>
        `${schicht(neu)} am ${tag(neu)} ${zeit(neu)} überschneidet sich mit ${schicht(mit)} ${zeit(mit)}` +
        (mit.anlass && mit.anlass !== neu.anlass ? ` (${mit.anlass})` : '')).join('; ');
}

module.exports = { schichtKonflikte, eindeutig, konfliktText, zeitKonflikte, zeitPaare, zeitText };
