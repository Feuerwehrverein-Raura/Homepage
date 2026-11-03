// Spesen: jedes Mitglied rechnet Auslagen fuer den Verein ab (November 2026).
//
// Ein Mitglied reicht in der App (Profil -> Spesen) Betrag, Datum, Zweck,
// Kategorie, optional den Anlass und einen Beleg (Foto oder PDF, Pflicht)
// ein. Ausbezahlt wird auf die IBAN aus dem Profil - ohne IBAN kein
// Einreichen. Der Kassier bekommt eine Mail an kassier@fwv-raura.ch und
// markiert die Spesen in der App (Vorstand -> Spesen) als bezahlt oder lehnt
// sie mit Begruendung ab; das Mitglied erfaehrt beides per Mail.
//
// Ablauf: eingereicht -> bezahlt | abgelehnt. Solange eingereicht, kann das
// Mitglied seine Spesen zurueckziehen (loeschen).
//
// Pingen-Porto legt api-dispatch selbst als Spesen des Aktuars an (quelle
// 'pingen', Beleg = die Abrechnung) - siehe backend-dispatch/src/pingen-spesen.js.
//
// Reine Bausteine (pruefen, Texte) sind ohne Datenbank testbar
// (test/spesen.test.js); spesenRouten haengt die Endpunkte ein.

