// Sammelmail: Benachrichtigungen hoechstens einmal pro Tag (Oktober 2026).
//
// Wer bei einem Anlass mitmacht, bekam bisher zu jeder Aenderung sofort eine
// Mail — Anmeldung bestaetigt, Schicht verschoben, Platz frei, neue Anmeldung
// beim Organisator ... an einem regen Tag ein Dutzend. Jetzt schicken die
// Dienste solche Mails mit `sammeln: true` an /email/send; sie landen hier in
// einer Warteschlange und gehen um 18:00 (Europe/Zurich) als EINE Mail je
// Empfaenger raus, mit allem, was seit der letzten Sammelmail kam.
//
// Nicht gesammelt wird, was sofort gebraucht wird: Bestaetigungslinks,
// Zugangsdaten, Codes, Erinnerungen, Mails mit Anhang. Diese Aufrufer setzen
// `sammeln` einfach nicht. Mails mit Anhang oder Cc gehen auch mit `sammeln`
// sofort (siehe kannSammeln).

const VERSANDSTUNDE = 18;
const MAX_VERSUCHE = 5;

async function sammelSchema(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS email_sammlung (
            id SERIAL PRIMARY KEY,
            empfaenger TEXT NOT NULL,
            betreff TEXT NOT NULL,
            text TEXT NOT NULL,
            html TEXT,
            member_id UUID,
            event_id UUID,
            template_id UUID,
            erstellt_am TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            gesendet_am TIMESTAMPTZ,
            versuche INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_email_sammlung_offen
            ON email_sammlung (erstellt_am) WHERE gesendet_am IS NULL;
    `);
}

function kannSammeln(body) {
    if (!body || body.sammeln !== true) return false;
    if (body.cc) return false;
    if (Array.isArray(body.attachments) && body.attachments.length > 0) return false;
    // Mehrere Empfaenger in einem Feld: lieber sofort als falsch gruppiert.
    return typeof body.to === 'string' && body.to.trim() !== '' && !/[,;]/.test(body.to);
}

async function vormerken(pool, m) {
    await pool.query(
        `INSERT INTO email_sammlung (empfaenger, betreff, text, html, member_id, event_id, template_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [m.to.trim(), m.subject || '(ohne Betreff)', m.text || '', m.html || null,
            m.member_id || null, m.event_id || null, m.template_id || null]);
}

// Wanduhr in Zuerich -> UTC. Der Versatz wird an der gesuchten Zeit selbst
// gemessen, damit Sommer- und Winterzeit stimmen.
function zuerichZuUtc(jahr, monat, tag, stunde) {
    const schaetzung = Date.UTC(jahr, monat - 1, tag, stunde);
    const teile = zuerichTeile(new Date(schaetzung));
    const wand = Date.UTC(teile.jahr, teile.monat - 1, teile.tag, teile.stunde, teile.minute);
    return new Date(schaetzung - (wand - schaetzung));
}

function zuerichTeile(d) {
    const f = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    });
    const t = Object.fromEntries(f.formatToParts(d).map(p => [p.type, p.value]));
    return { jahr: +t.year, monat: +t.month, tag: +t.day, stunde: +t.hour, minute: +t.minute };
}

/** Letzter Versandzeitpunkt (18:00 Zuerich) <= jetzt. Alles davor ist faellig. */
function stichzeit(jetzt = new Date()) {
    const z = zuerichTeile(jetzt);
    const heute = zuerichZuUtc(z.jahr, z.monat, z.tag, VERSANDSTUNDE);
    if (heute <= jetzt) return heute;
    const gestern = new Date(Date.UTC(z.jahr, z.monat - 1, z.tag) - 86400000);
    return zuerichZuUtc(gestern.getUTCFullYear(), gestern.getUTCMonth() + 1, gestern.getUTCDate(), VERSANDSTUNDE);
}

function textZuHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
        .replace(/\n/g, '<br>');
}

/**
 * Eine Mail aus den Eintraegen eines Empfaengers. Ein einzelner Eintrag geht
 * unveraendert raus (mit seinem Betreff und HTML), mehrere als Sammelmail.
 */
