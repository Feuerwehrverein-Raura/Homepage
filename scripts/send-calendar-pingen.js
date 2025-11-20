const fs = require('fs');
const path = require('path');
const https = require('https');

// Pingen API Configuration
const isStaging = process.env.PINGEN_STAGING === 'true';
const identityUrl = isStaging ? 'identity-staging.pingen.com' : 'identity.pingen.com';
const apiUrl = isStaging ? 'api-staging.pingen.com' : 'api.pingen.com';

const clientId = process.env.PINGEN_CLIENT_ID;
const clientSecret = process.env.PINGEN_CLIENT_SECRET;
const organisationId = process.env.PINGEN_ORGANISATION_ID;

// Load members with postal delivery
function loadPostMembers() {
    const membersPath = path.join(__dirname, '..', 'mitglieder_data.json');
    const members = JSON.parse(fs.readFileSync(membersPath, 'utf8'));

    return members.filter(m => m['zustellung-post'] === true);
}

// Get OAuth2 access token
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

// Get file upload URL
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

// Upload PDF to Pingen's storage
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

// Create letter for a member
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

// Main function
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
