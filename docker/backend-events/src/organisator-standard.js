// Ohne eigenen Organisator ist der Vorstand der Organisator eines Anlasses
// (Entscheid Stefan, 14.10.2026): Name "Vorstand", vorstand@fwv-raura.ch.
// So steht auf der Website und in der App immer jemand, und Meldungen an
// den Organisator gehen an den Vorstand.
//
// vorstand@ gilt im Backend schon als Vorstand-Adresse: kein Event-Login,
// keine Zugangsdaten. Die Mail "Du bist Organisator/in" geht fuer diese
// Vorgabe nicht raus - der Vorstand hat den Anlass ja selbst angelegt.

const STANDARD_ORGANISATOR = Object.freeze({
    organizer_name: 'Vorstand',
    organizer_email: 'vorstand@fwv-raura.ch'
});

const leer = v => v === undefined || v === null || String(v).trim() === '';

/** Hat der Anlass gar keinen Organisator (kein Mitglied, kein Name, keine E-Mail)? */
function ohneOrganisator(e) {
    return !!e && leer(e.organizer_id) && leer(e.organizer_name) && leer(e.organizer_email);
}

/** Ist das genau die Vorgabe (dann keine "Du bist Organisator"-Mail)? */
function istStandardOrganisator(e) {
    return !!e && leer(e.organizer_id) &&
        String(e.organizer_email || '').trim().toLowerCase() === STANDARD_ORGANISATOR.organizer_email &&
        String(e.organizer_name || '').trim() === STANDARD_ORGANISATOR.organizer_name;
}

module.exports = { STANDARD_ORGANISATOR, ohneOrganisator, istStandardOrganisator };
