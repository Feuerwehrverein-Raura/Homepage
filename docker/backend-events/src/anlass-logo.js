// Logos fuer wiederkehrende Anlaesse ("Reihen"): Fasnacht, Chilbi,
// Preisjassen und Weihnachtshock kommen jedes Jahr wieder und sollen ueberall
// gleich aussehen - App, Website, E-Mails.
//
// Erkannt wird die Reihe am Titel ("Fasnachtsauftakt 2027" -> fasnacht).
// Bewusst eng: "Weihnachtsessen" oder "Jassabend" bekommen kein Logo.
// Ein eigenes Bild am Anlass (image_url) geht immer vor. Die Bilder liegen auf
// der Website unter /images/anlaesse/<reihe>.png (512x512, PNG); die ersten
// sind Platzhalter vom 13.10.2026 und lassen sich durch echte Logos mit
// gleichem Dateinamen ersetzen.

const LOGO_BASIS = 'https://www.fwv-raura.ch/images/anlaesse/';

const REIHEN = [
    { reihe: 'fasnacht', name: 'Fasnacht', muster: /fasnacht/i },
    { reihe: 'chilbi', name: 'Chilbi', muster: /chilbi/i },
    { reihe: 'preisjassen', name: 'Preisjassen', muster: /preisjass/i },
    { reihe: 'weihnachtshock', name: 'Weihnachtshock', muster: /weihnachtshock/i },
];

/** Reihe eines Anlasses oder null. */
function anlassReihe(event) {
    const titel = String(event?.title || '');
    return REIHEN.find(r => r.muster.test(titel)) || null;
}

/** Bild fuer den Anlass: eigenes Bild, sonst das Logo der Reihe, sonst null. */
function anlassLogo(event) {
    const eigenes = typeof event?.image_url === 'string' ? event.image_url.trim() : '';
    if (/^https:\/\//i.test(eigenes)) return eigenes;
    const r = anlassReihe(event);
    return r ? `${LOGO_BASIS}${r.reihe}.png` : null;
}

module.exports = { anlassReihe, anlassLogo, REIHEN, LOGO_BASIS };
