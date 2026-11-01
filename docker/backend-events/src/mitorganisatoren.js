// DEUTSCH: Mitorganisatoren eines Anlasses (Tabelle event_organizers).
//
// Ein Anlass hat einen Haupt-Organisator (events.organizer_id bzw.
// organizer_name/organizer_email, Kontaktperson in Mails, Arbeitsplan und auf
// der Website) und beliebig viele Mitorganisatoren, die die Arbeit teilen.
// Mitorganisatoren haben dieselben Rechte wie der Haupt-Organisator
// (Anmeldungen, Schichten, Notizen, Material, Informieren, Anlass bearbeiten);
// nur der Vorstand aendert den Haupt-Organisator oder loescht den Anlass.
// Mitorganisatoren hinzufuegen und entfernen duerfen der Vorstand und der
// Haupt-Organisator.
//
// Ein Mitorganisator ist ein Mitglied (member_id, verwaltet den Anlass in der
// Mitglieder-App) oder extern (Name + E-Mail) mit EIGENEM Login fuers
// Event-Dashboard: eigene E-Mail, eigenes Passwort, eigenes Ablaufdatum.
//
// Hier nur reine Funktionen ohne Datenbank (test/mitorganisatoren.test.js);
// die Routen stehen in index.js (GET/POST/DELETE /events/:id/organizers).

const crypto = require('crypto');

// Schema: beim Start angelegt (wie event_organizer_notes) und als Migration
// 028 fuer frisch gebaute Datenbanken.
const SCHEMA_SQL = [
    `CREATE TABLE IF NOT EXISTS event_organizers (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        member_id UUID REFERENCES members(id) ON DELETE CASCADE,
        name VARCHAR(200),
        email VARCHAR(200),
        password_hash TEXT,
        access_expires TIMESTAMP,
        created_by VARCHAR(200),
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT event_organizers_mitglied_oder_extern
            CHECK (member_id IS NOT NULL OR (name IS NOT NULL AND email IS NOT NULL))
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_event_organizers_mitglied
        ON event_organizers(event_id, member_id) WHERE member_id IS NOT NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_event_organizers_email
        ON event_organizers(event_id, LOWER(email)) WHERE member_id IS NULL`,
    `CREATE INDEX IF NOT EXISTS idx_event_organizers_member ON event_organizers(member_id)`,
    `CREATE INDEX IF NOT EXISTS idx_event_organizers_email ON event_organizers(LOWER(email))`,
    // Links "Passwort festlegen" (passwortLinkMail): statt ein Passwort per
    // Mail zu schicken, legt der Organisator es selbst fest. organizer_id NULL
    // = Haupt-Organisator (events.event_password_hash). Gespeichert ist nur
    // der SHA-256 des Tokens.
    `CREATE TABLE IF NOT EXISTS organisator_passwort_links (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        token_hash TEXT NOT NULL UNIQUE,
        event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        organizer_id UUID REFERENCES event_organizers(id) ON DELETE CASCADE,
        gueltig_bis TIMESTAMP NOT NULL,
        benutzt_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
    )`
];

// Passwort der externen Mitorganisatoren: scrypt mit eigenem Salz (nicht wie
// event_password_hash ungesalzenes SHA-256). Format "scrypt$<salz>$<hash>".
function passwortHashen(passwort) {
    const salz = crypto.randomBytes(16);
    const hash = crypto.scryptSync(String(passwort), salz, 32);
    return `scrypt$${salz.toString('hex')}$${hash.toString('hex')}`;
}

function passwortPruefen(passwort, gespeichert) {
    if (typeof passwort !== 'string' || typeof gespeichert !== 'string') return false;
    const [art, salzHex, hashHex] = gespeichert.split('$');
    if (art !== 'scrypt' || !salzHex || !hashHex) return false;
    const soll = Buffer.from(hashHex, 'hex');
    if (soll.length !== 32) return false;
    const ist = crypto.scryptSync(passwort, Buffer.from(salzHex, 'hex'), 32);
    return crypto.timingSafeEqual(ist, soll);
}

// Passwort des Haupt-Organisators (events.event_password_hash): neu wie bei
// den Mitorganisatoren scrypt mit Salz, aeltere Zugaenge noch ungesalzenes
// SHA-256 (64 Hex-Zeichen) - beides wird angenommen.
function hauptPasswortPruefen(passwort, gespeichert) {
    if (typeof passwort !== 'string' || typeof gespeichert !== 'string') return false;
    if (gespeichert.startsWith('scrypt$')) return passwortPruefen(passwort, gespeichert);
    if (!/^[0-9a-f]{64}$/.test(gespeichert)) return false;
    const ist = crypto.createHash('sha256').update(passwort).digest();
    return crypto.timingSafeEqual(ist, Buffer.from(gespeichert, 'hex'));
}

// Selbst gewaehltes Passwort: mindestens 10 Zeichen.
function passwortGenuegt(passwort) {
    return typeof passwort === 'string' && passwort.length >= 10 && passwort.length <= 200;
}

