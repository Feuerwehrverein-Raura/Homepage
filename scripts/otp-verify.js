#!/usr/bin/env node

/**
 * OTP Verification Handler for GitHub Workflows
 *
 * Verifies OTP and generates JWT token
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MEMBER_EMAIL = process.env.MEMBER_EMAIL;
const OTP_CODE = process.env.OTP_CODE;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const JWT_EXPIRY_SECONDS = 3600; // 1 hour

if (!MEMBER_EMAIL || !OTP_CODE) {
    console.error('❌ MEMBER_EMAIL and OTP_CODE environment variables are required');
    process.exit(1);
}

// Simple JWT generation (without external library)
function generateJWT(payload, secret, expirySeconds) {
    const header = {
        alg: 'HS256',
        typ: 'JWT'
    };

    const now = Math.floor(Date.now() / 1000);
    const jwtPayload = {
        ...payload,
        iat: now,
        exp: now + expirySeconds
    };

    const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
    const base64Payload = Buffer.from(JSON.stringify(jwtPayload)).toString('base64url');

    const signature = crypto
        .createHmac('sha256', secret)
        .update(`${base64Header}.${base64Payload}`)
        .digest('base64url');

    return `${base64Header}.${base64Payload}.${signature}`;
}

// Retrieve and verify OTP from otp-data branch
function verifyOTP(email, otp) {
    const emailHash = crypto.createHash('sha256').update(email.toLowerCase()).digest('hex');

    try {
        // Checkout otp-data branch
        execSync('git fetch origin otp-data:otp-data 2>/dev/null', { stdio: 'pipe' });
        execSync('git checkout otp-data', { stdio: 'pipe' });
    } catch (error) {
        console.error('❌ OTP-Daten nicht gefunden. Bitte fordern Sie einen neuen Code an.');
        process.exit(1);
    }

    // Read OTP file
    const otpFile = path.join(process.cwd(), '.otp', `${emailHash}.json`);

    if (!fs.existsSync(otpFile)) {
        console.error('❌ Kein OTP für diese E-Mail-Adresse gefunden');
        process.exit(1);
    }

    const otpData = JSON.parse(fs.readFileSync(otpFile, 'utf-8'));

    // Check expiry
    if (new Date(otpData.expires) < new Date()) {
        // Delete expired OTP
        fs.unlinkSync(otpFile);
        execSync('git add .otp/', { stdio: 'pipe' });
        execSync(`git commit -m "Remove expired OTP for ${email}" || true`, { stdio: 'pipe' });
        execSync('git push origin otp-data', { stdio: 'pipe' });

        console.error('❌ OTP ist abgelaufen. Bitte fordern Sie einen neuen Code an.');
        process.exit(1);
    }

    // Check attempts
    if (otpData.attempts >= 3) {
        // Delete OTP after too many attempts
        fs.unlinkSync(otpFile);
        execSync('git add .otp/', { stdio: 'pipe' });
        execSync(`git commit -m "Remove OTP for ${email} (too many attempts)" || true`, { stdio: 'pipe' });
        execSync('git push origin otp-data', { stdio: 'pipe' });

        console.error('❌ Zu viele Fehlversuche. Bitte fordern Sie einen neuen Code an.');
        process.exit(1);
    }

    // Verify OTP
    if (otpData.otp !== otp) {
        // Increment attempts
        otpData.attempts++;
        fs.writeFileSync(otpFile, JSON.stringify(otpData, null, 2));
        execSync('git add .otp/', { stdio: 'pipe' });
        execSync(`git commit -m "Increment OTP attempts for ${email}" || true`, { stdio: 'pipe' });
        execSync('git push origin otp-data', { stdio: 'pipe' });

        console.error(`❌ Ungültiger Code. Verbleibende Versuche: ${3 - otpData.attempts}`);
        process.exit(1);
    }

    // OTP is valid - delete it
    fs.unlinkSync(otpFile);
    execSync('git add .otp/', { stdio: 'pipe' });
    execSync(`git commit -m "Remove verified OTP for ${email}" || true`, { stdio: 'pipe' });
    execSync('git push origin otp-data', { stdio: 'pipe' });

    return otpData;
}

async function main() {
    console.log('🔐 OTP Verification System');
    console.log(`📧 E-Mail: ${MEMBER_EMAIL}`);
    console.log(`🔢 Code: ${OTP_CODE.substring(0, 3)}***`);

    // Verify OTP
    console.log('🔍 Verifiziere OTP...');
    const otpData = verifyOTP(MEMBER_EMAIL, OTP_CODE);
    console.log('✅ OTP verifiziert');

    // Generate JWT
    console.log('🎫 Generiere JWT Token...');
    const token = generateJWT(
        {
            email: otpData.email,
            role: otpData.role,
            member: otpData.member
        },
        JWT_SECRET,
        JWT_EXPIRY_SECONDS
    );

    // Output result as JSON for GitHub Actions to capture
    const result = {
        success: true,
        token,
        role: otpData.role,
        expiresIn: JWT_EXPIRY_SECONDS,
        member: otpData.member
    };

    console.log('✅ Authentifizierung erfolgreich');
    console.log('');
    console.log('📋 RESULT_JSON (capture this in workflow):');
    console.log(JSON.stringify(result));

    // Also write to output file for GitHub Actions
    const outputFile = process.env.GITHUB_OUTPUT;
    if (outputFile) {
        fs.appendFileSync(outputFile, `token=${token}\n`);
        fs.appendFileSync(outputFile, `role=${otpData.role}\n`);
        fs.appendFileSync(outputFile, `result=${JSON.stringify(result)}\n`);
    }
}

main().catch(error => {
    console.error('❌ Fehler:', error.message);
    console.error(error.stack);
    process.exit(1);
});
