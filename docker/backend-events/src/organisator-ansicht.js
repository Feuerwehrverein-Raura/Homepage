// DEUTSCH: Anzeige-fertige Werte fuer den Organisator-Bereich der Apps
// (GET /events/organisator-uebersicht).
//
// Die alten Apps holten pro Anlass die Anmeldungen einzeln, lasen das
// notes-JSON selbst aus (Personen, Begleitpersonen, Allergien, Menue) und
// zaehlten offen/bestaetigt selbst — jede ein bisschen anders. Hier steht das
// einmal, die App zeigt es nur an (Punkt 6 in
// docs/flutter-mitglieder-app-plan.md, "Was ins Backend gehoert").
//
// Nur reine Funktionen, ohne Datenbank: getestet in
// test/organisator-ansicht.test.js, der Vertrag mit der App in
// test/app-vertrag.test.js (fixtures/organisator-uebersicht.json).

const appAnsicht = require('./app-ansicht');

// notes einer Anmeldung: JSON {phone, participants, companions, allergies,
// meal_selection, notes, shifts, alternative_suggestion} — oder bei alten
// Anmeldungen einfacher Text (dann ist das die Bemerkung).
function notizenLesen(notes) {
    if (notes === null || notes === undefined || notes === '') return { json: {}, text: null };
    if (typeof notes === 'object') return { json: notes, text: null };
    try {
        const json = JSON.parse(notes);
        if (json && typeof json === 'object' && !Array.isArray(json)) return { json, text: null };
    } catch (_) { /* Text */ }
    return { json: {}, text: String(notes) };
}

const text = v => (typeof v === 'string' && v.trim() ? v.trim() : (typeof v === 'number' ? String(v) : null));

function personen(json) {
    const v = parseInt(json.participants, 10);
    return Number.isFinite(v) && v > 1 ? v : 1;
}

// Begleitpersonen: Objekte {name, email?, phone?}; aeltere Anmeldungen
// schickten blanke Namen.
function begleitpersonen(json) {
    if (!Array.isArray(json.companions)) return [];
    return json.companions.map(c => {
        if (typeof c === 'string') return text(c) ? { name: text(c), email: null, phone: null } : null;
        const name = text(c?.name);
        return name ? { name, email: text(c.email), phone: text(c.phone) } : null;
    }).filter(Boolean);
}

// "15.09.2026"
function datumPunkt(wert) {
    const z = appAnsicht.zerlege(wert);
    if (!z) return null;
    const [j, m, t] = z.datum.split('-');
    return `${t}.${m}.${j}`;
}

// Eine Anmeldung, wie die Organisator-Ansicht sie zeigt.
//   reg: Zeile aus registrations + member_vorname/-nachname/-email/-mobile/-telefon
//   schichtenNachId: { [shift_id]: shift-Zeile }
function anmeldungFuerOrganisator(reg, schichtenNachId = {}) {
    const { json, text: bemerkungText } = notizenLesen(reg.notes);
    const mitglied = !!reg.member_id;
    const name = mitglied
        ? [reg.member_vorname, reg.member_nachname].filter(Boolean).join(' ') || text(reg.guest_name)
        : text(reg.guest_name);
    const shiftIds = Array.isArray(reg.shift_ids) ? reg.shift_ids : [];
    const alt = json.alternative_suggestion;
    const altSchicht = alt && schichtenNachId[alt.suggested_shift_id];
    return {
        id: reg.id,
        status: reg.status,
        ...appAnsicht.anmeldungStatus(reg.status),
        art: shiftIds.length > 0 ? 'schicht' : 'teilnahme',
        mitglied,
        member_id: reg.member_id || null,
        name: name || 'Ohne Namen',
        email: text(reg.member_email) || text(reg.guest_email),
        phone: text(json.phone) || text(reg.phone) || text(reg.member_mobile) || text(reg.member_telefon),
        personen: personen(json),
        begleitpersonen: begleitpersonen(json),
        allergien: text(json.allergies),
        menue: text(json.meal_selection),
        bemerkung: text(json.notes) || text(bemerkungText),
        shift_ids: shiftIds,
        schichten: shiftIds.map(id => schichtenNachId[id])
            .filter(Boolean)
            .map(s => ({ id: s.id, beschriftung: appAnsicht.schichtBeschriftung(s) })),
        alternative: alt
            ? {
                schicht_text: altSchicht ? appAnsicht.schichtBeschriftung(altSchicht)
                    : (typeof alt.suggested_shift_info === 'string' ? alt.suggested_shift_info : 'Andere Schicht'),
                vorgeschlagen_text: datumPunkt(alt.suggested_at)
            }
            : null,
        angemeldet_text: datumPunkt(reg.created_at)
    };
}

