// Pingen-Spesen fuer den Kassier (November 2026).
//
// Bisher ging zu jedem Brief eine Meldung "Ein Brief wurde ueber Pingen
// versendet ... Kosten im Dashboard" an den Kassier - ohne Betrag, und schon
// beim Einreichen, auch wenn der Brief mangels Guthaben noch gar nicht
// bezahlt war (Preisjassen 03.11.2026: 14 Meldungen, 13 Briefe warteten auf
// Guthaben). Das Guthaben laedt der Aktuar mit eigenem Geld auf.
//
// Jetzt: taeglich um 18:00 (Europe/Zurich) fragt der Dienst Pingen nach jedem
// noch nicht abgerechneten Brief. Was Pingen belastet hat, kommt mit dem
// genauen Preis in EINE Spesenabrechnung an den Kassier ("vorgestreckt vom
// Aktuar") - als eigene Mail, nicht in der Sammelmail, damit sie als Beleg
// fuer sich steht. Briefe, die noch auf
// Guthaben warten oder in der Pruefung sind, bleiben fuer den naechsten Tag
// liegen. Stornierte und abgelehnte Briefe kosten nichts und werden nur als
// erledigt markiert.

const qrZahlung = require('./qr-zahlung');

const PRUEFSTUNDE = 18;
const PRUEFMINUTE = 0;

// Erst ab hier abrechnen: die Briefe davor hatte der Kassier schon als
// Einzelmeldung (ohne Betrag) bekommen.
const AB = '2026-11-03';

const KASSIER_ADRESSE = process.env.KASSIER_EMAIL || 'kassier@fwv-raura.ch';

/** Pingen-Status, bei denen (noch) nichts belastet ist. */
const NICHT_BELASTET = ['created', 'uploaded', 'validating', 'valid', 'processing_validation',
    'action_required', 'awaiting_credits'];
/** Status, bei denen nie etwas belastet wird (oder es zurueckkam). */
const KOSTENLOS = ['cancelled', 'cancelled_expired', 'expired', 'deleted'];

function franken(n) {
    return `CHF ${Number(n).toFixed(2)}`;
}

/** "CH9300762011623852957" -> "CH93 0076 2011 6238 5295 7" */
function ibanText(iban) {
    const roh = String(iban || '').replace(/\s+/g, '').toUpperCase();
    return roh ? roh.replace(/(.{4})(?=.)/g, '$1 ') : null;
}

/** Text der Spesenabrechnung: eine Zeile je Brief, Summe, wer zurueckbekommt. */
function abrechnungBauen(briefe, { kassier, aktuar, datum }) {
    // Auf Rappen runden: 14 x 1.63 + ... ergibt sonst 22.299999999999994.
    const summe = Math.round(briefe.reduce((s, b) => s + Number(b.kosten), 0) * 100) / 100;
    const breite = Math.max(...briefe.map(b => b.name.length));
    const zeilen = briefe.map(b => `  ${b.name.padEnd(breite)}  ${franken(b.kosten)}  ${b.betreff}`);
    const name = aktuar ? `${aktuar.vorname} ${aktuar.nachname}`.trim() : null;
    const wer = name ? `${name} (Aktuar)` : 'der Aktuar';
    const iban = ibanText(aktuar?.iban);
    return {
        subject: `Spesenabrechnung Pingen ${datum}: ${briefe.length} ${briefe.length === 1 ? 'Brief' : 'Briefe'}, ${franken(summe)}`,
        text: [
            `Hallo ${kassier.vorname}`,
            '',
            `Pingen hat heute diese Briefe belastet (${datum}):`,
            '',
            ...zeilen,
            '',
            `Total: ${franken(summe)}`,
            '',
            `Das Pingen-Guthaben hat ${wer} vorgestreckt – bitte zurückerstatten.`,
            iban ? `Auszahlung: ${iban} (${name})` : 'Auszahlung: IBAN fehlt im Profil des Aktuars.',
            '',
            'Als Spesen eingetragen: «Bezahlt» in der Mitglieder-App unter Vorstand → Spesen.',
            'Belege und Rechnungen: https://app.pingen.com',
        ].join('\n'),
        summe,
    };
}

