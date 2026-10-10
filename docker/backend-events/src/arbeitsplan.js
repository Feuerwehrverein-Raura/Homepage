// DEUTSCH: Arbeitsplan und Anmelde-Details — die Teile des Events-Backends,
// die Website, Vorstand und Apps gemeinsam brauchen. Eigenes Modul, damit sie
// ohne laufenden Server getestet werden koennen (test/arbeitsplan.test.js);
// die Datenbank wird deshalb hineingereicht statt global genommen.

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

function formatDateDE(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('de-CH', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Bereiche sind als Wert ohne Umlaut gespeichert (Dropdown im Vorstand:
// value 'Kueche', label 'Küche'). Wo Menschen sie lesen, die Beschriftung.
const BEREICH_LESBAR = { Kueche: 'Küche' };
function bereichLesbar(bereich) {
    return BEREICH_LESBAR[bereich] || bereich;
}

// Was in jede Anmelde-Mail gehoert: Anlass, Datum, Ort, die eigenen Schichten,
// an wen man sich wendet und wo der Arbeitsplan steht. Vorher stand in der
// Bestaetigung nur "Deine Anmeldung wurde bestaetigt." — man musste raten,
// wofuer und wann.
async function registrationDetailsText(pool, eventId, shiftIds) {
    const ev = await pool.query(
        'SELECT title, slug, start_date, end_date, location, organizer_name, organizer_email FROM events WHERE id = $1',
        [eventId]
    );
    const e = ev.rows[0];
    if (!e) return '';

    const tag = d => (d ? String(d).slice(0, 10) : null);
    const lines = [`Anlass: ${e.title}`];
    if (e.start_date) {
        const von = tag(e.start_date), bis = tag(e.end_date);
        lines.push(`Datum: ${formatDateDE(von)}${bis && bis !== von ? ` bis ${formatDateDE(bis)}` : ''}`);
    }
    if (e.location) lines.push(`Ort: ${e.location}`);

    if (shiftIds && shiftIds.length > 0) {
        const s = await pool.query(
            'SELECT name, date, start_time, end_time, bereich FROM shifts WHERE id = ANY($1) ORDER BY date, start_time',
            [shiftIds]
        );
        if (s.rows.length > 0) {
            lines.push('', s.rows.length === 1 ? 'Schicht:' : 'Schichten:');
            for (const sh of s.rows) {
                const zeit = sh.start_time
                    ? `, ${String(sh.start_time).slice(0, 5)}${sh.end_time ? `–${String(sh.end_time).slice(0, 5)}` : ''} Uhr`
                    : '';
                const wo = [sh.bereich && bereichLesbar(sh.bereich), sh.name].filter(Boolean).join(' – ');
                lines.push(`- ${sh.date ? formatDateDE(tag(sh.date)) : 'Datum offen'}${zeit}${wo ? ` · ${wo}` : ''}`);
            }
        }
    }

    if (e.organizer_name || e.organizer_email) {
        lines.push('', `Fragen an: ${[e.organizer_name, e.organizer_email].filter(Boolean).join(', ')}`);
    }
    lines.push('', `Details und aktueller Arbeitsplan: https://fwv-raura.ch/events.html?event=${e.slug || eventId}`);
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Arbeitsplan als fertige Tabelle
//
// Website, Vorstand, Desktop- und Handy-Apps zeigen denselben Plan. Damit er
// ueberall gleich aussieht, wird er nur hier gebaut; die Oberflaechen zeichnen
// die Tabelle bloss noch ab und rechnen nichts selbst.
//
// Form: pro Tag eine Tabelle. Spalten sind die Bereiche (`bereiche`), Zeilen
// die Zeitfenster. `zellen` steht parallel zu `bereiche`: null heisst "in
// diesem Zeitfenster keine Schicht in diesem Bereich" (wird schwarz gezeigt),
// sonst die eingeteilten Helfer und wie viele Plaetze noch offen sind.
// Eingeteilt ist nur, wer bestaetigt ist — wie auf dem Aushang.
//
// Liefert null, wenn es den Anlass nicht gibt.
// ---------------------------------------------------------------------------
async function buildArbeitsplan(pool, eventId) {
    const eventResult = await pool.query('SELECT id, title FROM events WHERE id = $1', [eventId]);
    if (eventResult.rows.length === 0) return null;
    const event = eventResult.rows[0];

    const shiftsResult = await pool.query(`
        SELECT s.id, s.date, s.start_time, s.end_time, s.needed, s.bereich,
               COALESCE(
                   json_agg(
                       COALESCE(m.vorname || ' ' || m.nachname, r.guest_name, 'Unbekannt')
                       ORDER BY r.created_at
                   ) FILTER (WHERE r.id IS NOT NULL),
                   '[]'
               ) AS besetzt
        FROM shifts s
        LEFT JOIN registrations r
               ON s.id = ANY(r.shift_ids) AND r.status IN ('approved', 'confirmed')
        LEFT JOIN members m ON m.id = r.member_id
        WHERE s.event_id = $1
        GROUP BY s.id
        ORDER BY s.date, s.start_time
    `, [eventId]);

    const bereiche = [...new Set(shiftsResult.rows.map(s => bereichLesbar(s.bereich || 'Allgemein')))].sort();

    // Tag -> Zeitfenster -> Bereich -> Schicht
    const raster = {};
    for (const s of shiftsResult.rows) {
        const datum = s.date instanceof Date
            ? s.date.toISOString().slice(0, 10)
            : (s.date ? String(s.date).slice(0, 10) : '');
        const von = s.start_time ? String(s.start_time).slice(0, 5) : '';
        const bis = s.end_time ? String(s.end_time).slice(0, 5) : '';
        const zeit = `${von}-${bis}`;
        raster[datum] ??= {};
        raster[datum][zeit] ??= {};
        raster[datum][zeit][bereichLesbar(s.bereich || 'Allgemein')] = {
            gebraucht: s.needed || 1,
            besetzt: s.besetzt
        };
    }

    const tage = Object.keys(raster).sort().map(datum => ({
        datum: datum || null,
        bezeichnung: datum
            ? new Date(datum + 'T12:00:00').toLocaleDateString('de-CH', {
                weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
            })
            : 'Ohne Datum',
        zeilen: Object.keys(raster[datum]).sort((a, b) => a.localeCompare(b)).map(zeit => ({
            zeit,
            zellen: bereiche.map(bereich => {
                const zelle = raster[datum][zeit][bereich];
                if (!zelle) return null;
                return {
                    besetzt: zelle.besetzt,
                    gebraucht: zelle.gebraucht,
                    offen: Math.max(zelle.gebraucht - zelle.besetzt.length, 0)
                };
            })
        }))
    }));

    return {
        verein: 'Feuerwehrverein Raura, Kaiseraugst',
        titel: `Arbeitsplan ${event.title}`,
        anlass: event.title,
        bereiche,
        tage
    };
}

// DEUTSCH: Arbeitsplan (aus buildArbeitsplan) als PDF — im Layout des Aushangs:
// Logo, Vereinsname rot, "Arbeitsplan <Anlass>", pro Tag eine Tabelle mit der
// Zeit links und den Bereichen dieses Tages als Spalten; in den Zellen die
// Helfer ("- Name") und je ein "-" pro offenem Platz. Liefert einen Buffer —
// gebraucht vom Download in Apps/Vorstand und vom Versand eine Woche vorher.
//
// Frueher gab es hier eine schlichte Textliste, waehrend die Eventseite den
// Aushang bekam (POST /arbeitsplan/pdf). Jetzt sehen alle denselben Plan.
// `compress` nur fuer Tests abschaltbar.
const LOGO = path.join(__dirname, 'assets', 'logo.png');

function renderArbeitsplanPdf(plan, { compress = true } = {}) {
    const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        compress,
        bufferPages: true, // fuer "Seite x von y" am Schluss
        info: {
            Title: plan.titel,
            Author: 'Feuerwehrverein Raura'
        }
    });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    const done = new Promise((resolve, reject) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
    });

    // Stand: damit man auf dem Ausdruck sieht, welche Fassung an der Wand
    // haengt. Der Server laeuft auf UTC, deshalb die Zeitzone ausdruecklich.
    const jetzt = new Date();
    const stand = `${jetzt.toLocaleDateString('de-CH', { timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', year: 'numeric' })}, `
        + `${jetzt.toLocaleTimeString('de-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' })} Uhr`;

    const links = doc.page.margins.left;
    const breite = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const unten = () => doc.page.height - doc.page.margins.bottom;

    // Kopf: Logo (proportional, 303x228) links, Text rechts daneben
    const kopfY = doc.y;
    const logoBreite = 70;
    const logoHoehe = 53;
    if (fs.existsSync(LOGO)) doc.image(LOGO, links, kopfY, { fit: [logoBreite, logoHoehe] });
    const textX = links + logoBreite + 15;
    const textBreite = breite - logoBreite - 15;
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#cc0000')
        .text(plan.verein, textX, kopfY + 6, { width: textBreite });
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#000000')
        .text(plan.titel, textX, kopfY + 26, { width: textBreite, underline: true });
    doc.fontSize(9).font('Helvetica').fillColor('#444444')
        .text(`Stand: ${stand}`, textX, doc.y + 4, { width: textBreite });
    doc.fillColor('#000000');
    doc.x = links;
    doc.y = kopfY + logoHoehe + 15;

    const zeitBreite = 80;
    const pad = 5;
    const zeileH = 14;
    const schrift = 9;

    plan.tage.forEach(tag => {
        // Nur Bereiche, die an diesem Tag eine Schicht haben — sonst werden
        // die Spalten an Tagen mit wenig Betrieb unnoetig schmal.
        const spalten = plan.bereiche
            .map((bereich, i) => ({ bereich, i }))
            .filter(({ i }) => tag.zeilen.some(z => z.zellen[i]));
        const spaltenBreite = (breite - zeitBreite) / Math.max(spalten.length, 1);
        const textW = spaltenBreite - 2 * pad;

        // Ueberschrift + Kopfzeile + erste Zeile muessen zusammen passen
        if (doc.y + 70 > unten()) doc.addPage();
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000').text(tag.bezeichnung, links, doc.y);
        doc.moveDown(0.4);

        let y = doc.y;
        const kopfzeile = () => {
            const h = 22;
            doc.lineWidth(0.5);
            doc.rect(links, y, zeitBreite, h).stroke();
            doc.fontSize(schrift).font('Helvetica-Bold')
                .text('Zeit', links + pad, y + 6, { width: zeitBreite - 2 * pad, lineBreak: false });
            spalten.forEach(({ bereich }, k) => {
                const x = links + zeitBreite + k * spaltenBreite;
                doc.rect(x, y, spaltenBreite, h).stroke();
                doc.text(bereich, x + pad, y + 6, { width: textW, lineBreak: false, ellipsis: true });
            });
            y += h;
        };
        kopfzeile();

        tag.zeilen.forEach(zeile => {
            doc.fontSize(schrift).font('Helvetica');
            const hoehe = Math.max(22, 2 * pad + Math.max(zeileH, ...spalten.map(({ i }) => {
                const zelle = zeile.zellen[i];
                if (!zelle) return 0;
                return zelle.besetzt.reduce((h, name) => h + doc.heightOfString(`- ${name}`, { width: textW }), 0)
                    + zelle.offen * zeileH;
            })));

            // Seitenumbruch: neue Seite mit Tag und Kopfzeile — wer nur das
            // zweite Blatt an der Wand sieht, soll wissen, welcher Tag das ist.
            if (y + hoehe > unten()) {
                doc.addPage();
                doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000')
                    .text(`${tag.bezeichnung} (Fortsetzung)`, links, doc.page.margins.top);
                doc.moveDown(0.4);
                y = doc.y;
                kopfzeile();
            }

            doc.lineWidth(0.5).rect(links, y, zeitBreite, hoehe).stroke();
            doc.fontSize(schrift).font('Helvetica-Bold')
                .text(zeile.zeit, links + pad, y + pad, { width: zeitBreite - 2 * pad, lineBreak: false });

            spalten.forEach(({ i }, k) => {
                const x = links + zeitBreite + k * spaltenBreite;
                const zelle = zeile.zellen[i];
                if (!zelle) {
                    // keine Schicht: grau hinterlegt (schwarz wie am Bildschirm
                    // waere beim Ausdrucken reine Tintenverschwendung)
                    doc.rect(x, y, spaltenBreite, hoehe).fillAndStroke('#d9d9d9', '#000000');
                    doc.fillColor('#000000');
                    return;
                }
                doc.rect(x, y, spaltenBreite, hoehe).stroke();
                doc.fontSize(schrift).font('Helvetica');
                let ty = y + pad;
                zelle.besetzt.forEach(name => {
                    doc.text(`- ${name}`, x + pad, ty, { width: textW });
                    ty += doc.heightOfString(`- ${name}`, { width: textW });
                });
                for (let n = 0; n < zelle.offen; n++) {
                    doc.text('-', x + pad, ty, { width: textW });
                    ty += zeileH;
                }
            });
            y += hoehe;
        });

        doc.x = links;
        doc.y = y + 12;
    });

    // Fusszeile auf jeder Seite: Stand und Seitenzahl — fehlt ein Blatt, sieht
    // man es; liegen zwei Fassungen herum, auch.
    const seiten = doc.bufferedPageRange();
    for (let n = 0; n < seiten.count; n++) {
        doc.switchToPage(seiten.start + n);
        // Unterhalb des Rands wuerde pdfkit sonst eine neue (leere) Seite
        // anfangen — Rand fuer die Fusszeile kurz aufheben.
        const rand = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc.fontSize(8).font('Helvetica').fillColor('#666666')
            .text(`Stand: ${stand}  ·  Seite ${n + 1} von ${seiten.count}`, links, doc.page.height - rand + 15,
                { width: breite, align: 'center', lineBreak: false });
        doc.page.margins.bottom = rand;
    }
    doc.fillColor('#000000');

    doc.end();
    return done;
}

module.exports = { formatDateDE, bereichLesbar, registrationDetailsText, buildArbeitsplan, renderArbeitsplanPdf };
