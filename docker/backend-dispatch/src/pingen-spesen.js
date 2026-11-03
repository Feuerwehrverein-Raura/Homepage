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
const KOSTENLOS = ['cancelled', 'expired', 'deleted'];

function franken(n) {
    return `CHF ${Number(n).toFixed(2)}`;
}

/** Text der Spesenabrechnung: eine Zeile je Brief, Summe, wer zurueckbekommt. */
function abrechnungBauen(briefe, { kassier, aktuar, datum }) {
    const summe = briefe.reduce((s, b) => s + Number(b.kosten), 0);
    const breite = Math.max(...briefe.map(b => b.name.length));
    const zeilen = briefe.map(b => `  ${b.name.padEnd(breite)}  ${franken(b.kosten)}  ${b.betreff}`);
    const wer = aktuar ? `${`${aktuar.vorname} ${aktuar.nachname}`.trim()} (Aktuar)` : 'der Aktuar';
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
            'Belege und Rechnungen: https://app.pingen.com',
        ].join('\n'),
        summe,
    };
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
        belastet.push({ id: z.id, name: name || '(ohne Name)', betreff: z.subject || 'Brief', kosten: Number(brief.preis) });
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
        "SELECT vorname, nachname FROM members WHERE funktion ILIKE '%aktuar%' ORDER BY nachname, vorname LIMIT 1"
    )).rows[0];

    const mail = abrechnungBauen(belastet, { kassier, aktuar, datum });
    await senden({ to: kassier.email, subject: mail.subject, text: mail.text });
    await pool.query(`
        INSERT INTO dispatch_log (type, recipient_email, subject, body, status, sent_at)
        VALUES ('email', $1, $2, $3, 'sent', NOW())`, [kassier.email, mail.subject, mail.text]);
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
    `);
}

/** Jede Minute schauen; einmal am Tag ab 18:00 Zuerich abrechnen. */
function spesenStarten(pool, deps, zuerichTeile) {
    let erledigt = null;
    let laeuft = false;
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

module.exports = { AB, KASSIER_ADRESSE, NICHT_BELASTET, KOSTENLOS, abrechnungBauen, spesenAbrechnen, spesenSchema, spesenStarten };
