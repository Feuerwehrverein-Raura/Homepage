// Roter Schopf fuer die Schicht: Wer eine bestaetigte Schicht hat, darf
// von 1 Stunde vor Beginn bis 1 Stunde nach Ende in den Roten Schopf (Licht,
// Tiefkuehler, Musik) - auch ohne die Gruppe "Roter Schopf".
//
// Bewusst KEIN Ein- und Austragen in Authentik: Geprueft wird bei jedem
// Zugriff. So wirkt es sofort (ohne neues Token), niemand bleibt versehentlich
// in der Gruppe haengen, und wer schon drin ist, bleibt unberuehrt.
//
// Jede Schicht zaehlt, egal wo der Anlass ist (Entscheid Stefan, 13.10.2026).
// Schichten ueber Mitternacht (Ende <= Beginn) enden am Folgetag. Zeiten
// sind Schweizer Ortszeit.
//
// Wer ist "ich"? Die Mitglieds-UUID (Mitglieder-Token), sonst der
// Benutzername (Authentik: preferred_username), die E-Mail nur, wenn sie zu
// genau einem Mitglied gehoert - Paare teilen sich oft eine Adresse.

const VORLAUF_MIN = 60;
const NACHLAUF_MIN = 60;
const ZONE = 'Europe/Zurich';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Versatz der Zone zu UTC in ms fuer einen Zeitpunkt. */
function versatz(ms) {
    const teile = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(new Date(ms)).map(t => [t.type, t.value]));
    const alsUtc = Date.UTC(+teile.year, +teile.month - 1, +teile.day,
        +teile.hour, +teile.minute, +teile.second);
    return alsUtc - Math.floor(ms / 1000) * 1000;
}

/** "2026-10-14" + "17:00:00" Schweizer Zeit -> Date. */
function ortszeit(datum, zeit, plusTage = 0) {
    const [j, mo, t] = datum.split('-').map(Number);
    const [h, mi, s = 0] = zeit.split(':').map(Number);
    const naiv = Date.UTC(j, mo - 1, t + plusTage, h, mi, s);
    // Zweimal: beim ersten Mal kann der Versatz der falsche Seite der
    // Umstellung sein.
    let ms = naiv - versatz(naiv);
    ms = naiv - versatz(ms);
    return new Date(ms);
}

/**
 * Die Schicht, die gerade Zugang gibt (die am laengsten laufende), oder null.
 * zeilen: { datum: 'YYYY-MM-DD', beginn: 'HH:MM:SS', ende: 'HH:MM:SS', schicht, anlass }
 */
function aktiveSchicht(zeilen, jetzt = new Date(),
    { vorlaufMin = VORLAUF_MIN, nachlaufMin = NACHLAUF_MIN } = {}) {
    let beste = null;
    for (const z of zeilen) {
        if (!z.datum || !z.beginn || !z.ende) continue;
        const beginn = ortszeit(z.datum, z.beginn);
        const ende = ortszeit(z.datum, z.ende, z.ende <= z.beginn ? 1 : 0);
        const ab = new Date(beginn.getTime() - vorlaufMin * 60e3);
        const bis = new Date(ende.getTime() + nachlaufMin * 60e3);
        if (jetzt >= ab && jetzt <= bis && (!beste || bis > beste.bis)) {
            beste = { schicht: z.schicht || null, anlass: z.anlass || null, beginn, ende, bis };
        }
    }
    return beste;
}

/**
 * Mitglieds-Ids und E-Mail (nur wenn eindeutig) zur Anmeldung.
 * db: { query(sql, werte) } wie pg.Pool.
 */
async function wer(db, user) {
    if (typeof user?.id === 'string' && UUID.test(user.id)) {
        const r = await db.query('SELECT id, email FROM members WHERE id = $1', [user.id]);
        if (r.rows.length) return r.rows[0];
    }
    const name = user?.benutzername || user?.preferred_username;
    if (name) {
        const r = await db.query(
            'SELECT id, email FROM members WHERE LOWER(benutzername) = LOWER($1)', [name]);
        if (r.rows.length === 1) return r.rows[0];
    }
    if (user?.email) {
        const r = await db.query(
            'SELECT id, email FROM members WHERE LOWER(email) = LOWER($1)', [user.email]);
        if (r.rows.length === 1) return r.rows[0];
    }
    return null;
}

function schichtZugang(db, { jetzt = () => new Date(), cacheMs = 30e3 } = {}) {
    const cache = new Map();

    /** { schicht, anlass, beginn, ende, bis } oder null */
    async function pruefen(user) {
        const schluessel = `${user?.id}|${user?.benutzername || user?.preferred_username}|${user?.email}`;
        const jetztZeit = jetzt();
        const alt = cache.get(schluessel);
        if (alt && jetztZeit.getTime() - alt.zeit < cacheMs) return alt.wert;

        const m = await wer(db, user);
        let wert = null;
        if (m) {
            // Nur Schichten rund um heute laden; das Fenster selbst rechnet
            // aktiveSchicht. Gaeste-Anmeldungen (oeffentliches Formular)
            // zaehlen, wenn die E-Mail eindeutig diesem Mitglied gehoert.
            const eindeutig = m.email
                ? (await db.query('SELECT COUNT(*)::int AS n FROM members WHERE LOWER(email) = LOWER($1)',
                    [m.email])).rows[0].n === 1
                : false;
            const r = await db.query(`
                SELECT to_char(s.date, 'YYYY-MM-DD') AS datum,
                       s.start_time::text AS beginn, s.end_time::text AS ende,
                       s.name AS schicht, e.title AS anlass
                FROM registrations r
                JOIN shifts s ON s.id = ANY(r.shift_ids)
                LEFT JOIN events e ON e.id = s.event_id
                WHERE r.status = 'approved'
                  AND (r.member_id = $1
                       OR ($2::text IS NOT NULL AND r.member_id IS NULL
                           AND LOWER(r.guest_email) = LOWER($2)))
                  AND s.date BETWEEN ($3::date - 1) AND ($3::date + 1)
            `, [m.id, eindeutig ? m.email : null,
                new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(jetztZeit)]);
            wert = aktiveSchicht(r.rows, jetztZeit);
        }
        cache.set(schluessel, { zeit: jetztZeit.getTime(), wert });
        if (cache.size > 500) cache.clear();
        return wert;
    }

    return { pruefen };
}

module.exports = { schichtZugang, aktiveSchicht, ortszeit, wer, VORLAUF_MIN, NACHLAUF_MIN };
