/**
 * pdf-generator.js - PDF-Generator fuer Arbeitsplaene und Event-Uebersichten
 *
 * Generiert professionelle PDF-Dokumente fuer:
 * 1. Einzelne Arbeitsplaene (Schichtplan pro Event)
 * 2. Event-Uebersichten (alle Events mit Statistiken)
 *
 * Features:
 * - Statistik-Dashboard (besetzte/offene Schichten)
 * - Kritische Bereiche hervorgehoben (rot)
 * - FWV-Branding (Rot #d32f2f)
 * - Kontaktdaten und Springer-System
 * - Header/Footer mit Seitenzahlen
 *
 * Verwendung:
 *   const generator = new PDFGenerator();
 *   await generator.initialize();
 *   await generator.generateShiftPlanPDF(event, assignments, markdown);
 *   await generator.close();
 *
 * Ausgabe-Verzeichnis: pdfs/ im Wurzelverzeichnis
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const FWV_CONFIG = require('./config.js');

/**
 * PDFGenerator-Klasse fuer Arbeitsplan-PDFs
 *
 * Verwaltet eine Puppeteer-Browser-Instanz fuer effiziente
 * Batch-Generierung mehrerer PDFs.
 */
class PDFGenerator {
    /**
     * Konstruktor - Setzt Pfade fuer Ausgabe und Logo
     */
    constructor() {
        this.browser = null;                                    // Puppeteer Browser-Instanz
        this.outputDir = path.join(__dirname, '..', 'pdfs');   // Ausgabeverzeichnis
        this.logoPath = path.join(__dirname, '..', 'images', 'logo.png');
    }

    /**
     * Initialisiert den PDF-Generator
     *
     * Muss VOR generateShiftPlanPDF/generateOverviewPDF aufgerufen werden.
     * Erstellt Output-Verzeichnis und startet Headless Chrome.
     */
    async initialize() {
        // Ensure output directory exists
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }

