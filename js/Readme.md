# 📜 JavaScript Modules Documentation

This directory contains the core JavaScript modules that power the Feuerwehrverein Raura Homepage.

---

## 📁 Directory Structure

```
js/
├── calendar.js          # Calendar view and event display
├── events.js           # Event management and rendering
└── schichtplan.js      # Shift planning and management
```

---

## 📋 Module Overview

### **calendar.js**
**Purpose:** Interactive calendar with month, week, and list views

**Features:**
- Month/Week/List view switching
- Event rendering on calendar grid
- Event modal with details
- ICS download functionality
- Calendar subscription
- Responsive layout

**Dependencies:**
- Loads events from markdown files
- Uses `events.js` parsing utilities

---

### **events.js**
**Purpose:** Event management, parsing, and display

**Features:**
- Markdown frontmatter parsing
- Event list rendering
- Registration form generation
- Shift selection interface
- Email generation for registrations
- Filtering and sorting

**Dependencies:**
- Fetches event markdown files
- Parses YAML frontmatter
- Generates mailto: links

---

### **schichtplan.js**
**Purpose:** Shift plan management and PDF generation

**Features:**
- Interactive shift assignment
- Drag-and-drop interface
- Live statistics
- Markdown export
- PDF generation (uses jsPDF)
- Assignment tracking

**Dependencies:**
- jsPDF library for PDF generation
- Event and assignment markdown parsing

---

## 🔧 Core Functionality

### **Event Parsing**

All modules use a common event parsing approach:

```javascript
parseMarkdownEvent(content, filename) {
    // Parse frontmatter
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    
    if (!frontmatterMatch) return null;
    
    const [, frontmatterStr, markdownContent] = frontmatterMatch;
    const frontmatter = this.parseFrontmatter(frontmatterStr);
    
    return {
        ...frontmatter,
        description: markdownContent.trim(),
        startDate: new Date(frontmatter.startDate),
        endDate: new Date(frontmatter.endDate)
    };
}
```

### **Date Handling**

**Format:** ISO 8601
```javascript
// Parsing
const date = new Date('2025-10-14T14:00:00');

// Validation
function isValidDate(date) {
    return date instanceof Date && !isNaN(date.getTime());
}

// Formatting for display
function formatDate(date) {
    return new Intl.DateTimeFormat('de-CH', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}
```

### **Event Filtering**

```javascript
// Get upcoming events
function getUpcomingEvents(events) {
    const now = new Date();
    return events
        .filter(event => event.startDate > now)
        .sort((a, b) => a.startDate - b.startDate);
}

// Filter by category
function filterByCategory(events, category) {
    return events.filter(event => event.category === category);
}

// Filter by tag
function filterByTag(events, tag) {
    return events.filter(event => 
        event.tags && event.tags.includes(tag)
    );
}
```

---

## 📅 calendar.js Details

### **Class: CalendarManager**

```javascript
class CalendarManager {
    constructor() {
        this.currentDate = new Date();
        this.viewMode = 'month'; // 'month', 'week', or 'list'
        this.events = [];
    }
    
    async initialize() {
        await this.loadEvents();
        this.renderCalendar();
        this.setupEventListeners();
    }
    
    async loadEvents() {
        // Fetch and parse markdown files
    }
    
    renderCalendar() {
        // Render based on viewMode
    }
    
    showEventDetails(eventId) {
        // Display event modal
    }
}
```

### **Key Methods**

**Navigation:**
```javascript
previousMonth() {
    this.currentDate.setMonth(this.currentDate.getMonth() - 1);
    this.renderCalendar();
}

nextMonth() {
    this.currentDate.setMonth(this.currentDate.getMonth() + 1);
    this.renderCalendar();
}

goToToday() {
    this.currentDate = new Date();
    this.renderCalendar();
}
```

**View Switching:**
```javascript
toggleView() {
    switch(this.viewMode) {
        case 'month':
            this.renderMonthView();
            break;
        case 'week':
            this.renderWeekView();
            break;
        case 'list':
            this.renderListView();
            break;
    }
}
```

**ICS Generation:**
```javascript
generateICS(events) {
    let ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Feuerwehrverein Raura//Kalender//DE',
        // ... event entries ...
        'END:VCALENDAR'
    ];
    return ics.join('\r\n');
}

downloadAllICS() {
    const icsData = this.generateICS(this.events);
    this.downloadICS(icsData, 'fwv-raura-calendar.ics');
}
```

---

## 🎫 events.js Details

### **Class: EventManager**