/** QR-Code zum Auszahlen an den Aktuar (html + attachments) oder {}. */
function zahlteilMail(mail, aktuar) {
    if (!aktuar?.iban) return {};
    const qr = qrZahlung.anhang({
        iban: aktuar.iban, name: `${aktuar.vorname} ${aktuar.nachname}`.trim(),
        strasse: aktuar.strasse, plz: aktuar.plz, ort: aktuar.ort,
        betrag: mail.summe, mitteilung: mail.subject,
    });
    if (!qr) return {};
    const html = mail.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
    return { html: `<div style="font-family:monospace;white-space:pre-wrap">${html}</div>${qrZahlung.HTML_BLOCK}`,
        attachments: [qr] };
}

/**
 * Offene Briefe bei Pingen nachfragen, belastete abrechnen.
 * briefLesen(letterId) -> { status, preis } (Pingen-API, price_value);
 * senden({ to, subject, text }) schickt die Abrechnung als eigene Mail.
 * Gibt { abgerechnet, summe, offen } zurueck.
 */
async function spesenAbrechnen(pool, { briefLesen, senden, datum, log = () => {} }) {
    const offen = (await pool.query(`
        SELECT id, external_id, subject, recipient_address FROM dispatch_log
        WHERE type = 'pingen' AND external_id IS NOT NULL AND spesen_gemeldet_am IS NULL
          AND created_at >= $1 AND subject NOT LIKE '[Staging]%'
        ORDER BY created_at`, [AB])).rows;
    if (!offen.length) return { abgerechnet: 0, summe: 0, offen: 0 };

    const belastet = [];
    let wartet = 0;
    for (const z of offen) {
        let brief;
        try {
            brief = await briefLesen(z.external_id);
        } catch (e) {
            // 404: in Pingen geloescht - nie belastet.
            if (e.response?.status === 404) brief = { status: 'deleted', preis: 0 };
            else { log('Pingen-Spesen: Brief nicht lesbar', { id: z.external_id, fehler: e.message }); wartet++; continue; }
        }
        if (NICHT_BELASTET.includes(brief.status)) { wartet++; continue; }
        if (KOSTENLOS.includes(brief.status) || !(Number(brief.preis) > 0)) {
            await pool.query('UPDATE dispatch_log SET spesen_gemeldet_am = NOW(), kosten = 0 WHERE id = $1', [z.id]);
            continue;
        }
        let name = '';
        try { name = JSON.parse(z.recipient_address || '{}').name || ''; } catch { /* alte Eintraege */ }
        belastet.push({ id: z.id, letterId: z.external_id, name: name || '(ohne Name)', betreff: z.subject || 'Brief',
            kosten: Number(brief.preis) });
    }
    if (!belastet.length) return { abgerechnet: 0, summe: 0, offen: wartet };

    // An das Funktionspostfach (bleibt beim Amtswechsel), Anrede vom Kassier.
    const kassier = {
        vorname: (await pool.query(
            "SELECT vorname FROM members WHERE funktion ILIKE '%kassier%' ORDER BY nachname, vorname LIMIT 1"
        )).rows[0]?.vorname || 'Kassier',
        email: KASSIER_ADRESSE,
    };
    const aktuar = (await pool.query(
        "SELECT vorname, nachname, iban, strasse, plz, ort FROM members WHERE funktion ILIKE '%aktuar%' ORDER BY nachname, vorname LIMIT 1"
    )).rows[0];

    const mail = abrechnungBauen(belastet, { kassier, aktuar, datum });
    await senden({ to: kassier.email, subject: mail.subject, text: mail.text, ...zahlteilMail(mail, aktuar) });
    await pool.query(`
        INSERT INTO dispatch_log (type, recipient_email, subject, body, status, sent_at)
        VALUES ('email', $1, $2, $3, 'sent', NOW())`, [kassier.email, mail.subject, mail.text]);
    await pool.query(`
        INSERT INTO pingen_abrechnungen (art, titel, empfaenger, briefe, summe, letter_ids, text)
        VALUES ('taeglich', $1, $2, $3, $4, $5, $6)`,
    [mail.subject, kassier.email, belastet.length, mail.summe, belastet.map(b => b.letterId), mail.text]);
    await alsSpesenEintragen(pool, log);
    for (const b of belastet) {
        await pool.query('UPDATE dispatch_log SET spesen_gemeldet_am = NOW(), kosten = $2 WHERE id = $1', [b.id, b.kosten]);
    }
    log('Pingen-Spesen verschickt', { briefe: belastet.length, summe: mail.summe });
    return { abgerechnet: belastet.length, summe: mail.summe, offen: wartet };
}

