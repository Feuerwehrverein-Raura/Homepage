#!/usr/bin/env node

/**
 * transform-zustellung.js - Zustellungs-Feld Migration
 *
 * Transformiert das alte "Zustellung" Freitextfeld in mitglieder_data.json
 * zu den neuen Boolean-Feldern "zustellung-email" und "zustellung-post".
 *
 * Migration (einmalig):
 *   Alt: "Zustellung": "Post" | "Mail" | "E-Mail" | "E-Mail und Post"
 *   Neu: "zustellung-email": true/false, "zustellung-post": true/false
 *
 * Verwendung: node scripts/transform-zustellung.js
 *
 * Erkennungslogik:
 * - E-Mail: Enthält "mail", "e-mail" oder "email" (case-insensitive)
 * - Post: Enthält "post" (case-insensitive)
 * - Beide: Enthält beides (z.B. "E-Mail und Post")
 *
 * Hinweis: Dieses Script wurde einmalig zur Datenmigration verwendet.
 * Die neuen Boolean-Felder werden von send-event-email.js und
 * send-calendar-pingen.js zur Empfängerfilterung verwendet.
 */

const fs = require('fs');
const path = require('path');

// Pfad zur Mitgliederdaten-Datei
const memberDataPath = path.join(__dirname, '..', 'mitglieder_data.json');

// === Lade Mitgliederdaten ===
console.log('📋 Lade mitglieder_data.json...');
const members = JSON.parse(fs.readFileSync(memberDataPath, 'utf-8'));

console.log(`✅ ${members.length} Mitglieder geladen\n`);

// === Transformiere jedes Mitglied ===
const transformedMembers = members.map(member => {
    // Altes Zustellungs-Feld normalisieren (lowercase für Vergleich)
    const zustellung = (member.Zustellung || '').toLowerCase();

    // Prüfe auf E-Mail-Zustellung (verschiedene Schreibweisen)
    // Erkennt: "Mail", "E-Mail", "email", "E-Mail und Post"
    const hasEmail = zustellung.includes('mail') || zustellung.includes('e-mail') || zustellung.includes('email');

    // Prüfe auf Post-Zustellung
    // Erkennt: "Post", "E-Mail und Post"
    const hasPost = zustellung.includes('post');

    // Erstelle neues Objekt mit allen bestehenden Feldern
    const transformed = { ...member };

    // Entferne altes Freitext-Feld
    delete transformed.Zustellung;

    // Füge neue Boolean-Felder hinzu
    transformed['zustellung-email'] = hasEmail;
    transformed['zustellung-post'] = hasPost;

    return transformed;
});

// === Speichere transformierte Daten ===
console.log('💾 Schreibe transformierte Daten...');
fs.writeFileSync(memberDataPath, JSON.stringify(transformedMembers, null, 2), 'utf-8');

console.log('✅ Transformation erfolgreich!');

// === Ausgabe Statistik ===
console.log('\nStatistik:');

// Zähle Mitglieder nach Zustellungsart
const emailCount = transformedMembers.filter(m => m['zustellung-email']).length;
const postCount = transformedMembers.filter(m => m['zustellung-post']).length;
const bothCount = transformedMembers.filter(m => m['zustellung-email'] && m['zustellung-post']).length;

console.log(`  📧 E-Mail: ${emailCount}`);
console.log(`  📮 Post: ${postCount}`);
console.log(`  📧+📮 Beide: ${bothCount}`);
