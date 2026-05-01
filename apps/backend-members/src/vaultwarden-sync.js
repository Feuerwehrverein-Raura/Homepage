const crypto = require('crypto');
const https = require('https');
const http = require('http');

const VAULTWARDEN_URL = process.env.VAULTWARDEN_URL || 'https://vault.fwv-raura.ch';
const VAULTWARDEN_EMAIL = process.env.VAULTWARDEN_SYNC_EMAIL || 'vaultwarden-sync@fwv-raura.ch';
const VAULTWARDEN_PASSWORD = process.env.VAULTWARDEN_SYNC_PASSWORD;
const VAULTWARDEN_ORG_ID = process.env.VAULTWARDEN_ORG_ID || 'dbc02839-7b9c-4003-8285-1b64cb1d521a';
const VAULTWARDEN_COLLECTION_ID = process.env.VAULTWARDEN_COLLECTION_ID || '62cec13c-7300-4637-b5f6-bd9f9f1e02f6';
const KDF_ITERATIONS = 600000;
const CLIENT_VERSION = '2026.2.0';

function log(level, message, data = {}) {
    console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'vaultwarden-sync',
        level, message, ...data
    }));
}

function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const mod = parsed.protocol === 'https:' ? https : http;
        const headers = {
            'Bitwarden-Client-Version': CLIENT_VERSION,
            ...options.headers
        };
        const req = mod.request(url, {
            method: options.method || 'GET',
            headers,
            rejectUnauthorized: false
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 400) {
                    reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
                } else {
                    try { resolve(JSON.parse(data)); }
                    catch { resolve(data); }
                }
            });
        });
        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
    });
}

async function getAccessToken() {
    if (!VAULTWARDEN_PASSWORD) {
        throw new Error('VAULTWARDEN_SYNC_PASSWORD not set');
    }

    const masterKey = crypto.pbkdf2Sync(
        VAULTWARDEN_PASSWORD, VAULTWARDEN_EMAIL.toLowerCase(),
        KDF_ITERATIONS, 32, 'sha256'
    );
    const masterPwHash = crypto.pbkdf2Sync(
        masterKey, VAULTWARDEN_PASSWORD,
        1, 32, 'sha256'
    ).toString('base64');

    const body = new URLSearchParams({
        grant_type: 'password',
        username: VAULTWARDEN_EMAIL,
        password: masterPwHash,
        scope: 'api offline_access',
        client_id: 'web',
        deviceType: '10',
        deviceIdentifier: 'fwv-raura-sync',
        deviceName: 'FWV Raura Sync Service'
    }).toString();

    const result = await makeRequest(
        `${VAULTWARDEN_URL}/identity/connect/token`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body
        }
    );
    return result.access_token;
}

async function getOrgMembers(token) {
    const result = await makeRequest(
        `${VAULTWARDEN_URL}/api/organizations/${VAULTWARDEN_ORG_ID}/users`,
        { headers: { 'Authorization': `Bearer ${token}` } }
    );
    return (result.data || []).map(m => ({
        id: m.id,
        email: (m.email || '').toLowerCase(),
        name: m.name || '',
        type: m.type,
        status: m.status
    }));
}

async function inviteToOrg(token, email) {
    const body = JSON.stringify({
        emails: [email],
        type: 2, // User role
        accessAll: false,
        collections: [{
            id: VAULTWARDEN_COLLECTION_ID,
            readOnly: false,
            hidePasswords: false
        }]
    });

    await makeRequest(
        `${VAULTWARDEN_URL}/api/organizations/${VAULTWARDEN_ORG_ID}/users/invite`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body
        }
    );
    log('INFO', 'Invited to Vaultwarden org', { email });
}

async function removeFromOrg(token, orgUserId, email) {
    await makeRequest(
        `${VAULTWARDEN_URL}/api/organizations/${VAULTWARDEN_ORG_ID}/users/${orgUserId}`,
        {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        }
    );
    log('INFO', 'Removed from Vaultwarden org', { email, orgUserId });
}

// Service accounts that should never be removed
const PROTECTED_EMAILS = [
    VAULTWARDEN_EMAIL.toLowerCase()
];

async function syncVorstandToVaultwarden(pool) {
    if (!VAULTWARDEN_PASSWORD) {
        log('WARN', 'Vaultwarden sync skipped - no password configured');
        return { skipped: true, reason: 'VAULTWARDEN_SYNC_PASSWORD not set' };
    }

    try {
        log('INFO', 'Starting Vaultwarden org sync');

        // 1. Get Vorstand members from DB
        const dbResult = await pool.query(`
            SELECT DISTINCT m.email
            FROM members m
            WHERE m.funktion IS NOT NULL
              AND m.status = 'Aktivmitglied'
              AND m.email IS NOT NULL
              AND m.email != ''
              AND (
                m.funktion ILIKE '%präsident%' OR
                m.funktion ILIKE '%praesident%' OR
                m.funktion ILIKE '%aktuar%' OR
                m.funktion ILIKE '%kassier%' OR
                m.funktion ILIKE '%materialwart%' OR
                m.funktion ILIKE '%beisitzer%' OR
                m.funktion ILIKE '%vorstand%'
              )
        `);
        const vorstandEmails = new Set(
            dbResult.rows.map(r => r.email.toLowerCase())
        );

        // 2. Login to Vaultwarden
        const token = await getAccessToken();

        // 3. Get current org members
        const orgMembers = await getOrgMembers(token);

        // 4. Calculate diff
        const currentEmails = new Set(
            orgMembers
                .filter(m => !PROTECTED_EMAILS.includes(m.email))
                .map(m => m.email)
        );

        const toInvite = [...vorstandEmails]
            .filter(e => !currentEmails.has(e));
        const toRemove = orgMembers
            .filter(m =>
                !PROTECTED_EMAILS.includes(m.email) &&
                !vorstandEmails.has(m.email) &&
                m.type !== 0 // Never remove Owners
            );

        // 5. Execute changes
        const results = { invited: [], removed: [], errors: [] };

        for (const email of toInvite) {
            try {
                await inviteToOrg(token, email);
                results.invited.push(email);
            } catch (err) {
                log('ERROR', 'Failed to invite', {
                    email, error: err.message
                });
                results.errors.push({ email, action: 'invite', error: err.message });
            }
        }

        for (const member of toRemove) {
            try {
                await removeFromOrg(token, member.id, member.email);
                results.removed.push(member.email);
            } catch (err) {
                log('ERROR', 'Failed to remove', {
                    email: member.email, error: err.message
                });
                results.errors.push({
                    email: member.email, action: 'remove', error: err.message
                });
            }
        }

        log('INFO', 'Vaultwarden sync completed', {
            vorstand: vorstandEmails.size,
            orgMembers: orgMembers.length,
            invited: results.invited.length,
            removed: results.removed.length,
            errors: results.errors.length
        });

        return results;
    } catch (error) {
        log('ERROR', 'Vaultwarden sync failed', { error: error.message });
        throw error;
    }
}

module.exports = { syncVorstandToVaultwarden };
