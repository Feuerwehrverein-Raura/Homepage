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
        
        for (const file of files) {
            if (file.endsWith('.md')) {
                const filePath = path.join(eventsDir, file);
                const content = fs.readFileSync(filePath, 'utf8');
                const event = this.parseMarkdownEvent(content);
                
                if (event) {
                    this.events.push(event);
                }
            }
        }
    }

    parseMarkdownEvent(content) {
        // Parse Frontmatter
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        if (!frontmatterMatch) return null;

        const [, frontmatterStr, markdownContent] = frontmatterMatch;
        const frontmatter = this.parseFrontmatter(frontmatterStr);
        
        return {
            ...frontmatter,
            description: markdownContent.trim(),
            startDate: new Date(frontmatter.startDate),
            endDate: new Date(frontmatter.endDate),
            registrationDeadline: frontmatter.registrationDeadline ? 
                new Date(frontmatter.registrationDeadline) : null
        };
    }

    parseFrontmatter(frontmatterStr) {
        const result = {};
        const lines = frontmatterStr.split('\n');
        
        for (const line of lines) {
            const [key, ...valueParts] = line.split(':');
            if (key && valueParts.length > 0) {
                let value = valueParts.join(':').trim();
                
                // Parse arrays
                if (value.startsWith('[') && value.endsWith(']')) {
                    value = value.slice(1, -1).split(',').map(s => s.trim());
                }
                
                // Parse booleans
                if (value === 'true') value = true;
                if (value === 'false') value = false;
                
                result[key.trim()] = value;
            }
        }
        
        return result;
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
            const uid = `${event.id}@feuerwehrverein-raura.ch`;
            const dtstart = this.formatDateForICS(event.startDate);
            const dtend = this.formatDateForICS(event.endDate);
            const dtstamp = this.formatDateForICS(now);
            
            // Clean description - remove markdown formatting and newlines
            const description = event.description
                .replace(/\*\*(.*?)\*\*/g, '$1')
                .replace(/\*(.*?)\*/g, '$1')
                .replace(/#{1,6}\s/g, '')
                .replace(/\n/g, '\\n')
                .replace(/,/g, '\\,');

            ics.push(
                'BEGIN:VEVENT',
                `UID:${uid}`,
                `DTSTAMP:${dtstamp}`,
                `DTSTART:${dtstart}`,
                `DTEND:${dtend}`,
                `SUMMARY:${event.title}`,
                `DESCRIPTION:${description}`,
                `LOCATION:${event.location}`,
                `ORGANIZER;CN=${event.organizer}:mailto:${event.email}`,
                `CATEGORIES:${event.category}`,
                'STATUS:CONFIRMED',
                'END:VEVENT'
            );
        });

        ics.push('END:VCALENDAR');
        return ics.join('\r\n');
    }

    formatDateForICS(date) {
        return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    }

    async run() {
        try {
            await this.loadEvents();
            const icsContent = this.generateICS();
            
            const outputPath = path.join(__dirname, '..', 'calendar.ics');
            fs.writeFileSync(outputPath, icsContent);
            
            console.log(`Generated calendar.ics with ${this.events.length} events`);
        } catch (error) {
            console.error('Error generating ICS file:', error);
            process.exit(1);
        }
    }
}

// Run the generator
new ICSGenerator().run();
