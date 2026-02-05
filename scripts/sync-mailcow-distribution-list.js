#!/usr/bin/env node

/**
 * sync-mailcow-distribution-list.js - Mailcow Verteilerlisten-Synchronisation
 *
 * Synchronisiert die Mailcow-Verteilerliste (alle@fwv-raura.ch) mit den
 * Mitgliederdaten aus mitglieder_data.json. Fuegt neue E-Mails hinzu und
 * entfernt ausgetretene Mitglieder.
 *
 * Verwendung: node scripts/sync-mailcow-distribution-list.js
 *
 * Umgebungsvariablen:
 * - MAILCOW_API_URL: Mailcow Server (Standard: https://mail.fwv-raura.ch)
 * - MAILCOW_API_KEY: API-Schluessel fuer Mailcow Admin-API
 * - MAILCOW_ALIAS_ADDRESS: Verteilerliste (Standard: alle@fwv-raura.ch)
 *
 * Workflow:
 * 1. Laedt Mitglieder mit zustellung-email=true aus JSON
 * 2. Holt aktuellen Alias aus Mailcow API
 * 3. Vergleicht Listen (hinzugefuegt/entfernt)
 * 4. Aktualisiert Alias nur bei Aenderungen
 *
 * Mailcow API Endpoints:
 * - GET /api/v1/get/alias/all - Liste aller Aliase
 * - POST /api/v1/edit/alias - Alias aktualisieren
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

// Konfiguration aus Umgebungsvariablen
const MAILCOW_API_URL = process.env.MAILCOW_API_URL || 'https://mail.fwv-raura.ch';
const MAILCOW_API_KEY = process.env.MAILCOW_API_KEY;
const MAILCOW_ALIAS_ADDRESS = process.env.MAILCOW_ALIAS_ADDRESS || 'alle@fwv-raura.ch';

/**
 * Fuehrt einen API-Request an Mailcow aus
 *
 * Verwendet X-API-Key Header fuer Authentifizierung.
 * Alle Requests/Responses als JSON.
 *
 * @param {string} method - HTTP-Methode (GET, POST, etc.)
 * @param {string} endpoint - API-Pfad (z.B. '/api/v1/get/alias/all')
 * @param {Object} data - Request-Body fuer POST (optional)
 * @returns {Promise<Object>} Geparste JSON-Response
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
 * Holt die aktuelle Alias-Konfiguration aus Mailcow
 *
 * @param {string} aliasAddress - E-Mail-Adresse des Alias
 * @returns {Promise<Object>} Alias-Objekt mit id, address, goto (Empfaenger)
 * @throws {Error} Wenn Alias nicht gefunden
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
 * Aktualisiert die Alias-Empfaenger in Mailcow
 *
 * @param {number} aliasId - Mailcow interne Alias-ID
 * @param {string[]} gotoAddresses - Array von E-Mail-Adressen
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
 * Laedt E-Mail-Empfaenger aus Mitgliederdaten
 *
 * Filtert: Aktiv/Ehrenmitglieder mit zustellung-email=true
 * und gueltiger E-Mail-Adresse
 *
 * @returns {string[]} Array von E-Mail-Adressen
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
 * Hauptfunktion - Orchestriert die Synchronisation
 *
 * Zeigt Diff zwischen aktueller und neuer Liste an
 * und aktualisiert nur bei Aenderungen.
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
