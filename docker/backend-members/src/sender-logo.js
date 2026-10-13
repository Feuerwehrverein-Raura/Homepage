// Senderlogos fuer die Radiosender im Roten Schopf.
//
// Wer einen Sender anlegt, gibt nur Name und Stream-Adresse ein. Das Logo
// holen wir aus dem oeffentlichen Verzeichnis radio-browser.info
// (https://docs.radio-browser.info, Feld "favicon"): zuerst ueber die
// Stream-Adresse (/json/stations/byurl), sonst ueber den Namen
// (/json/stations/byname/<name>, nach Stimmen sortiert).
//
// Uebernommen wird ein Logo nur, wenn die Adresse https ist (die App laedt
// kein http) und der Abruf wirklich ein Bild liefert. SVG und Favicons
// (.ico) fallen weg, siehe UNBRAUCHBAR.
//
// Reine Bausteine ohne Express und ohne Datenbank; fetch ist austauschbar,
// damit die Tests ohne Netz laufen (test/sender-logo.test.js).

const RADIO_BROWSER = 'https://de1.api.radio-browser.info';
// Das Verzeichnis bittet darum, sich mit einem sprechenden Namen zu melden.
const KENNUNG = 'fwv-raura-mitglieder/1.0';
const WARTEZEIT_MS = 8000;
// SVG kann Image.network nicht anzeigen; ein favicon.ico ist meist 16 Pixel
// klein und im grossen Player nur Brei.
const UNBRAUCHBAR = ['image/svg', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/ico'];
// Mehr Kandidaten zu pruefen lohnt nicht - die guten stehen oben.
const HOECHSTENS_PRUEFEN = 5;

function mitFrist(ms) {
    return typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(ms) : undefined;
}

async function stationen(fetchFn, pfad) {
    const antwort = await fetchFn(RADIO_BROWSER + pfad, {
        headers: { 'User-Agent': KENNUNG, Accept: 'application/json' },
        signal: mitFrist(WARTEZEIT_MS),
    });
    if (!antwort.ok) return [];
    const daten = await antwort.json();
    return Array.isArray(daten) ? daten : [];
}

// Verzeichnis nicht erreichbar: eben keine Treffer, die andere Suche darf
// trotzdem noch.
async function stationenOderNichts(fetchFn, pfad) {
    try {
        return await stationen(fetchFn, pfad);
    } catch {
        return [];
    }
}

/** true, wenn die Adresse https ist und ein brauchbares Bild liefert. */
async function istBild(fetchFn, adresse) {
    let url;
    try {
        url = new URL(adresse);
    } catch {
        return false;
    }
    if (url.protocol !== 'https:') return false;
    try {
        const antwort = await fetchFn(url.href, {
            headers: { 'User-Agent': KENNUNG },
            redirect: 'follow',
            signal: mitFrist(WARTEZEIT_MS),
        });
        const art = String(antwort.headers?.get?.('content-type') || '').toLowerCase();
        // Den Inhalt brauchen wir nicht - Verbindung freigeben.
        try { await antwort.body?.cancel?.(); } catch { /* egal */ }
        return antwort.ok && art.startsWith('image/') && !UNBRAUCHBAR.some((u) => art.startsWith(u));
    } catch {
        return false;
    }
}

function vereinfacht(name) {
    return String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Sucht ein Logo fuer { name, url }. Liefert die Logo-Adresse oder null -
 * nie einen Fehler, auch wenn das Verzeichnis nicht antwortet.
 */
async function senderLogoSuchen(sender, { fetchFn = globalThis.fetch } = {}) {
    const name = String(sender?.name || '').trim();
    const stream = String(sender?.url || '').trim();
    const kandidaten = [];
    const merken = (liste) => {
        for (const s of liste) {
            const logo = String(s?.favicon || '').trim();
            if (logo && !kandidaten.includes(logo)) kandidaten.push(logo);
        }
    };

    if (stream) {
        merken(await stationenOderNichts(fetchFn,
            '/json/stations/byurl?url=' + encodeURIComponent(stream)));
    }
    if (name) {
        const treffer = await stationenOderNichts(fetchFn,
            '/json/stations/byname/' + encodeURIComponent(name) +
            '?order=votes&reverse=true&hidebroken=true&limit=20');
        // Gleichnamige zuerst: "SRF 1" soll nicht das Logo von
        // "SRF 1 Regionaljournal" bekommen, wenn es "SRF 1" selbst gibt.
        merken(treffer.filter((s) => vereinfacht(s?.name) === vereinfacht(name)));
        merken(treffer);
    }

    const https = kandidaten.filter((k) => /^https:\/\//i.test(k)).slice(0, HOECHSTENS_PRUEFEN);
    for (const logo of https) {
        if (await istBild(fetchFn, logo)) return logo;
    }
    return null;
}

/**
 * Traegt fehlende Logos im Hintergrund nach - pro Sender hoechstens einmal
 * je Prozesslauf, damit nicht jeder Aufruf der Senderliste das Verzeichnis
 * neu befragt. [speichern] bekommt (id, logo) nur bei einem Treffer.
 */
function logoNachtrag({ suchen = senderLogoSuchen, speichern, melden = () => {} }) {
    const versucht = new Set();
    return function nachtragen(sender) {
        if (!sender?.id || sender.logo_url || versucht.has(sender.id)) return null;
        versucht.add(sender.id);
        return Promise.resolve()
            .then(() => suchen(sender))
            .then((logo) => (logo ? speichern(sender.id, logo) : null))
            .catch((fehler) => melden(fehler));
    };
}

module.exports = { senderLogoSuchen, logoNachtrag, istBild, RADIO_BROWSER };
