const fs = require('fs');
const path = require('path');

// Parse frontmatter from markdown
function parseFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return null;

    const frontmatter = {};
    const lines = match[1].split('\n');

    for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
            const key = line.substring(0, colonIndex).trim();
            let value = line.substring(colonIndex + 1).trim();

            // Remove quotes
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }

            frontmatter[key] = value;
        }
    }

    return frontmatter;
}

// Load all events
function loadEvents() {
    const eventsDir = path.join(__dirname, '..', 'events');
    const files = fs.readdirSync(eventsDir).filter(f =>
        f.endsWith('.md') && !f.includes('assignments') && f !== 'README.md'
    );

    const events = [];

    for (const file of files) {
        const content = fs.readFileSync(path.join(eventsDir, file), 'utf8');
        const data = parseFrontmatter(content);

        if (data && data.startDate) {
            events.push({
                id: data.id || file.replace('.md', ''),
                title: data.title || 'Unbekannt',
                startDate: new Date(data.startDate),
                endDate: data.endDate ? new Date(data.endDate) : null,
                location: data.location || '',
                category: data.category || '',
                status: data.status || 'confirmed'
            });
        }
    }

    // Sort by date
    events.sort((a, b) => a.startDate - b.startDate);

    // Filter future events
    const now = new Date();
    return events.filter(e => e.startDate >= now || (e.endDate && e.endDate >= now));
}

// Generate HTML for PDF
function generateHTML(events) {
    const formatDate = (date) => {
        return date.toLocaleDateString('de-CH', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });
    };

    const formatTime = (date) => {
        return date.toLocaleTimeString('de-CH', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const eventsHTML = events.map(event => {
        const dateStr = formatDate(event.startDate);
        const timeStr = formatTime(event.startDate);
        const endTimeStr = event.endDate ? ` - ${formatTime(event.endDate)}` : '';

        return `
            <tr>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
                    <strong>${dateStr}</strong><br>
                    <span style="color: #6b7280;">${timeStr}${endTimeStr}</span>
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
                    <strong>${event.title}</strong><br>
                    <span style="color: #6b7280;">${event.location}</span>
                </td>
            </tr>
        `;
    }).join('');

    return `
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <title>Veranstaltungskalender - Feuerwehrverein Raura</title>
    <style>
        @page {
            size: A4;
            margin: 2cm;
        }
        body {
            font-family: Arial, Helvetica, sans-serif;
            font-size: 11pt;
            line-height: 1.4;
            color: #1f2937;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 3px solid #dc2626;
        }
        .header h1 {
            color: #dc2626;
            margin: 0 0 10px 0;
            font-size: 24pt;
        }
        .header p {
            margin: 0;
            color: #6b7280;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th {
            background: #dc2626;
            color: white;
            padding: 12px;
            text-align: left;
            font-weight: bold;
        }
        .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            text-align: center;
            color: #6b7280;
            font-size: 9pt;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Veranstaltungskalender</h1>
        <p>Feuerwehrverein Raurachemme Kaiseraugst</p>
        <p>Stand: ${new Date().toLocaleDateString('de-CH')}</p>
    </div>

    <table>
        <thead>
            <tr>
                <th style="width: 40%;">Datum & Zeit</th>
                <th style="width: 60%;">Veranstaltung</th>
            </tr>
        </thead>
        <tbody>
            ${eventsHTML || '<tr><td colspan="2" style="padding: 20px; text-align: center;">Keine kommenden Veranstaltungen</td></tr>'}
        </tbody>
    </table>

    <div class="footer">
        <p>Feuerwehrverein Raurachemme | www.fwv-raura.ch | kontakt@fwv-raura.ch</p>
        <p>Änderungen vorbehalten. Aktuelle Informationen auf unserer Website.</p>
    </div>
</body>
</html>
    `;
}

// Main
const events = loadEvents();
const html = generateHTML(events);

// Save HTML (will be converted to PDF by puppeteer)
const outputPath = path.join(__dirname, '..', 'calendar-events.html');
fs.writeFileSync(outputPath, html);

console.log(`Generated calendar HTML with ${events.length} events`);
console.log(`Output: ${outputPath}`);
