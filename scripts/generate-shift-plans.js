const fs = require('fs');
const path = require('path');

class ShiftPlanGenerator {
    constructor() {
        this.events = [];
        this.assignments = new Map();
        this.mockAssignments = this.createMockAssignments();
    }

    createMockAssignments() {
        // Mock-Anmeldungen basierend auf den PDF-Arbeitsplä
        return {
            'chilbi-2025': [
                // Aufbau
                { shiftId: 'aufbau', name: 'Stefan Müller', email: 'aktuar@fwv-raura.ch', timestamp: '2024-09-15T10:30:00Z' },
                { shiftId: 'aufbau', name: 'René Käslin', email: 'praesident@fwv-raura.ch', timestamp: '2024-09-15T11:15:00Z' },
                
                // Samstag 12-14
                { shiftId: 'samstag-kasse-12-14', name: 'Brigitte Käslin', email: 'brigitte@example.com', timestamp: '2024-09-16T14:20:00Z' },
                { shiftId: 'samstag-kasse-12-14', name: 'Conny Lengweiler', email: 'conny@example.com', timestamp: '2024-09-16T14:25:00Z' },
                { shiftId: 'samstag-bar-12-14', name: 'Giuseppe Costanza', email: 'kassier@fwv-raura.ch', timestamp: '2024-09-16T15:10:00Z' },
                
                // Samstag 16-18
                { shiftId: 'samstag-bar-16-18', name: 'Ramon Kahl', email: 'ramon@example.com', timestamp: '2024-09-17T09:45:00Z' },
                { shiftId: 'samstag-bar-16-18', name: 'Edi Grossenbacher', email: 'materialwart@fwv-raura.ch', timestamp: '2024-09-17T10:30:00Z' },
                { shiftId: 'samstag-kueche-16-18', name: 'Paola Meixueiro', email: 'paola@example.com', timestamp: '2024-09-17T11:20:00Z' },
                { shiftId: 'samstag-kasse-16-18', name: 'Raphael Kohler', email: 'raphael@example.com', timestamp: '2024-09-17T12:15:00Z' },
                
                // Samstag 18-20
                { shiftId: 'samstag-kueche-18-20', name: 'Helen Grossenbacher', email: 'helen@example.com', timestamp: '2024-09-18T08:30:00Z' },
                
                // Samstag 22-open
                { shiftId: 'samstag-bar-22-open', name: 'Andrea Schöllnast', email: 'andrea@example.com', timestamp: '2024-09-18T16:45:00Z' },
                { shiftId: 'samstag-bar-22-open', name: 'Oliver Jucker', email: 'oliver@example.com', timestamp: '2024-09-18T17:20:00Z' },
                { shiftId: 'samstag-kueche-22-open', name: 'Monika Heid', email: 'monika@example.com', timestamp: '2024-09-18T18:10:00Z' },
                { shiftId: 'samstag-kasse-22-open', name: 'Giuseppe Costanza', email: 'kassier@fwv-raura.ch', timestamp: '2024-09-18T18:30:00Z' },
                
                // Sonntag 12-14
                { shiftId: 'sonntag-bar-12-14', name: 'Ramon Kahl', email: 'ramon@example.com', timestamp: '2024-09-19T07:15:00Z' },
                { shiftId: 'sonntag-kasse-12-14', name: 'Giuseppe Costanza', email: 'kassier@fwv-raura.ch', timestamp: '2024-09-19T07:30:00Z' },
                
                // Sonntag 16-18
                { shiftId: 'sonntag-kueche-16-18', name: 'Dietmar Müller', email: 'dietmar@example.com', timestamp: '2024-09-19T10:45:00Z' },
                
                // Sonntag 18-20
                { shiftId: 'sonntag-bar-18-20', name: 'René Käslin', email: 'praesident@fwv-raura.ch', timestamp: '2024-09-19T13:20:00Z' },
                { shiftId: 'sonntag-kueche-18-20', name: 'Angi Engel', email: 'angi@example.com', timestamp: '2024-09-19T13:45:00Z' },
            ]
        };
    }

    async run() {
        try {
            await this.loadEvents();
            console.log(`Loaded ${this.events.length} events`);
            
            for (const event of this.events) {
                if (event.shifts && event.shifts.length > 0) {
                    await this.generateShiftPlan(event);
                }
            }
            
            console.log('✅ Shift plans generated successfully');
        } catch (error) {
            console.error('❌ Error generating shift plans:', error);
            process.exit(1);
        }
    }