async function spesenSchema(pool) {
    await pool.query(`
        ALTER TABLE dispatch_log ADD COLUMN IF NOT EXISTS kosten NUMERIC(8,2);
        ALTER TABLE dispatch_log ADD COLUMN IF NOT EXISTS spesen_gemeldet_am TIMESTAMPTZ;
        CREATE TABLE IF NOT EXISTS pingen_abrechnungen (
            id SERIAL PRIMARY KEY,
            art TEXT NOT NULL,
            titel TEXT NOT NULL,
            empfaenger TEXT NOT NULL,
            briefe INTEGER NOT NULL,
            summe NUMERIC(10,2) NOT NULL,
            letter_ids TEXT[] NOT NULL DEFAULT '{}',
            erstellt_am TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        ALTER TABLE pingen_abrechnungen ADD COLUMN IF NOT EXISTS text TEXT;
        ALTER TABLE pingen_abrechnungen ADD COLUMN IF NOT EXISTS spesen_id UUID;
    `);
    // Die einmalige Abrechnung 2026 (Jan-Sep) ging am 03.11.2026 von Hand an
    // den Kassier; sie deckt alle belasteten Briefe vor AB ab.
    await pool.query(`
        INSERT INTO pingen_abrechnungen (art, titel, empfaenger, briefe, summe, erstellt_am)
        SELECT 'nachtrag', 'Spesenabrechnung Pingen 2026 (Jan–Sep): 89 Briefe, CHF 146.06',
               'kassier@fwv-raura.ch', 89, 146.06, '2026-11-03T16:50:00+01:00'
        WHERE NOT EXISTS (SELECT 1 FROM pingen_abrechnungen WHERE art = 'nachtrag')
    `);
    await pool.query("UPDATE pingen_abrechnungen SET text = $1 WHERE art = 'nachtrag' AND text IS NULL", [NACHTRAG_2026]);
    // Abrechnungen aus der Zeit vor dieser Tabelle (03.11.2026, 18:00):
    // aus dispatch_log nachtragen, je Tag eine.
    await pool.query(`
        INSERT INTO pingen_abrechnungen (art, titel, empfaenger, briefe, summe, letter_ids, erstellt_am)
        SELECT 'taeglich',
               'Spesenabrechnung Pingen ' || to_char(tag, 'DD.MM.YYYY') || ': ' || count(*) || ' Briefe, CHF '
                   || to_char(sum(kosten), 'FM999990.00'),
               $1, count(*), sum(kosten), array_agg(external_id), max(spesen_gemeldet_am)
        FROM (SELECT *, (spesen_gemeldet_am AT TIME ZONE 'Europe/Zurich')::date AS tag FROM dispatch_log
              WHERE type = 'pingen' AND kosten > 0 AND spesen_gemeldet_am IS NOT NULL
                AND external_id <> ALL (SELECT unnest(letter_ids) FROM pingen_abrechnungen)) d
        GROUP BY tag
    `, [KASSIER_ADRESSE]);
}

