#!/usr/bin/env node

/**
 * OTP Request Handler for GitHub Workflows
 *
 * Generates OTP, sends via email, stores in otp-data branch
 */

const nodemailer = require('nodemailer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SMTP_HOST = process.env.SMTP_HOST || 'mail.fwv-raura.ch';
const SMTP_PORT = process.env.SMTP_PORT || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const FROM_EMAIL = process.env.FROM_EMAIL || 'alle@fwv-raura.ch';
const MEMBER_EMAIL = process.env.MEMBER_EMAIL;
const OTP_EXPIRY_MINUTES = 10;

if (!MEMBER_EMAIL) {
    console.error('❌ MEMBER_EMAIL environment variable is required');
    process.exit(1);
}

if (!SMTP_USER || !SMTP_PASS) {
    console.error('❌ SMTP_USER and SMTP_PASS environment variables are required');
    process.exit(1);
}

// Generate 6-digit OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP email
async function sendOTPEmail(email, otp) {
    const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT == 465,
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASS
        }
    });

    const mailOptions = {
        from: `"Feuerwehrverein Raura" <${FROM_EMAIL}>`,
        to: email,
        subject: 'Ihr Login-Code für den Mitgliederbereich',
        html: `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
        .content { background: #f9f9f9; padding: 30px; }
        .otp-box { background: white; border: 2px solid #dc2626; padding: 20px; text-align: center; margin: 20px 0; }
        .otp-code { font-size: 32px; font-weight: bold; color: #dc2626; letter-spacing: 5px; }
        .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Feuerwehrverein Raura Kaiseraugst</h1>
        </div>
        <div class="content">
            <h2>Ihr Login-Code</h2>
            <p>Sie haben einen Login-Code für den Mitgliederbereich angefordert.</p>

            <div class="otp-box">
                <p>Ihr Code lautet:</p>
                <div class="otp-code">${otp}</div>
            </div>

            <p><strong>Wichtig:</strong></p>
            <ul>
                <li>Dieser Code ist ${OTP_EXPIRY_MINUTES} Minuten gültig</li>
                <li>Geben Sie den Code niemals an Dritte weiter</li>
                <li>Falls Sie diese E-Mail nicht angefordert haben, ignorieren Sie sie bitte</li>
            </ul>
        </div>
        <div class="footer">
            <p>Feuerwehrverein Raura Kaiseraugst<br>
            www.fwv-raura.ch</p>
        </div>
    </div>
</body>
</html>
        `
    };

    await transporter.sendMail(mailOptions);
}

// Store OTP in otp-data branch
function storeOTP(email, otp, memberData) {
    const emailHash = crypto.createHash('sha256').update(email.toLowerCase()).digest('hex');
    const expires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

    const otpData = {
        email: email.toLowerCase(),
        otp,
        expires,
        attempts: 0,
        role: memberData.role,
        member: {
            name: memberData.Mitglied,
            vorname: memberData.Vorname,
            nachname: memberData.Name,
            email: memberData['E-Mail']
        }
    };

    // Setup otp-data branch
    try {
        execSync('git fetch origin otp-data:otp-data 2>/dev/null || git checkout -b otp-data', { stdio: 'inherit' });
        execSync('git checkout otp-data', { stdio: 'inherit' });
    } catch (error) {
        // Branch doesn't exist, create it
        execSync('git checkout --orphan otp-data', { stdio: 'inherit' });
        execSync('git rm -rf . 2>/dev/null || true', { stdio: 'inherit' });
    }

    // Create .otp directory if it doesn't exist
    const otpDir = path.join(process.cwd(), '.otp');
    if (!fs.existsSync(otpDir)) {
        fs.mkdirSync(otpDir, { recursive: true });
    }

    // Write OTP file
    const otpFile = path.join(otpDir, `${emailHash}.json`);
    fs.writeFileSync(otpFile, JSON.stringify(otpData, null, 2));

    // Commit and push
    execSync('git add .otp/', { stdio: 'inherit' });
    execSync(`git commit -m "Store OTP for ${email}" || true`, { stdio: 'inherit' });
    execSync('git push -u origin otp-data', { stdio: 'inherit' });

    console.log(`✅ OTP stored in otp-data branch`);
}

async function main() {
    console.log('🔐 OTP Request System');
    console.log(`📧 E-Mail: ${MEMBER_EMAIL}`);

    // Load member data
    const memberDataPath = path.join(__dirname, '..', 'mitglieder_data.json');
    const members = JSON.parse(fs.readFileSync(memberDataPath, 'utf-8'));

    // Find member
    const member = members.find(m =>
        m['E-Mail'] && m['E-Mail'].toLowerCase() === MEMBER_EMAIL.toLowerCase()
    );

    if (!member) {
        console.error('❌ E-Mail-Adresse nicht in Mitgliederdaten gefunden');
        process.exit(1);
    }

    // Check if member is active
    if (member.Status !== 'Aktivmitglied' && member.Status !== 'Ehrenmitglied') {
        console.error('❌ Ihr Mitgliedsstatus erlaubt keinen Zugriff');
        process.exit(1);
    }

    // Determine role
    const vorstandFunctions = ['Vorstand', 'Präsident', 'Kassier', 'Aktuar', 'Materialwart', 'Revisor'];
    const isVorstand = vorstandFunctions.some(func =>
        (member.Funktion || '').toLowerCase().includes(func.toLowerCase())
    );
    member.role = isVorstand ? 'vorstand' : 'member';

    console.log(`👤 Mitglied: ${member.Mitglied} (${member.role})`);

    // Generate OTP
    const otp = generateOTP();
    console.log(`🔢 OTP generiert: ${otp.substring(0, 3)}***`);

    // Send email
    console.log('📧 Sende E-Mail...');
    await sendOTPEmail(MEMBER_EMAIL, otp);
    console.log('✅ E-Mail versendet');

    // Store OTP
    console.log('💾 Speichere OTP...');
    storeOTP(MEMBER_EMAIL, otp, member);

    console.log('✅ OTP-Request erfolgreich abgeschlossen');
    console.log(`⏱️  Code gültig für ${OTP_EXPIRY_MINUTES} Minuten`);
}

main().catch(error => {
    console.error('❌ Fehler:', error.message);
    process.exit(1);
});
