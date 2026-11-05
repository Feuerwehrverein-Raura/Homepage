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

/** QR-Code als SVG (Modul = 1 Einheit, ohne Ruhezone) mit Schweizerkreuz. */
function svg(text) {
    const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    let pfad = '';
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) if (qr.modules.get(y, x)) pfad += `M${x} ${y}h1v1h-1z`;
    }
    const k = n * 7 / 46;
    const o = (n - k) / 2;
    const r = k * 0.06;
    const b = k * 0.18;
    const l = b * (1 + 2 * 7 / 6);
    const m = n / 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges">`
        + `<rect width="${n}" height="${n}" fill="#fff"/><path d="${pfad}" fill="#000"/>`
        + `<rect x="${o}" y="${o}" width="${k}" height="${k}" fill="#fff"/>`
        + `<rect x="${o + r}" y="${o + r}" width="${k - 2 * r}" height="${k - 2 * r}" fill="#000"/>`
        + `<rect x="${m - b / 2}" y="${m - l / 2}" width="${b}" height="${l}" fill="#fff"/>`
        + `<rect x="${m - l / 2}" y="${m - b / 2}" width="${l}" height="${b}" fill="#fff"/></svg>`;
}

const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** "1590" -> "1 590.00" (SIX 3.5.3: Leerzeichen als Tausender-Trenner). */
function betragText(b) {
    const [ganz, rappen] = Number(b).toFixed(2).split('.');
    return `${ganz.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}.${rappen}`;
}

/** Ecken eines Feldes zum Ausfuellen (SIX 3.5.3/3.5.4: 0.75 pt). */
function eckenFeld(breiteMm, hoeheMm) {
    const e = 3;
    const w = breiteMm;
    const h = hoeheMm;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}"`
        + ' style="overflow:visible;display:block">'
        + `<path d="M0 ${e}V0H${e}M${w - e} 0H${w}V${e}M${w} ${h - e}V${h}H${w - e}M${e} ${h}H0V${h - e}"`
        + ' fill="none" stroke="#000" stroke-width="0.26"/></svg>';
}

/**
 * Zahlteil (148 x 105 mm) wie auf der QR-Rechnung, fuer die Anzeige online
 * (SIX 3.5 und 3.8: ohne Empfangsschein). Schrift Liberation Sans/Arial,
 * Titel 11 pt, Ueberschriften 8 pt fett, Werte 10 pt.
 */
function zahlteilHtml(z) {
    const text = inhalt(z);
    const zeilen = text.split('\n');
    const { strasse, nummer } = strasseTeilen(z.strasse);
    const land = zeilen[10];
    const ortZeile = `${land === 'CH' ? '' : `${land}-`}${zeilen[8]} ${zeilen[9]}`;
    const iban = zeilen[3].replace(/(.{4})(?=.)/g, '$1 ');
    const konto = [iban, zeilen[5], [strasse, nummer].filter(Boolean).join(' '), ortZeile].filter(Boolean);
    const mitteilung = zeilen[29];
    const betrag = zeilen[18];
    const titel = t => `<div class="t">${esc(t)}</div>`;
    const werte = ws => ws.map(w => `<div class="w">${esc(w)}</div>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #fff; }
        #zahlteil { position: relative; width: 148mm; height: 105mm; background: #fff; color: #000;
            font-family: 'Liberation Sans', Arial, Helvetica, sans-serif; border: 0.2mm solid #000; }
        .abs { position: absolute; }
        .h { font-size: 11pt; font-weight: bold; }
        .t { font-size: 8pt; font-weight: bold; line-height: 11pt; }
        .w { font-size: 10pt; line-height: 11pt; }
        .gruppe { margin-bottom: 9pt; }
    </style></head><body><div id="zahlteil">
        <div class="abs h" style="left:5mm;top:5mm">Zahlteil</div>
        <div class="abs" style="left:5mm;top:17mm;width:46mm;height:46mm">${svg(text)}</div>
        <div class="abs" style="left:5mm;top:68mm;width:12mm">${titel('Währung')}${werte(['CHF'])}</div>
        <div class="abs" style="left:19mm;top:68mm;width:32mm">${titel('Betrag')}${betrag
            ? werte([betragText(betrag)])
            : `<div style="margin-top:1mm">${eckenFeld(30, 10)}</div>`}</div>
        <div class="abs" style="left:56mm;top:5mm;width:87mm">
            <div class="gruppe">${titel('Konto / Zahlbar an')}${werte(konto)}</div>
            ${mitteilung ? `<div class="gruppe">${titel('Zusätzliche Informationen')}${werte([mitteilung])}</div>` : ''}
            <div class="gruppe">${titel('Zahlbar durch (Name/Adresse)')}<div style="margin-top:1mm">${eckenFeld(65, 25)}</div></div>
        </div>
    </div></body></html>`;
}

/** Zahlteil als PNG (Chrome per puppeteer), 3-fach fuer scharfe Schrift. */
async function zahlteilPng(z) {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 700, height: 500, deviceScaleFactor: 3 });
        await page.setContent(zahlteilHtml(z), { waitUntil: 'load' });
        const el = await page.$('#zahlteil');
        return Buffer.from(await el.screenshot({ type: 'png' }));
    } finally {
        await browser.close();
    }
}

/**
 * Mail-Anhang (inline, cid) mit dem ganzen Zahlteil; geht Chrome nicht, nur
 * der QR-Code. null, wenn kein Code moeglich ist.
 */
async function anhang(z, { log = () => {} } = {}) {
    if (fehlt(z)) return null;
    try {
        return { filename: 'Zahlteil.png', content: await zahlteilPng(z), contentType: 'image/png', cid: 'qr-zahlteil',
            zahlteil: true };
    } catch (e) {
        log('Zahlteil: Bild nicht erzeugt, nur QR-Code', { fehler: e.message });
        return { filename: 'QR-Code.png', content: png(inhalt(z)), contentType: 'image/png', cid: 'qr-zahlteil' };
    }
}

/** HTML-Block fuer die Mail (zum Anhang aus anhang()). */
function htmlBlock(a) {
    const bild = a.zahlteil
        ? '<img src="cid:qr-zahlteil" alt="Zahlteil" width="560" style="max-width:100%;height:auto">'
        : '<img src="cid:qr-zahlteil" alt="QR-Code" width="220" height="220">';
    return '<p style="margin-top:16px">Zum Auszahlen den QR-Code mit der Bank-App scannen '
        + '(nur für E-Banking und Mobile Banking):</p>' + bild;
}

module.exports = {
    ibanGueltig, strasseTeilen, plzUndLand, fehlt, inhalt, png, svg, betragText, zahlteilHtml, zahlteilPng,
    anhang, htmlBlock,
};
