/**
 * send-calendar-pingen.js - Kalender-PDF Massenversand via Pingen
 *
 * Versendet das Jahreskalender-PDF an alle Mitglieder mit Post-Zustellung.
 * Verwendet Pingen API v2 mit OAuth2-Authentifizierung.
 *
 * Verwendung: node scripts/send-calendar-pingen.js
 *
 * Voraussetzungen:
 * - calendar-events.pdf im Wurzelverzeichnis
 * - mitglieder_data.json mit Mitgliederdaten
 * - Pingen API-Credentials
 *
 * Workflow:
 * 1. OAuth2 Token von Pingen Identity Server holen
 * 2. Upload-URL für PDF anfordern
 * 3. PDF zu Pingen hochladen
 * 4. Für jeden Empfänger einen Brief erstellen
 * 5. auto_send=true löst automatischen Versand aus
 *
 * Umgebungsvariablen:
 * - PINGEN_CLIENT_ID: OAuth2 Client ID
 * - PINGEN_CLIENT_SECRET: OAuth2 Client Secret
 * - PINGEN_ORGANISATION_ID: Pingen Organisations-ID
 * - PINGEN_STAGING: 'true' für Testumgebung
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

// Pingen API Konfiguration (Staging vs. Produktion)
const isStaging = process.env.PINGEN_STAGING === 'true';
const identityUrl = isStaging ? 'identity-staging.pingen.com' : 'identity.pingen.com';
const apiUrl = isStaging ? 'api-staging.pingen.com' : 'api.pingen.com';

const clientId = process.env.PINGEN_CLIENT_ID;
const clientSecret = process.env.PINGEN_CLIENT_SECRET;
const organisationId = process.env.PINGEN_ORGANISATION_ID;

/**
 * Lädt alle Mitglieder mit Post-Zustellung
 *
 * @returns {Array<Object>} Mitglieder mit zustellung-post=true
 */
function loadPostMembers() {
    const membersPath = path.join(__dirname, '..', 'mitglieder_data.json');
    const members = JSON.parse(fs.readFileSync(membersPath, 'utf8'));

    return members.filter(m => m['zustellung-post'] === true);
}

/**
 * Holt OAuth2 Access Token von Pingen Identity Server
 *
 * Verwendet Client Credentials Grant (M2M Authentifizierung)
 * Scope: letter batch (für Briefversand und Batch-Operationen)
 *
 * @returns {Promise<string>} Access Token für API-Aufrufe
 */
