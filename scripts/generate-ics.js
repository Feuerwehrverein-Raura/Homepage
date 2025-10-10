const fs = require('fs');
const path = require('path');

class ICSGenerator {
    constructor() {
        this.events = [];
    }

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

    isValidDate(date) {
        return date instanceof Date && !isNaN(date.getTime());
    }

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

    generateICS() {
        const now = new Date();
        let ics = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Feuerwehrverein Raura Kaiseraugst//Vereinskalender//DE',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'X-WR-CALNAME:Feuerwehrverein Raura Kaiseraugst',
            'X-WR-CALDESC:Termine und Veranstaltungen des Feuerwehrvereins Raura Kaiseraugst',
            'X-WR-TIMEZONE:Europe/Zurich'
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
                    .substring(0, 500); // Limit description length

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

    formatDateForICS(date) {
        if (!this.isValidDate(date)) {
            throw new Error(`Invalid date object: ${date}`);
        }
        return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    }

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