```javascript
class EventManager {
    constructor() {
        this.events = [];
        this.filters = {
            category: null,
            tags: [],
            status: null
        };
    }
    
    async initialize() {
        await this.loadEventsFromMarkdown();
        this.renderEvents();
        this.setupEventListeners();
    }
    
    async loadEventsFromMarkdown() {
        const eventFiles = [
            'events/chilbi-2024.md',
            'events/chilbi-2025.md',
            'events/grillplausch-2024.md'
            // ... more events
        ];
        
        for (const file of eventFiles) {
            const response = await fetch(file);
            const content = await response.text();
            const event = this.parseMarkdownEvent(content, file);
            if (event) {
                this.events.push(event);
            }
        }
    }
}
```

### **Key Methods**

**Event Rendering:**
```javascript
renderEvents() {
    const filteredEvents = this.applyFilters(this.events);
    const container = document.getElementById('events-container');
    
    filteredEvents.forEach(event => {
        const card = this.createEventCard(event);
        container.appendChild(card);
    });
}

createEventCard(event) {
    // Create HTML card with event details
    // Include registration button if applicable
    // Add badges for status/category
}
```

**Registration Handling:**
```javascript
handleRegistration(event) {
    if (event.shifts && event.shifts.length > 0) {
        // Helper registration with shift selection
        this.showShiftSelection(event);
    } else if (event.participantRegistration) {
        // Participant registration
        this.showParticipantForm(event);
    }
}

generateRegistrationEmail(event, formData) {
    const subject = `Anmeldung: ${event.title}`;
    let body = `Hallo ${event.organizer},\n\n`;
    
    if (formData.shifts) {
        body += `hiermit melde ich mich als Helfer an:\n\n`;
        formData.shifts.forEach(shift => {
            body += `• ${shift.name} (${shift.date}, ${shift.time})\n`;
        });
    } else {
        body += `hiermit melde ich mich an:\n`;
        body += `Anzahl Personen: ${formData.participants}\n`;
    }
    
    body += `\nKontaktdaten:\n`;
    body += `Name: ${formData.name}\n`;
    body += `E-Mail: ${formData.email}\n`;
    
    return `mailto:${event.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
```

**Filtering:**
```javascript
applyFilters(events) {
    let filtered = events;
    
    if (this.filters.category) {
        filtered = filtered.filter(e => e.category === this.filters.category);
    }
    
    if (this.filters.tags.length > 0) {
        filtered = filtered.filter(e => 
            e.tags && e.tags.some(tag => this.filters.tags.includes(tag))
        );
    }
    
    if (this.filters.status) {
        filtered = filtered.filter(e => this.getStatus(e) === this.filters.status);
    }
    
    return filtered;
}

getStatus(event) {
    const now = new Date();
    if (event.endDate < now) return 'past';
    if (event.startDate <= now && event.endDate >= now) return 'ongoing';
    return 'upcoming';
}
```

---

## 👷 schichtplan.js Details

### **Class: SchichtplanManager**

```javascript
class SchichtplanManager {
    constructor() {
        this.currentEvent = null;
        this.assignments = {};
        this.isDirty = false; // Track unsaved changes
    }
    
    async initialize() {
        await this.loadEvents();
        this.setupEventListeners();
        this.setupAutosave();
    }
    
    async loadEvent(eventId) {
        const event = this.events.find(e => e.id === eventId);
        if (!event) return;
        
        this.currentEvent = event;
        await this.loadAssignments(eventId);
        this.renderShiftplan();
    }
    
    async loadAssignments(eventId) {
        const assignmentFile = `events/${eventId}-assignments.md`;
        try {
            const response = await fetch(assignmentFile);
            const content = await response.text();
            this.assignments = this.parseAssignments(content);
        } catch (error) {
            console.warn('No assignment file found, starting fresh');
            this.assignments = {};
        }
    }
}
```

### **Key Methods**

**Assignment Management:**
```javascript
assignPerson(shiftId, personName) {
    if (!this.assignments[shiftId]) {
        this.assignments[shiftId] = [];
    }
    
    this.assignments[shiftId].push({
        name: personName,
        timestamp: new Date().toISOString()
    });
    
    this.isDirty = true;
    this.updateStatistics();
    this.renderShiftplan();
}

removePerson(shiftId, personName) {
    if (!this.assignments[shiftId]) return;
    
    this.assignments[shiftId] = this.assignments[shiftId]
        .filter(p => p.name !== personName);
    
    this.isDirty = true;
    this.updateStatistics();
    this.renderShiftplan();
}
```

**Statistics:**
```javascript
calculateStatistics() {
    const stats = {
        totalShifts: this.currentEvent.shifts.length,
        filledShifts: 0,
        totalPositions: 0,
        filledPositions: 0,
        byCategory: {}
    };
    
    this.currentEvent.shifts.forEach(shift => {
        const assigned = this.assignments[shift.id] || [];
        stats.totalPositions += shift.needed;
        stats.filledPositions += assigned.length;
        
        if (assigned.length >= shift.needed) {
            stats.filledShifts++;
        }
        
        // Category stats
        const category = this.getShiftCategory(shift);
        if (!stats.byCategory[category]) {
            stats.byCategory[category] = {
                total: 0,
                filled: 0,
                positions: 0,
                assigned: 0
            };
        }
        
        stats.byCategory[category].total++;
        stats.byCategory[category].positions += shift.needed;
        stats.byCategory[category].assigned += assigned.length;
        if (assigned.length >= shift.needed) {
            stats.byCategory[category].filled++;
        }
    });
    
    return stats;
}
```

**Markdown Export:**
```javascript
generateMarkdown() {
    let md = `# Schichtplan ${this.currentEvent.title}\n\n`;
    md += `**Event:** ${this.currentEvent.id}\n`;
    md += `**Generiert:** ${new Date().toLocaleDateString('de-CH')}\n`;
    md += `**Status:** In Planung\n\n`;
    md += `---\n\n`;
    
    // Group by category
    const categories = this.groupShiftsByCategory();
    
    for (const [category, shifts] of Object.entries(categories)) {
        md += `## ${category}\n\n`;
        
        shifts.forEach(shift => {
            const assigned = this.assignments[shift.id] || [];
            const open = shift.needed - assigned.length;
            
            md += `### ${shift.id} (${shift.date}, ${shift.time}) - ${shift.needed} Personen benötigt\n`;
            
            assigned.forEach(person => {
                md += `- ${person.name}\n`;
            });
            
            if (open > 0) {
                md += `- **[OFFEN - ${open} ${open === 1 ? 'Platz' : 'Plätze'}]**\n`;
            }
            
            md += '\n';
        });
        
        md += '---\n\n';
    }
    
    // Add statistics
    const stats = this.calculateStatistics();
    md += `## Statistik\n\n`;
    
    for (const [category, stat] of Object.entries(stats.byCategory)) {
        md += `- **${category}:** ${stat.assigned}/${stat.positions} zugeteilt (${stat.positions - stat.assigned} offen)\n`;
    }
    
    md += `- **GESAMT:** ${stats.filledPositions}/${stats.totalPositions} Plätze zugeteilt (**${stats.totalPositions - stats.filledPositions} Plätze noch offen**)\n`;
    
    return md;
}
```

**PDF Generation:**
```javascript
async generatePDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(16);
    doc.text('Feuerwehrverein Raura, Kaiseraugst', 20, 20);
    doc.setFontSize(14);
    doc.text(`Arbeitsplan ${this.currentEvent.title}`, 20, 30);
    
    let y = 50;
    
    // Aufbau section
    const aufbau = this.getShiftsByCategory('Aufbau');
    if (aufbau.length > 0) {
        doc.setFontSize(12);
        doc.text('Aufbau', 20, y);
        y += 10;
        
        aufbau.forEach(shift => {
            const assigned = this.assignments[shift.id] || [];
            assigned.forEach(person => {
                doc.setFontSize(10);
                doc.text(`- ${person.name}`, 25, y);
                y += 6;
            });
        });
        
        y += 10;
    }
    
    // Betrieb table
    // ... table generation code ...
    
    // Abbau section
    const abbau = this.getShiftsByCategory('Abbau');
    if (abbau.length > 0) {
        doc.setFontSize(12);
        doc.text('Abbau', 20, y);
        y += 10;
        
        abbau.forEach(shift => {
            const assigned = this.assignments[shift.id] || [];
            assigned.forEach(person => {
                doc.setFontSize(10);
                doc.text(`- ${person.name}`, 25, y);
                y += 6;
            });
        });
    }
    
    // Save
    doc.save(`arbeitsplan-${this.currentEvent.id}.pdf`);
}
```

---

## 🔄 Common Utilities

### **Markdown Parsing**

```javascript
// Shared utility for all modules
function parseFrontmatter(frontmatterStr) {
    const result = {};
    const lines = frontmatterStr.split(/\r?\n/).filter(line => line.trim());
    
    for (const line of lines) {
        if (line.trim().startsWith('#')) continue;
        
        const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
        if (match) {
            const [, key, value] = match;
            result[key] = parseValue(value);
        }
    }
    
    return result;
}

