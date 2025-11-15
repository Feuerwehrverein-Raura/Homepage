#!/usr/bin/env node

/**
 * Sync Mailcow Distribution List from Member Data
 * Updates the Mailcow alias (distribution list) automatically based on mitglieder_data.json
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuration from environment variables
const MAILCOW_API_URL = process.env.MAILCOW_API_URL || 'https://mail.fwv-raura.ch';
const MAILCOW_API_KEY = process.env.MAILCOW_API_KEY;
const MAILCOW_ALIAS_ADDRESS = process.env.MAILCOW_ALIAS_ADDRESS || 'alle@fwv-raura.ch';

/**
 * Make API request to Mailcow
 */
function mailcowRequest(method, endpoint, data = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(endpoint, MAILCOW_API_URL);

        const options = {
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname,
            method: method,
            headers: {
                'X-API-Key': MAILCOW_API_KEY,
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let responseData = '';

            res.on('data', (chunk) => {
                responseData += chunk;
            });

            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(responseData));
                    } catch (e) {
                        resolve(responseData);
                    }
                } else {
                    reject(new Error(`Mailcow API Error: ${res.statusCode} - ${responseData}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        if (data) {
            req.write(JSON.stringify(data));
        }

        req.end();
    });
}

/**
 * Get current alias configuration
 */
async function getAlias(aliasAddress) {
    console.log(`🔍 Suche Alias: ${aliasAddress}`);
    const aliases = await mailcowRequest('GET', '/api/v1/get/alias/all');

    const alias = aliases.find(a => a.address === aliasAddress);
    if (!alias) {
        throw new Error(`Alias ${aliasAddress} nicht gefunden in Mailcow!`);
    }

    console.log(`✅ Alias gefunden: ${alias.address}`);
    console.log(`   Aktuelle Empfänger: ${alias.goto.split(',').length}`);
    return alias;
}

/**
 * Update alias with new goto addresses
 */
async function updateAlias(aliasId, gotoAddresses) {
    console.log(`🔄 Aktualisiere Alias...`);

    const data = {
        attr: {
            goto: gotoAddresses.join(','),
            active: '1'
        },
        items: [aliasId.toString()]
    };

    await mailcowRequest('POST', '/api/v1/edit/alias', data);
    console.log(`✅ Alias erfolgreich aktualisiert`);
}

/**
 * Load member data and extract email recipients
 */
function getEmailRecipientsFromMemberData() {
    const memberDataPath = path.join(__dirname, '..', 'mitglieder_data.json');

    if (!fs.existsSync(memberDataPath)) {
        throw new Error('mitglieder_data.json nicht gefunden!');
    }

    console.log('📋 Lade Mitgliederdaten...');
    const members = JSON.parse(fs.readFileSync(memberDataPath, 'utf-8'));

    // Filter: Nur Aktivmitglieder und Ehrenmitglieder mit E-Mail-Zustellung
    const emailRecipients = members.filter(m => {
        return (m.Status === 'Aktivmitglied' || m.Status === 'Ehrenmitglied') &&
            m['E-Mail'] &&
            m['E-Mail'].trim() !== '' &&
            m['zustellung-email'] === true;
    });

    console.log(`✅ ${emailRecipients.length} Mitglieder mit E-Mail-Zustellung gefunden`);

    return emailRecipients.map(m => m['E-Mail'].trim());
}

/**
 * Main function
 */
async function main() {
    try {
        console.log('🚀 Mailcow Verteilerliste Synchronisation gestartet...\n');

        // Check required environment variables
        if (!MAILCOW_API_KEY) {
            throw new Error('MAILCOW_API_KEY environment variable is required');
        }

        // Get email addresses from member data
        const emailAddresses = getEmailRecipientsFromMemberData();

        if (emailAddresses.length === 0) {
            console.warn('⚠️  Keine E-Mail-Empfänger gefunden. Abbruch.');
            process.exit(0);
        }

        console.log(`\n📧 E-Mail-Adressen (${emailAddresses.length}):`);
        emailAddresses.forEach(email => console.log(`   - ${email}`));

        // Get current alias
        const currentAlias = await getAlias(MAILCOW_ALIAS_ADDRESS);

        // Get current goto addresses
        const currentGoto = currentAlias.goto.split(',').map(e => e.trim()).filter(e => e);

        // Compare
        const added = emailAddresses.filter(e => !currentGoto.includes(e));
        const removed = currentGoto.filter(e => !emailAddresses.includes(e));

        console.log('\n📊 Änderungen:');
        if (added.length > 0) {
            console.log(`   ➕ Hinzugefügt (${added.length}):`);
            added.forEach(email => console.log(`      - ${email}`));
        }
        if (removed.length > 0) {
            console.log(`   ➖ Entfernt (${removed.length}):`);
            removed.forEach(email => console.log(`      - ${email}`));
        }
        if (added.length === 0 && removed.length === 0) {
            console.log('   ℹ️  Keine Änderungen notwendig - Verteilerliste ist aktuell!');
            process.exit(0);
        }

        // Update alias
        await updateAlias(currentAlias.id, emailAddresses);

        console.log('\n✅ Synchronisation erfolgreich abgeschlossen!');
        console.log(`   Verteilerliste ${MAILCOW_ALIAS_ADDRESS} wurde aktualisiert.`);
        console.log(`   Neue Anzahl Empfänger: ${emailAddresses.length}`);

    } catch (error) {
        console.error('\n❌ Fehler:', error.message);
        process.exit(1);
    }
}

// Run
main();