function sammelmailBauen(eintraege, jetzt = new Date()) {
    if (eintraege.length === 1) {
        const e = eintraege[0];
        return { subject: e.betreff, text: e.text, html: e.html || textZuHtml(e.text) };
    }
    const zeit = (d) => new Date(d).toLocaleString('de-CH', {
        timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
    const datum = jetzt.toLocaleDateString('de-CH', { timeZone: 'Europe/Zurich' });
    const subject = `Feuerwehrverein Raura: ${eintraege.length} Benachrichtigungen (${datum})`;
    const einleitung = `Guten Tag,\n\nhier alle Benachrichtigungen seit der letzten Sammelmail (${eintraege.length}):`;
    const text = einleitung + '\n\n' + eintraege.map((e, i) =>
        `━━━━━━━━━━━━━━━━━━━━\n${i + 1}. ${e.betreff}  (${zeit(e.erstellt_am)})\n━━━━━━━━━━━━━━━━━━━━\n\n${String(e.text).trim()}`
    ).join('\n\n\n') + '\n\n\nFeuerwehrverein Raura (Sammelmail, einmal täglich um 18 Uhr)';
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;max-width:680px">
<p>${textZuHtml(einleitung)}</p>
<ol style="padding-left:18px;margin:0 0 12px">${eintraege.map((e, i) =>
        `<li><a href="#n${i + 1}">${textZuHtml(e.betreff)}</a></li>`).join('')}</ol>
${eintraege.map((e, i) => `<div id="n${i + 1}" style="border-top:3px solid #B91C1C;margin-top:22px;padding-top:8px">
<div style="font-weight:bold;font-size:15px">${i + 1}. ${textZuHtml(e.betreff)}</div>
<div style="color:#666;font-size:12px;margin-bottom:8px">${zeit(e.erstellt_am)}</div>
<div>${textZuHtml(String(e.text).trim())}</div></div>`).join('\n')}
<p style="color:#666;font-size:12px;margin-top:24px">Feuerwehrverein Raura (Sammelmail, einmal täglich um 18 Uhr)</p></div>`;
    return { subject, text, html };
}

/**
 * Faellige Eintraege holen (und sofort als gesendet markieren, damit ein
 * zweiter Lauf sie nicht auch nimmt), je Empfaenger eine Mail schicken,
 * protokollieren. Schlaegt der Versand fehl, kommen die Eintraege zurueck in
 * die Warteschlange — hoechstens MAX_VERSUCHE Mal.
 */
async function faelligeVersenden(pool, senden, jetzt = new Date()) {
    const r = await pool.query(`
        UPDATE email_sammlung SET gesendet_am = NOW()
        WHERE id IN (
            SELECT id FROM email_sammlung
            WHERE gesendet_am IS NULL AND erstellt_am < $1 AND versuche < $2
            ORDER BY id FOR UPDATE SKIP LOCKED)
        RETURNING *`, [stichzeit(jetzt), MAX_VERSUCHE]);
    if (!r.rows.length) return { mails: 0, eintraege: 0 };

    const gruppen = new Map();
    for (const e of r.rows.sort((a, b) => a.id - b.id)) {
        const k = e.empfaenger.toLowerCase();
        gruppen.set(k, [...(gruppen.get(k) || []), e]);
    }

    let mails = 0;
    for (const eintraege of gruppen.values()) {
        const ids = eintraege.map(e => e.id);
        try {
            const mail = sammelmailBauen(eintraege, jetzt);
            const info = await senden({ to: eintraege[0].empfaenger, ...mail });
            for (const e of eintraege) {
                await pool.query(`
                    INSERT INTO dispatch_log (type, template_id, member_id, recipient_email, subject, body, status, external_id, event_id, sent_at)
                    VALUES ('email', $1, $2, $3, $4, $5, 'sent', $6, $7, NOW())`,
                    [e.template_id, e.member_id, e.empfaenger, e.betreff, e.text, info?.messageId || null, e.event_id]);
            }
            mails++;
        } catch (err) {
            console.error('[SAMMELMAIL] Versand an', eintraege[0].empfaenger, 'fehlgeschlagen:', err.message);
            await pool.query(
                'UPDATE email_sammlung SET gesendet_am = NULL, versuche = versuche + 1 WHERE id = ANY($1)', [ids]);
        }
    }
    console.log(`[SAMMELMAIL] ${mails} Mail(s) mit ${r.rows.length} Benachrichtigung(en) verschickt`);
    return { mails, eintraege: r.rows.length };
}

/** Jede Minute pruefen; faellig ist erst, was vor dem letzten 18:00 kam. */
function sammelmailStarten(pool, senden) {
    let laeuft = false;
    const takt = async () => {
        if (laeuft) return;
        laeuft = true;
        try { await faelligeVersenden(pool, senden); }
        catch (e) { console.error('[SAMMELMAIL] Lauf fehlgeschlagen:', e.message); }
        finally { laeuft = false; }
    };
    setInterval(takt, 60 * 1000);
    takt();
}

module.exports = {
    sammelSchema, kannSammeln, vormerken, stichzeit, sammelmailBauen,
    faelligeVersenden, sammelmailStarten, VERSANDSTUNDE
};