    async loadEvents() {
        const eventsDir = path.join(__dirname, '..', 'events');
        
        if (!fs.existsSync(eventsDir)) {
            console.log('Events directory not found');
            return;
        }

        const files = fs.readdirSync(eventsDir);
        
        for (const file of files) {
            if (file.endsWith('.md') && !file.includes('arbeitsplan') && !file.includes('README')) {
                const filePath = path.join(eventsDir, file);
                const content = fs.readFileSync(filePath, 'utf8');
                const event = this.parseMarkdownEvent(content, file);
                
                if (event) {
                    this.events.push(event);
                }
            }
        }
    }

    parseMarkdownEvent(content, filename) {
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        if (!frontmatterMatch) return null;

        const [, frontmatterStr] = frontmatterMatch;
        const frontmatter = this.parseFrontmatter(frontmatterStr);
        
        if (!frontmatter.id || !frontmatter.title) {
            console.warn(`Missing required fields in ${filename}`);
            return null;
        }
        
        return frontmatter;
    }

    parseFrontmatter(frontmatterStr) {
        const result = {};
        const lines = frontmatterStr.split('\n');
        let currentKey = null;
        let currentValue = [];
        let inArray = false;
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            
            if (trimmed.startsWith('- ') && inArray) {
                // Array item
                if (currentKey === 'shifts') {
                    // Handle shift objects
                    const shiftLine = trimmed.substring(2);
                    if (shiftLine.startsWith('id:')) {
                        // New shift object
                        if (currentValue.length > 0) {
                            // Save previous shift
                            if (!result[currentKey]) result[currentKey] = [];
                            result[currentKey].push(this.parseShiftObject(currentValue));
                        }
                        currentValue = [shiftLine];
                    } else {
                        currentValue.push(shiftLine);
                    }
                } else {
                    // Simple array
                    const value = shiftLine.replace(/[\[\]]/g, '').trim();
                    if (!result[currentKey]) result[currentKey] = [];
                    result[currentKey].push(value);
                }
            } else if (trimmed.includes(':')) {
                // Save previous array if exists
                if (inArray && currentKey === 'shifts' && currentValue.length > 0) {
                    if (!result[currentKey]) result[currentKey] = [];
                    result[currentKey].push(this.parseShiftObject(currentValue));
                }
                
                const [key, ...valueParts] = trimmed.split(':');
                const value = valueParts.join(':').trim();
                currentKey = key.trim();
                
                if (value.startsWith('[') && value.endsWith(']')) {
                    // Simple array on one line
                    result[currentKey] = value.slice(1, -1).split(',').map(s => s.trim());
                    inArray = false;
                } else if (currentKey === 'shifts' && !value) {
                    // Start of shifts array
                    inArray = true;
                    currentValue = [];
                } else if (value) {
                    // Simple value
                    result[currentKey] = value;
                    inArray = false;
                } else {
                    // Key without value, might be start of array
                    inArray = true;
                    currentValue = [];
                }
            }
        }
        
        // Handle last shift if exists
        if (inArray && currentKey === 'shifts' && currentValue.length > 0) {
            if (!result[currentKey]) result[currentKey] = [];
            result[currentKey].push(this.parseShiftObject(currentValue));
        }
        
