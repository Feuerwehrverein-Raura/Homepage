/**
 * generate-ics.js - ICS Kalender-Generator für Feuerwehrverein Raura
 *
 * Liest alle Event-Markdown-Dateien aus dem events/ Verzeichnis
 * und generiert eine iCalendar-Datei (.ics) für Kalender-Abonnements.
 *
 * Ausgabe: calendar.ics im Wurzelverzeichnis
 *
 * Verwendung: node scripts/generate-ics.js
 *
 * ICS-Format (RFC 5545):
 * - VCALENDAR Container mit Metadaten (PRODID, CALSCALE)
 * - VEVENT pro Termin (UID, DTSTART, DTEND, SUMMARY, etc.)
 */
const fs = require('fs');
const path = require('path');
const FWV_CONFIG = require('./config.js');

/**
 * ICSGenerator - Klasse zur Generierung von iCalendar-Dateien
 *
 * Workflow:
 * 1. loadEvents() - Lädt alle .md Dateien aus events/
 * 2. parseMarkdownEvent() - Extrahiert Frontmatter und Content
 * 3. generateICS() - Erstellt ICS-String mit allen Events
 * 4. run() - Hauptmethode, speichert calendar.ics
 */
class ICSGenerator {
    constructor() {
        this.events = [];  // Gesammelte Events aus Markdown-Dateien
    }

    /**
     * Lädt alle Event-Markdown-Dateien aus dem events/ Verzeichnis
     *
     * Überspringt:
     * - Nicht-Markdown-Dateien
     * - assignment/arbeitsplan Dateien (Schichtpläne)
     * - README.md
     */
    async loadEvents() {
        const eventsDir = path.join(__dirname, '..', 'events');
        
        if (!fs.existsSync(eventsDir)) {
            console.log('Events directory not found');
            return;
        }

        const files = fs.readdirSync(eventsDir);
        console.log(`📁 Found ${files.length} files in events directory`);
        
        for (const file of files) {
            // Skip non-markdown files, assignment files, arbeitsplan files, and README
            if (!file.endsWith('.md') || 
                file.includes('assignment') || 
                file.includes('arbeitsplan') ||
                file === 'README.md') {
                console.log(`⏭️  Skipping: ${file}`);
                continue;
            }

            try {
                const filePath = path.join(eventsDir, file);
                const content = fs.readFileSync(filePath, 'utf8');
                const event = this.parseMarkdownEvent(content, file);
                
                if (event) {
                    // Validate dates before adding
                    if (this.isValidDate(event.startDate) && this.isValidDate(event.endDate)) {
                        this.events.push(event);
                        console.log(`✅ Loaded: ${event.title} (${event.startDate.toISOString()})`);
                    } else {
                        console.warn(`⚠️  ${file}: Invalid date format - Start: ${event.startDate}, End: ${event.endDate}`);
                    }
                } else {
                    console.warn(`⚠️  ${file}: Could not parse event`);
                }
            } catch (error) {
                console.error(`❌ Error loading ${file}:`, error.message);
            }
        }
        
        console.log(`\n📊 Total events loaded: ${this.events.length}`);
    }

    /**
     * Prüft ob ein Date-Objekt gültig ist
     * @param {Date} date - Zu prüfendes Datum
     * @returns {boolean} true wenn gültiges Datum
     */
    isValidDate(date) {
        return date instanceof Date && !isNaN(date.getTime());
    }

    /**
     * Parst eine Event-Markdown-Datei
     *
     * Erwartet YAML-Frontmatter zwischen --- Zeilen:
     * ---
     * id: event-2024
     * title: Vereinsanlass
     * startDate: 2024-06-15T18:00
     * endDate: 2024-06-15T22:00
     * ---
     *
     * @param {string} content - Dateiinhalt
     * @param {string} filename - Dateiname für Fehlermeldungen
     * @returns {Object|null} Event-Objekt oder null bei Fehlern
     */
    parseMarkdownEvent(content, filename) {
        try {
            // Parse Frontmatter with different line ending support
            const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
            if (!frontmatterMatch) {
                console.warn(`⚠️  ${filename}: No frontmatter found`);
                return null;
            }

            const [, frontmatterStr, markdownContent] = frontmatterMatch;
            const frontmatter = this.parseFrontmatter(frontmatterStr, filename);
            
            // Validate required fields
            if (!frontmatter.id || !frontmatter.title) {
                console.warn(`⚠️  ${filename}: Missing required fields (id or title)`);
                return null;
            }

            if (!frontmatter.startDate || !frontmatter.endDate) {
                console.warn(`⚠️  ${filename}: Missing date fields`);
                return null;
            }

            // Parse dates with validation
            const startDate = this.parseDate(frontmatter.startDate, filename, 'startDate');
            const endDate = this.parseDate(frontmatter.endDate, filename, 'endDate');
            
            if (!startDate || !endDate) {
                return null;
            }

            const registrationDeadline = frontmatter.registrationDeadline ? 
                this.parseDate(frontmatter.registrationDeadline, filename, 'registrationDeadline') : null;
            
            return {
                ...frontmatter,
                description: markdownContent.trim(),
                startDate: startDate,
                endDate: endDate,
                registrationDeadline: registrationDeadline
            };
        } catch (error) {
            console.error(`❌ Error parsing ${filename}:`, error.message);
            return null;
        }
    }

