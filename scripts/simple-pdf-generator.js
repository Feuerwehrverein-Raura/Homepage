const fs = require('fs');
const path = require('path');

// Simple PDF generator without external dependencies
class SimplePDFGenerator {
    constructor() {
        this.outputDir = path.join(__dirname, '..', 'pdfs');
    }

    async initialize() {
        // Ensure output directory exists
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
        console.log('📄 Simple PDF generator initialized (HTML format)');
    }

    async generateShiftPlanPDF(event, assignments, markdownContent) {
        try {
            // Generate HTML content that can be printed to PDF
            const htmlContent = this.createPrintableHTML(event, assignments);
            
            // Save as HTML file that can be opened in browser and printed to PDF
            const htmlPath = path.join(this.outputDir, `${event.id}-arbeitsplan.html`);
            fs.writeFileSync(htmlPath, htmlContent);
            
            console.log(`📄 Printable HTML generated: ${htmlPath}`);
            console.log(`   💡 Open in browser and use 'Print to PDF' to create PDF`);
            
            return htmlPath;
        } catch (error) {
            console.error(`❌ Error generating HTML for ${event.id}:`, error);
            throw error;
        }
    }

    async generateOverviewPDF(events, allAssignments) {
        try {
            const htmlContent = this.createOverviewHTML(events, allAssignments);
            
            const htmlPath = path.join(this.outputDir, 'fwv-raura-events-overview.html');
            fs.writeFileSync(htmlPath, htmlContent);
            
            console.log(`📄 Overview HTML generated: ${htmlPath}`);
            console.log(`   💡 Open in browser and use 'Print to PDF' to create PDF`);
            
            return htmlPath;
        } catch (error) {
            console.error('❌ Error generating overview HTML:', error);
            throw error;
        }
    }

    createPrintableHTML(event, assignments) {
        const stats = this.calculateStats(event, assignments);
        const criticalShifts = this.findCriticalShifts(event, assignments);
        
        return `<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Arbeitsplan ${event.title}</title>
    <style>
        ${this.getPrintCSS()}
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <header class="header">
            <div class="header-left">
                <img src="../images/logo.png" alt="FWV Raura Logo" class="logo" onerror="this.style.display='none'">
                <div class="header-text">
                    <h1>Feuerwehrverein Raura</h1>
                    <h2>📋 Arbeitsplan ${event.title}</h2>
                </div>
            </div>
            <div class="header-right">
                <div class="info-box">
                    <div class="info-item"><strong>📅 Datum:</strong> ${this.formatEventDate(event)}</div>
                    <div class="info-item"><strong>📍 Ort:</strong> ${event.location}</div>
                    <div class="info-item"><strong>⏰ Stand:</strong> ${new Date().toLocaleDateString('de-DE')} ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr</div>
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
                    <p><strong>Stefan Müller (Aktuar)</strong></p>
                    <p>📧 aktuar@fwv-raura.ch</p>
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
        
        <!-- Print Instructions -->
        <div class="print-instructions no-print">
            <h3>🖨️ PDF erstellen</h3>
            <p><strong>So erstellen Sie ein PDF:</strong></p>
            <ol>
                <li>Drücken Sie <kbd>Ctrl+P</kbd> (Windows/Linux) oder <kbd>Cmd+P</kbd> (Mac)</li>
                <li>Wählen Sie "Als PDF speichern" oder "Microsoft Print to PDF"</li>
                <li>Klicken Sie auf "Speichern"</li>
            </ol>
            <p><em>Diese Anweisungen werden nicht mitgedruckt.</em></p>
        </div>
    </div>
</body>
</html>`;
    }

