// DEUTSCH: Datum, Zeit und Kosten eines Anlasses fuer die Anzeige
// (events.html: Liste, Karten, Anlass-Fenster).
//
// Mehrtaegige Anlaesse (Chilbi Mi 14. - Mo 19. Oktober) zeigen den Zeitraum
// statt nur den ersten Tag. Eine Nacht, die frueh am Folgetag endet
// (Fasnacht 19:00 - 01:00), bleibt ein Tag.
//
// Kosten stehen in der Datenbank als freier Text ("25", "CHF 98.- pro
// Person", "Kostenlos"). Eine nackte Zahl wird zu "CHF 25.–" bzw.
// "CHF 12.50", leer oder 0 zu "Kostenlos", alles andere bleibt wie es ist.

const ANLASS_MORGEN_STUNDE = 6;

function anlassGueltigesDatum(d) {
    return Object.prototype.toString.call(d) === '[object Date]' && !isNaN(d.getTime());
}

function anlassGleicherTag(a, b) {
    return a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
}

// DEUTSCH: Liegen Beginn und Ende auf verschiedenen Kalendertagen? Ausnahme:
// Ende am Folgetag vor 06:00 (Abendanlass bis nach Mitternacht).
function anlassIstMehrtaegig(start, ende) {
    if (!anlassGueltigesDatum(start) || !anlassGueltigesDatum(ende) || ende <= start) return false;
    if (anlassGleicherTag(start, ende)) return false;
    const folgetag = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    return !(anlassGleicherTag(folgetag, ende) && ende.getHours() < ANLASS_MORGEN_STUNDE);
}

// DEUTSCH: "Mi" statt "Mi." - kurzer Wochentag ohne Punkt.
function anlassWochentag(d) {
    return new Intl.DateTimeFormat('de-CH', { weekday: 'short' }).format(d).replace(/\.$/, '');
}

function anlassMonat(d) {
    return new Intl.DateTimeFormat('de-CH', { month: 'long' }).format(d);
}

function anlassUhrzeit(d) {
    return new Intl.DateTimeFormat('de-CH', { hour: '2-digit', minute: '2-digit' }).format(d);
}

// DEUTSCH: Ein Tag: "Mittwoch, 14. Oktober 2026".
// Mehrere Tage: "Mi 14. – Mo 19. Oktober 2026",
// ueber den Monat: "Mi 30. September – Fr 2. Oktober 2026",
// ueber das Jahr: "Do 31. Dezember 2026 – Fr 1. Januar 2027".
function anlassZeitraum(start, ende) {
    if (!anlassGueltigesDatum(start)) return '';
    if (!anlassIstMehrtaegig(start, ende)) {
        return new Intl.DateTimeFormat('de-CH', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        }).format(start);
    }
    const s = `${anlassWochentag(start)} ${start.getDate()}.`;
    const e = `${anlassWochentag(ende)} ${ende.getDate()}. ${anlassMonat(ende)} ${ende.getFullYear()}`;
    if (start.getFullYear() !== ende.getFullYear()) {
        return `${s} ${anlassMonat(start)} ${start.getFullYear()} – ${e}`;
    }
    if (start.getMonth() !== ende.getMonth()) {
        return `${s} ${anlassMonat(start)} – ${e}`;
    }
    return `${s} – ${e}`;
}

// DEUTSCH: Ein Tag: "17:00 – 22:00". Mehrere Tage: "Mi 17:00 – Mo 22:00".
// Ohne gueltiges Ende nur der Beginn.
function anlassZeiten(start, ende) {
    if (!anlassGueltigesDatum(start)) return '';
    if (!anlassGueltigesDatum(ende) || ende <= start) return anlassUhrzeit(start);
    if (anlassIstMehrtaegig(start, ende)) {
        return `${anlassWochentag(start)} ${anlassUhrzeit(start)} – ${anlassWochentag(ende)} ${anlassUhrzeit(ende)}`;
    }
    return `${anlassUhrzeit(start)} – ${anlassUhrzeit(ende)}`;
}

// DEUTSCH: Kosten in Schweizer Schreibweise, siehe Kopf.
function anlassKosten(wert) {
    const text = String(wert ?? '').trim();
    if (!text) return 'Kostenlos';
    const m = text.match(/^(?:CHF|Fr\.?)?\s*(\d+)(?:[.,](\d{1,2}|[-–]))?\s*(?:CHF|Fr\.?)?$/i);
    if (!m) return text;
    const rappen = m[2] && /^\d+$/.test(m[2]) ? m[2].padEnd(2, '0') : '00';
    const betrag = parseInt(m[1], 10) + parseInt(rappen, 10) / 100;
    if (betrag <= 0) return 'Kostenlos';
    return rappen === '00' ? `CHF ${parseInt(m[1], 10)}.–` : `CHF ${parseInt(m[1], 10)}.${rappen}`;
}
