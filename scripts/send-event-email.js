#!/usr/bin/env node

/**
 * send-event-email.js - E-Mail-Einladungen für Vereinsanlässe
 *
 * Versendet HTML-formatierte Einladungs-E-Mails an alle Mitglieder
 * mit aktivierter E-Mail-Zustellung.
 *
 * Verwendung: node scripts/send-event-email.js <event-file.md>
 *
 * Workflow:
 * 1. Parst Event-Markdown-Datei (Frontmatter + Beschreibung)
 * 2. Lädt Empfänger aus mitglieder_data.json (zustellung-email=true)
 * 3. Rendert HTML-Template mit Handlebars
 * 4. Versendet einzeln via Mailcow SMTP
 *
 * Umgebungsvariablen:
 * - SMTP_HOST: Mail-Server (Standard: mail.test.juroct.net)
 * - SMTP_PORT: Port (Standard: 587 STARTTLS)
 * - SMTP_USER: Benutzername für SMTP-Auth
 * - SMTP_PASS: Passwort für SMTP-Auth
 * - FROM_EMAIL: Absender-Adresse (Standard: alle@fwv-raura.ch)
 */

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');

// Configuration from environment variables
const SMTP_HOST = process.env.SMTP_HOST || 'mail.test.juroct.net';
const SMTP_PORT = process.env.SMTP_PORT || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const FROM_EMAIL = process.env.FROM_EMAIL || 'alle@fwv-raura.ch';
const FROM_NAME = process.env.FROM_NAME || 'Feuerwehrverein Raura Kaiseraugst';

// Kommandozeilen-Argumente (erstes Argument = Event-Datei)
const args = process.argv.slice(2);
if (args.length === 0) {
    console.error('❌ Usage: node send-event-email.js <event-file.md>');
    process.exit(1);
}

const eventFile = args[0];

/**
 * Parst eine Event-Markdown-Datei
 *
 * Erwartet Frontmatter zwischen --- Markern mit:
 * - title, subtitle: Veranstaltungsname
 * - startDate, endDate: ISO-8601 Datum
 * - location: Veranstaltungsort
 * - organizer, email: Kontaktperson
 * - registrationRequired, registrationDeadline: Anmeldung
 *
 * @param {string} filePath - Pfad zur .md Datei
 * @returns {Object} Event-Objekt mit Frontmatter + description
 */
function parseEventFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);

    if (!frontmatterMatch) {
        throw new Error('No frontmatter found in event file');
    }

    const [, frontmatterStr, markdown] = frontmatterMatch;
    const frontmatter = parseFrontmatter(frontmatterStr);

    return {
        ...frontmatter,
        description: markdown.trim()
    };
}

/**
 * Parst YAML-Frontmatter zu einem Objekt
 * Einfacher Parser für key: value Zeilen
 *
 * @param {string} str - YAML-String ohne ---
 * @returns {Object} Geparstes Objekt
 */
function parseFrontmatter(str) {
    const result = {};
    const lines = str.split(/\r?\n/);

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const colonIndex = trimmed.indexOf(':');
        if (colonIndex > -1) {
            const key = trimmed.substring(0, colonIndex).trim();
            const value = trimmed.substring(colonIndex + 1).trim();
            result[key] = value;
        }
    }

    return result;
}

/**
 * Formatiert Datum für Anzeige (deutsch)
 * Beispiel: "Samstag, 15. Juni 2024"
 *
 * @param {string} dateStr - ISO-8601 Datums-String
 * @returns {string} Formatiertes Datum
 */
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('de-DE', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }).format(date);
}

/**
 * Formatiert Uhrzeit für Anzeige
 * Beispiel: "18:30"
 *
 * @param {string} dateStr - ISO-8601 Datums-String
 * @returns {string} Formatierte Uhrzeit (HH:mm)
 */