// Inhalt der von Hand verschickten Abrechnung 2026 - Beleg der Spesen.
const NACHTRAG_2026 = [
    'Abrechnung der Pingen-Briefe 2026 bis September', '',
    '  22.01.2026  Helferaufruf (1 unzustellbar)  17 Briefe  CHF  25.16',
    '  21.02.2026  Einladung                      16 Briefe  CHF  34.28',
    '  16.04.2026  Mitgliederbeitrag              28 Briefe  CHF  42.02',
    '  04.07.2026  Einladung Taco-Abend           14 Briefe  CHF  22.30',
    '  07.09.2026  Einladung Chilbi               14 Briefe  CHF  22.30', '',
    'Total: 89 Briefe, CHF 146.06', '',
    'Preise je Brief laut Pingen; Belege: https://app.pingen.com',
].join('\n');

/**
 * Jede Pingen-Abrechnung zusaetzlich als Spesen des Aktuars eintragen
 * (Tabelle spesen von api-members, Quelle 'pingen', Beleg = Text der
 * Abrechnung). Die Mail an den Kassier bleibt - sie soll nicht untergehen.
 * Fehlt die Tabelle noch (api-members aelter), beim naechsten Mal.
 */
async function alsSpesenEintragen(pool, log = () => {}) {
    try {
        const offen = (await pool.query(
            'SELECT * FROM pingen_abrechnungen WHERE spesen_id IS NULL ORDER BY erstellt_am')).rows;
        if (!offen.length) return 0;
        const aktuar = (await pool.query(
            "SELECT id, iban FROM members WHERE funktion ILIKE '%aktuar%' ORDER BY nachname, vorname LIMIT 1")).rows[0];
        if (!aktuar) return 0;
        for (const a of offen) {
            const r = await pool.query(`
                INSERT INTO spesen (member_id, betrag, datum, zweck, kategorie, iban, beleg, beleg_name, beleg_typ, quelle)
                VALUES ($1, $2, ($3::timestamptz AT TIME ZONE 'Europe/Zurich')::date, $4, 'Porto', $5, $6, $7, 'text/plain', 'pingen')
                RETURNING id`,
            [aktuar.id, a.summe, a.erstellt_am, a.titel, aktuar.iban || null,
                Buffer.from(`${a.titel}\n\n${a.text || ''}`.trim() + '\n', 'utf8'),
                `${a.titel.replace(/[^\w.\- äöüÄÖÜ()]/g, '_').slice(0, 100)}.txt`]);
            await pool.query('UPDATE pingen_abrechnungen SET spesen_id = $1 WHERE id = $2', [r.rows[0].id, a.id]);
        }
        log('Pingen-Abrechnungen als Spesen eingetragen', { anzahl: offen.length });
        return offen.length;
    } catch (e) {
        log('Pingen-Spesen: Eintrag in spesen nicht moeglich', { fehler: e.message });
        return 0;
    }
}

/** Belastet heisst: Pingen hat den Preis vom Guthaben abgezogen. */
function istBelastet(b) {
    return !NICHT_BELASTET.includes(b.status) && !KOSTENLOS.includes(b.status) && Number(b.preis) > 0;
}

/**
 * Uebersicht fuer ein Jahr: briefe = alle Pingen-Briefe ({ id, erstellt,
 * status, preis }), abrechnungen = Zeilen aus pingen_abrechnungen.
 * Abgerechnet ist ein Brief, wenn eine taegliche Abrechnung ihn nennt oder
 * er vor AB belastet wurde (Nachtrag).
 */
