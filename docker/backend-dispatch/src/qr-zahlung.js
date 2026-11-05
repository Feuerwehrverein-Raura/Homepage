// Swiss QR Code (Zahlteil der QR-Rechnung) fuer Spesen-Mails an den Kassier:
// er scannt das Bild mit der Bank-App, IBAN, Name, Adresse, Betrag und Zweck
// stehen dann schon drin.
//
// Nach den Swiss Implementation Guidelines QR-bill von SIX (Version 2.4 vom
// 24.02.2026, Kapitel 4 und 6): Kopf SPC/0200/1, nur IBAN mit CH oder LI, nur
// strukturierte Adresse (S), ohne Referenz (NON), Mitteilung bis 140 Zeichen,
// Schluss EPD, Fehlerkorrektur M, Schweizerkreuz in der Mitte (7 von 46 mm).
// Gleich gebaut wie flutter/fwv_core/lib/src/mitglied/qr_zahlung.dart (App).

const QRCode = require('qrcode');
const { PNG } = require('pngjs');

function ibanKompakt(iban) {
    return String(iban || '').replace(/\s+/g, '').toUpperCase();
}

function ibanGueltig(iban) {
    const i = ibanKompakt(iban);
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(i)) return false;
    const umgestellt = (i.slice(4) + i.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
    let rest = 0;
    for (const z of umgestellt) rest = (rest * 10 + Number(z)) % 97;
    return rest === 1;
}

/** "Hauptstrasse 12a" -> { strasse: 'Hauptstrasse', nummer: '12a' } */
function strasseTeilen(s) {
    const t = String(s || '').trim().replace(/\s+/g, ' ');
    const m = /^(.*\D)\s+(\d+(?:\s?[a-zA-Z])?(?:\s?[/-]\s?\d+[a-zA-Z]?)?)$/.exec(t);
    if (!m) return { strasse: t, nummer: '' };
    return { strasse: m[1].trim(), nummer: m[2].replace(/ /g, '') };
}

/** "4303" -> CH, 9485-9498 -> LI, "DE-79618" -> DE; sonst null. */
function plzUndLand(plz) {
    const t = String(plz || '').trim().toUpperCase();
    const mitLand = /^([A-Z]{2})\s*-\s*(\S.*)$/.exec(t);
    if (mitLand) return { plz: mitLand[2], land: mitLand[1] };
    if (!/^\d{4}$/.test(t)) return null;
    const n = Number(t);
    return { plz: t, land: n >= 9485 && n <= 9498 ? 'LI' : 'CH' };
}

/** Nur erlaubte Zeichen (SIX 4.1.1), Umbrueche als Leerzeichen. */
function zeichen(s) {
    const ersetzt = String(s || '')
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/[‐-―]/g, '-')
        .replace(/[‘’‚]/g, "'")
        .replace(/[“”„]/g, '"')
        .replace(/…/g, '...');
    return [...ersetzt].filter(c => {
        const r = c.codePointAt(0);
        return (r >= 0x20 && r <= 0x7e) || (r >= 0xa0 && r <= 0x17f) || (r >= 0x218 && r <= 0x21b) || r === 0x20ac;
    }).join('').replace(/ {2,}/g, ' ').trim();
}

/**
 * Warum es keinen QR-Code gibt, sonst null.
 * z: { iban, name, strasse, plz, ort, betrag, mitteilung }
 */
function fehlt(z) {
    const i = ibanKompakt(z.iban);
    if (!ibanGueltig(i)) return 'Keine gültige IBAN.';
    if (!i.startsWith('CH') && !i.startsWith('LI')) return 'QR-Code nur für Schweizer und Liechtensteiner Konten.';
    if (!zeichen(z.name)) return 'Name fehlt.';
    if (!zeichen(z.ort) || !plzUndLand(z.plz)) return 'Adresse (PLZ und Ort) fehlt im Profil.';
    if (z.betrag != null && !(Number(z.betrag) >= 0.01 && Number(z.betrag) <= 999999999.99)) {
        return 'Betrag ausserhalb des Erlaubten.';
    }
    return null;
}

