/**
 * otp.js - OTP (One-Time-Password) Generierung und Verifizierung
 *
 * Verwendet für:
 * - Mitglieder-Registrierung (E-Mail-Verifizierung)
 * - Datenänderungen (Mutation-Bestätigung)
 * - Newsletter-Anmeldung (Token-Generierung)
 *
 * Speicherung: In-Memory (Map) - für Produktion besser Redis verwenden
 * Gültigkeit: 5 Minuten
 */
const crypto = require('crypto');  // Node.js Crypto für sichere Zufallszahlen

// ========== IN-MEMORY SPEICHER ==========
// Map: E-Mail -> { otp, data, expiresAt }
// Hinweis: Bei Server-Neustart gehen alle OTPs verloren!
const otpStore = new Map();

// OTP Gültigkeitsdauer: 5 Minuten in Millisekunden
const OTP_EXPIRY = 5 * 60 * 1000;

/**
 * Generiert einen kryptographisch sicheren 6-stelligen OTP-Code
 *
 * crypto.randomInt() ist sicherer als Math.random()
 * Bereich: 100000-999999 (immer 6 Stellen)
 *
 * @returns {string} 6-stelliger Code als String
 */
function generateOTP() {
    return crypto.randomInt(100000, 999999).toString();
}

/**
 * Generiert einen einmaligen Token (für Newsletter-Links etc.)
 *
 * 32 Bytes = 64 Hex-Zeichen = 256 Bit Entropie
 * Praktisch unmöglich zu erraten
 *
 * @returns {string} 64-stelliger Hex-Token
 */
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Speichert OTP mit zugehörigen Daten
 *
 * @param {string} email - E-Mail-Adresse (wird lowercase gespeichert)
 * @param {string} otp - Der 6-stellige Code
 * @param {Object} data - Zusätzliche Daten (z.B. memberData bei Registrierung)
 */
function storeOTP(email, otp, data = {}) {
    const key = email.toLowerCase();  // Case-insensitive
    otpStore.set(key, {
        otp,
        data,
        expiresAt: Date.now() + OTP_EXPIRY
    });

    // Automatische Bereinigung nach Ablauf (Memory-Leak-Prävention)
    setTimeout(() => otpStore.delete(key), OTP_EXPIRY);
}

/**
 * Verifiziert einen OTP-Code
 *
 * Prüft:
 * 1. Existiert ein OTP für diese E-Mail?
 * 2. Ist der OTP noch gültig (nicht abgelaufen)?
 * 3. Stimmt der Code überein?
 *
 * Bei Erfolg wird der OTP gelöscht (einmalige Verwendung)
 *
 * @param {string} email - E-Mail-Adresse
 * @param {string} otp - Eingegebener Code
 * @returns {Object|null} Gespeicherte Daten bei Erfolg, null bei Fehler
 */
function verifyOTP(email, otp) {
    const key = email.toLowerCase();
    const stored = otpStore.get(key);

    // Kein OTP für diese E-Mail vorhanden
    if (!stored) {
        return null;
    }

    // OTP abgelaufen
    if (Date.now() > stored.expiresAt) {
        otpStore.delete(key);
        return null;
    }

    // Falscher Code
    if (stored.otp !== otp) {
        return null;
    }

    // Erfolg: OTP löschen (One-Time-Use) und Daten zurückgeben
    otpStore.delete(key);
    return stored.data;
}

/**
 * Erzeugt SHA-256 Hash mit Salt
 *
 * Verwendet OTP_SECRET als Salt für zusätzliche Sicherheit
 * Nicht für Passwörter geeignet (dafür bcrypt/argon2 verwenden)
 *
 * @param {string} data - Zu hashende Daten
 * @returns {string} Hex-kodierter SHA-256 Hash
 */
function hash(data) {
    return crypto.createHash('sha256').update(data + process.env.OTP_SECRET).digest('hex');
}

module.exports = {
    generateOTP,
    generateToken,
    storeOTP,
    verifyOTP,
    hash
};
