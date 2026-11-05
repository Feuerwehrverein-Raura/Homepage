// Ein Weg fuer alle Pushs (November 2026). Die Geraete stehen in fcm_tokens,
// unterschieden nach platform:
//  - android, ios: Firebase Cloud Messaging wie bisher.
//  - web: Web-Push im Browser (mein.html). token = Abo des Browsers als JSON
//    ({ endpoint, keys: { p256dh, auth } }), verschickt mit eigenem
//    VAPID-Schluessel (Tabelle push_schluessel, beim ersten Mal erzeugt).
//  - desktop: Desktop-Programm (macOS, Windows, Linux) - dort gibt es kein
//    FCM. Die Mitteilung kommt ins Postfach (push_postfach), das Programm
//    holt sie ab (GET /members/me/push-postfach) und zeigt sie selbst.
// Wer was bekommt (Abschalter, Status), entscheiden die Aufrufer wie bisher
// ueber ihre Abfrage auf fcm_tokens.
//
// Reine Daten-Pushs ohne Titel (Schopf-Musik) gehen nur an Android/iOS.

const ABGELAUFEN_FCM = ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token',
    'messaging/invalid-argument'];

/** Postfach-Eintraege, die so lange niemand abholt, verfallen. */
const POSTFACH_TAGE = 2;

async function pushSchema(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS push_postfach (
            id BIGSERIAL PRIMARY KEY,
            token TEXT NOT NULL,
            titel TEXT NOT NULL,
            text TEXT,
            daten JSONB NOT NULL DEFAULT '{}',
            erstellt TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_push_postfach_token ON push_postfach(token, id);
        CREATE TABLE IF NOT EXISTS push_schluessel (
            id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
            oeffentlich TEXT NOT NULL,
            privat TEXT NOT NULL
        );
    `);
}

/** Titel und Text: aus notification, sonst (Daten-Push) aus data. */
function sichtbar(nachricht) {
    const titel = nachricht.notification?.title ?? nachricht.data?.title;
    const text = nachricht.notification?.body ?? nachricht.data?.body ?? '';
    return titel ? { titel: String(titel), text: String(text) } : null;
}

/**
 * deps: pool, fcm() -> admin.messaging() oder null (nicht eingerichtet),
 * webpush (Modul web-push), log.
 */
function pushVersand({ pool, fcm, webpush, log = console }) {
    let schluessel = null;

    /** VAPID-Schluessel; beim ersten Aufruf erzeugt und gespeichert. */
    async function vapid() {
        if (schluessel) return schluessel;
        let r = (await pool.query('SELECT oeffentlich, privat FROM push_schluessel WHERE id = 1')).rows[0];
        if (!r) {
            const neu = webpush.generateVAPIDKeys();
            await pool.query(
                'INSERT INTO push_schluessel (id, oeffentlich, privat) VALUES (1, $1, $2) ON CONFLICT (id) DO NOTHING',
                [neu.publicKey, neu.privateKey]);
            r = (await pool.query('SELECT oeffentlich, privat FROM push_schluessel WHERE id = 1')).rows[0];
        }
        schluessel = { oeffentlich: r.oeffentlich, privat: r.privat };
        return schluessel;
    }

    async function anFcm(tokens, nachricht) {
        const m = fcm();
        if (!m || !tokens.length) return { gesendet: 0, kaputt: [] };
        let gesendet = 0;
        const kaputt = [];
        for (let i = 0; i < tokens.length; i += 500) {
            const teil = tokens.slice(i, i + 500);
            const antwort = await m.sendEachForMulticast({ ...nachricht, tokens: teil });
            gesendet += antwort.successCount;
            antwort.responses.forEach((x, j) => {
                if (!x.success && ABGELAUFEN_FCM.includes(x.error?.code)) kaputt.push(teil[j]);
            });
        }
        return { gesendet, kaputt };
    }

    async function anBrowser(tokens, inhalt) {
        if (!tokens.length) return { gesendet: 0, kaputt: [] };
        const s = await vapid();
        let gesendet = 0;
        const kaputt = [];
        for (const token of tokens) {
            let abo;
            try { abo = JSON.parse(token); } catch { kaputt.push(token); continue; }
            try {
                await webpush.sendNotification(abo, JSON.stringify(inhalt), {
                    TTL: 24 * 3600,
                    vapidDetails: { subject: 'https://www.fwv-raura.ch', publicKey: s.oeffentlich, privateKey: s.privat },
                });
                gesendet++;
            } catch (e) {
                // 404/410: Abo im Browser beendet.
                if (e.statusCode === 404 || e.statusCode === 410) kaputt.push(token);
                else log.warn?.('Web-Push fehlgeschlagen', e.statusCode || e.message);
            }
        }
        return { gesendet, kaputt };
    }

    async function insPostfach(tokens, inhalt) {
        if (!tokens.length) return 0;
        await pool.query(`
            INSERT INTO push_postfach (token, titel, text, daten)
            SELECT t, $2, $3, $4::jsonb FROM unnest($1::text[]) AS t`,
        [tokens, inhalt.titel, inhalt.text, JSON.stringify(inhalt.daten)]);
        return tokens.length;
    }

    /**
     * zeilen: [{ token, platform }] - schon nach Empfaenger und Abschaltern
     * gefiltert. nachricht: wie fuer FCM ohne tokens ({ notification?, data,
     * android? }). Raeumt abgelaufene Geraete weg.
     */
    async function senden(zeilen, nachricht) {
        const nach = p => zeilen.filter(z => (z.platform || 'android') === p).map(z => z.token);
        const handy = zeilen.filter(z => !['web', 'desktop'].includes(z.platform)).map(z => z.token);
        const zeigen = sichtbar(nachricht);
        const inhalt = zeigen && { ...zeigen, daten: nachricht.data || {} };
        const [f, w, d] = await Promise.all([
            anFcm(handy, nachricht).catch(e => { log.error?.('FCM fehlgeschlagen', e.message); return { gesendet: 0, kaputt: [] }; }),
            inhalt ? anBrowser(nach('web'), inhalt) : { gesendet: 0, kaputt: [] },
            inhalt ? insPostfach(nach('desktop'), inhalt) : 0,
        ]);
        const kaputt = [...f.kaputt, ...w.kaputt];
        if (kaputt.length) await pool.query('DELETE FROM fcm_tokens WHERE token = ANY($1::text[])', [kaputt]);
        return { gesendet: f.gesendet + w.gesendet + d, kaputt };
    }

    /** Fuer das Desktop-Programm: alles fuer dieses Geraet, danach geleert. */
    async function abholen(memberId, token) {
        const meins = await pool.query(
            "UPDATE fcm_tokens SET updated_at = NOW() WHERE member_id = $1 AND token = $2 AND platform = 'desktop' RETURNING id",
            [memberId, token]);
        if (!meins.rows.length) return null;
        await pool.query(`DELETE FROM push_postfach WHERE erstellt < NOW() - INTERVAL '${POSTFACH_TAGE} days'`);
        const r = await pool.query(
            'DELETE FROM push_postfach WHERE token = $1 RETURNING id, titel, text, daten, erstellt', [token]);
        return r.rows.sort((a, b) => Number(a.id) - Number(b.id));
    }

    async function oeffentlicherSchluessel() {
        return (await vapid()).oeffentlich;
    }

    return { senden, abholen, oeffentlicherSchluessel };
}

module.exports = { pushVersand, pushSchema, sichtbar, POSTFACH_TAGE };