function parseValue(value) {
    value = value.trim().replace(/^["']|["']$/g, '');
    
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (!isNaN(value) && value !== '') return parseFloat(value);
    if (value.startsWith('[') && value.endsWith(']')) {
        return value.slice(1, -1).split(',').map(s => s.trim());
    }
    
    return value;
}
```

### **Date Formatting**

```javascript
function formatDateShort(date) {
    return new Intl.DateTimeFormat('de-CH', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).format(date);
}

function formatDateLong(date) {
    return new Intl.DateTimeFormat('de-CH', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    }).format(date);
}

function formatTime(date) {
    return new Intl.DateTimeFormat('de-CH', {
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}
```

### **Error Handling**

```javascript
// Standard error handling pattern
async function loadData() {
    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.text();
        return parseData(data);
        
    } catch (error) {
        console.error('❌ Error loading data:', error);
        showErrorMessage('Daten konnten nicht geladen werden.');
        return null;
    }
}

function showErrorMessage(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded';
    errorDiv.textContent = message;
    document.getElementById('error-container').appendChild(errorDiv);
    
    setTimeout(() => errorDiv.remove(), 5000);
}
```

---

## 🎨 UI Components

### **Modal Component**

```javascript
function showModal(title, content) {
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modal-title');
    const modalContent = document.getElementById('modal-content');
    
    modalTitle.textContent = title;
    modalContent.innerHTML = content;
    modal.classList.remove('hidden');
    
    // Close on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
}

function closeModal() {
    const modal = document.getElementById('modal');
    modal.classList.add('hidden');
}
```

### **Loading Indicator**

```javascript
function showLoading(container) {
    container.innerHTML = `
        <div class="flex justify-center items-center py-12">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
        </div>
    `;
}

function hideLoading(container) {
    const loader = container.querySelector('.animate-spin');
    if (loader) loader.parentElement.remove();
}
```

---

## 🐛 Debugging

### **Console Logging**

All modules use emoji prefixes for easy identification:

```javascript
console.log('📄 Loading events...');
console.log('✅ Events loaded successfully');
console.warn('⚠️  No assignment file found');
console.error('❌ Error parsing event:', error);
```

### **Debug Mode**

Enable debug mode by adding to URL:
```
?debug=true
```

```javascript
const DEBUG = new URLSearchParams(window.location.search).get('debug') === 'true';

if (DEBUG) {
    console.log('🐛 Debug mode enabled');
    console.log('Events:', this.events);
    console.log('Assignments:', this.assignments);
}
```

---

## 📚 Dependencies

### **External Libraries**

- **jsPDF** - PDF generation (schichtplan.js)
- **Tailwind CSS** - Styling (all modules)

### **Browser APIs**

- **Fetch API** - Loading markdown files
- **localStorage** - Saving user preferences (optional)
- **Intl.DateTimeFormat** - Date formatting
- **URL API** - Parsing query parameters

---

## 🔒 Best Practices

### **Code Style**

```javascript
// ✅ Use descriptive variable names
const upcomingEvents = events.filter(e => e.startDate > now);

// ✅ Use async/await for promises
async loadEvents() {
    const data = await fetch(url);
    return await data.text();
}

// ✅ Handle errors gracefully
try {
    await loadData();
} catch (error) {
    console.error('Error:', error);
    showErrorMessage('Fehler beim Laden');
}

// ✅ Validate inputs
function assignPerson(shiftId, personName) {
    if (!shiftId || !personName) {
        throw new Error('Invalid parameters');
    }
    // ... rest of code
}
```

### **Performance**

```javascript
// ✅ Cache DOM queries
const container = document.getElementById('container');
events.forEach(event => {
    container.appendChild(createCard(event));
});

// ❌ Don't query in loop
events.forEach(event => {
    document.getElementById('container').appendChild(createCard(event));
});

// ✅ Use event delegation
container.addEventListener('click', (e) => {
    if (e.target.matches('.event-card')) {
        handleEventClick(e.target.dataset.id);
    }
});
```

---

## 📞 Support

**Issues with JavaScript modules:**
- 🐛 Report bugs: [GitHub Issues](https://github.com/Feuerwehrverein-Raura/Homepage/issues)
- 📧 Technical contact: webmaster@feuerwehrverein-raura.ch
- 📖 Main README: [../README.md](../README.md)

---

**Last Updated:** October 2025  
**Maintained by:** Feuerwehrverein Raura IT Team
