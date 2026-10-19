// Erneuern der Mitglieder-Anmeldungen ohne Authentik (QR-Code vom Datenblatt,
// Anmeldebon, Passwort-Reset) - gleichwertig zur Anmeldung ueber Authentik
// (Provider "FWV Members Mobile App": Zugang 8 Stunden, Refresh 30 Tage, bei
// jedem Erneuern neu ausgestellt). Wer die App mindestens alle 30 Tage
// oeffnet, bleibt angemeldet; wer laenger weg war, meldet sich neu an.
// Entscheid Stefan, 19.10.2026.
//
// Gespeichert wird nur der SHA-256 des Erneuerungs-Tokens. Jedes Token gilt
// einmal; GNADE_SEKUNDEN lang darf es nochmals eingeloest werden, falls die
// Antwort unterwegs verloren ging (sonst waere die App abgemeldet).

const crypto = require('crypto');

const ZUGANG_DAUER = '8h';
const ZUGANG_SEKUNDEN = 8 * 3600;
// Erkennungszeichen: so unterscheidet POST /auth/refresh die eigenen Tokens
// von denen von Authentik.
const PRAEFIX = 'fwvm_';
const ERNEUERUNG_TAGE = parseInt(process.env.MEMBER_ERNEUERUNG_TAGE, 10) || 30;
const GNADE_SEKUNDEN = 120;

// Wie OHNE_ZUGANG bei der Anmeldung: diese Mitglieder werden nicht erneuert.
const OHNE_ERNEUERUNG = ['Aufnahme pendent', 'Ausgetreten', 'Verstorben'];

const SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS member_refresh_tokens (
        id SERIAL PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        quelle VARCHAR(20) NOT NULL,
        qr_token_id UUID,
        erstellt_am TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        gilt_bis TIMESTAMPTZ NOT NULL,
        benutzt_am TIMESTAMPTZ,
        widerrufen_am TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_member_refresh_tokens_member
        ON member_refresh_tokens(member_id);
`;

const hash = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

function mitgliedErneuerung(pool) {
    let bereit = null;
    const tabelle = () => (bereit ??= pool.query(SCHEMA_SQL).catch((e) => { bereit = null; throw e; }));

    /** Neues Erneuerungs-Token (Klartext, nur fuer die Antwort an die App). */
    async function ausstellen({ memberId, quelle, qrTokenId = null }) {
        await tabelle();
        const token = PRAEFIX + crypto.randomBytes(32).toString('base64url');
        await pool.query(
            `INSERT INTO member_refresh_tokens (token_hash, member_id, quelle, qr_token_id, gilt_bis)
             VALUES ($1, $2, $3, $4, NOW() + make_interval(days => $5))`,
            [hash(token), memberId, quelle, qrTokenId, ERNEUERUNG_TAGE]);
        // Aufraeumen: laengst abgelaufene Eintraege
        await pool.query(`DELETE FROM member_refresh_tokens WHERE gilt_bis < NOW() - INTERVAL '7 days'`);
        return token;
    }

    /**
     * Token einloesen. Liefert { mitglied, quelle, qrTokenId } oder null, wenn
     * es unbekannt, abgelaufen, widerrufen, schon benutzt (nach der Gnadenfrist)
     * ist, der QR-Code widerrufen wurde oder das Mitglied keinen Zugang mehr hat.
     */
    async function einloesen(token) {
        if (!token || typeof token !== 'string') return null;
        await tabelle();
        const r = await pool.query(
            `UPDATE member_refresh_tokens SET benutzt_am = COALESCE(benutzt_am, NOW())
             WHERE token_hash = $1 AND widerrufen_am IS NULL AND gilt_bis > NOW()
               AND (benutzt_am IS NULL OR benutzt_am > NOW() - make_interval(secs => $2))
             RETURNING member_id, quelle, qr_token_id`,
            [hash(token), GNADE_SEKUNDEN]);
        if (!r.rows.length) return null;
        const { member_id: memberId, quelle, qr_token_id: qrTokenId } = r.rows[0];
        if (qrTokenId) {
            const qr = await pool.query(
                'SELECT 1 FROM member_app_tokens WHERE id = $1 AND revoked_at IS NULL', [qrTokenId]);
            if (!qr.rows.length) return null;
            await pool.query('UPDATE member_app_tokens SET last_used_at = NOW() WHERE id = $1', [qrTokenId]);
        }
        const m = await pool.query(
            'SELECT id, email, benutzername, vorname, nachname, status FROM members WHERE id = $1', [memberId]);
        if (!m.rows.length || OHNE_ERNEUERUNG.includes(m.rows[0].status)) return null;
        return { mitglied: m.rows[0], quelle, qrTokenId };
    }

    return { ausstellen, einloesen, istEigenes };
}

const istEigenes = (token) => typeof token === 'string' && token.startsWith(PRAEFIX);

module.exports = { mitgliedErneuerung, istEigenes, ZUGANG_DAUER, ZUGANG_SEKUNDEN, ERNEUERUNG_TAGE, GNADE_SEKUNDEN, SCHEMA_SQL };
