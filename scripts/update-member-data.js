#!/usr/bin/env node

/**
 * Member Data Update Handler for GitHub Workflows
 *
 * Updates member data and creates PR for review
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const JWT_TOKEN = process.env.JWT_TOKEN;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const UPDATES_JSON = process.env.UPDATES_JSON;
const TARGET_EMAIL = process.env.TARGET_EMAIL; // For Vorstand editing other members

if (!JWT_TOKEN) {
    console.error('❌ JWT_TOKEN environment variable is required');
    process.exit(1);
}

if (!UPDATES_JSON) {
    console.error('❌ UPDATES_JSON environment variable is required');
    process.exit(1);
}

// Verify JWT token
function verifyJWT(token, secret) {
    try {
        const [headerB64, payloadB64, signatureB64] = token.split('.');

        if (!headerB64 || !payloadB64 || !signatureB64) {
            throw new Error('Invalid token format');
        }

        // Verify signature
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(`${headerB64}.${payloadB64}`)
            .digest('base64url');

        if (signatureB64 !== expectedSignature) {
            throw new Error('Invalid signature');
        }

        // Decode payload
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

        // Check expiry
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
            throw new Error('Token expired');
        }

        return payload;
    } catch (error) {
        console.error('❌ JWT Verification failed:', error.message);
        process.exit(1);
    }
}

// Check which fields member can update
function getAllowedFields(role) {
    if (role === 'vorstand') {
        // Vorstand can update most fields except sensitive ones
        return [
            'Vorname', 'Name', 'Mitglied',
            'Telefon', 'Mobile', 'E-Mail',
            'Strasse', 'PLZ', 'Ort', 'Adresszusatz',
            'zustellung-email', 'zustellung-post',
            'Funktion', 'Eintritt', 'Status'
            // IBAN is forbidden for security
        ];
    } else {
        // Regular members can only update contact info
        return [
            'Telefon', 'Mobile', 'E-Mail',
            'Strasse', 'PLZ', 'Ort', 'Adresszusatz',
            'zustellung-email', 'zustellung-post'
        ];
    }
}

function updateMemberData(payload, updates, targetEmail) {
    const memberDataPath = path.join(__dirname, '..', 'mitglieder_data.json');
    const members = JSON.parse(fs.readFileSync(memberDataPath, 'utf-8'));

    // Determine which member to update
    const emailToUpdate = targetEmail || payload.email;

    // Find member
    const memberIndex = members.findIndex(m =>
        m['E-Mail'] && m['E-Mail'].toLowerCase() === emailToUpdate.toLowerCase()
    );

    if (memberIndex === -1) {
        console.error('❌ Mitglied nicht gefunden');
        process.exit(1);
    }

    // Check permissions
    if (targetEmail && payload.role !== 'vorstand') {
        console.error('❌ Keine Berechtigung. Nur Vorstand kann andere Mitglieder bearbeiten.');
        process.exit(1);
    }

    if (targetEmail && targetEmail.toLowerCase() !== payload.email.toLowerCase()) {
        console.log(`👮 Vorstand bearbeitet Mitglied: ${emailToUpdate}`);
    }

    // Filter updates to allowed fields
    const allowedFields = getAllowedFields(payload.role);
    const filteredUpdates = {};
    const rejectedFields = [];

    for (const [field, value] of Object.entries(updates)) {
        if (allowedFields.includes(field)) {
            filteredUpdates[field] = value;
        } else {
            rejectedFields.push(field);
        }
    }

    if (rejectedFields.length > 0) {
        console.log(`⚠️  Folgende Felder wurden ignoriert (keine Berechtigung): ${rejectedFields.join(', ')}`);
    }

    if (Object.keys(filteredUpdates).length === 0) {
        console.error('❌ Keine gültigen Änderungen');
        process.exit(1);
    }

    // Apply updates
    const oldMember = { ...members[memberIndex] };
    members[memberIndex] = { ...members[memberIndex], ...filteredUpdates };

    // Save updated data
    fs.writeFileSync(memberDataPath, JSON.stringify(members, null, 2) + '\n');

    console.log('✅ Mitgliederdaten aktualisiert');
    console.log('');
    console.log('📋 Änderungen:');
    for (const [field, value] of Object.entries(filteredUpdates)) {
        const oldValue = oldMember[field];
        console.log(`  ${field}: "${oldValue}" → "${value}"`);
    }

    return {
        member: members[memberIndex],
        changes: filteredUpdates,
        oldValues: Object.keys(filteredUpdates).reduce((acc, key) => {
            acc[key] = oldMember[key];
            return acc;
        }, {})
    };
}

function createPR(payload, result, targetEmail) {
    const emailToUpdate = targetEmail || payload.email;
    const branchName = `member-update-${Date.now()}`;

    try {
        // Create and checkout new branch
        execSync(`git checkout -b ${branchName}`, { stdio: 'inherit' });

        // Stage changes
        execSync('git add mitglieder_data.json', { stdio: 'inherit' });

        // Create commit message
        const changeList = Object.entries(result.changes)
            .map(([field, value]) => `- ${field}: ${result.oldValues[field]} → ${value}`)
            .join('\n');

        const commitMessage = `Mitgliederdaten Update: ${result.member.Mitglied}

Geändert von: ${payload.member.name} (${payload.role})
Ziel-Mitglied: ${emailToUpdate}

Änderungen:
${changeList}`;

        execSync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });

        // Push branch
        execSync(`git push -u origin ${branchName}`, { stdio: 'inherit' });

        console.log('✅ Branch erstellt und gepusht');
        console.log(`📌 Branch: ${branchName}`);

        // Output for GitHub Actions
        const outputFile = process.env.GITHUB_OUTPUT;
        if (outputFile) {
            fs.appendFileSync(outputFile, `branch=${branchName}\n`);
            fs.appendFileSync(outputFile, `pr_title=Mitgliederdaten Update: ${result.member.Mitglied}\n`);
            const prBody = `## Mitgliederdaten Update

**Geändert von:** ${payload.member.name} (${payload.role})
**Ziel-Mitglied:** ${result.member.Mitglied}

### Änderungen

${Object.entries(result.changes).map(([field, value]) => `- **${field}**: \`${result.oldValues[field]}\` → \`${value}\``).join('\n')}

---

Bitte überprüfen Sie die Änderungen und mergen Sie den PR wenn alles korrekt ist.`;
            fs.appendFileSync(outputFile, `pr_body<<EOF\n${prBody}\nEOF\n`);
        }

    } catch (error) {
        console.error('❌ Fehler beim Erstellen des PR:', error.message);
        process.exit(1);
    }
}

async function main() {
    console.log('📝 Member Data Update System');

    // Verify JWT
    console.log('🔐 Verifiziere Token...');
    const payload = verifyJWT(JWT_TOKEN, JWT_SECRET);
    console.log(`✅ Authentifiziert: ${payload.member.name} (${payload.role})`);

    // Parse updates
    const updates = JSON.parse(UPDATES_JSON);
    console.log(`📋 ${Object.keys(updates).length} Änderungen angefordert`);

    // Configure Git
    execSync('git config --global user.name "Member Data Update Bot"', { stdio: 'pipe' });
    execSync('git config --global user.email "actions@github.com"', { stdio: 'pipe' });

    // Update member data
    const result = updateMemberData(payload, updates, TARGET_EMAIL);

    // Create PR
    console.log('');
    console.log('📤 Erstelle Pull Request...');
    createPR(payload, result, TARGET_EMAIL);

    console.log('');
    console.log('✅ Update erfolgreich! PR erstellt für Review.');
}

main().catch(error => {
    console.error('❌ Fehler:', error.message);
    console.error(error.stack);
    process.exit(1);
});