async function getAccessToken() {
    return new Promise((resolve, reject) => {
        const postData = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
            scope: 'letter batch'
        }).toString();

        const options = {
            hostname: identityUrl,
            port: 443,
            path: '/auth/access-tokens',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    const json = JSON.parse(data);
                    resolve(json.access_token);
                } else {
                    reject(new Error(`Auth failed: ${res.statusCode} - ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

/**
 * Fordert eine signierte Upload-URL von Pingen an
 *
 * Die URL ist nur für kurze Zeit gültig und enthält
 * eine Signatur zur Verifizierung beim Brief-Erstellen.
 *
 * @param {string} accessToken - OAuth2 Access Token
 * @returns {Promise<{url: string, urlSignature: string}>} Upload-URL mit Signatur
 */
async function getUploadUrl(accessToken) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: apiUrl,
            port: 443,
            path: '/file-upload',
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    const json = JSON.parse(data);
                    resolve({
                        url: json.data.attributes.url,
                        urlSignature: json.data.attributes.url_signature
                    });
                } else {
                    reject(new Error(`Get upload URL failed: ${res.statusCode} - ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

/**
 * Lädt PDF zu Pingen's Speicher hoch
 *
 * Verwendet PUT-Request mit Binary-Content
 * Die URL stammt von getUploadUrl()
 *
 * @param {string} uploadUrl - Signierte Upload-URL
 * @param {string} pdfPath - Lokaler Pfad zur PDF-Datei
 * @returns {Promise<void>} Erfolgreich wenn Status 200/201
 */
async function uploadPdf(uploadUrl, pdfPath) {
    return new Promise((resolve, reject) => {
        const pdfBuffer = fs.readFileSync(pdfPath);
        const url = new URL(uploadUrl);

        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname + url.search,
            method: 'PUT',
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Length': pdfBuffer.length
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200 || res.statusCode === 201) {
                    resolve();
                } else {
                    reject(new Error(`Upload failed: ${res.statusCode} - ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(pdfBuffer);
        req.end();
    });
}

/**
 * Erstellt einen Brief für ein Mitglied über Pingen API
 *
 * JSON:API Format (application/vnd.api+json):
 * - file_url: URL der hochgeladenen PDF
 * - file_url_signature: Signatur zur Verifizierung
 * - auto_send: true = sofortiger Versand
 * - delivery_product: cheap = B-Post (günstiger, 2-3 Tage)
 *
 * Adress-Handling:
 * - CH: Schweizer PLZ direkt
 * - DE: Deutsche PLZ mit 'DE-' Präfix entfernen
 *
 * @param {string} accessToken - OAuth2 Access Token
 * @param {Object} member - Mitglied aus mitglieder_data.json
 * @param {string} fileUrl - URL der hochgeladenen PDF
 * @param {string} fileUrlSignature - Signatur der URL
 * @returns {Promise<string>} Pingen Brief-ID
 */
async function createLetter(accessToken, member, fileUrl, fileUrlSignature) {
    return new Promise((resolve, reject) => {
        // Build address
        const address = {
            name: `${member.Anrede} ${member.Vorname} ${member.Name}`,
            street: member.Strasse,
            zip: String(member.PLZ).trim(),
            city: member.Ort,
            country: member.PLZ.toString().startsWith('DE-') ? 'DE' : 'CH'
        };

        // For German addresses, remove the DE- prefix
        if (address.country === 'DE') {
            address.zip = address.zip.replace('DE-', '');
        }

        const letterData = {
            data: {
                type: 'letters',
                attributes: {
                    file_original_name: 'Kalender-Feuerwehrverein.pdf',
                    file_url: fileUrl,
                    file_url_signature: fileUrlSignature,
                    address_position: 'left',
                    auto_send: true,
                    delivery_product: 'cheap',
                    print_mode: 'simplex',
                    print_spectrum: 'color'
                },
                relationships: {
                    recipient: {
                        data: {
                            type: 'recipient',
                            attributes: {
                                name: `${member.Vorname} ${member.Name}`,
                                street: member.Strasse,
                                zip: address.zip,
                                city: member.Ort,
                                country: address.country
                            }
                        }
                    }
                }
            }
        };

        const postData = JSON.stringify(letterData);

        const options = {
            hostname: apiUrl,
            port: 443,
            path: `/organisations/${organisationId}/letters`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/vnd.api+json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 201 || res.statusCode === 200) {
                    const json = JSON.parse(data);
                    resolve(json.data.id);
                } else {
                    reject(new Error(`Create letter failed for ${member.Mitglied}: ${res.statusCode} - ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

/**
 * Hauptfunktion - Orchestriert den Kalender-Massenversand
 *
 * Ablauf:
 * 1. Prüft Credentials (Client ID, Secret, Org ID)
 * 2. Lädt Mitglieder mit Post-Zustellung
 * 3. Authentifiziert bei Pingen (OAuth2)
 * 4. Lädt PDF einmalig hoch (wird für alle Briefe wiederverwendet)
 * 5. Erstellt Brief pro Mitglied (auto_send=true)
 * 6. Gibt Zusammenfassung aus
 */
async function main() {
    try {
        console.log('📮 Starte Pingen-Versand für Kalender-PDF...\n');

        // Check credentials
        if (!clientId || !clientSecret || !organisationId) {
            throw new Error('Pingen credentials missing. Set PINGEN_CLIENT_ID, PINGEN_CLIENT_SECRET, PINGEN_ORGANISATION_ID');
        }

        // Load members
        const postMembers = loadPostMembers();
        console.log(`📋 ${postMembers.length} Mitglieder mit Post-Zustellung gefunden\n`);

        if (postMembers.length === 0) {
            console.log('Keine Mitglieder für Post-Versand. Beende.');
            return;
        }

        // Get access token
        console.log('🔐 Authentifiziere bei Pingen...');
        const accessToken = await getAccessToken();
        console.log('✅ Authentifizierung erfolgreich\n');

        // Get upload URL
        console.log('📤 Lade PDF hoch...');
        const { url, urlSignature } = await getUploadUrl(accessToken);

        // Upload PDF
        const pdfPath = path.join(__dirname, '..', 'calendar-events.pdf');
        await uploadPdf(url, pdfPath);
        console.log('✅ PDF hochgeladen\n');

        // Create letters for each member
        console.log('📨 Erstelle Briefe...\n');
        const results = [];

        for (const member of postMembers) {
            try {
                const letterId = await createLetter(accessToken, member, url, urlSignature);
                console.log(`✅ ${member.Mitglied} - Brief erstellt (ID: ${letterId})`);
                results.push({ member: member.Mitglied, success: true, id: letterId });
            } catch (error) {
                console.error(`❌ ${member.Mitglied} - Fehler: ${error.message}`);
                results.push({ member: member.Mitglied, success: false, error: error.message });
            }
        }

        // Summary
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        console.log('\n📊 Zusammenfassung:');
        console.log(`   ✅ Erfolgreich: ${successful}`);
        console.log(`   ❌ Fehlgeschlagen: ${failed}`);
        console.log(`   📬 Gesamt: ${results.length}`);

        if (failed > 0) {
            process.exit(1);
        }

    } catch (error) {
        console.error('❌ Fehler:', error.message);
        process.exit(1);
    }
}

main();
