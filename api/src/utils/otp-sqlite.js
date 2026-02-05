/**
 * otp-sqlite.js - Persistente OTP-Speicherung in SQLite
 *
 * Im Gegensatz zu otp.js (In-Memory) werden OTPs hier in der
 * SQLite-Datenbank gespeichert. Vorteile:
 * - OTPs überleben Server-Neustarts
 * - Skalierbar über mehrere Server-Instanzen
 *
 * Tabelle: otp_codes (email, otp, data, expires_at, created_at)
 */
const crypto = require('crypto');  // Für sichere Zufallszahlen
const { runQuery, getQuery } = require('./database');  // SQLite-Wrapper

// OTP Gültigkeitsdauer: 5 Minuten
const OTP_EXPIRY_MINUTES = 5;

/**
 * Generiert 6-stelligen OTP-Code
 * @returns {string} Sicherer 6-stelliger Zahlencode
 */
function generateOTP() {
    return crypto.randomInt(100000, 999999).toString();
}

/**
 * Generiert einmaligen Token (64 Hex-Zeichen)
 * @returns {string} Kryptographisch sicherer Token
 */
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Speichert OTP mit E-Mail in der Datenbank
 *
 * Verwendet INSERT OR REPLACE um vorherige OTPs zu überschreiben
 *
 * @param {string} email - E-Mail-Adresse (wird lowercase gespeichert)
 * @param {string} otp - Der 6-stellige Code
 * @param {Object} data - Zusätzliche Daten (z.B. memberData)
 */
async function storeOTP(email, otp, data = {}) {
    // Berechne Ablaufzeit
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

    // INSERT OR REPLACE ersetzt vorhandene OTPs für diese E-Mail
    await runQuery(
        `INSERT OR REPLACE INTO otp_codes (email, otp, data, expires_at)
         VALUES (?, ?, ?, ?)`,
        [email.toLowerCase(), otp, JSON.stringify(data), expiresAt]
    );
}

/**
 * Verifiziert OTP aus der Datenbank
 *
 * Prüft:
 * 1. Existiert OTP für E-Mail?
 * 2. Stimmt der Code?
 * 3. Ist er noch gültig?
 *
 * Bei Erfolg oder Ablauf wird der OTP gelöscht.
 *
 * @param {string} email - E-Mail-Adresse
 * @param {string} otp - Eingegebener Code
 * @returns {Object|null} Gespeicherte Daten bei Erfolg, null bei Fehler
 */
async function verifyOTP(email, otp) {
    const key = email.toLowerCase();

    // Suche OTP in Datenbank
    const stored = await getQuery(
        'SELECT * FROM otp_codes WHERE email = ? AND otp = ?',
        [key, otp]
    );

    if (!stored) {
        return null;  // Kein OTP gefunden oder falscher Code
    }

    // Prüfe Ablaufzeit
    if (new Date(stored.expires_at) < new Date()) {
        // OTP abgelaufen -> löschen
        await runQuery('DELETE FROM otp_codes WHERE email = ?', [key]);
        return null;
    }

    // OTP gültig -> löschen (One-Time-Use)
    await runQuery('DELETE FROM otp_codes WHERE email = ?', [key]);

    // Gespeicherte Daten zurückgeben
    return JSON.parse(stored.data);
}

/**
 * Bereinigt abgelaufene OTPs (wird periodisch ausgeführt)
 * Entfernt alle OTPs mit expires_at < jetzt
 */
async function cleanupExpiredOTPs() {
    await runQuery('DELETE FROM otp_codes WHERE expires_at < datetime("now")');
}

// Automatische Bereinigung alle 10 Minuten
setInterval(cleanupExpiredOTPs, 10 * 60 * 1000);

/**
 * Erzeugt SHA-256 Hash mit Salt
 * @param {string} data - Zu hashende Daten
 * @returns {string} Hex-kodierter Hash
 */
function hash(data) {
    return crypto.createHash('sha256').update(data + (process.env.OTP_SECRET || '')).digest('hex');
}

module.exports = {
    generateOTP,
    generateToken,
    storeOTP,
    verifyOTP,
    cleanupExpiredOTPs,
    hash
};