    createOverviewHTML(events, allAssignments) {
        return `<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FWV Raura - Events Übersicht</title>
    <style>
        ${this.getPrintCSS()}
    </style>
</head>
<body>
    <div class="container">
        <header class="header">
            <div class="header-left">
                <img src="../images/logo.png" alt="FWV Raura Logo" class="logo" onerror="this.style.display='none'">
                <div class="header-text">
                    <h1>Feuerwehrverein Raura</h1>
                    <h2>📅 Events & Schichtpläne Übersicht</h2>
                </div>
            </div>
            <div class="header-right">
                <div class="info-box">
                    <div class="info-item"><strong>📄 Generiert:</strong> ${new Date().toLocaleDateString('de-DE')} ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr</div>
                    <div class="info-item"><strong>📊 Events:</strong> ${events.length}</div>
                </div>
            </div>
        </header>

        ${events.map(event => this.generateEventOverviewSection(event, allAssignments[event.id] || [])).join('')}

        <!-- Print Instructions -->
        <div class="print-instructions no-print">
            <h3>🖨️ PDF erstellen</h3>
            <p><strong>So erstellen Sie ein PDF:</strong></p>
            <ol>
                <li>Drücken Sie <kbd>Ctrl+P</kbd> (Windows/Linux) oder <kbd>Cmd+P</kbd> (Mac)</li>
                <li>Wählen Sie "Als PDF speichern" oder "Microsoft Print to PDF"</li>
                <li>Klicken Sie auf "Speichern"</li>
            </ol>
            <p><em>Diese Anweisungen werden nicht mitgedruckt.</em></p>
        </div>
    </div>
</body>
</html>`;
    }

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

    generateShiftTable(shifts, assignments, category) {
        if (category === 'samstag' || category === 'sonntag') {
            return this.generateDailyShiftTable(shifts, assignments);
        }
        return this.generateSimpleShiftTable(shifts, assignments);
    }

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