        // Launch browser
        this.browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
    }

    /**
     * Generiert PDF fuer einen einzelnen Arbeitsplan/Schichtplan
     *
     * Enthaelt:
     * - Statistik-Dashboard mit Besetzungsgrad
     * - Kritische Schichten (0 Anmeldungen)
     * - Schicht-Tabellen nach Kategorien
     * - Kontakt- und Springer-Informationen
     *
     * @param {Object} event - Event-Objekt mit id, title, shifts, etc.
     * @param {Array} assignments - Array von Schicht-Zuweisungen
     * @param {string} markdownContent - Optionaler Markdown-Inhalt
     * @returns {Promise<string>} Pfad zur generierten PDF
     */
    async generateShiftPlanPDF(event, assignments, markdownContent) {
        if (!this.browser) {
            throw new Error('PDF Generator not initialized. Call initialize() first.');
        }

        const page = await this.browser.newPage();

        try {
            // Set page format
            await page.setViewport({ width: 1200, height: 800 });

            // Generate HTML content
            const htmlContent = this.createHTMLContent(event, assignments, markdownContent);
            
            // Set HTML content
            await page.setContent(htmlContent, { 
                waitUntil: 'networkidle0',
                timeout: 30000 
            });

            // Generate PDF
            const pdfPath = path.join(this.outputDir, `${event.id}-arbeitsplan.pdf`);
            
            await page.pdf({
                path: pdfPath,
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '20mm',
                    right: '15mm',
                    bottom: '20mm',
                    left: '15mm'
                },
                displayHeaderFooter: true,
                headerTemplate: this.getHeaderTemplate(event),
                footerTemplate: this.getFooterTemplate(),
                preferCSSPageSize: false
            });

            console.log(`📄 PDF generated: ${pdfPath}`);
            return pdfPath;

        } finally {
            await page.close();
        }
    }

    /**
     * Generiert PDF mit Uebersicht aller Events
     *
     * Zeigt fuer jedes Event:
     * - Titel, Datum, Ort
     * - Besetzungsstatistik
     * - Kritische Bereiche
     *
     * @param {Array} events - Array von Event-Objekten
     * @param {Object} allAssignments - Map von eventId zu assignments[]
     * @returns {Promise<string>} Pfad zur generierten PDF
     */
    async generateOverviewPDF(events, allAssignments) {
        if (!this.browser) {
            throw new Error('PDF Generator not initialized. Call initialize() first.');
        }

        const page = await this.browser.newPage();

        try {
            await page.setViewport({ width: 1200, height: 800 });

            const htmlContent = this.createOverviewHTML(events, allAssignments);
            
            await page.setContent(htmlContent, { 
                waitUntil: 'networkidle0',
                timeout: 30000 
            });

            const pdfPath = path.join(this.outputDir, 'fwv-raura-events-overview.pdf');
            
            await page.pdf({
                path: pdfPath,
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '25mm',
                    right: '15mm',
                    bottom: '20mm',
                    left: '15mm'
                },
                displayHeaderFooter: true,
                headerTemplate: this.getOverviewHeaderTemplate(),
                footerTemplate: this.getFooterTemplate(),
                preferCSSPageSize: false
            });

            console.log(`📄 Overview PDF generated: ${pdfPath}`);
            return pdfPath;

        } finally {
            await page.close();
        }
    }

    /**
     * Erstellt HTML-Inhalt fuer einen Arbeitsplan
     * (interner Helfer fuer generateShiftPlanPDF)
     */
    createHTMLContent(event, assignments, markdownContent) {
        const stats = this.calculateStats(event, assignments);
        const criticalShifts = this.findCriticalShifts(event, assignments);
        
        return `
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Arbeitsplan ${event.title}</title>
    <style>
        ${this.getCSS()}
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <header class="header">
            <div class="header-content">
                <div class="logo-section">
                    <h1>${FWV_CONFIG.verein.name}</h1>
                    <h2>📋 Arbeitsplan ${event.title}</h2>
                </div>
                <div class="event-info">
                    <div class="info-item">
                        <strong>📅 Datum:</strong> ${this.formatEventDate(event)}
                    </div>
                    <div class="info-item">
                        <strong>📍 Ort:</strong> ${event.location}
                    </div>
                    <div class="info-item">
                        <strong>⏰ Stand:</strong> ${new Date().toLocaleDateString('de-DE')} ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
                    </div>
                </div>
            </div>
        </header>

        <!-- Statistics Dashboard -->
        <section class="stats-section">
            <h3>📊 Übersicht</h3>
            <div class="stats-grid">
                <div class="stat-card ${stats.fillPercentage >= 80 ? 'stat-good' : stats.fillPercentage >= 50 ? 'stat-warning' : 'stat-critical'}">
                    <div class="stat-number">${stats.filled}/${stats.total}</div>
                    <div class="stat-label">Besetzte Schichten</div>
                    <div class="stat-percentage">${stats.fillPercentage}%</div>
                </div>
                <div class="stat-card ${stats.open === 0 ? 'stat-good' : stats.open < 10 ? 'stat-warning' : 'stat-critical'}">
                    <div class="stat-number">${stats.open}</div>
                    <div class="stat-label">Offene Schichten</div>
                </div>
                <div class="stat-card ${criticalShifts.length === 0 ? 'stat-good' : 'stat-critical'}">
                    <div class="stat-number">${criticalShifts.length}</div>
                    <div class="stat-label">Kritische Bereiche</div>
                </div>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${stats.fillPercentage}%"></div>
                <div class="progress-text">${stats.fillPercentage}% belegt (${stats.filled}/${stats.total})</div>
            </div>
        </section>

        ${criticalShifts.length > 0 ? this.generateCriticalSection(criticalShifts) : ''}

        <!-- Shift Tables -->
        ${this.generateShiftSections(event, assignments)}

        <!-- Contact Information -->
        <section class="contact-section">
            <h3>📞 Kontakt & Springer-System</h3>
            <div class="contact-grid">
                <div class="contact-card">
                    <h4>Hauptspringer</h4>
                    <p><strong>${FWV_CONFIG.system.springer.hauptspringer}</strong></p>
                    <p>📧 ${FWV_CONFIG.system.springer.email}</p>
                    <p>⏰ Verfügbar: Samstag & Sonntag ganztags</p>
                </div>
                <div class="contact-card">
                    <h4>Schichtkoordination</h4>
                    <p><strong>${event.organizer}</strong></p>
                    <p>📧 ${event.email}</p>
                    <p>📅 Anmeldung bis: ${event.registrationDeadline ? new Date(event.registrationDeadline).toLocaleDateString('de-DE') : 'Siehe Event-Details'}</p>
                </div>
            </div>
        </section>
    </div>
</body>
</html>`;
    }

    /**
     * Erstellt HTML-Inhalt fuer die Event-Uebersicht
     * (interner Helfer fuer generateOverviewPDF)
     */
    createOverviewHTML(events, allAssignments) {
        return `
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FWV Raura - Events Übersicht</title>
    <style>
        ${this.getCSS()}
    </style>
</head>
<body>
    <div class="container">
        <header class="header">
            <div class="header-content">
                <div class="logo-section">
                    <h1>${FWV_CONFIG.verein.name}</h1>
                    <h2>📅 Events & Schichtpläne Übersicht</h2>
                </div>
                <div class="event-info">
                    <div class="info-item">
                        <strong>📄 Generiert:</strong> ${new Date().toLocaleDateString('de-DE')} ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
                    </div>
                    <div class="info-item">
                        <strong>📊 Events:</strong> ${events.length}
                    </div>
                </div>
            </div>
        </header>

        ${events.map(event => this.generateEventOverviewSection(event, allAssignments[event.id] || [])).join('')}
    </div>
</body>
</html>`;
    }

    /**
     * Erstellt HTML-Sektion fuer ein einzelnes Event in der Uebersicht
     *
     * @param {Object} event - Event-Objekt
     * @param {Array} assignments - Zuweisungen fuer dieses Event
     * @returns {string} HTML-String fuer die Event-Sektion
     */
    generateEventOverviewSection(event, assignments) {
        const stats = this.calculateStats(event, assignments);
        const criticalShifts = this.findCriticalShifts(event, assignments);

        return `
        <section class="event-overview">
            <h3>${event.title}</h3>
            <div class="event-meta">
                <span class="event-date">📅 ${this.formatEventDate(event)}</span>
                <span class="event-location">📍 ${event.location}</span>
                <span class="event-status ${event.status}">${event.status}</span>
            </div>
            
            <div class="stats-grid">
                <div class="stat-card ${stats.fillPercentage >= 80 ? 'stat-good' : stats.fillPercentage >= 50 ? 'stat-warning' : 'stat-critical'}">
                    <div class="stat-number">${stats.filled}/${stats.total}</div>
                    <div class="stat-label">Schichten besetzt</div>
                </div>
                <div class="stat-card ${criticalShifts.length === 0 ? 'stat-good' : 'stat-critical'}">
                    <div class="stat-number">${criticalShifts.length}</div>
                    <div class="stat-label">Kritische Bereiche</div>
                </div>
            </div>

            ${criticalShifts.length > 0 ? `
            <div class="critical-alert">
                <h4>🚨 Dringende Hilfe gesucht:</h4>
                <ul>
                    ${criticalShifts.map(shift => `<li>${shift.name} (${shift.time})</li>`).join('')}
                </ul>
            </div>
            ` : ''}
        </section>`;
    }

    /**
     * Generiert alle Schicht-Sektionen gruppiert nach Kategorie
     *
     * Kategorien: aufbau, samstag, sonntag, abbau, sonstige
     * Jede Kategorie erhaelt eigenen Titel und Tabelle
     *
     * @param {Object} event - Event mit shifts-Array
     * @param {Array} assignments - Alle Schicht-Zuweisungen
     * @returns {string} HTML-String aller Schicht-Sektionen
     */
    generateShiftSections(event, assignments) {
        const shiftsByCategory = this.groupShiftsByCategory(event.shifts);
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
            sections += `
            <section class="shift-category">
                <h3>${categoryTitles[category]}</h3>
                ${this.generateShiftTable(shifts, assignments, category)}
            </section>`;
        }

        return sections;
    }

    /**
     * Waehlt Tabellen-Typ basierend auf Kategorie
     *
     * Samstag/Sonntag: Zeitslot-gruppierte Tabelle (komplexer)
     * Andere: Einfache Schicht-Tabelle
     *
     * @param {Array} shifts - Schichten dieser Kategorie
     * @param {Array} assignments - Zuweisungen
     * @param {string} category - Kategorie-Name
     * @returns {string} HTML-Tabelle
     */
    generateShiftTable(shifts, assignments, category) {
        if (category === 'samstag' || category === 'sonntag') {
            return this.generateDailyShiftTable(shifts, assignments);
        }
        return this.generateSimpleShiftTable(shifts, assignments);
    }

    /**
     * Generiert Tabelle fuer Tagesschichten (Samstag/Sonntag)
     *
     * Gruppiert Schichten nach Zeitslot (z.B. 10:00-14:00)
     * und zeigt Bar/Kueche/Kasse nebeneinander.
     * Status-Farben: gruen=besetzt, orange=teilweise, rot=kritisch
     *
     * @param {Array} shifts - Schichten eines Tages
     * @param {Array} assignments - Zuweisungen
     * @returns {string} HTML mit Zeitslot-gruppierten Tabellen
     */
    generateDailyShiftTable(shifts, assignments) {
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

        let html = '';

        for (const [timeKey, timeSlot] of timeSlots.entries()) {
            html += `
            <div class="time-slot">
                <h4>${timeSlot.time} Uhr</h4>
                <table class="shift-table">
                    <thead>
                        <tr>
                            <th>Bereich</th>
                            <th>Benötigt</th>
                            <th>Zugewiesen</th>
                            <th>Status</th>
                            <th>Helfer</th>
                        </tr>
                    </thead>
                    <tbody>`;

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

                let statusClass, statusText;
                if (assigned >= needed) {
                    statusClass = 'status-complete';
                    statusText = '✅ Besetzt';
                } else if (assigned === 0) {
                    statusClass = 'status-critical';
                    statusText = `❌ ${needed} fehlen`;
                } else {
                    statusClass = 'status-partial';
                    statusText = `⚠️ ${needed - assigned} fehlen`;
                }

                const helpers = assigned > 0 
                    ? assignedHelpers.map(h => h.name).join(', ') 
                    : '-';

                const areaName = shift.description.split(' - ')[0] || 
                    (shift.id.includes('bar') ? 'Bar' : 
                     shift.id.includes('kueche') ? 'Küche' : 'Kasse');

                html += `
                        <tr class="${statusClass}">
                            <td><strong>${areaName}</strong></td>
                            <td>${needed}</td>
                            <td><strong>${assigned}</strong></td>
                            <td class="${statusClass}">${statusText}</td>
                            <td>${helpers}</td>
                        </tr>`;
            }

            html += `
                    </tbody>
                </table>
            </div>`;
        }

        return html;
    }

    /**
     * Generiert einfache Schicht-Tabelle (Aufbau/Abbau/Sonstige)
     *
     * Eine Zeile pro Schicht mit: Name, Zeit, Benoetigt, Zugewiesen, Status, Helfer
     *
     * @param {Array} shifts - Schichten
     * @param {Array} assignments - Zuweisungen
     * @returns {string} HTML-Tabelle
     */
    generateSimpleShiftTable(shifts, assignments) {
        let html = `
        <table class="shift-table">
            <thead>
                <tr>
                    <th>Schicht</th>
                    <th>Zeit</th>
                    <th>Benötigt</th>
                    <th>Zugewiesen</th>
                    <th>Status</th>
                    <th>Helfer</th>
                </tr>
            </thead>
            <tbody>`;

        for (const shift of shifts) {
            const assignedHelpers = assignments.filter(a => a.shiftId === shift.id);
            const needed = shift.needed || 1;
            const assigned = assignedHelpers.length;

            let statusClass, statusText;
            if (assigned >= needed) {
                statusClass = 'status-complete';
                statusText = '✅ Besetzt';
            } else if (assigned === 0) {
                statusClass = 'status-critical';
                statusText = `❌ ${needed} fehlen`;
            } else {
                statusClass = 'status-partial';
                statusText = `⚠️ ${needed - assigned} fehlen`;
            }

            const helpers = assigned > 0 
                ? assignedHelpers.map(h => h.name).join(', ') 
                : '-';

            html += `
                <tr class="${statusClass}">
                    <td><strong>${shift.name}</strong></td>
                    <td>${shift.time}</td>
                    <td>${needed}</td>
                    <td><strong>${assigned}</strong></td>
                    <td class="${statusClass}">${statusText}</td>
                    <td>${helpers}</td>
                </tr>`;
        }

        html += `
            </tbody>
        </table>`;

        return html;
    }

    /**
     * Generiert Warnungs-Sektion fuer kritische Schichten
     *
     * Zeigt alle Schichten mit 0 Anmeldungen in rotem Warnkasten
     * mit dringendem Aufruf zur Anmeldung.
     *
     * @param {Array} criticalShifts - Schichten ohne Anmeldungen
     * @returns {string} HTML-Warnungs-Sektion
     */
    generateCriticalSection(criticalShifts) {
        return `
        <section class="critical-section">
            <h3>🚨 Dringende Hilfe gesucht</h3>
            <div class="critical-alert">
                <h4>❌ Kritische Schichten (0 Anmeldungen)</h4>
                <ul class="critical-list">
                    ${criticalShifts.map(shift => `
                        <li><strong>${shift.name}</strong> (${shift.time}): ${shift.description}</li>
                    `).join('')}
                </ul>
                <p class="critical-note">
                    <strong>📞 Sofortige Unterstützung nötig:</strong> Diese Schichten haben noch keine einzige Anmeldung! 
                    Bitte meldet euch dringend an oder kontaktiert die Schichtkoordination.
                </p>
            </div>
        </section>`;
    }

    /**
     * Liefert CSS-Styles fuer PDF-Dokumente
     *
     * Enthaelt:
     * - FWV-Branding (Rot #d32f2f)
     * - Statistik-Karten mit Farbcodes
     * - Tabellen-Styles mit Status-Farben
     * - Print-spezifische Styles (Seitenumbruch)
     *
     * @returns {string} CSS-String
     */
    getCSS() {
        return `
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Arial', 'Helvetica', sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f8f9fa;
        }

        .container {
            max-width: 100%;
            margin: 0 auto;
            background: white;
        }

        .header {
            background: linear-gradient(135deg, #d32f2f 0%, #b71c1c 100%);
            color: white;
            padding: 20px;
            margin-bottom: 20px;
        }

        .header-content {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            flex-wrap: wrap;
        }

        .logo-section h1 {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 5px;
        }

        .logo-section h2 {
            font-size: 20px;
            font-weight: normal;
            opacity: 0.9;
        }

        .event-info {
            text-align: right;
        }

        .info-item {
            margin-bottom: 5px;
            font-size: 14px;
        }

        .stats-section {
            background: white;
            padding: 20px;
            margin-bottom: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .stats-section h3 {
            margin-bottom: 15px;
            color: #d32f2f;
            border-bottom: 2px solid #d32f2f;
            padding-bottom: 5px;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }

        .stat-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            border: 2px solid #e0e0e0;
            transition: all 0.3s ease;
        }

        .stat-card.stat-good {
            border-color: #4caf50;
            background: #f1f8e9;
        }

        .stat-card.stat-warning {
            border-color: #ff9800;
            background: #fff3e0;
        }

        .stat-card.stat-critical {
            border-color: #f44336;
            background: #ffebee;
        }

        .stat-number {
            font-size: 28px;
            font-weight: bold;
            margin-bottom: 5px;
        }

        .stat-label {
            font-size: 14px;
            color: #666;
            margin-bottom: 5px;
        }

        .stat-percentage {
            font-size: 16px;
            font-weight: bold;
            color: #d32f2f;
        }

        .progress-bar {
            background: #e0e0e0;
            height: 30px;
            border-radius: 15px;
            position: relative;
            overflow: hidden;
        }

        .progress-fill {
            background: linear-gradient(90deg, #4caf50, #8bc34a);
            height: 100%;
            border-radius: 15px;
            transition: width 0.5s ease;
        }

        .progress-text {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-weight: bold;
            color: #333;
            font-size: 14px;
        }

        .critical-section {
            background: #ffebee;
            border: 2px solid #f44336;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
        }

        .critical-section h3 {
            color: #d32f2f;
            margin-bottom: 15px;
        }

        .critical-alert {
            background: white;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid #f44336;
        }

        .critical-list {
            list-style-type: none;
            margin: 10px 0;
        }

        .critical-list li {
            padding: 5px 0;
            border-bottom: 1px solid #eee;
        }

        .critical-note {
            margin-top: 15px;
            padding: 10px;
            background: #ffcdd2;
            border-radius: 4px;
            font-size: 14px;
        }

        .shift-category {
            background: white;
            margin-bottom: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            overflow: hidden;
        }

        .shift-category h3 {
            background: #d32f2f;
            color: white;
            padding: 15px 20px;
            margin: 0;
            font-size: 18px;
        }

        .time-slot {
            padding: 15px 20px;
            border-bottom: 1px solid #eee;
        }

        .time-slot:last-child {
            border-bottom: none;
        }

        .time-slot h4 {
            color: #d32f2f;
            margin-bottom: 10px;
            font-size: 16px;
        }

        .shift-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
        }

        .shift-table th {
            background: #f5f5f5;
            padding: 12px 8px;
            text-align: left;
            border: 1px solid #ddd;
            font-weight: bold;
            font-size: 14px;
        }

        .shift-table td {
            padding: 10px 8px;
            border: 1px solid #ddd;
            font-size: 13px;
            vertical-align: top;
        }

        .shift-table tr.status-complete {
            background: #f1f8e9;
        }

        .shift-table tr.status-partial {
            background: #fff3e0;
        }

        .shift-table tr.status-critical {
            background: #ffebee;
        }

        .status-complete {
            color: #2e7d32;
            font-weight: bold;
        }

        .status-partial {
            color: #f57c00;
            font-weight: bold;
        }

        .status-critical {
            color: #d32f2f;
            font-weight: bold;
        }

        .contact-section {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-top: 20px;
        }

        .contact-section h3 {
            color: #d32f2f;
            margin-bottom: 15px;
            border-bottom: 2px solid #d32f2f;
            padding-bottom: 5px;
        }

        .contact-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
        }

        .contact-card {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid #d32f2f;
        }

        .contact-card h4 {
            color: #d32f2f;
            margin-bottom: 10px;
        }

        .contact-card p {
            margin-bottom: 5px;
            font-size: 14px;
        }

        .event-overview {
            background: white;
            margin-bottom: 20px;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .event-overview h3 {
            color: #d32f2f;
            margin-bottom: 10px;
        }

        .event-meta {
            display: flex;
            gap: 20px;
            margin-bottom: 15px;
            flex-wrap: wrap;
        }

        .event-meta span {
            font-size: 14px;
            padding: 5px 10px;
            border-radius: 15px;
            background: #f5f5f5;
        }

        .event-status.confirmed {
            background: #e8f5e8;
            color: #2e7d32;
        }

        .event-status.planning {
            background: #fff3e0;
            color: #f57c00;
        }

        /* Print specific styles */
        @media print {
            body {
                background: white !important;
            }
            
            .container {
                box-shadow: none !important;
            }
            
            .shift-category {
                page-break-inside: avoid;
                break-inside: avoid;
            }
            
            .time-slot {
                page-break-inside: avoid;
                break-inside: avoid;
            }
        }

        /* Page break helpers */
        .page-break {
            page-break-before: always;
        }

        .no-break {
            page-break-inside: avoid;
            break-inside: avoid;
        }
        `;
    }

    /**
     * Liefert HTML-Template fuer PDF-Kopfzeile (Einzelner Arbeitsplan)
     *
     * @param {Object} event - Event fuer Titel
     * @returns {string} HTML-Header-Template fuer Puppeteer
     */
    getHeaderTemplate(event) {
        return `
        <div style="font-size: 10px; padding: 5px 15px; width: 100%; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #ddd;">
            <span style="color: #d32f2f; font-weight: bold;">${FWV_CONFIG.verein.name} - ${event.title}</span>
            <span style="color: #666;">Arbeitsplan</span>
        </div>`;
    }

    /**
     * Liefert HTML-Template fuer PDF-Kopfzeile (Uebersicht)
     *
     * @returns {string} HTML-Header-Template fuer Puppeteer
     */
    getOverviewHeaderTemplate() {
        return `
        <div style="font-size: 10px; padding: 5px 15px; width: 100%; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #ddd;">
            <span style="color: #d32f2f; font-weight: bold;">${FWV_CONFIG.verein.name}</span>
            <span style="color: #666;">Events & Schichtpläne Übersicht</span>
        </div>`;
    }

    /**
     * Liefert HTML-Template fuer PDF-Fusszeile
     *
     * Enthaelt: Generierungsdatum und Seitenzahlen
     *
     * @returns {string} HTML-Footer-Template mit pageNumber/totalPages
     */
    getFooterTemplate() {
        return `
        <div style="font-size: 10px; padding: 5px 15px; width: 100%; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #ddd;">
            <span style="color: #666;">Generiert am: ${new Date().toLocaleDateString('de-DE')} ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr</span>
            <span style="color: #666;">Seite <span class="pageNumber"></span> von <span class="totalPages"></span></span>
        </div>`;
    }

    /**
     * Berechnet Besetzungs-Statistiken fuer ein Event
     *
     * @param {Object} event - Event mit shifts-Array
     * @param {Array} assignments - Zuweisungen
     * @returns {{total: number, filled: number, open: number, fillPercentage: number}}
     */
    calculateStats(event, assignments) {
        const totalShifts = event.shifts ? event.shifts.length : 0;
        const filledShifts = new Set(assignments.map(a => a.shiftId)).size;
        const openShifts = totalShifts - filledShifts;
        const fillPercentage = totalShifts > 0 ? Math.round((filledShifts / totalShifts) * 100) : 0;

        return {
            total: totalShifts,
            filled: filledShifts,
            open: openShifts,
            fillPercentage
        };
    }

    /**
     * Findet kritische Schichten (0 Anmeldungen)
     *
     * @param {Object} event - Event mit shifts-Array
     * @param {Array} assignments - Zuweisungen
     * @returns {Array} Schichten ohne jegliche Anmeldung
     */
    findCriticalShifts(event, assignments) {
        if (!event.shifts) return [];

        return event.shifts.filter(shift => {
            const assignedCount = assignments.filter(a => a.shiftId === shift.id).length;
            return assignedCount === 0;
        });
    }

    /**
     * Gruppiert Schichten nach Kategorie
     *
     * Erkennt Kategorie anhand der Schicht-ID:
     * - "aufbau" in ID → Aufbau
     * - "abbau" in ID → Abbau
     * - "samstag" in ID → Chilbi Samstag
     * - "sonntag" in ID → Chilbi Sonntag
     * - Sonst → Sonstige
     *
     * @param {Array} shifts - Alle Schichten eines Events
     * @returns {Map<string, Array>} Map von Kategorie zu Schichten
     */
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

    /**
     * Formatiert Event-Datum fuer Anzeige (Deutsch)
     *
     * Ein Tag: "Samstag, 15. Juni 2024"
     * Mehrere Tage: "15. Juni-16. Juni 2024"
     *
     * @param {Object} event - Event mit startDate und endDate
     * @returns {string} Formatiertes Datum
     */
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

    /**
     * Schliesst den PDF-Generator und beendet Puppeteer
     *
     * Sollte am Ende aufgerufen werden, um Ressourcen freizugeben.
     */
    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}

module.exports = PDFGenerator;
