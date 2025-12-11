const crypto = require('crypto');

// In-memory OTP storage (in production, use Redis or database)
const otpStore = new Map();

// OTP expiry time (5 minutes)
const OTP_EXPIRY = 5 * 60 * 1000;

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
 * Store OTP with email
 * @param {string} email
 * @param {string} otp
 * @param {Object} data - Additional data to store
 */
function storeOTP(email, otp, data = {}) {
    const key = email.toLowerCase();
    otpStore.set(key, {
        otp,
        data,
        expiresAt: Date.now() + OTP_EXPIRY
    });

    // Auto-cleanup after expiry
    setTimeout(() => otpStore.delete(key), OTP_EXPIRY);
}

/**
 * Verify OTP
 * @param {string} email
 * @param {string} otp
 * @returns {Object|null} Stored data if valid, null otherwise
 */
function verifyOTP(email, otp) {
    const key = email.toLowerCase();
    const stored = otpStore.get(key);

    if (!stored) {
        return null;
    }

    if (Date.now() > stored.expiresAt) {
        otpStore.delete(key);
        return null;
    }

    if (stored.otp !== otp) {
        return null;
    }

    // OTP is valid, delete it (one-time use)
    otpStore.delete(key);
    return stored.data;
}

/**
 * Hash password or data
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
