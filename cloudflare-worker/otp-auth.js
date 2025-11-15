/**
 * Cloudflare Worker for OTP Authentication
 *
 * Endpoints:
 * - POST /api/auth/request-otp - Request OTP code
 * - POST /api/auth/verify-otp - Verify OTP and get JWT
 * - POST /api/auth/logout - Logout (client-side)
 *
 * Environment Variables:
 * - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 * - JWT_SECRET
 * - GITHUB_TOKEN, GITHUB_REPO
 */

import { SignJWT, jwtVerify } from 'jose';

const OTP_EXPIRY = 10 * 60 * 1000; // 10 minutes
const JWT_EXPIRY = 1 * 60 * 60; // 1 hour in seconds

// CORS headers
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * Generate 6-digit OTP
 */
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Send OTP email via Mailcow SMTP
 */
async function sendOTPEmail(env, email, otp) {
    const mailContent = `From: "Feuerwehrverein Raura" <${env.FROM_EMAIL || 'mitglieder@fwv-raura.ch'}>
To: ${email}
Subject: Ihr Login-Code für den Mitgliederbereich
Content-Type: text/html; charset=UTF-8

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
            <h1>Feuerwehrverein Raura</h1>
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
                <li>Dieser Code ist 10 Minuten gültig</li>
                <li>Geben Sie den Code niemals an Dritte weiter</li>
            </ul>
        </div>
        <div class="footer">
            <p>Feuerwehrverein Raura Kaiseraugst | www.fwv-raura.ch</p>
        </div>
    </div>
</body>
</html>`;

    // Send via SMTP (Mailcow)
    const smtpUrl = `smtp://${env.SMTP_USER}:${env.SMTP_PASS}@${env.SMTP_HOST}:${env.SMTP_PORT}`;

    // Note: Cloudflare Workers don't support SMTP directly
    // Use a service like Mailchannels or Resend
    // For now, we'll use Resend API which is free for 3000 emails/month
    const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${env.RESEND_API_KEY || env.SMTP_PASS}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: env.FROM_EMAIL || 'mitglieder@fwv-raura.ch',
            to: [email],
            subject: 'Ihr Login-Code für den Mitgliederbereich',
            html: mailContent.split('\n\n')[1], // Extract HTML part
        }),
    });

    if (!resendResponse.ok) {
        throw new Error('Failed to send email');
    }
}

/**
 * Fetch member data from GitHub
 */
async function fetchMemberData(env) {
    const response = await fetch(
        `https://api.github.com/repos/${env.GITHUB_REPO}/contents/mitglieder_data.json`,
        {
            headers: {
                'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3.raw',
                'User-Agent': 'OTP-Auth-Worker',
            },
        }
    );

    if (!response.ok) {
        throw new Error('Failed to fetch member data');
    }

    return await response.json();
}

/**
 * Check if member is Vorstand
 */
function isVorstand(member) {
    const vorstandFunctions = ['Vorstand', 'Präsident', 'Kassier', 'Aktuar', 'Materialwart', 'Revisor'];
    return vorstandFunctions.some(func =>
        (member.Funktion || '').toLowerCase().includes(func.toLowerCase())
    );
}

/**
 * Create JWT token
 */
async function createJWT(env, email, role) {
    const secret = new TextEncoder().encode(env.JWT_SECRET);

    const jwt = await new SignJWT({ email, role })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${JWT_EXPIRY}s`)
        .sign(secret);

    return jwt;
}

/**
 * Verify JWT token
 */
async function verifyJWT(env, token) {
    try {
        const secret = new TextEncoder().encode(env.JWT_SECRET);
        const { payload } = await jwtVerify(token, secret);
        return payload;
    } catch (error) {
        return null;
    }
}

/**
 * Handle request
 */
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            // Route handling
            if (url.pathname === '/api/auth/request-otp' && request.method === 'POST') {
                return await handleRequestOTP(request, env, ctx);
            } else if (url.pathname === '/api/auth/verify-otp' && request.method === 'POST') {
                return await handleVerifyOTP(request, env, ctx);
            } else if (url.pathname === '/health') {
                return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }

            return new Response('Not Found', { status: 404, headers: corsHeaders });
        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }
    },
};

/**
 * Handle OTP request
 */
async function handleRequestOTP(request, env, ctx) {
    const { email } = await request.json();

    if (!email) {
        return new Response(JSON.stringify({ error: 'E-Mail ist erforderlich' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // Fetch member data
    const members = await fetchMemberData(env);
    const member = members.find(m =>
        m['E-Mail'] && m['E-Mail'].toLowerCase() === email.toLowerCase()
    );

    if (!member) {
        return new Response(JSON.stringify({ error: 'E-Mail-Adresse nicht gefunden' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // Check if member is active
    if (member.Status !== 'Aktivmitglied' && member.Status !== 'Ehrenmitglied') {
        return new Response(JSON.stringify({ error: 'Ihr Mitgliedsstatus erlaubt keinen Zugriff' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // Generate OTP
    const otp = generateOTP();
    const expires = Date.now() + OTP_EXPIRY;

    // Store OTP in KV
    await env.OTP_STORE.put(email.toLowerCase(), JSON.stringify({ otp, expires, attempts: 0 }), {
        expirationTtl: OTP_EXPIRY / 1000,
    });

    // Send email
    await sendOTPEmail(env, email, otp);

    return new Response(JSON.stringify({
        success: true,
        message: 'Code wurde per E-Mail versendet',
        expiresIn: OTP_EXPIRY / 1000,
    }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

/**
 * Handle OTP verification
 */
async function handleVerifyOTP(request, env, ctx) {
    const { email, otp } = await request.json();

    if (!email || !otp) {
        return new Response(JSON.stringify({ error: 'E-Mail und Code sind erforderlich' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // Get stored OTP
    const storedDataStr = await env.OTP_STORE.get(email.toLowerCase());

    if (!storedDataStr) {
        return new Response(JSON.stringify({ error: 'Kein Code angefordert oder Code abgelaufen' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const storedData = JSON.parse(storedDataStr);

    // Check expiry
    if (storedData.expires < Date.now()) {
        await env.OTP_STORE.delete(email.toLowerCase());
        return new Response(JSON.stringify({ error: 'Code ist abgelaufen' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // Check attempts
    if (storedData.attempts >= 3) {
        await env.OTP_STORE.delete(email.toLowerCase());
        return new Response(JSON.stringify({ error: 'Zu viele Fehlversuche' }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // Verify OTP
    if (storedData.otp !== otp) {
        storedData.attempts++;
        await env.OTP_STORE.put(email.toLowerCase(), JSON.stringify(storedData), {
            expirationTtl: (storedData.expires - Date.now()) / 1000,
        });
        return new Response(JSON.stringify({ error: 'Ungültiger Code' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // OTP verified - delete it
    await env.OTP_STORE.delete(email.toLowerCase());

    // Get member data
    const members = await fetchMemberData(env);
    const member = members.find(m =>
        m['E-Mail'] && m['E-Mail'].toLowerCase() === email.toLowerCase()
    );

    const role = isVorstand(member) ? 'vorstand' : 'member';
    const token = await createJWT(env, email.toLowerCase(), role);

    return new Response(JSON.stringify({
        success: true,
        token,
        role,
        expiresIn: JWT_EXPIRY,
        member: {
            name: member.Mitglied,
            vorname: member.Vorname,
            nachname: member.Name,
            email: member['E-Mail'],
        },
    }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}
