// DEUTSCH: Huawei Push Kit Sender — Pendant zu firebase-admin fuer Geraete ohne
// Google-Services. Spricht direkt die HMS Push REST-API an, da es keinen offiziellen
// Node-SDK gibt. OAuth2-Access-Tokens werden gecached und vor Ablauf erneuert.
//
// ENV:
//   HMS_APP_ID        Numerische App-ID aus AppGallery Connect (z.B. 105432123)
//   HMS_CLIENT_ID     OAuth2-Client-ID (oft identisch mit App-ID)
//   HMS_CLIENT_SECRET App-Secret aus AppGallery Connect -> Project Settings
//
// Doku: https://developer.huawei.com/consumer/en/doc/HMSCore-References/https-send-api-0000001050986197
const axios = require('axios');

const TOKEN_URL = 'https://oauth-login.cloud.huawei.com/oauth2/v3/token';
const PUSH_URL_TEMPLATE = 'https://push-api.cloud.huawei.com/v1/%APP_ID%/messages:send';

let cached = null; // { accessToken, expiresAt }
let initialized = false;

function init() {
    const appId = process.env.HMS_APP_ID;
    const clientId = process.env.HMS_CLIENT_ID;
    const clientSecret = process.env.HMS_CLIENT_SECRET;
    if (!appId || !clientId || !clientSecret) {
        console.warn('HMS Push NOT initialized — HMS_APP_ID/HMS_CLIENT_ID/HMS_CLIENT_SECRET not set; Huawei pushes disabled');
        return false;
    }
    initialized = true;
    console.log(`HMS Push initialized (app_id: ${appId})`);
    return true;
}

function isInitialized() {
    return initialized;
}

async function getAccessToken() {
    if (cached && cached.expiresAt > Date.now() + 30_000) return cached.accessToken;
    const params = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.HMS_CLIENT_ID,
        client_secret: process.env.HMS_CLIENT_SECRET
    });
    const resp = await axios.post(TOKEN_URL, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10_000
    });
    const accessToken = resp.data.access_token;
    const expiresIn = (resp.data.expires_in || 3600) * 1000;
    cached = { accessToken, expiresAt: Date.now() + expiresIn };
    return accessToken;
}

/**
 * DEUTSCH: Push an mehrere HMS-Tokens schicken. HMS akzeptiert pro Request bis zu
 * 1000 Tokens, wir bleiben sicherheitshalber bei 500 (analog zu FCM).
 *
 * Returntyp ist deliberately analog zu admin.messaging().sendEachForMulticast(),
 * damit der Caller einen einheitlichen Pfad hat:
 *   { successCount, responses: [{ success, error: { code } }, ...] }
 *
 * Ungueltige Tokens werden anhand der HMS-Response-Codes erkannt
 * (80300007 = invalid token, 80100000 mit illegal_token im body).
 */
async function sendMulticast({ tokens, title, body, data }) {
    if (!initialized) {
        return {
            successCount: 0,
            responses: tokens.map(() => ({
                success: false,
                error: { code: 'hms/not-initialized' }
            }))
        };
    }
    if (!tokens || tokens.length === 0) {
        return { successCount: 0, responses: [] };
    }

    const appId = process.env.HMS_APP_ID;
    const url = PUSH_URL_TEMPLATE.replace('%APP_ID%', appId);
    const accessToken = await getAccessToken();

    // HMS data muss ein String sein (kein Object) — analog zu FCM serialisieren.
    const dataStr = data ? JSON.stringify(data) : undefined;

    const message = {
        message: {
            notification: { title, body },
            android: {
                notification: { title, body, click_action: { type: 3 } } // 3 = open app
            },
            data: dataStr,
            token: tokens
        }
    };

    try {
        const resp = await axios.post(url, message, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            timeout: 15_000,
            // HMS gibt 200 + code im Body zurueck, auch bei Token-Problemen.
            validateStatus: () => true
        });

        const code = String(resp.data && resp.data.code || '');
        const illegalTokens = (resp.data && resp.data.illegal_tokens) || [];
        const illegalSet = new Set(illegalTokens);

        // 80000000 = success, 80100000 = some_invalid (Teilerfolg). Beides verteilt
        // erfolgreich an gueltige Tokens; nur die in illegal_tokens sind fehlgeschlagen.
        if (code === '80000000' || code === '80100000') {
            const responses = tokens.map(t => {
                if (illegalSet.has(t)) {
                    return { success: false, error: { code: 'hms/invalid-token' } };
                }
                return { success: true };
            });
            return { successCount: responses.filter(r => r.success).length, responses };
        }

        // Andere Fehlercodes: kompletter Batch fehlgeschlagen
        console.error(`HMS Push API error: code=${code} msg=${resp.data && resp.data.msg}`);
        return {
            successCount: 0,
            responses: tokens.map(() => ({
                success: false,
                error: { code: `hms/${code || 'unknown'}` }
            }))
        };
    } catch (err) {
        console.error('HMS Push request failed:', err.message);
        return {
            successCount: 0,
            responses: tokens.map(() => ({
                success: false,
                error: { code: 'hms/network' }
            }))
        };
    }
}

/** True wenn der Error-Code anzeigt, dass der Token endgueltig ungueltig ist. */
function isInvalidTokenError(code) {
    return code === 'hms/invalid-token';
}

module.exports = { init, isInitialized, sendMulticast, isInvalidTokenError };