/** Inhalt des QR-Codes (31 Zeilen, LF, ohne Umbruch am Schluss). */
function inhalt(z) {
    const grund = fehlt(z);
    if (grund) throw new Error(grund);
    const { strasse, nummer } = strasseTeilen(z.strasse);
    const { plz, land } = plzUndLand(z.plz);
    const feld = (t, max) => { const x = zeichen(t); return x.length > max ? x.slice(0, max).trim() : x; };
    return [
        'SPC', '0200', '1', ibanKompakt(z.iban),
        'S', feld(z.name, 70), feld(strasse, 70), feld(nummer, 16), feld(plz, 16), feld(z.ort, 35), land,
        // Endgueltiger Zahlungsempfaenger: leer (fuer spaeter reserviert).
        '', '', '', '', '', '', '',
        z.betrag == null ? '' : Number(z.betrag).toFixed(2), 'CHF',
        // Endgueltiger Zahlungspflichtiger: weggelassen.
        '', '', '', '', '', '', '',
        'NON', '', feld(z.mitteilung, 140), 'EPD',
    ].join('\n');
}

/** PNG des Codes mit Schweizerkreuz; 4 Module Ruhezone. */
function png(text, { modul = 8 } = {}) {
    const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    const rand = 4;
    const seite = (n + 2 * rand) * modul;
    const bild = new PNG({ width: seite, height: seite });
    const setzen = (x, y, schwarz) => {
        const o = (y * seite + x) * 4;
        const w = schwarz ? 0 : 255;
        bild.data[o] = w; bild.data[o + 1] = w; bild.data[o + 2] = w; bild.data[o + 3] = 255;
    };
    for (let y = 0; y < seite; y++) {
        for (let x = 0; x < seite; x++) {
            const mx = Math.floor(x / modul) - rand;
            const my = Math.floor(y / modul) - rand;
            setzen(x, y, mx >= 0 && my >= 0 && mx < n && my < n && qr.modules.get(my, mx));
        }
    }
    // Kreuz: weisses Quadrat, schwarz mit weissem Rand, weisses Kreuz.
    const code = n * modul;
    const k = Math.round(code * 7 / 46);
    const x0 = Math.round((seite - k) / 2);
    const randK = Math.max(1, Math.round(k * 0.06));
    const breite = k * 0.18;
    const laenge = breite * (1 + 2 * 7 / 6);
    const mitte = k / 2;
    for (let y = 0; y < k; y++) {
        for (let x = 0; x < k; x++) {
            const innen = x >= randK && y >= randK && x < k - randK && y < k - randK;
            const dx = Math.abs(x + 0.5 - mitte);
            const dy = Math.abs(y + 0.5 - mitte);
            const kreuz = (dx <= breite / 2 && dy <= laenge / 2) || (dy <= breite / 2 && dx <= laenge / 2);
            setzen(x0 + x, x0 + y, innen && !kreuz);
        }
    }
    return PNG.sync.write(bild);
}

/** Mail-Anhang (inline, cid) oder null, wenn kein Code moeglich ist. */
function anhang(z) {
    if (fehlt(z)) return null;
    return { filename: 'QR-Zahlteil.png', content: png(inhalt(z)), contentType: 'image/png', cid: 'qr-zahlteil' };
}

/** HTML-Block fuer die Mail (zum Anhang aus anhang()). */
const HTML_BLOCK = '<p style="margin-top:16px">Zum Auszahlen mit der Bank-App scannen:<br>'
    + '<img src="cid:qr-zahlteil" alt="QR-Zahlteil" width="220" height="220"></p>';

module.exports = { ibanGueltig, strasseTeilen, plzUndLand, fehlt, inhalt, png, anhang, HTML_BLOCK };