// Link "Passwort festlegen": 14 Tage gueltig, einmal benutzbar.
const LINK_TAGE = 14;
function linkToken() {
    const token = crypto.randomBytes(32).toString('base64url');
    return { token, hash: tokenHash(token) };
}
function tokenHash(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
}
function linkAdresse(token) {
    return `https://www.fwv-raura.ch/event-dashboard.html?passwort=${encodeURIComponent(token)}`;
}

// Zufaelliges Passwort (16 Zeichen, wie beim Haupt-Organisator).
function neuesPasswort() {
    return crypto.randomBytes(12).toString('base64url').slice(0, 16);
}

// Zugang gilt bis 3 Monate nach dem Ende (sonst Beginn) — wie beim
// Haupt-Organisator (POST /events, create_access).
function zugangBis(event) {
    const basis = new Date(event.end_date || event.start_date || Date.now());
    const bis = new Date(Number.isNaN(basis.getTime()) ? Date.now() : basis);
    bis.setMonth(bis.getMonth() + 3);
    return bis;
}

const EMAIL_MUSTER = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function emailGueltig(email) {
    return typeof email === 'string' && EMAIL_MUSTER.test(email.trim());
}

// Mail mit dem Zugang zum Event-Dashboard: Login-Adresse und ein Link, mit
// dem die Person ihr Passwort selbst festlegt - kein Passwort im Klartext.
// Gleicher Text fuer den externen Haupt-Organisator und externe
// Mitorganisatoren (rolle 'Mitorganisator').
function passwortLinkMail({ name, titel, loginEmail, link, gueltigBis, rolle = 'Organisator' }) {
    return {
        subject: `Ihr Zugang fuer ${titel}`,
        body: `
Guten Tag ${name || rolle},

Sie wurden als ${rolle} fuer das Event "${titel}" eingetragen.

Ihr Login fuer das Event-Dashboard (https://www.fwv-raura.ch/event-dashboard.html):
E-Mail: ${loginEmail}

Bitte legen Sie Ihr Passwort selbst fest - der Link gilt ${LINK_TAGE} Tage:
${link}

Abgelaufen? Im Event-Dashboard unter "Passwort vergessen?" bekommen Sie einen neuen Link.

Der Zugang ist gueltig bis ${new Date(gueltigBis).toLocaleDateString('de-CH')}.

Bei Fragen wenden Sie sich bitte an den Vorstand.

Mit freundlichen Gruessen
Feuerwehrverein Raura
        `.trim()
    };
}

// Mail an ein Mitglied, das Mitorganisator wurde (verwaltet den Anlass in
// der Mitglieder-App, kein eigener Login noetig).
function mitgliedMail({ name, titel, eventUrl, hauptorganisator }) {
    return {
        subject: `Du bist Mitorganisator/in: ${titel}`,
        body: `Hallo ${name || 'Mitorganisator/in'},

Du wurdest als Mitorganisator/in fuer den Anlass "${titel}" eingetragen${hauptorganisator ? ` (Organisator/in: ${hauptorganisator})` : ''}.

Du kannst den Anlass direkt in der Mitglieder-App unter "Organisator" verwalten — Anmeldungen einsehen und bestaetigen, Schichten, Notizen und Material, Teilnehmerliste als PDF.

Eventseite:
${eventUrl}

Freundliche Gruesse
Feuerwehrverein Raura`
    };
}

// Ein Eintrag fuer GET /events/:id/organizers (Zeile + Mitglied aus dem JOIN).
function eintragAnsicht(zeile) {
    const mitglied = !!zeile.member_id;
    const mitgliedName = [zeile.member_vorname, zeile.member_nachname].filter(Boolean).join(' ').trim();
    return {
        id: zeile.id,
        art: mitglied ? 'mitglied' : 'extern',
        member_id: zeile.member_id || null,
        name: (mitglied ? mitgliedName : '') || zeile.name || zeile.member_email || zeile.email || 'Ohne Namen',
        email: (mitglied ? zeile.member_email : zeile.email) || null,
        zugang_bis: mitglied ? null : (zeile.access_expires || null),
        hinzugefuegt_von: zeile.created_by || null,
        hinzugefuegt_am: zeile.created_at || null
    };
}

// E-Mail-Adressen fuer Benachrichtigungen: Haupt-Empfaenger plus alle
// Mitorganisatoren, ohne Doppelte (Gross-/Kleinschreibung egal) und ohne
// die Adresse dessen, der die Aenderung selbst gemacht hat.
function empfaengerListe(haupt, weitere = [], ohne = []) {
    const gesehen = new Set((ohne || []).filter(Boolean).map(e => String(e).trim().toLowerCase()));
    const liste = [];
    for (const e of [...(Array.isArray(haupt) ? haupt : [haupt]), ...(weitere || [])]) {
        const t = (e || '').trim();
        if (!t || gesehen.has(t.toLowerCase())) continue;
        gesehen.add(t.toLowerCase());
        liste.push(t);
    }
    return liste;
}

module.exports = {
    SCHEMA_SQL, passwortHashen, passwortPruefen, hauptPasswortPruefen, passwortGenuegt, neuesPasswort,
    zugangBis, emailGueltig, LINK_TAGE, linkToken, tokenHash, linkAdresse,
    passwortLinkMail, mitgliedMail, eintragAnsicht, empfaengerListe
};