    getPrintCSS() {
        return `
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Arial', 'Helvetica', sans-serif;
            line-height: 1.4;
            color: #333;
            background: white;
            font-size: 12px;
        }

        .container {
            max-width: 100%;
            margin: 0;
            padding: 0;
        }

        .header {
            background: linear-gradient(135deg, #d32f2f 0%, #b71c1c 100%);
            color: white;
            padding: 15px;
            margin-bottom: 15px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            page-break-inside: avoid;
        }

        .header-left {
            display: flex;
            align-items: center;
            gap: 15px;
        }

        .logo {
            height: 50px;
            width: auto;
        }

        .header-text h1 {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 3px;
        }

        .header-text h2 {
            font-size: 16px;
            font-weight: normal;
            opacity: 0.9;
        }

        .header-right .info-box {
            text-align: right;
        }

        .info-item {
            margin-bottom: 3px;
            font-size: 11px;
        }

        .stats-section {
            background: #f8f9fa;
            padding: 15px;
            margin-bottom: 15px;
            border: 1px solid #ddd;
            page-break-inside: avoid;
        }

        .stats-section h3 {
            margin-bottom: 10px;
            color: #d32f2f;
            border-bottom: 1px solid #d32f2f;
            padding-bottom: 3px;
            font-size: 14px;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            margin-bottom: 15px;
        }

        .stat-card {
            background: white;
            padding: 12px;
            border: 1px solid #e0e0e0;
            text-align: center;
            border-radius: 4px;
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
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 3px;
        }

        .stat-label {
            font-size: 10px;
            color: #666;
            margin-bottom: 3px;
        }

        .stat-percentage {
            font-size: 12px;
            font-weight: bold;
            color: #d32f2f;
        }

        .progress-bar {
            background: #e0e0e0;
            height: 20px;
            border-radius: 10px;
            position: relative;
            overflow: hidden;
        }

        .progress-fill {
            background: linear-gradient(90deg, #4caf50, #8bc34a);
            height: 100%;
            border-radius: 10px;
        }

        .progress-text {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-weight: bold;
            color: #333;
            font-size: 10px;
        }

        .critical-section {
            background: #ffebee;
            border: 1px solid #f44336;
            padding: 15px;
            margin-bottom: 15px;
            page-break-inside: avoid;
        }

        .critical-section h3 {
            color: #d32f2f;
            margin-bottom: 10px;
            font-size: 14px;
        }

        .critical-alert {
            background: white;
            padding: 10px;
            border-left: 3px solid #f44336;
        }

        .critical-list {
            list-style-type: none;
            margin: 8px 0;
        }

        .critical-list li {
            padding: 3px 0;
            border-bottom: 1px solid #eee;
            font-size: 11px;
        }

        .critical-note {
            margin-top: 10px;
            padding: 8px;
            background: #ffcdd2;
            font-size: 10px;
        }

        .shift-category {
            background: white;
            margin-bottom: 15px;
            border: 1px solid #ddd;
            page-break-inside: avoid;
        }

        .shift-category h3 {
            background: #d32f2f;
            color: white;
            padding: 10px 15px;
            margin: 0;
            font-size: 14px;
        }

        .time-slot {
            padding: 10px 15px;
            border-bottom: 1px solid #eee;
        }

        .time-slot:last-child {
            border-bottom: none;
        }

        .time-slot h4 {
            color: #d32f2f;
            margin-bottom: 8px;
            font-size: 12px;
        }

        .shift-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 8px;
        }

        .shift-table th {
            background: #f5f5f5;
            padding: 6px 4px;
            text-align: left;
            border: 1px solid #ddd;
            font-weight: bold;
            font-size: 10px;
        }

        .shift-table td {
            padding: 5px 4px;
            border: 1px solid #ddd;
            font-size: 10px;
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
            background: #f8f9fa;
            padding: 15px;
            border: 1px solid #ddd;
            margin-top: 15px;
            page-break-inside: avoid;
        }

        .contact-section h3 {
            color: #d32f2f;
            margin-bottom: 10px;
            border-bottom: 1px solid #d32f2f;
            padding-bottom: 3px;
            font-size: 14px;
        }

        .contact-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
        }

        .contact-card {
            background: white;
            padding: 10px;
            border-left: 3px solid #d32f2f;
        }

        .contact-card h4 {
            color: #d32f2f;
            margin-bottom: 5px;
            font-size: 12px;
        }

        .contact-card p {
            margin-bottom: 3px;
            font-size: 10px;
        }

        .event-overview {
            background: white;
            margin-bottom: 15px;
            padding: 15px;
            border: 1px solid #ddd;
            page-break-inside: avoid;
        }

        .event-overview h3 {
            color: #d32f2f;
            margin-bottom: 8px;
            font-size: 14px;
        }

        .event-meta {
            display: flex;
            gap: 15px;
            margin-bottom: 10px;
            flex-wrap: wrap;
        }

        .event-meta span {
            font-size: 10px;
            padding: 3px 8px;
            border-radius: 10px;
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

        .print-instructions {
            background: #e3f2fd;
            border: 2px solid #2196f3;
            padding: 20px;
            margin: 20px 0;
            border-radius: 8px;
        }

        .print-instructions h3 {
            color: #1976d2;
            margin-bottom: 10px;
        }

        .print-instructions kbd {
            background: #f5f5f5;
            border: 1px solid #ccc;
            border-radius: 3px;
            padding: 2px 4px;
            font-family: monospace;
        }

        /* Print specific styles */
        @media print {
            .no-print {
                display: none !important;
            }
            
            body {
                font-size: 10px;
            }
            
            .header {
                background: #d32f2f !important;
                -webkit-print-color-adjust: exact;
                color-adjust: exact;
            }
            
            .stat-card.stat-good {
                background: #f1f8e9 !important;
                -webkit-print-color-adjust: exact;
                color-adjust: exact;
            }

            .stat-card.stat-warning {
                background: #fff3e0 !important;
                -webkit-print-color-adjust: exact;
                color-adjust: exact;
            }

            .stat-card.stat-critical {
                background: #ffebee !important;
                -webkit-print-color-adjust: exact;
                color-adjust: exact;
            }
            
            .shift-category {
                page-break-inside: avoid;
                break-inside: avoid;
            }
            
            .time-slot {
                page-break-inside: avoid;
                break-inside: avoid;
            }

            .shift-category h3 {
                background: #d32f2f !important;
                -webkit-print-color-adjust: exact;
                color-adjust: exact;
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

    findCriticalShifts(event, assignments) {
        if (!event.shifts) return [];
        
        return event.shifts.filter(shift => {
            const assignedCount = assignments.filter(a => a.shiftId === shift.id).length;
            return assignedCount === 0;
        });
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

    async close() {
        // No cleanup needed for simple generator
        console.log('📄 Simple PDF generator closed');
    }
}

module.exports = SimplePDFGenerator;
