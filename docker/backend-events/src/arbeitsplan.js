// DEUTSCH: Arbeitsplan und Anmelde-Details — die Teile des Events-Backends,
// die Website, Vorstand und Apps gemeinsam brauchen. Eigenes Modul, damit sie
// ohne laufenden Server getestet werden koennen (test/arbeitsplan.test.js);
// die Datenbank wird deshalb hineingereicht statt global genommen.

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

module.exports = { formatDateDE, bereichLesbar, registrationDetailsText, buildArbeitsplan };