function formatTime(dateStr) {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('de-DE', {
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

/**
 * Konvertiert einfaches Markdown zu HTML
 *
 * Unterstützt:
 * - Überschriften (# ## ###)
 * - Fett (**text**)
 * - Kursiv (*text*)
 * - Listen (- item)
 * - Absätze
 *
 * @param {string} markdown - Markdown-Text
 * @returns {string} HTML-String
 */
function markdownToHtml(markdown) {
    return markdown
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/^(.+)$/gm, (match) => {
            if (match.startsWith('<')) return match;
            return `<p>${match}</p>`;
        });
}

/**
 * Lädt E-Mail-Empfänger aus Mitgliederdaten
 *
 * Priorität:
 * 1. mitglieder_data.json - Mitglieder mit zustellung-email=true
 * 2. EMAIL_RECIPIENTS_TO - Fallback auf Umgebungsvariable
 *
 * Filtert nur Aktiv- und Ehrenmitglieder
 *
 * @returns {Array<{name: string, email: string}>} Empfänger-Liste
 * @throws {Error} Wenn keine Empfänger gefunden
 */
function loadRecipients() {
    // Option 1: Load from mitglieder_data.json
    const memberDataPath = path.join(__dirname, '..', 'mitglieder_data.json');
    if (fs.existsSync(memberDataPath)) {
        console.log('📋 Lade E-Mail-Empfänger aus mitglieder_data.json...');
        const members = JSON.parse(fs.readFileSync(memberDataPath, 'utf-8'));

        // Filter: Nur Aktivmitglieder und Ehrenmitglieder mit E-Mail-Zustellung
        const emailRecipients = members.filter(m => {
            return (m.Status === 'Aktivmitglied' || m.Status === 'Ehrenmitglied') &&
                m['E-Mail'] &&
                m['E-Mail'].trim() !== '' &&
                m['zustellung-email'] === true;
        });

        console.log(`✅ ${emailRecipients.length} Mitglieder mit E-Mail-Zustellung gefunden`);

        return emailRecipients.map(m => ({
            name: m.Mitglied,
            email: m['E-Mail']
        }));
    }

    // Option 2: Fallback to Mailcow distribution list
    if (process.env.EMAIL_RECIPIENTS_TO) {
        console.log('📋 Verwende Mailcow Verteilerliste...');
        const emails = process.env.EMAIL_RECIPIENTS_TO.split(',').map(e => e.trim());
        return emails.map(email => ({
            name: email.split('@')[0],
            email: email
        }));
    }

    throw new Error('Keine Empfänger gefunden! Entweder mitglieder_data.json oder EMAIL_RECIPIENTS_TO Secret muss vorhanden sein.');
}

/**
 * Rendert das E-Mail-Template mit Event-Daten
 *
 * Verwendet Handlebars-Template aus .email/template.html
 * Template enthält FWV-Branding, Event-Details und Anmeldelinks
 *
 * @param {Object} event - Event-Objekt mit allen Frontmatter-Feldern
 * @returns {string} Gerendertes HTML für E-Mail-Body
 */
function renderEmailTemplate(event) {
    const templatePath = path.join(__dirname, '..', '.email', 'template.html');
    const templateSource = fs.readFileSync(templatePath, 'utf-8');
    const template = Handlebars.compile(templateSource);

    const data = {
        title: event.title,
        subtitle: event.subtitle,
        startDate: formatDate(event.startDate),
        endDate: event.endDate ? formatDate(event.endDate) : null,
        startTime: formatTime(event.startDate),
        endTime: event.endDate ? formatTime(event.endDate) : null,
        location: event.location,
        organizer: event.organizer,
        organizerEmail: event.email,
        cost: event.cost,
        description: markdownToHtml(event.description),
        registrationRequired: event.registrationRequired === 'true',
        registrationDeadline: event.registrationDeadline ? formatDate(event.registrationDeadline) : null,
        maxParticipants: event.maxParticipants,
        eventUrl: `https://www.fwv-raura.ch/events.html#${event.id}`,
        registrationUrl: event.registrationUrl || null
    };

    return template(data);
}

/**
 * Versendet E-Mails an alle Empfänger
 *
 * Verwendet Nodemailer mit SMTP-Transport (Mailcow)
 * Versendet einzeln (nicht BCC) für personalisierte Zustellung
 *
 * @param {Array<{name: string, email: string}>} recipients - Empfänger
 * @param {string} subject - Betreffzeile
 * @param {string} htmlContent - HTML-Body
 * @returns {Array<{email: string, success: boolean, messageId?: string, error?: string}>}
 */
async function sendEmail(recipients, subject, htmlContent) {
    // Create transporter
    const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASS
        }
    });

    // Verify connection
    await transporter.verify();
    console.log('✅ SMTP connection verified');

    // Send emails
    const results = [];
    for (const recipient of recipients) {
        try {
            const info = await transporter.sendMail({
                from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
                to: `"${recipient.name}" <${recipient.email}>`,
                subject: subject,
                html: htmlContent,
                text: 'Bitte öffnen Sie diese E-Mail in einem HTML-fähigen E-Mail-Client.'
            });

            console.log(`✅ E-Mail gesendet an ${recipient.name} (${recipient.email})`);
            results.push({ email: recipient.email, success: true, messageId: info.messageId });
        } catch (error) {
            console.error(`❌ Fehler beim Senden an ${recipient.email}:`, error.message);
            results.push({ email: recipient.email, success: false, error: error.message });
        }
    }

    return results;
}

/**
 * Hauptfunktion - Orchestriert den gesamten E-Mail-Versand
 *
 * 1. Prüft SMTP-Credentials
 * 2. Parst Event-Datei
 * 3. Lädt Empfänger
 * 4. Rendert Template
 * 5. Versendet E-Mails
 * 6. Gibt Zusammenfassung aus
 */
async function main() {
    try {
        console.log('🚀 Event E-Mail Versand gestartet...\n');

        // Check required environment variables
        if (!SMTP_USER || !SMTP_PASS) {
            throw new Error('SMTP_USER and SMTP_PASS environment variables are required');
        }

        // Parse event file
        console.log(`📄 Lade Event-Datei: ${eventFile}`);
        const event = parseEventFile(eventFile);
        console.log(`✅ Event geladen: ${event.title}\n`);

        // Load recipients
        console.log('📋 Lade E-Mail-Empfänger...');
        const recipients = loadRecipients();
        console.log(`✅ ${recipients.length} aktive Empfänger gefunden\n`);

        // Render email
        console.log('🎨 Erstelle E-Mail-Template...');
        const htmlContent = renderEmailTemplate(event);
        console.log('✅ Template erstellt\n');

        // Send emails
        console.log('📧 Versende E-Mails...\n');
        const subject = `Einladung: ${event.title}`;
        const results = await sendEmail(recipients, subject, htmlContent);

        // Summary
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        console.log('\n📊 Zusammenfassung:');
        console.log(`✅ Erfolgreich: ${successful}`);
        console.log(`❌ Fehlgeschlagen: ${failed}`);

        if (failed > 0) {
            console.log('\n❌ Fehlgeschlagene E-Mails:');
            results.filter(r => !r.success).forEach(r => {
                console.log(`  - ${r.email}: ${r.error}`);
            });
            process.exit(1);
        }

        console.log('\n✅ Alle E-Mails erfolgreich versendet!');
    } catch (error) {
        console.error('\n❌ Fehler:', error.message);
        process.exit(1);
    }
}

// Run
main();
