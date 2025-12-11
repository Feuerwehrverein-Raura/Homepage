const crypto = require('crypto');
const { runQuery, getQuery } = require('./database');

// OTP expiry time (5 minutes)
const OTP_EXPIRY_MINUTES = 5;

/**
 * Generate 6-digit OTP
 */
function generateOTP() {
    return crypto.randomInt(100000, 999999).toString();
}

/**
 * Generate unique token
 */
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Store OTP with email in database
 * @param {string} email
 * @param {string} otp
 * @param {Object} data - Additional data to store
 */
async function storeOTP(email, otp, data = {}) {
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

    await runQuery(
        `INSERT OR REPLACE INTO otp_codes (email, otp, data, expires_at)
         VALUES (?, ?, ?, ?)`,
        [email.toLowerCase(), otp, JSON.stringify(data), expiresAt]
    );
}

/**
 * Verify OTP from database
 * @param {string} email
 * @param {string} otp
 * @returns {Object|null} Stored data if valid, null otherwise
 */
async function verifyOTP(email, otp) {
    const key = email.toLowerCase();

    const stored = await getQuery(
        'SELECT * FROM otp_codes WHERE email = ? AND otp = ?',
        [key, otp]
    );

    if (!stored) {
        return null;
    }

    // Check expiry
    if (new Date(stored.expires_at) < new Date()) {
        // Delete expired OTP
        await runQuery('DELETE FROM otp_codes WHERE email = ?', [key]);
        return null;
    }

    // OTP is valid, delete it (one-time use)
    await runQuery('DELETE FROM otp_codes WHERE email = ?', [key]);

    return JSON.parse(stored.data);
}

/**
 * Clean up expired OTPs (run periodically)
 */
async function cleanupExpiredOTPs() {
    await runQuery('DELETE FROM otp_codes WHERE expires_at < datetime("now")');
}

// Run cleanup every 10 minutes
setInterval(cleanupExpiredOTPs, 10 * 60 * 1000);

/**
 * Hash password or data
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
