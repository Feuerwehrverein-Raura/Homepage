// Niemand soll sich zweimal fuer denselben Anlass als Teilnehmer anmelden.
//
// Anlass (Spaghetti-Plausch 2026): Heinz Degen stand viermal in der Liste,
// alle innerhalb von 5 Sekunden eingetragen - der Knopf gab keine schnelle
// Rueckmeldung, also wurde mehrfach gedrueckt. Gleichzeitig muessen Paare
// und Familien sich weiterhin einzeln anmelden koennen, auch mit einer
// gemeinsamen E-Mail-Adresse (Entscheid Stefan).
//
// Dieselbe Person heisst darum:
//  - dasselbe Mitglied (member_id) UND derselbe Name, oder
//  - (nicht zwei verschiedene Mitglieder) dieselbe E-Mail UND derselbe Name.
// Derselbe Name wird grosszuegig verglichen: Gross/klein, Leerzeichen und
// "Nachname, Vorname" == "Vorname Nachname".
// Zaehlen tun nur offene und bestaetigte Anmeldungen ohne Schicht
// (Teilnehmer). Schicht-Anmeldungen prueft doppelte-schicht.js.
//
// Gegen gleichzeitige Doppelklicks laufen Pruefen und Einfuegen in einer
// Transaktion unter einer Sperre pro Anlass (pg_advisory_xact_lock). Pro
// Anlass statt pro Person, weil dieselbe Person ueber Mitglied ODER
// Adresse erkannt wird - ein einziger Personenschluessel liesse sich nicht
// bilden. Anmeldungen sind selten; die Sperre haelt nur Millisekunden.

const AKTIV = ['pending', 'approved', 'confirmed'];

/** Name fuer den Vergleich: klein, ohne Komma, Woerter sortiert. */
function normalName(name) {
    return String(name ?? '')
        .normalize('NFC')
        .toLowerCase()
        .replace(/,/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .sort()
        .join(' ');
}

/** Gleicher Name? Leere Namen sind nie gleich. */
function gleicherName(a, b) {
    const x = normalName(a);
    return x !== '' && x === normalName(b);
}

function adresse(email) {
    return String(email ?? '').trim().toLowerCase();
}

/** Teilnehmer-Anmeldung = keine Schicht gewaehlt. */
function istTeilnahme(shiftIds) {
    return !Array.isArray(shiftIds) || shiftIds.filter(Boolean).length === 0;
}

/**
 * Ist [alt] (Zeile mit member_id, guest_email, person_name) dieselbe Person
 * wie [neu] ({ memberId, email, name })?
 */
function gleichePerson(neu, alt) {
    if (!gleicherName(neu.name, alt.person_name)) return false;
    const m1 = neu.memberId ? String(neu.memberId) : null;
    const m2 = alt.member_id ? String(alt.member_id) : null;
    if (m1 && m2) return m1 === m2; // zwei verschiedene Mitglieder bleiben verschieden
    const e = adresse(neu.email);
    return e !== '' && e === adresse(alt.guest_email);
}

/** Anzahl Personen einer Anmeldung (notes.participants, sonst 1). */
function personenZahl(reg) {
    try {
        const n = typeof reg?.notes === 'string' ? JSON.parse(reg.notes) : (reg?.notes || {});
        const v = parseInt(n?.participants, 10);
        if (Number.isFinite(v) && v > 1) return v;
    } catch (_) { /* alte/nicht-JSON notes zaehlen als 1 Person */ }
    return 1;
}

function personenText(n) {
    return `${n} ${n === 1 ? 'Person' : 'Personen'}`;
}

/**
 * Die aktive Teilnehmer-Anmeldung derselben Person fuer [eventId] - oder
 * null. Fehlen Name oder Adresse, kommen sie vom Mitglied.
 */
async function bestehendeTeilnahme(db, { eventId, memberId = null, email = '', name = '', ausser = null }) {
    if (!eventId) return null;
    let person = { memberId: memberId || null, email: adresse(email), name: String(name ?? '').trim() };
    if (person.memberId && (!person.name || !person.email)) {
        const m = (await db.query(
            'SELECT vorname, nachname, email FROM members WHERE id = $1::uuid', [person.memberId])).rows[0];
        if (m) {
            person = {
                ...person,
                name: person.name || [m.vorname, m.nachname].filter(Boolean).join(' '),
                email: person.email || adresse(m.email)
            };
        }
    }
    if (!person.name || (!person.memberId && !person.email)) return null;
    const kandidaten = await db.query(`
        SELECT r.*,
               COALESCE(NULLIF(TRIM(r.guest_name), ''), TRIM(CONCAT(m.vorname, ' ', m.nachname))) AS person_name
        FROM registrations r
        LEFT JOIN members m ON m.id = r.member_id
        WHERE r.event_id = $1
          AND r.status = ANY($2::text[])
          AND COALESCE(cardinality(r.shift_ids), 0) = 0
          AND ($3::uuid IS NULL OR r.id <> $3::uuid)
          AND (($4::uuid IS NOT NULL AND r.member_id = $4::uuid)
               OR ($5 <> '' AND LOWER(TRIM(r.guest_email)) = $5))
        ORDER BY r.created_at, r.id`,
        [eventId, AKTIV, ausser, person.memberId, person.email]);
    return kandidaten.rows.find(r => gleichePerson(person, r)) || null;
}

/**
 * Text fuer die Person selbst (Doppelklick, zweiter Versuch). Weicht die
 * neu angegebene Personenzahl ab, wird nichts still ueberschrieben - der
 * Text sagt, wie man die Anzahl aendert.
 */
function hinweisSelbst(bestehend, angefragt) {
    const n = personenZahl(bestehend);
    let text = `Du bist schon angemeldet (${personenText(n)}). Eine zweite Anmeldung ist nicht nötig.`;
    const neu = parseInt(angefragt, 10);
    if (Number.isFinite(neu) && neu > 0 && neu !== n) {
        text += ` Du hast jetzt ${personenText(neu)} angegeben – die Anzahl haben wir nicht geändert.`
            + ' Um sie zu ändern, melde dich beim Organisator oder beim Vorstand.';
    }
    return text;
}

/** Text fuer Vorstand/Organisator, die von Hand eintragen (409). */
function hinweisVorstand(bestehend) {
    const name = bestehend.person_name || bestehend.guest_name || 'Diese Person';
    const status = { pending: 'offen', approved: 'bestätigt', confirmed: 'bestätigt' }[bestehend.status] || bestehend.status;
    return `${name} ist für diesen Anlass schon angemeldet (${personenText(personenZahl(bestehend))}, ${status}). `
        + 'Es wurde keine zweite Anmeldung angelegt. Um die Personenzahl zu ändern, '
        + 'bearbeite die bestehende Anmeldung.';
}

/**
 * Fuehrt [arbeit](client) in einer Transaktion unter der Anmelde-Sperre des
 * Anlasses aus. Wirft [arbeit], wird zurueckgerollt.
 */
async function mitAnmeldeSperre(pool, eventId, arbeit) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`anmeldung:${eventId}`]);
        const ergebnis = await arbeit(client);
        await client.query('COMMIT');
        return ergebnis;
    } catch (fehler) {
        await client.query('ROLLBACK').catch(() => {});
        throw fehler;
    } finally {
        client.release();
    }
}

module.exports = {
    AKTIV,
    normalName,
    gleicherName,
    istTeilnahme,
    gleichePerson,
    personenZahl,
    bestehendeTeilnahme,
    hinweisSelbst,
    hinweisVorstand,
    mitAnmeldeSperre
};
