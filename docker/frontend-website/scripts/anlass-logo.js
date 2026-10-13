// DEUTSCH: Logos fuer Anlaesse — gemeinsam fuer Startseite, Anlass-Seite,
// Kalender und Mitgliederbereich.
//
// api-events liefert pro Anlass im Block "app" das fertige Logo (app.logo:
// eigenes https-Bild oder Logo der Reihe, sonst null) und die Reihe
// (app.reihe: fasnacht | chilbi | preisjassen | weihnachtshock | null),
// siehe docker/backend-events/src/anlass-logo.js. Kommt ein Anlass aus einer
// Quelle ohne app-Block (z.B. Anmeldungen im Mitgliederbereich), wird die
// Reihe hier wie im Backend am Titel erkannt.
//
// Ohne Logo liefert anlassLogoHtml() einen leeren String — das Layout bleibt
// dann wie bisher. Ein Bild, das nicht laedt, blendet sich selbst aus.

const ANLASS_REIHEN = [
    { reihe: 'fasnacht', muster: /fasnacht/i },
    { reihe: 'chilbi', muster: /chilbi/i },
    { reihe: 'preisjassen', muster: /preisjass/i },
    { reihe: 'weihnachtshock', muster: /weihnachtshock/i },
];

// DEUTSCH: Nur https-Adressen uebernehmen (kein javascript:, data:, http:)
function anlassSichereUrl(wert) {
    if (typeof wert !== 'string' || !wert.trim()) return null;
    try {
        const url = new URL(wert.trim());
        return url.protocol === 'https:' ? url.href : null;
    } catch (e) {
        return null;
    }
}

// DEUTSCH: Logo-Adresse eines Anlasses so, wie er von der API kommt.
// Mit app-Block gilt nur app.logo (null = bewusst kein Logo); ohne app-Block
// Rueckfall auf die Reihe im Titel.
function anlassLogoUrl(anlass) {
    if (!anlass) return null;
    if (anlass.app && typeof anlass.app === 'object') {
        return anlassSichereUrl(anlass.app.logo);
    }
    const titel = String(anlass.title || anlass.event_title || '');
    const r = ANLASS_REIHEN.find(x => x.muster.test(titel));
    return r ? `/images/anlaesse/${r.reihe}.png` : null;
}

// DEUTSCH: <img> fuer das Logo, rund, quadratisch in groesse px; '' ohne Logo.
// Erwartet eine Adresse aus anlassLogoUrl() und escaped sie trotzdem fuer
// das Attribut. alt bleibt leer: der Titel steht immer daneben.
function anlassLogoHtml(url, groesse = 56, klassen = '') {
    if (!url) return '';
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const px = Number(groesse) || 56;
    return `<img src="${esc(url)}" alt="" width="${px}" height="${px}" loading="lazy"
                 class="anlass-logo rounded-full flex-shrink-0 object-contain ${esc(klassen)}"
                 style="width:${px}px;height:${px}px"
                 onerror="this.style.display='none'">`;
}