const KATEGORIEN = ['Einkauf', 'Porto', 'Fahrt', 'Material', 'Verpflegung', 'Anderes'];
const BELEG_TYPEN = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };
const BELEG_MAX = 10 * 1024 * 1024;
const KASSIER_ADRESSE = process.env.KASSIER_EMAIL || 'kassier@fwv-raura.ch';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function spesenSchema(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS spesen (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            member_id UUID NOT NULL,
            betrag NUMERIC(10,2) NOT NULL CHECK (betrag > 0),
            datum DATE NOT NULL,
            zweck TEXT NOT NULL,
            kategorie TEXT NOT NULL,
            event_id UUID,
            iban TEXT,
            beleg BYTEA,
            beleg_name TEXT,
            beleg_typ TEXT,
            quelle TEXT NOT NULL DEFAULT 'mitglied',
            status TEXT NOT NULL DEFAULT 'eingereicht',
            grund TEXT,
            erstellt_am TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            erledigt_am TIMESTAMPTZ,
            erledigt_von TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_spesen_member ON spesen (member_id, erstellt_am DESC);
        CREATE INDEX IF NOT EXISTS idx_spesen_status ON spesen (status, erstellt_am DESC);
    `);
}

/** IBAN ohne Leerzeichen, gross. */
function ibanNormal(iban) {
    return String(iban || '').replace(/\s+/g, '').toUpperCase();
}

/** IBAN-Pruefziffer (Modulo 97). */
function ibanGueltig(iban) {
    const i = ibanNormal(iban);
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(i)) return false;
    const umgestellt = (i.slice(4) + i.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
    let rest = 0;
    for (const ziffer of umgestellt) rest = (rest * 10 + Number(ziffer)) % 97;
    return rest === 1;
}

/** IBAN fuer Mails: CH93 0076 2011 6238 5295 7. */
function ibanText(iban) {
    return ibanNormal(iban).replace(/(.{4})/g, '$1 ').trim();
}

function franken(n) {
    return `CHF ${Number(n).toFixed(2)}`;
}

/**
 * Eingabe pruefen. Gibt { fehler } oder { wert } zurueck; wert enthaelt den
 * Beleg als Buffer. [heute] fuer Tests.
 */
function eingabePruefen(body, { iban, heute = new Date() } = {}) {
    const b = body || {};
    if (!ibanGueltig(iban)) {
        return { fehler: 'Bitte zuerst eine gültige IBAN im Profil eintragen – darauf wird ausbezahlt.' };
    }
    const betrag = Math.round(Number(String(b.betrag ?? '').replace(',', '.')) * 100) / 100;
    if (!(betrag > 0) || betrag > 10000) return { fehler: 'Betrag fehlt oder ist ungültig.' };
    const datum = String(b.datum || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || Number.isNaN(Date.parse(datum))) return { fehler: 'Datum fehlt.' };
    if (Date.parse(datum) > heute.getTime() + 86400000) return { fehler: 'Das Datum liegt in der Zukunft.' };
    const zweck = String(b.zweck || '').trim();
    if (zweck.length < 3) return { fehler: 'Bitte angeben, wofür die Auslage war.' };
    if (!KATEGORIEN.includes(b.kategorie)) return { fehler: 'Kategorie fehlt.' };
    if (b.event_id && !UUID.test(String(b.event_id))) return { fehler: 'Anlass ungültig.' };
    const typ = String(b.beleg_typ || '').toLowerCase();
    if (!b.beleg_base64) return { fehler: 'Beleg fehlt (Foto oder PDF der Quittung).' };
    if (!BELEG_TYPEN[typ]) return { fehler: 'Beleg muss ein PDF, JPG oder PNG sein.' };
    const beleg = Buffer.from(String(b.beleg_base64), 'base64');
    if (!beleg.length) return { fehler: 'Beleg ist leer.' };
    if (beleg.length > BELEG_MAX) return { fehler: 'Beleg ist grösser als 10 MB.' };
    const name = String(b.beleg_name || `Beleg.${BELEG_TYPEN[typ]}`).replace(/[^\w.\- äöüÄÖÜ]/g, '_').slice(0, 120);
    return {
        wert: {
            betrag, datum, zweck: zweck.slice(0, 500), kategorie: b.kategorie,
            event_id: b.event_id || null, beleg, beleg_name: name, beleg_typ: typ, iban: ibanNormal(iban),
        },
    };
}

function schweizerDatum(d) {
    const x = new Date(d);
    return `${String(x.getDate()).padStart(2, '0')}.${String(x.getMonth() + 1).padStart(2, '0')}.${x.getFullYear()}`;
}

/** Mail an den Kassier: neue Spesen. */
function kassierMail(s, { mitglied, anlass }) {
    const wer = `${mitglied.vorname} ${mitglied.nachname}`.trim();
    return {
        to: KASSIER_ADRESSE,
        subject: `Spesen ${franken(s.betrag)}: ${wer} – ${s.zweck}`.slice(0, 200),
        body: [
            'Hallo Kassier', '',
            `${wer} hat Spesen eingereicht:`, '',
            `  Betrag:     ${franken(s.betrag)}`,
            `  Datum:      ${schweizerDatum(s.datum)}`,
            `  Zweck:      ${s.zweck}`,
            `  Kategorie:  ${s.kategorie}`,
            ...(anlass ? [`  Anlass:     ${anlass}`] : []),
            `  Auszahlung: ${ibanText(s.iban)} (${wer})`, '',
            'Den Beleg und «Bezahlt» bzw. «Ablehnen» findest du in der Mitglieder-App unter Vorstand → Spesen.',
        ].join('\n'),
    };
}

/** Mail an das Mitglied: bezahlt oder abgelehnt. */
function erledigtMail(s, { mitglied }) {
    const bezahlt = s.status === 'bezahlt';
    return {
        to: mitglied.versand_email || mitglied.email,
        subject: bezahlt
            ? `Spesen ausbezahlt: ${franken(s.betrag)} – ${s.zweck}`.slice(0, 200)
            : `Spesen abgelehnt: ${franken(s.betrag)} – ${s.zweck}`.slice(0, 200),
        body: [
            `Hallo ${mitglied.vorname}`, '',
            bezahlt
                ? `deine Spesen vom ${schweizerDatum(s.datum)} (${s.zweck}, ${franken(s.betrag)}) sind ausbezahlt ` +
                  `auf ${ibanText(s.iban)}.`
                : `deine Spesen vom ${schweizerDatum(s.datum)} (${s.zweck}, ${franken(s.betrag)}) wurden abgelehnt.`,
            ...(!bezahlt && s.grund ? ['', `Begründung: ${s.grund}`] : []),
            '', 'Danke für deinen Einsatz!', 'Feuerwehrverein Raura',
        ].join('\n'),
    };
}

const LISTE_FELDER = `s.id, s.member_id, s.betrag, s.datum, s.zweck, s.kategorie, s.event_id, s.iban,
    s.beleg_name, s.beleg_typ, s.quelle, s.status, s.grund, s.erstellt_am, s.erledigt_am, s.erledigt_von,
    m.vorname, m.nachname, e.title AS anlass`;

/**
 * Endpunkte einhaengen.
 * deps: pool, mitgliedAuth (Middleware), vorstandAuth (Middleware-Liste),
 * mitgliedZurAnmeldung(req), mailSenden({to, subject, body}), log.
 */
function spesenRouten(app, { pool, express, mitgliedAuth, vorstandAuth, mitgliedZurAnmeldung, mailSenden, log = () => {} }) {
    const gross = express.json({ limit: '15mb' });

    async function ich(req, res) {
        const m = await mitgliedZurAnmeldung(req);
        if (!m) res.status(404).json({ error: 'Mitglied nicht gefunden' });
        return m;
    }

    async function anlassTitel(id) {
        if (!id) return null;
        try {
            return (await pool.query('SELECT title FROM events WHERE id = $1', [id])).rows[0]?.title || null;
        } catch { return null; }
    }

    // Eigene Spesen
    app.get('/members/me/spesen', mitgliedAuth, async (req, res) => {
        try {
            const m = await ich(req, res);
            if (!m) return;
            const r = await pool.query(`SELECT ${LISTE_FELDER} FROM spesen s
                JOIN members m ON m.id = s.member_id LEFT JOIN events e ON e.id = s.event_id
                WHERE s.member_id = $1 ORDER BY s.erstellt_am DESC`, [m.id]);
            res.json({ spesen: r.rows, iban: m.iban || null, kategorien: KATEGORIEN });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/members/me/spesen', mitgliedAuth, gross, async (req, res) => {
        try {
            const m = await ich(req, res);
            if (!m) return;
            const p = eingabePruefen(req.body, { iban: m.iban });
            if (p.fehler) return res.status(400).json({ error: p.fehler });
            const v = p.wert;
            const r = await pool.query(`
                INSERT INTO spesen (member_id, betrag, datum, zweck, kategorie, event_id, iban, beleg, beleg_name, beleg_typ)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING id, betrag, datum, zweck, kategorie, event_id, iban, status, erstellt_am`,
            [m.id, v.betrag, v.datum, v.zweck, v.kategorie, v.event_id, v.iban, v.beleg, v.beleg_name, v.beleg_typ]);
            const s = r.rows[0];
            try {
                await mailSenden(kassierMail(s, { mitglied: m, anlass: await anlassTitel(s.event_id) }));
            } catch (e) {
                log('Spesen: Mail an Kassier fehlgeschlagen', { fehler: e.message });
            }
            res.status(201).json(s);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.delete('/members/me/spesen/:id', mitgliedAuth, async (req, res) => {
        try {
            const m = await ich(req, res);
            if (!m) return;
            if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Nicht gefunden' });
            const r = await pool.query(
                "DELETE FROM spesen WHERE id = $1 AND member_id = $2 AND status = 'eingereicht' RETURNING id",
                [req.params.id, m.id]);
            if (!r.rows.length) return res.status(409).json({ error: 'Nur eingereichte Spesen lassen sich zurückziehen.' });
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    async function belegSchicken(res, zeile) {
        if (!zeile?.beleg) return res.status(404).json({ error: 'Kein Beleg' });
        res.setHeader('Content-Type', zeile.beleg_typ || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(zeile.beleg_name || 'Beleg')}"`);
        res.send(zeile.beleg);
    }

    app.get('/members/me/spesen/:id/beleg', mitgliedAuth, async (req, res) => {
        try {
            const m = await ich(req, res);
            if (!m) return;
            if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Nicht gefunden' });
            const r = await pool.query('SELECT beleg, beleg_name, beleg_typ FROM spesen WHERE id = $1 AND member_id = $2',
                [req.params.id, m.id]);
            await belegSchicken(res, r.rows[0]);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Kassier / Vorstand
    app.get('/members/spesen', ...vorstandAuth, async (req, res) => {
        try {
            const status = ['eingereicht', 'bezahlt', 'abgelehnt'].includes(req.query.status) ? req.query.status : null;
            const r = await pool.query(`SELECT ${LISTE_FELDER} FROM spesen s
                JOIN members m ON m.id = s.member_id LEFT JOIN events e ON e.id = s.event_id
                WHERE ($1::text IS NULL OR s.status = $1) ORDER BY s.erstellt_am DESC LIMIT 500`, [status]);
            const offen = await pool.query(
                "SELECT count(*)::int AS anzahl, coalesce(sum(betrag), 0)::float AS summe FROM spesen WHERE status = 'eingereicht'");
            res.json({ spesen: r.rows, offen: offen.rows[0] });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/members/spesen/:id/beleg', ...vorstandAuth, async (req, res) => {
        try {
            if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Nicht gefunden' });
            const r = await pool.query('SELECT beleg, beleg_name, beleg_typ FROM spesen WHERE id = $1', [req.params.id]);
            await belegSchicken(res, r.rows[0]);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.patch('/members/spesen/:id', ...vorstandAuth, async (req, res) => {
        try {
            if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Nicht gefunden' });
            const status = req.body?.status;
            const grund = String(req.body?.grund || '').trim();
            if (!['bezahlt', 'abgelehnt'].includes(status)) return res.status(400).json({ error: 'status: bezahlt oder abgelehnt' });
            if (status === 'abgelehnt' && grund.length < 3) return res.status(400).json({ error: 'Bitte eine Begründung angeben.' });
            const wer = req.user?.name || req.user?.email || 'Vorstand';
            const r = await pool.query(`
                UPDATE spesen SET status = $2, grund = $3, erledigt_am = NOW(), erledigt_von = $4
                WHERE id = $1 AND status = 'eingereicht'
                RETURNING id, member_id, betrag, datum, zweck, iban, status, grund, quelle, erledigt_am`,
            [req.params.id, status, status === 'abgelehnt' ? grund : null, wer]);
            if (!r.rows.length) return res.status(409).json({ error: 'Schon erledigt oder nicht gefunden.' });
            const s = r.rows[0];
            const m = (await pool.query('SELECT vorname, nachname, email, versand_email FROM members WHERE id = $1', [s.member_id])).rows[0];
            if (m?.email || m?.versand_email) {
                try { await mailSenden(erledigtMail(s, { mitglied: m })); } catch (e) {
                    log('Spesen: Mail an Mitglied fehlgeschlagen', { fehler: e.message });
                }
            }
            res.json(s);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
}

module.exports = {
    KATEGORIEN, BELEG_MAX, KASSIER_ADRESSE, spesenSchema, ibanNormal, ibanGueltig, ibanText,
    eingabePruefen, kassierMail, erledigtMail, spesenRouten,
};