    /**
     * Parst einen Datums-String zu einem Date-Objekt
     *
     * Unterstützt ISO-8601 Format (YYYY-MM-DDTHH:mm)
     * Entfernt automatisch Anführungszeichen
     *
     * @param {string} dateStr - Datums-String
     * @param {string} filename - Dateiname für Fehlermeldungen
     * @param {string} fieldName - Feldname (startDate, endDate, etc.)
     * @returns {Date|null} Date-Objekt oder null bei ungültigem Format
     */
    parseDate(dateStr, filename, fieldName) {
        try {
            // Remove quotes if present
            dateStr = String(dateStr).replace(/['"]/g, '').trim();
            
            const date = new Date(dateStr);
            
            if (isNaN(date.getTime())) {
                console.warn(`⚠️  ${filename}: Invalid ${fieldName} format: "${dateStr}"`);
                return null;
            }
            
            return date;
        } catch (error) {
            console.error(`❌ ${filename}: Error parsing ${fieldName}:`, error.message);
            return null;
        }
    }

    /**
     * Parst YAML-Frontmatter zu einem JavaScript-Objekt
     *
     * Unterstützt:
     * - Einfache key: value Paare
     * - Booleans (true/false)
     * - Zahlen
     * - Arrays in [] oder YAML-Format (- item)
     *
     * @param {string} frontmatterStr - YAML-String ohne ---
     * @param {string} filename - Dateiname für Fehlermeldungen
     * @returns {Object} Geparstes Objekt
     */
    parseFrontmatter(frontmatterStr, filename) {
        const result = {};
        const lines = frontmatterStr.split(/\r?\n/).filter(line => line.trim());
        
        let currentKey = null;
        let currentValue = '';
        let inArray = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Skip comments
            if (line.trim().startsWith('#')) continue;
            
            // Check if this is a key-value line
            const keyValueMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
            
            if (keyValueMatch && !line.startsWith(' ') && !line.startsWith('-')) {
                // Save previous key-value if exists
                if (currentKey) {
                    result[currentKey] = this.parseValue(currentValue.trim());
                }
                
                currentKey = keyValueMatch[1];
                currentValue = keyValueMatch[2];
                inArray = false;
                
                // Check if value starts an array or object
                if (currentValue.trim() === '' && i + 1 < lines.length) {
                    const nextLine = lines[i + 1];
                    if (nextLine.trim().startsWith('-') || nextLine.trim().startsWith(' ')) {
                        inArray = true;
                        currentValue = '';
                    }
                }
            } else if (inArray || line.trim().startsWith('-') || line.startsWith('  ')) {
                // Continuation of array or nested object
                currentValue += '\n' + line;
            }
        }
        
        // Save last key-value
        if (currentKey) {
            result[currentKey] = this.parseValue(currentValue.trim());
        }
        
        return result;
    }

    /**
     * Konvertiert einen Frontmatter-Wert zum passenden JavaScript-Typ
     *
     * @param {string} value - Roher Wert aus Frontmatter
     * @returns {string|boolean|number|Array} Konvertierter Wert
     */
    parseValue(value) {
        if (!value) return '';
        
        // Remove surrounding quotes
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        
        // Parse booleans
        if (value === 'true') return true;
        if (value === 'false') return false;
        
        // Parse numbers
        if (!isNaN(value) && value !== '' && !isNaN(parseFloat(value))) {
            return parseFloat(value);
        }
        
        // Parse simple arrays [item1, item2]
        if (value.startsWith('[') && value.endsWith(']')) {
            const arrayContent = value.slice(1, -1);
            return arrayContent.split(',').map(s => s.trim().replace(/['"]/g, ''));
        }
        
        // Parse multi-line arrays (YAML format)
        if (value.includes('\n-')) {
            const items = [];
            const itemMatches = value.match(/- (.+)/g);
            if (itemMatches) {
                itemMatches.forEach(match => {
                    items.push(match.substring(2).trim());
                });
            }
            return items;
        }
        
        return value;
    }

    /**
     * Generiert den ICS-Kalender-String
     *
     * ICS-Struktur:
     * - VCALENDAR Header mit Kalender-Metadaten
     * - VEVENT pro Event mit UID, Datum, Titel, Beschreibung
     * - VCALENDAR Footer
     *
     * @returns {string} Kompletter ICS-Inhalt mit CRLF Zeilenenden
     */
    generateICS() {
        const now = new Date();
        let ics = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            `PRODID:${FWV_CONFIG.system.calendar.prodId}`,
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            `X-WR-CALNAME:${FWV_CONFIG.system.calendar.calendarName}`,
            `X-WR-CALDESC:${FWV_CONFIG.system.calendar.calendarDescription}`,
            `X-WR-TIMEZONE:${FWV_CONFIG.system.defaultTimezone}`
        ];

        this.events.forEach(event => {
            try {
                const uid = `${event.id}@feuerwehrverein-raura.ch`;
                const dtstart = this.formatDateForICS(event.startDate);
                const dtend = this.formatDateForICS(event.endDate);
                const dtstamp = this.formatDateForICS(now);
                
                // Clean description - remove markdown formatting
                const description = (event.description || '')
                    .replace(/\*\*(.*?)\*\*/g, '$1')
                    .replace(/\*(.*?)\*/g, '$1')
                    .replace(/#{1,6}\s/g, '')
                    .replace(/\n/g, '\\n')
                    .replace(/,/g, '\\,')
                    .substring(0, 1000); // Increase description length limit

                ics.push(
                    'BEGIN:VEVENT',
                    `UID:${uid}`,
                    `DTSTAMP:${dtstamp}`,
                    `DTSTART:${dtstart}`,
                    `DTEND:${dtend}`,
                    `SUMMARY:${event.title}`,
                    `DESCRIPTION:${description}`,
                    `LOCATION:${event.location || 'TBD'}`,
                    `ORGANIZER;CN=${event.organizer || 'Feuerwehrverein Raura'}:mailto:${event.email || 'info@feuerwehrverein-raura.ch'}`,
                    `CATEGORIES:${event.category || 'Event'}`,
                    'STATUS:CONFIRMED',
                    'END:VEVENT'
                );
            } catch (error) {
                console.error(`❌ Error generating ICS for event ${event.id}:`, error.message);
            }
        });

        ics.push('END:VCALENDAR');
        return ics.join('\r\n');
    }

    /**
     * Formatiert ein Date-Objekt für ICS (lokale Zeit ohne Zeitzone)
     *
     * ICS-Format: YYYYMMDDTHHmmss (z.B. 20240615T180000)
     *
     * @param {Date} date - Zu formatierendes Datum
     * @returns {string} ICS-formatierter Datums-String
     * @throws {Error} Bei ungültigem Datum
     */
    formatDateForICS(date) {
        if (!this.isValidDate(date)) {
            throw new Error(`Invalid date object: ${date}`);
        }
        // For local time events (no timezone conversion)
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        
        return `${year}${month}${day}T${hours}${minutes}${seconds}`;
    }

    /**
     * Hauptmethode - Führt die komplette ICS-Generierung durch
     *
     * 1. Lädt alle Events
     * 2. Generiert ICS-Inhalt
     * 3. Speichert calendar.ics
     *
     * Bei leerer Event-Liste wird ein leerer Kalender erstellt
     */
    async run() {
        try {
            console.log('🚀 Starting ICS generation...\n');
            
            await this.loadEvents();
            
            if (this.events.length === 0) {
                console.warn('⚠️  No events found to generate ICS file');
                // Create empty calendar
                const emptyICS = [
                    'BEGIN:VCALENDAR',
                    'VERSION:2.0',
                    'PRODID:-//Feuerwehrverein Raura Kaiseraugst//Vereinskalender//DE',
                    'CALSCALE:GREGORIAN',
                    'METHOD:PUBLISH',
                    'X-WR-CALNAME:Feuerwehrverein Raura Kaiseraugst',
                    'END:VCALENDAR'
                ].join('\r\n');
                
                const outputPath = path.join(__dirname, '..', 'calendar.ics');
                fs.writeFileSync(outputPath, emptyICS);
                console.log('✅ Generated empty calendar.ics (no events available)');
                return;
            }
            
            const icsContent = this.generateICS();
            
            const outputPath = path.join(__dirname, '..', 'calendar.ics');
            fs.writeFileSync(outputPath, icsContent);
            
            console.log(`\n✅ Generated calendar.ics with ${this.events.length} events`);
            console.log(`📍 Output: ${outputPath}`);
        } catch (error) {
            console.error('\n❌ Error generating ICS file:', error);
            console.error('Stack trace:', error.stack);
            process.exit(1);
        }
    }
}

// Run the generator
new ICSGenerator().run();
