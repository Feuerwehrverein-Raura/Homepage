// Titelliste abgleichen: eine eingefuegte Playlist (Spotify, Apple Music,
// YouTube ...) gegen die Sammlung auf dem Laptop halten. Reine Funktionen
// ohne Datenbank, damit sie sich testen lassen (test/kiosk-abgleich.test.js).
// Die Route POST /kiosk/abgleich steht in index.js.
//
// Der Abgleich schlaegt vor, er entscheidet nicht: Jeder Treffer landet in
// der Auswahl und laesst sich dort einzeln herausnehmen. Bei unscharfem
// Vergleich ist das der Unterschied zwischen Hilfe und Aerger.

// Alles wegraeumen, was zwischen zwei Schreibweisen desselben Titels steht.
function kioskNormalisiere(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/ß/g, 'ss')
        // Akzente abtrennen und verwerfen: "Céline" und "Celine" sind dasselbe.
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\.(mp3|m4a|flac|wav|ogg|opus)\s*$/, '')
        // "Don't" und "Dont" sind dasselbe Wort, nicht "don" plus "t".
        .replace(/['’‘`´]/g, '')
        // "K.I.Z" und "A.C.D.C." zu einem Wort zusammenziehen, BEVOR die
        // Punkte zu Leerzeichen werden. Sonst zerfaellt der Interpret in
        // Einzelbuchstaben und faellt gleich darauf durch das Laengenraster
        // — "K.I.Z - Kannibalenlied - Live" blieb so als einziger von
        // vierzig Testtiteln unerkannt.
        .replace(/\b(?:[a-z]\.){2,}/g, m => m.replace(/\./g, ''))
        // Klammern raus — dort steht bei YouTube der ganze Ballast:
        // "(Official Video)", "[4K Remaster]", "(Lyrics)".
        .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
        .replace(/\b(official|video|videoclip|lyric|lyrics|audio|hd|hq|4k|remaster|remastered|live|feat|ft|prod|explicit|version)\b/g, ' ')
        .replace(/[^a-z0-9 ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Fuellwoerter, die je nach Quelle mal dastehen und mal nicht:
// "The Beatles" / "Beatles", "Simon & Garfunkel" / "Simon and Garfunkel".
const FUELLWORTE = new Set(['the', 'and', 'und']);

// Einbuchstabige Reste und Fuellwoerter tragen nichts bei und verzerren nur
// das Mass — es sei denn, es bleibt sonst zu wenig uebrig. Bei kurzen Titeln
// ("U 2 - One") ist ein schwaches Wort besser als gar keines.
function kioskWorte(text) {
    const alle = kioskNormalisiere(text).split(' ').filter(Boolean);
    const lang = alle.filter(w => w.length > 1 && !FUELLWORTE.has(w));
    return lang.length >= 2 ? lang : alle;
}

// Aehnlichkeit zweier Wortmengen (Dice). Bewusst wortbasiert und nicht
// zeichenweise: "Bohemian Rhapsody - Queen" und "Queen - Bohemian Rhapsody"
// sind derselbe Titel, und die Reihenfolge von Interpret und Titel ist in
// Exportlisten nicht einheitlich.
function gemeinsameWorte(a, b) {
    const zaehler = new Map();
    for (const w of b) zaehler.set(w, (zaehler.get(w) || 0) + 1);
    let gemeinsam = 0;
    for (const w of a) {
        const n = zaehler.get(w) || 0;
        if (n > 0) { gemeinsam++; zaehler.set(w, n - 1); }
    }
    return gemeinsam;
}

function kioskAehnlichkeit(a, b) {
    if (!a.length || !b.length) return 0;
    return (2 * gemeinsameWorte(a, b)) / (a.length + b.length);
}

// Listen kommen in allen Formen: nummeriert, als CSV mit acht Spalten, mit
// Links, mit Tabulatoren. Hier wird jede Zeile auf das Wesentliche gebracht.
function kioskZeileSaeubern(zeile) {
    let z = String(zeile).trim();
    if (!z) return '';
    z = z.replace(/https?:\/\/\S+/g, ' ');       // Links tragen nichts bei
    z = z.replace(/^\s*\d{1,3}[.)]\s+/, '');     // "12. " am Zeilenanfang

    // CSV oder Tabulatoren: Die ersten beiden Felder sind bei den gaengigen
    // Exporten Titel und Interpret — der Rest ist Album, Spieldauer, ISRC
    // und aehnliches Rauschen, das den Vergleich verwaessert.
    if (z.includes('\t') || (z.match(/,/g) || []).length >= 2) {
        const felder = z.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
            .map(f => f.replace(/^\s*"|"\s*$/g, '').trim())
            .filter(f => f && !/^\d+(:\d+)?$/.test(f));
        if (felder.length >= 2) z = felder[0] + ' ' + felder[1];
        else if (felder.length === 1) z = felder[0];
    }
    return z.trim();
}

// Ein Sammlungstitel wird dreifach vorbereitet. Frueher wurde der ganze Pfad
// mit in die Wortmenge gepackt — Ordner, Album, Tracknummer und Interpret und
// Titel doppelt. Damit kam selbst "Queen - Bohemian Rhapsody" gegen
// "Queen/A Night at the Opera/11 Bohemian Rhapsody.mp3" nur auf rund 0.4 und
// blieb unter der Schwelle: der Abgleich war viel zu streng.
function kioskKandidat(r) {
    const datei = String(r.pfad || '').split('/').pop()
        .replace(/^\s*\d{1,3}(?:[\s._-]+)/, '');   // "11 " / "03 - " vorne
    return {
        pfad: r.pfad, interpret: r.interpret, titel: r.titel,
        kern: kioskWorte((r.interpret || '') + ' ' + (r.titel || '')),
        datei: kioskWorte(datei),
        titelWorte: kioskWorte(r.titel || ''),
        interpretWorte: kioskWorte(r.interpret || '')
    };
}

// Wie gut passt eine Zeile (als Wortmenge) zu einem Kandidaten, 0 bis 1.
function kioskWert(w, k) {
    let wert = Math.max(kioskAehnlichkeit(w, k.kern), kioskAehnlichkeit(w, k.datei));
    // Steht der ganze Titel samt (einem Wort des) Interpreten in der Zeile,
    // ist es derselbe Song, auch wenn die Zeile noch Album, Jahr oder
    // "2011 Remaster" mitbringt, die Dice sonst runterziehen.
    const t = k.titelWorte;
    if (t.length && gemeinsameWorte(t, w) === t.length &&
        (!k.interpretWorte.length || gemeinsameWorte(k.interpretWorte, w) > 0)) {
        wert = Math.max(wert, t.length >= 2 ? 0.8 : 0.7);
    }
    return wert;
}

// 0.6: unterhalb davon sind es erfahrungsgemaess zufaellige
// Wortueberschneidungen ("Love", "Night") und keine Titel.
const SCHWELLE = 0.6;
const SICHER = 0.8;

/**
 * zeilen: gesaeuberte Zeilen; kandidaten: aus kioskKandidat().
 * Ergebnis: { gefunden: [{zeile, pfad, interpret, titel, sicher}], fehlend: [zeile] }
 */
function kioskAbgleichen(zeilen, kandidaten) {
    const gefunden = [];
    const fehlend = [];
    const schonDrin = new Set();

    for (const zeile of zeilen) {
        const w = kioskWorte(zeile);
        // Eine einzelne Zeile mit nur einem brauchbaren Wort trifft fast
        // alles — solche Zeilen sind Kopfzeilen oder Trenner, keine Titel.
        if (w.length < 2) { fehlend.push(zeile); continue; }

        let bester = null, bestwert = 0;
        for (const k of kandidaten) {
            const wert = kioskWert(w, k);
            if (wert > bestwert) { bestwert = wert; bester = k; }
        }

        if (!bester || bestwert < SCHWELLE) { fehlend.push(zeile); continue; }
        // Treffer, aber der Titel steht schon in der Liste.
        if (schonDrin.has(bester.pfad)) continue;
        schonDrin.add(bester.pfad);
        gefunden.push({
            zeile,
            pfad: bester.pfad,
            interpret: bester.interpret,
            titel: bester.titel,
            // Mitgeliefert, damit die Oberflaeche knappe Treffer
            // kennzeichnen kann — die will man nachsehen.
            sicher: bestwert >= SICHER
        });
    }
    return { gefunden, fehlend };
}

module.exports = {
    kioskNormalisiere, kioskWorte, kioskAehnlichkeit, kioskZeileSaeubern,
    kioskKandidat, kioskWert, kioskAbgleichen
};
