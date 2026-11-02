// Nachricht-Entwuerfe des Vorstands (Vorstand-App > Nachricht > Verfassen).
//
// vorstand.html hielt Entwuerfe nur im localStorage des Browsers. Hier liegen
// sie in der Datenbank: jedes Vorstandsmitglied sieht sie auf jedem Geraet und
// kann einen Entwurf eines anderen weiterschreiben. Anhaenge werden nicht
// gespeichert (Groesse) - die waehlt man beim Senden neu.
//
// GET    /dispatch/entwuerfe       Liste, neueste zuerst (hoechstens 50)
// POST   /dispatch/entwuerfe       neu   { betreff, text, art?, wahl?, anlass_id? }
// PUT    /dispatch/entwuerfe/:id   aendern (gleiche Felder)
// DELETE /dispatch/entwuerfe/:id

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ARTEN = new Set(['auto', 'email', 'post']);

async function entwurfSchema(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS nachricht_entwuerfe (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            betreff TEXT NOT NULL DEFAULT '',
            text TEXT NOT NULL DEFAULT '',
            art TEXT NOT NULL DEFAULT 'auto',
            wahl JSONB,
            anlass_id UUID,
            erstellt_von TEXT,
            geaendert_von TEXT,
            erstellt_am TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            geaendert_am TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
}

/** Eingabe pruefen; liefert { fehler } oder die bereinigten Felder. */
function entwurfLesen(body) {
    const b = body && typeof body === 'object' ? body : {};
    const betreff = typeof b.betreff === 'string' ? b.betreff.slice(0, 500) : '';
    const text = typeof b.text === 'string' ? b.text.slice(0, 100000) : '';
    if (!betreff.trim() && !text.trim()) return { fehler: 'Betreff oder Text fehlt' };
    const art = ARTEN.has(b.art) ? b.art : 'auto';
    const wahl = b.wahl && typeof b.wahl === 'object' && !Array.isArray(b.wahl) ? b.wahl : null;
    const anlassId = typeof b.anlass_id === 'string' && UUID.test(b.anlass_id) ? b.anlass_id : null;
    return { betreff, text, art, wahl, anlassId };
}

function wer(req) {
    const u = req.user || {};
    return u.name || u.benutzername || u.preferred_username || u.email || null;
}

function mountEntwuerfe(app, pool, auth) {
    app.get('/dispatch/entwuerfe', ...auth, async (req, res) => {
        try {
            const r = await pool.query(
                `SELECT id, betreff, text, art, wahl, anlass_id, erstellt_von, geaendert_von, erstellt_am, geaendert_am
                 FROM nachricht_entwuerfe ORDER BY geaendert_am DESC LIMIT 50`);
            res.json(r.rows);
        } catch (e) {
            console.error('[ENTWURF] Liste:', e.message);
            res.status(500).json({ error: 'Entwürfe nicht lesbar' });
        }
    });

    app.post('/dispatch/entwuerfe', ...auth, async (req, res) => {
        const e = entwurfLesen(req.body);
        if (e.fehler) return res.status(400).json({ error: e.fehler });
        try {
            const r = await pool.query(
                `INSERT INTO nachricht_entwuerfe (betreff, text, art, wahl, anlass_id, erstellt_von, geaendert_von)
                 VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING *`,
                [e.betreff, e.text, e.art, e.wahl, e.anlassId, wer(req)]);
            res.status(201).json(r.rows[0]);
        } catch (err) {
            console.error('[ENTWURF] Neu:', err.message);
            res.status(500).json({ error: 'Entwurf nicht gespeichert' });
        }
    });

    app.put('/dispatch/entwuerfe/:id', ...auth, async (req, res) => {
        if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Entwurf nicht gefunden' });
        const e = entwurfLesen(req.body);
        if (e.fehler) return res.status(400).json({ error: e.fehler });
        try {
            const r = await pool.query(
                `UPDATE nachricht_entwuerfe
                 SET betreff = $2, text = $3, art = $4, wahl = $5, anlass_id = $6, geaendert_von = $7, geaendert_am = NOW()
                 WHERE id = $1 RETURNING *`,
                [req.params.id, e.betreff, e.text, e.art, e.wahl, e.anlassId, wer(req)]);
            if (!r.rows.length) return res.status(404).json({ error: 'Entwurf nicht gefunden' });
            res.json(r.rows[0]);
        } catch (err) {
            console.error('[ENTWURF] Aendern:', err.message);
            res.status(500).json({ error: 'Entwurf nicht gespeichert' });
        }
    });

    app.delete('/dispatch/entwuerfe/:id', ...auth, async (req, res) => {
        if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Entwurf nicht gefunden' });
        try {
            await pool.query('DELETE FROM nachricht_entwuerfe WHERE id = $1', [req.params.id]);
            res.json({ success: true });
        } catch (err) {
            console.error('[ENTWURF] Loeschen:', err.message);
            res.status(500).json({ error: 'Entwurf nicht gelöscht' });
        }
    });
}

module.exports = { entwurfSchema, entwurfLesen, mountEntwuerfe };