// Reihenfolge: zuerst, was zu tun ist (offen), dann bestaetigt, dann der Rest.
const STATUS_REIHENFOLGE = { pending: 0, approved: 1, confirmed: 1, rejected: 2, cancelled: 3 };

function anmeldungenSortieren(anmeldungen) {
    return [...anmeldungen].sort((a, b) =>
        (STATUS_REIHENFOLGE[a.status] ?? 9) - (STATUS_REIHENFOLGE[b.status] ?? 9)
        || a.name.localeCompare(b.name, 'de')
        || String(a.id).localeCompare(String(b.id)));
}

// Zahlen fuer die Karte: Personen zaehlen nur offen + bestaetigt (wie die
// Kapazitaetspruefung bei der Anmeldung).
function zahlen(anmeldungen) {
    const offen = anmeldungen.filter(a => a.status === 'pending').length;
    const bestaetigt = anmeldungen.filter(a => ['approved', 'confirmed'].includes(a.status)).length;
    const abgelehnt = anmeldungen.filter(a => a.status === 'rejected').length;
    const personenTotal = anmeldungen
        .filter(a => ['pending', 'approved', 'confirmed'].includes(a.status))
        .reduce((s, a) => s + a.personen, 0);
    const teile = [];
    if (bestaetigt) teile.push(`${bestaetigt} bestätigt`);
    if (offen) teile.push(`${offen} offen`);
    if (personenTotal) teile.push(personenTotal === 1 ? '1 Person' : `${personenTotal} Personen`);
    return {
        anmeldungen: anmeldungen.length,
        offen,
        bestaetigt,
        abgelehnt,
        personen_total: personenTotal,
        text: teile.length ? teile.join(' · ') : 'Noch keine Anmeldungen'
    };
}

// Was der Anfragende an diesem Anlass tun darf. Der Organisator-Login
// (POST /events/login) hat nur die /events/my-event/...-Routen: bestaetigen,
// ablehnen, hinzufuegen, Arbeitsplan senden.
function aktionen(zugang, event, anmeldungen) {
    const voll = zugang !== 'organisator-login';
    const hatSchichten = (event.shifts || []).length > 0;
    return {
        bestaetigen: true,
        hinzufuegen: true,
        bearbeiten: voll,
        loeschen: voll,
        alternative: voll && hatSchichten,
        mitteilen: voll,
        anlass_bearbeiten: voll,
        schichten: voll,
        notizen: voll,
        material: voll,
        arbeitsplan_senden: !voll && hatSchichten,
        pdf_teilnehmerliste: anmeldungen.some(a => a.status !== 'rejected'),
        pdf_arbeitsplan: hatSchichten,
        pdf_aushang: !!event.pdf_filename
    };
}

// Gehoert der Anlass noch in die aktuelle Liste? Abgesagte bleiben drin
// (der Organisator muss sie sehen), Ideen ohne Datum auch.
function istAktuellFuerOrganisator(event, zeit) {
    return appAnsicht.istDatumOffen(event) || appAnsicht.istAktuell(event, zeit);
}