        return result;
    }

    parseShiftObject(lines) {
        const shift = {};
        for (const line of lines) {
            const [key, ...valueParts] = line.split(':');
            const value = valueParts.join(':').trim();
            if (key && value) {
                const cleanKey = key.trim();
                let cleanValue = value.trim();
                
                if (cleanKey === 'needed' && !isNaN(cleanValue)) {
                    cleanValue = parseInt(cleanValue);
                }
                
                shift[cleanKey] = cleanValue;
            }
        }
        return shift;
    }

    async generateShiftPlan(event) {
        const assignments = this.mockAssignments[event.id] || [];
        const markdown = this.createShiftPlanMarkdown(event, assignments);
        
        const filename = path.join(__dirname, '..', 'events', `${event.id}-arbeitsplan.md`);
        fs.writeFileSync(filename, markdown);
        
        console.log(`📋 Generated shift plan: ${event.id}-arbeitsplan.md`);
    }

    createShiftPlanMarkdown(event, assignments) {
        const filledShifts = new Set(assignments.map(a => a.shiftId)).size;
        const totalShifts = event.shifts.length;
        const openShifts = totalShifts - filledShifts;
        
        const now = new Date();
        const criticalShifts = this.findCriticalShifts(event, assignments);
        const shiftsByCategory = this.groupShiftsByCategory(event.shifts);

        return `---
parent_event: ${event.id}
title: Arbeitsplan ${event.title}
generated: ${now.toISOString()}
last_updated: ${now.toISOString()}
total_shifts: ${totalShifts}
filled_shifts: ${filledShifts}
open_shifts: ${openShifts}
critical_count: ${criticalShifts.length}
---

# 📋 Arbeitsplan ${event.title}

**Veranstaltung:** ${event.title}  
**Datum:** ${this.formatEventDate(event)}  
**Ort:** ${event.location}  
**Stand:** ${now.toLocaleDateString('de-DE')}, ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr

## 📊 Übersicht

- ✅ **Besetzte Schichten:** ${filledShifts} von ${totalShifts}
- ❌ **Offene Schichten:** ${openShifts}
- ⚠️ **Kritische Bereiche:** ${criticalShifts.length > 0 ? criticalShifts.map(s => s.name).join(', ') : 'Keine'}

${this.generateProgressBar(filledShifts, totalShifts)}

---

${this.generateShiftSections(shiftsByCategory, assignments)}

${criticalShifts.length > 0 ? this.generateCriticalSection(criticalShifts) : ''}

## 📞 Springer-System

**Hauptspringer:** Stefan Müller (Aktuar)
- Verfügbar: Samstag & Sonntag ganztags
- Kontakt: aktuar@fwv-raura.ch

**Weitere Springer:**
- René Käslin (bei Bedarf)
- Giuseppe Costanza (flexible Einsätze)

---

## 📧 Kontakt & Nachfragen

**Schichtkoordination:** ${event.organizer}  
📧 ${event.email}  

**Anmeldung noch möglich bis:** ${event.registrationDeadline ? new Date(event.registrationDeadline).toLocaleDateString('de-DE') : 'Siehe Event-Details'}

---

*Letzte Aktualisierung: ${now.toLocaleDateString('de-DE')}, ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr*  
*Automatisch generiert aus Event-Anmeldungen*`;
    }

    formatEventDate(event) {
        const start = new Date(event.startDate);
        const end = new Date(event.endDate);
        
        if (start.toDateString() === end.toDateString()) {
            return start.toLocaleDateString('de-DE', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });
        } else {
            return `${start.toLocaleDateString('de-DE', { 
                day: 'numeric', 
                month: 'long' 
            })}-${end.toLocaleDateString('de-DE', { 
                day: 'numeric', 
                month: 'long', 
                year: 'numeric' 
            })}`;
        }
    }

    generateProgressBar(filled, total) {
        const percentage = Math.round((filled / total) * 100);
        const filledBlocks = Math.round((filled / total) * 20);
        const emptyBlocks = 20 - filledBlocks;
        
        const bar = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);
        
        return `
**Fortschritt:** ${percentage}%  
\`${bar}\` ${filled}/${total}`;
    }

    groupShiftsByCategory(shifts) {
        const categories = new Map();
        
        for (const shift of shifts) {
            let category;
            if (shift.id.includes('aufbau')) {
                category = 'aufbau';
            } else if (shift.id.includes('abbau')) {
                category = 'abbau';
            } else if (shift.id.includes('samstag')) {
                category = 'samstag';
            } else if (shift.id.includes('sonntag')) {
                category = 'sonntag';
            } else {
                category = 'sonstige';
            }
            
            if (!categories.has(category)) {
                categories.set(category, []);
            }
            categories.get(category).push(shift);
        }
        
        return categories;
    }

    generateShiftSections(shiftsByCategory, assignments) {
        let sections = '';
        
        const categoryOrder = ['aufbau', 'samstag', 'sonntag', 'abbau', 'sonstige'];
        const categoryTitles = {
            'aufbau': '🔨 Aufbau',
            'samstag': '🎪 Chilbi-Betrieb Samstag',
            'sonntag': '🎪 Chilbi-Betrieb Sonntag', 
            'abbau': '🔧 Abbau',
            'sonstige': '📋 Weitere Schichten'
        };
        
        for (const category of categoryOrder) {
            if (!shiftsByCategory.has(category)) continue;
            
            const shifts = shiftsByCategory.get(category);
            sections += `## ${categoryTitles[category]}\n\n`;
            
            if (category === 'samstag' || category === 'sonntag') {
                sections += this.generateDailyShiftTables(shifts, assignments);
            } else {
                sections += this.generateSimpleShiftTable(shifts, assignments);
            }
            
            sections += '\n---\n\n';
        }
        
        return sections;
    }

    generateDailyShiftTables(shifts, assignments) {
        // Group by time slots
        const timeSlots = new Map();
        
        for (const shift of shifts) {
            const timeMatch = shift.time.match(/(\d{2}:\d{2})-(\d{2}:\d{2}|Open End)/);
            if (timeMatch) {
                const timeKey = `${timeMatch[1]}-${timeMatch[2]}`;
                if (!timeSlots.has(timeKey)) {
                    timeSlots.set(timeKey, { time: shift.time, shifts: [] });
                }
                timeSlots.get(timeKey).shifts.push(shift);
            }
        }
        
        let table = '';
        
        for (const [timeKey, timeSlot] of timeSlots.entries()) {
            table += `### ${timeSlot.time} Uhr\n\n`;
            table += '| Bereich | Benötigt | Angemeldet | Status | Helfer |\n';
            table += '|---------|----------|------------|--------|--------|\n';
            
            // Sort shifts by area (Bar, Küche, Kasse)
            const sortedShifts = timeSlot.shifts.sort((a, b) => {
                const order = { 'bar': 0, 'kueche': 1, 'kasse': 2 };
                const aType = a.id.includes('bar') ? 'bar' : a.id.includes('kueche') ? 'kueche' : 'kasse';
                const bType = b.id.includes('bar') ? 'bar' : b.id.includes('kueche') ? 'kueche' : 'kasse';
                return order[aType] - order[bType];
            });
            
            for (const shift of sortedShifts) {
                const assignedHelpers = assignments.filter(a => a.shiftId === shift.id);
                const needed = shift.needed || 1;
                const assigned = assignedHelpers.length;
                
                let status, statusIcon;
                if (assigned >= needed) {
                    status = '✅ Besetzt';
                    statusIcon = '';
                } else if (assigned === 0) {
                    status = `❌ ${needed} fehlen`;
                    statusIcon = assigned === 0 ? ' - ⚠️ KRITISCH' : '';
                } else {
                    status = `⚠️ ${needed - assigned} fehlen`;
                    statusIcon = '';
                }
                
                const helpers = assigned > 0 
                    ? assignedHelpers.map(h => h.name).join(', ') 
                    : '-';
                
                const areaName = shift.description.split(' - ')[0] || 
                    (shift.id.includes('bar') ? 'Bar' : 
                     shift.id.includes('kueche') ? 'Küche' : 'Kasse');
                
                table += `| **${areaName}** | ${needed} | **${assigned}** | ${status} | ${helpers} |\n`;
            }
            
            table += '\n';
        }
        
        return table;
    }

    generateSimpleShiftTable(shifts, assignments) {
        let table = '| Schicht | Zeit | Benötigt | Angemeldet | Status |\n';
        table += '|---------|------|----------|------------|---------|\n';
        
        for (const shift of shifts) {
            const assignedHelpers = assignments.filter(a => a.shiftId === shift.id);
            const needed = shift.needed || 1;
            const assigned = assignedHelpers.length;
            
            let status;
            if (assigned >= needed) {
                status = '✅ Besetzt';
            } else if (assigned === 0) {
                status = `❌ ${needed} fehlen`;
            } else {
                status = `⚠️ ${needed - assigned} fehlen`;
            }
            
            table += `| **${shift.name}** | ${shift.time} | ${needed} | **${assigned}** | ${status} |\n`;
        }
        
        table += '\n**Angemeldete Helfer:**\n';
        
        if (assignments.length > 0) {
            for (const shift of shifts) {
                const assignedHelpers = assignments.filter(a => a.shiftId === shift.id);
                if (assignedHelpers.length > 0) {
                    table += `- **${shift.name}:** ${assignedHelpers.map(h => h.name).join(', ')}\n`;
                }
            }
        } else {
            table += '- ❌ **Noch keine Anmeldungen!**\n';
        }
        
        return table;
    }

    findCriticalShifts(event, assignments) {
        return event.shifts.filter(shift => {
            const assignedCount = assignments.filter(a => a.shiftId === shift.id).length;
            return assignedCount === 0;
        });
    }

    generateCriticalSection(criticalShifts) {
        return `
## 🚨 Dringende Hilfe gesucht

### ❌ Kritische Schichten (0 Anmeldungen)
${criticalShifts.map(shift => `- **${shift.name}** (${shift.time}): ${shift.description}`).join('\n')}

### 📞 Sofortige Unterstützung nötig
Diese Schichten haben noch **keine einzige Anmeldung**! Bitte meldet euch dringend an.

---`;
    }
}

// Run the generator
if (require.main === module) {
    new ShiftPlanGenerator().run();
}

module.exports = ShiftPlanGenerator;
