// Vorstandsrolle aus der Funktion eines Mitglieds.
//
// Bisher kam die Rolle aus dem Funktionspostfach, mit dem sich der Vorstand per
// IMAP anmeldete (kassier@... -> "kassier"). Mit dem persoenlichen Login
// (Authentik, Gruppe Vorstand) steht sie in der Mitgliederdatenbank, z.B.
// funktion = "Aktuar, Social Media". Die Rolle bestimmt das Webmail-Postfach
// (backend-dispatch imap-mail.js) und den Anzeigenamen.

const ROLLEN = [
    ['praesident', /pr(ä|ae)sident/i],
    ['aktuar', /aktuar/i],
    ['kassier', /kassier/i],
    ['materialwart', /materialwart/i],
    ['beisitzer', /beisitzer/i]
];

/** Alle Vorstandsrollen in der Funktion, in fester Reihenfolge. */
function vorstandsRollen(funktion) {
    if (typeof funktion !== 'string' || !funktion.trim()) return [];
    return ROLLEN.filter(([, muster]) => muster.test(funktion)).map(([rolle]) => rolle);
}

module.exports = { vorstandsRollen };