// Warum ein Organisator-Login (Anlass-Zugang) nicht (mehr) gilt — oder null.
function organisatorLoginGesperrt(event, zeit = appAnsicht.jetzt()) {
    if (!event) return 'Der Anlass existiert nicht mehr.';
    if (event.status === 'cancelled') {
        return 'Der Anlass wurde abgesagt – der Organisator-Zugang gilt nicht mehr.';
    }
    if (!appAnsicht.istDatumOffen(event) && !appAnsicht.istAktuell(event, zeit)) {
        return 'Der Anlass ist vorbei – der Organisator-Zugang gilt nicht mehr.';
    }
    return null;
}

// Felder der Anlass-Zeile, die die Uebersicht nicht mitschickt: Zugang zum
// Organisator-Login und der PDF-Anhang (gross, eigener Download).
const OHNE_FELDER = ['event_email', 'event_password_hash', 'event_password_encrypted', 'pdf_attachment'];

// Ein Anlass der Uebersicht: Zeile + Schichten (mit app-Block) + app-Block +
// organisator { aktuell, zahlen, aktionen, anmeldungen }.
//   event:   Zeile aus events, mit shifts (Zeilen)
//   regs:    Anmeldungen (siehe anmeldungFuerOrganisator)
//   zugang:  'vorstand' | 'mitglied' | 'organisator-login'
function anlassFuerOrganisator(event, regs, { zugang = 'mitglied', zeit = appAnsicht.jetzt() } = {}) {
    const schichten = event.shifts || [];
    const schichtenNachId = Object.fromEntries(schichten.map(s => [s.id, s]));
    const anmeldungen = anmeldungenSortieren(regs.map(r => anmeldungFuerOrganisator(r, schichtenNachId)));

    // Belegung je Schicht wie in GET /events (approvedCount/pendingCount)
    const mitBelegung = schichten.map(s => {
        const dabei = regs.filter(r => Array.isArray(r.shift_ids) && r.shift_ids.includes(s.id));
        return {
            ...s,
            registrations: {
                approvedCount: dabei.filter(r => r.status === 'approved').length,
                pendingCount: dabei.filter(r => r.status === 'pending').length
            }
        };
    });
    const belegtePersonen = anmeldungen
        .filter(a => ['pending', 'approved'].includes(a.status))
        .reduce((s, a) => s + a.personen, 0);
    const mitApp = appAnsicht.anlassAnsicht({ ...event, shifts: mitBelegung },
        { belegtePersonen, kannBearbeiten: zugang !== 'organisator-login', zeit });

    const zeile = { ...mitApp };
    for (const f of OHNE_FELDER) delete zeile[f];
    // Die Belegung steht im app-Block der Schicht; die Zaehler oben braucht
    // niemand doppelt.
    zeile.shifts = mitApp.shifts.map(({ registrations, ...s }) => s);

    return {
        ...zeile,
        organisator: {
            aktuell: istAktuellFuerOrganisator(event, zeit),
            zahlen: zahlen(anmeldungen),
            aktionen: aktionen(zugang, event, anmeldungen),
            anmeldungen
        }
    };
}

// Aktuelle zuerst (Ideen ohne Datum am Ende der aktuellen), danach die eben
// vergangenen, die neusten zuerst.
function anlaesseSortieren(anlaesse) {
    const start = a => String(a.start_date || '');
    return [...anlaesse].sort((a, b) => {
        if (a.organisator.aktuell !== b.organisator.aktuell) return a.organisator.aktuell ? -1 : 1;
        if (a.organisator.aktuell) {
            if (a.app.datum_offen !== b.app.datum_offen) return a.app.datum_offen ? 1 : -1;
            return start(a).localeCompare(start(b)) || String(a.id).localeCompare(String(b.id));
        }
        return start(b).localeCompare(start(a)) || String(a.id).localeCompare(String(b.id));
    });
}

module.exports = {
    notizenLesen, anmeldungFuerOrganisator, anmeldungenSortieren, zahlen, aktionen,
    istAktuellFuerOrganisator, organisatorLoginGesperrt, anlassFuerOrganisator, anlaesseSortieren
};
