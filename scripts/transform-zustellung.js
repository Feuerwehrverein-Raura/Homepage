#!/usr/bin/env node

/**
 * Transform mitglieder_data.json Zustellung field
 * From: "Zustellung": "Post" | "Mail" | "E-Mail" | "E-Mail und Post" | etc.
 * To: "zustellung-email": true/false, "zustellung-post": true/false
 */

const fs = require('fs');
const path = require('path');

const memberDataPath = path.join(__dirname, '..', 'mitglieder_data.json');

console.log('📋 Lade mitglieder_data.json...');
const members = JSON.parse(fs.readFileSync(memberDataPath, 'utf-8'));

console.log(`✅ ${members.length} Mitglieder geladen\n`);

// Transform each member
const transformedMembers = members.map(member => {
    const zustellung = (member.Zustellung || '').toLowerCase();

    // Determine email and post preferences
    const hasEmail = zustellung.includes('mail') || zustellung.includes('e-mail') || zustellung.includes('email');
    const hasPost = zustellung.includes('post');

    // Create new member object with transformed fields
    const transformed = { ...member };

    // Remove old Zustellung field
    delete transformed.Zustellung;

    // Add new boolean fields
    transformed['zustellung-email'] = hasEmail;
    transformed['zustellung-post'] = hasPost;

    return transformed;
});

// Write back to file with nice formatting
console.log('💾 Schreibe transformierte Daten...');
fs.writeFileSync(memberDataPath, JSON.stringify(transformedMembers, null, 2), 'utf-8');

console.log('✅ Transformation erfolgreich!');
console.log('\nStatistik:');

const emailCount = transformedMembers.filter(m => m['zustellung-email']).length;
const postCount = transformedMembers.filter(m => m['zustellung-post']).length;
const bothCount = transformedMembers.filter(m => m['zustellung-email'] && m['zustellung-post']).length;

console.log(`  📧 E-Mail: ${emailCount}`);
console.log(`  📮 Post: ${postCount}`);
console.log(`  📧+📮 Beide: ${bothCount}`);