function spesenUebersicht({ briefe, abrechnungen, jahr }) {
    const genannt = new Set(abrechnungen.flatMap(a => a.letter_ids || []));
    const rund = (n) => Math.round(n * 100) / 100;
    const monate = new Map();
    let wartet = { briefe: 0, summe: 0 };
    for (const b of briefe) {
        if (!String(b.erstellt).startsWith(String(jahr))) continue;
        const monat = String(b.erstellt).slice(0, 7);
        if (b.status === 'awaiting_credits') {
            wartet = { briefe: wartet.briefe + 1, summe: wartet.summe + Number(b.preis || 0) };
            continue;
        }
        if (!istBelastet(b)) continue;
        const m = monate.get(monat) || { monat, briefe: 0, summe: 0, abgerechnet: 0, offen: 0 };
        const abgerechnet = genannt.has(b.id) || String(b.erstellt) < AB;
        m.briefe++;
        m.summe += Number(b.preis);
        if (abgerechnet) m.abgerechnet += Number(b.preis); else m.offen += Number(b.preis);
        monate.set(monat, m);
    }
    const liste = [...monate.values()].sort((a, b) => a.monat.localeCompare(b.monat))
        .map(m => ({ ...m, summe: rund(m.summe), abgerechnet: rund(m.abgerechnet), offen: rund(m.offen) }));
    const total = (k) => rund(liste.reduce((s, m) => s + m[k], 0));
    return {
        jahr: Number(jahr),
        monate: liste,
        total: { briefe: liste.reduce((s, m) => s + m.briefe, 0), summe: total('summe'),
            abgerechnet: total('abgerechnet'), offen: total('offen') },
        wartet: { briefe: wartet.briefe, summe: rund(wartet.summe) },
        abrechnungen: abrechnungen
            .filter(a => new Date(a.erstellt_am).getFullYear() === Number(jahr))
            .map(a => ({ datum: new Date(a.erstellt_am).toISOString(), titel: a.titel, art: a.art,
                briefe: a.briefe, summe: Number(a.summe), empfaenger: a.empfaenger })),
    };
}

/** GET /pingen/spesen?jahr= - briefeListe() liefert alle Pingen-Briefe. */
function spesenRoute({ pool, briefeListe }) {
    return async (req, res) => {
        try {
            const jahr = /^\d{4}$/.test(String(req.query.jahr || '')) ? req.query.jahr : String(new Date().getFullYear());
            const [briefe, abrechnungen] = await Promise.all([
                briefeListe(),
                pool.query('SELECT * FROM pingen_abrechnungen ORDER BY erstellt_am DESC').then(r => r.rows),
            ]);
            res.json(spesenUebersicht({ briefe, abrechnungen, jahr }));
        } catch (e) {
            res.status(502).json({ error: `Pingen nicht erreichbar: ${e.message}` });
        }
    };
}

/** Jede Minute schauen; einmal am Tag ab 18:00 Zuerich abrechnen. */
function spesenStarten(pool, deps, zuerichTeile) {
    let erledigt = null;
    let laeuft = false;
    // Abrechnungen, die noch nicht als Spesen stehen (z.B. api-members kam
    // spaeter hoch): gleich und dann stuendlich nachtragen.
    alsSpesenEintragen(pool, deps.log);
    setInterval(() => alsSpesenEintragen(pool, deps.log), 60 * 60 * 1000);
    setInterval(async () => {
        const z = zuerichTeile(new Date());
        const tag = `${z.jahr}-${z.monat}-${z.tag}`;
        if (laeuft || erledigt === tag || z.stunde !== PRUEFSTUNDE || z.minute < PRUEFMINUTE) return;
        laeuft = true;
        try {
            const datum = `${String(z.tag).padStart(2, '0')}.${String(z.monat).padStart(2, '0')}.${z.jahr}`;
            const r = await spesenAbrechnen(pool, { ...deps, datum });
            console.log(`[PINGEN-SPESEN] ${r.abgerechnet} Brief(e) abgerechnet (${franken(r.summe)}), ${r.offen} offen`);
            erledigt = tag;
        } catch (e) {
            console.error('[PINGEN-SPESEN] Lauf fehlgeschlagen:', e.message);
        } finally {
            laeuft = false;
        }
    }, 60 * 1000);
}

module.exports = { AB, KASSIER_ADRESSE, NICHT_BELASTET, KOSTENLOS, abrechnungBauen, spesenAbrechnen, spesenSchema,
    spesenStarten, zahlteilMail, istBelastet, spesenUebersicht, spesenRoute, alsSpesenEintragen };
