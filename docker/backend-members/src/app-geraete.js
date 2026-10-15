// Geraete der Mitglieder-App: welches Mitglied hat welche App-Version auf
// welchem Geraet? ("Welcher Tester hat eigentlich welche Version?")
//
// Die App meldet sich einmal pro Start (POST /members/me/geraet) und beim
// Anmelden des Push-Tokens (POST /members/me/fcm-token mit denselben
// Feldern). Gespeichert wird je Mitglied und Geraet eine Zeile in
// app_geraete:
//
//   geraet_id      Zufallskennung, die die App einmal erzeugt und sich merkt
//                  (dieselbe wie fcm_tokens.device_id) - KEINE Hardware-ID
//   plattform      android | ios | web | linux | windows | macos
//   quelle         play | apk | web | desktop | unbekannt (wer installiert hat)
//   app_version    "1.0.23", build_nummer 10023 (MAJOR*10000+MINOR*100+PATCH,
//                  siehe .github/workflows/build-android-members.yml)
//   os_version     z.B. "Android 16 (SDK 36)", geraet_modell "samsung SM-A376B"
//   erstmals, zuletzt
//
// Datensparsam: keine IP, kein Standort, keine Hardware-Kennung.
//
// Neuste Version (fuer "veraltet"): der Server weiss nicht sicher, was im
// Play-Test oder auf GitHub liegt. Ist APP_NEUSTE_VERSION gesetzt (z.B.
// "1.0.25"), gilt diese; sonst die hoechste build_nummer, die ein Android-
// Geraet gemeldet hat (Android bekommt Updates zuerst). Browser laden immer
// die Fassung vom Server und gelten nie als veraltet.
//
// Die Tabelle legt die Migration 029_app_geraete.sql an und - fuer
// Bestandsdatenbanken - tabelleAnlegen() beim Start (beides IF NOT EXISTS,
// gleich gehalten). Reine Bausteine mit uebergebenem pool, testbar ohne
// Datenbank (test/app-geraete.test.js).

const PLATTFORMEN = ['android', 'ios', 'web', 'linux', 'windows', 'macos'];
const QUELLEN = ['play', 'apk', 'web', 'desktop', 'unbekannt'];

const SCHEMA_SQL = [
    `CREATE TABLE IF NOT EXISTS app_geraete (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        geraet_id TEXT NOT NULL,
        plattform VARCHAR(20) NOT NULL,
        quelle VARCHAR(20) NOT NULL DEFAULT 'unbekannt',
        app_version VARCHAR(40),
        build_nummer INTEGER,
        os_version VARCHAR(100),
        geraet_modell VARCHAR(100),
        erstmals TIMESTAMP NOT NULL DEFAULT NOW(),
        zuletzt TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE (member_id, geraet_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_app_geraete_member ON app_geraete(member_id)`
];

const GERAET_ID = /^[A-Za-z0-9_-]{8,64}$/;
const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}([-+][0-9A-Za-z.-]{1,30})?$/;
const BUILD_MAX = 2147483647;

/** Freitext fuer Anzeige: Steuerzeichen raus, gekuerzt; leer -> null. */
function freitext(wert, laenge) {
    if (typeof wert !== 'string') return null;
    // eslint-disable-next-line no-control-regex
    const t = wert.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
    return t ? t.slice(0, laenge) : null;
}

/** "1.0.23" -> 10023 (wie VCODE im Build); unlesbar -> null. */
function versionsCode(version) {
    if (typeof version !== 'string') return null;
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
    if (!m) return null;
    return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
}

/**
 * Eingabe der App pruefen. { werte } oder { fehler } (Text fuer 400).
 * geraet_id und plattform sind Pflicht, alles andere optional; Unbekanntes
 * wird abgewiesen statt still verworfen, damit Fehler in der App auffallen.
 */
function geraetAusEingabe(body) {
    const b = body && typeof body === 'object' ? body : {};
    const geraetId = typeof b.geraet_id === 'string' ? b.geraet_id.trim() : '';
    if (!GERAET_ID.test(geraetId)) return { fehler: 'geraet_id ungueltig (8-64 Zeichen A-Z, 0-9, _ -)' };

    const plattform = typeof b.plattform === 'string' ? b.plattform.trim().toLowerCase() : '';
    if (!PLATTFORMEN.includes(plattform)) return { fehler: `plattform muss eine von ${PLATTFORMEN.join(', ')} sein` };

    let quelle = 'unbekannt';
    if (b.quelle !== undefined && b.quelle !== null && b.quelle !== '') {
        quelle = typeof b.quelle === 'string' ? b.quelle.trim().toLowerCase() : '';
        if (!QUELLEN.includes(quelle)) return { fehler: `quelle muss eine von ${QUELLEN.join(', ')} sein` };
    }

    let appVersion = null;
    if (b.app_version !== undefined && b.app_version !== null && b.app_version !== '') {
        appVersion = typeof b.app_version === 'string' ? b.app_version.trim() : '';
        if (!VERSION.test(appVersion)) return { fehler: 'app_version ungueltig (z.B. 1.0.23)' };
    }

    let build = null;
    if (b.build_nummer !== undefined && b.build_nummer !== null && b.build_nummer !== '') {
        build = typeof b.build_nummer === 'string' && /^\d+$/.test(b.build_nummer.trim())
            ? Number(b.build_nummer.trim()) : b.build_nummer;
        if (!Number.isInteger(build) || build < 0 || build > BUILD_MAX) {
            return { fehler: 'build_nummer muss eine ganze Zahl sein' };
        }
    }

    return {
        werte: {
            geraet_id: geraetId,
            plattform,
            quelle,
            app_version: appVersion,
            build_nummer: build,
            os_version: freitext(b.os_version, 100),
            geraet_modell: freitext(b.geraet_modell, 100)
        }
    };
}

/**
 * Felder aus POST /members/me/fcm-token als Geraete-Meldung, oder null,
 * wenn die App (vor 1.0.24) keine mitschickt. device_id ist die geraet_id,
 * platform die plattform.
 */
function geraetAusFcmEingabe(body) {
    const b = body && typeof body === 'object' ? body : {};
    if (b.app_version === undefined && b.quelle === undefined && b.build_nummer === undefined) return null;
    const r = geraetAusEingabe({ ...b, geraet_id: b.geraet_id ?? b.device_id, plattform: b.plattform ?? b.platform });
    return r.werte || null;
}

/** Name wie in den Listen des Vorstands: "Vorname Nachname". */
function nameVon(z) {
    return [z.vorname, z.nachname].filter(Boolean).join(' ').trim() || 'Unbekannt';
}

function appGeraete({ pool, neusteVersion = process.env.APP_NEUSTE_VERSION, log = console } = {}) {
    let angelegt = null;

    /** Idempotent; einmal pro Prozess (bei Fehler beim naechsten Mal erneut). */
    function tabelleAnlegen() {
        if (!angelegt) {
            angelegt = (async () => {
                for (const sql of SCHEMA_SQL) await pool.query(sql);
            })().catch(e => {
                angelegt = null;
                throw e;
            });
        }
        return angelegt;
    }

    /** Upsert der Zeile (member_id, geraet_id); zuletzt = NOW(). */
    async function melden(memberId, w) {
        await tabelleAnlegen();
        await pool.query(
            `INSERT INTO app_geraete
                (member_id, geraet_id, plattform, quelle, app_version, build_nummer, os_version, geraet_modell)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (member_id, geraet_id) DO UPDATE SET
                plattform = EXCLUDED.plattform,
                quelle = CASE WHEN EXCLUDED.quelle = 'unbekannt' THEN app_geraete.quelle ELSE EXCLUDED.quelle END,
                app_version = COALESCE(EXCLUDED.app_version, app_geraete.app_version),
                build_nummer = COALESCE(EXCLUDED.build_nummer, app_geraete.build_nummer),
                os_version = COALESCE(EXCLUDED.os_version, app_geraete.os_version),
                geraet_modell = COALESCE(EXCLUDED.geraet_modell, app_geraete.geraet_modell),
                zuletzt = NOW()`,
            [memberId, w.geraet_id, w.plattform, w.quelle, w.app_version, w.build_nummer,
                w.os_version, w.geraet_modell]
        );
    }

    /** Wie melden, wirft aber nie (fuer fcm-token: das Token zaehlt mehr). */
    async function leiseMelden(memberId, w) {
        try {
            await melden(memberId, w);
        } catch (e) {
            log.error('app_geraete: Meldung nicht gespeichert:', e.message);
        }
    }

    /**
     * Fuer den Vorstand:
     * { neuste: { version, build_nummer, herkunft: 'env'|'geraete'|null },
     *   geraete: [{ member_id, name, plattform, quelle, app_version, build_nummer,
     *               os_version, geraet_modell, erstmals, zuletzt, veraltet }],
     *   ohne_meldung: [{ member_id, name, plattform, zuletzt }] }
     * ohne_meldung: Push-Tokens (fcm_tokens) ohne passende Geraete-Meldung -
     * App aelter als 1.0.24, Version unbekannt.
     */
    async function liste() {
        await tabelleAnlegen();
        const geraete = (await pool.query(
            `SELECT g.member_id, m.vorname, m.nachname, g.plattform, g.quelle, g.app_version,
                    g.build_nummer, g.os_version, g.geraet_modell, g.erstmals, g.zuletzt
             FROM app_geraete g JOIN members m ON m.id = g.member_id
             ORDER BY g.build_nummer DESC NULLS LAST, m.nachname, m.vorname, g.zuletzt DESC`
        )).rows;

        let alt = [];
        try {
            alt = (await pool.query(
                `SELECT t.member_id, m.vorname, m.nachname, t.platform AS plattform,
                        MAX(t.updated_at) AS zuletzt
                 FROM fcm_tokens t JOIN members m ON m.id = t.member_id
                 WHERE NOT EXISTS (
                     SELECT 1 FROM app_geraete g
                     WHERE g.member_id = t.member_id
                       AND (t.device_id IS NULL OR g.geraet_id = t.device_id))
                 GROUP BY t.member_id, m.vorname, m.nachname, t.platform, t.device_id
                 ORDER BY m.nachname, m.vorname`
            )).rows;
        } catch (e) {
            // 42P01: fcm_tokens gibt es noch nicht (nie ein Token angemeldet).
            if (e.code !== '42P01') throw e;
        }

        let neuste = { version: null, build_nummer: null, herkunft: null };
        const ausEnv = versionsCode(neusteVersion);
        if (ausEnv !== null) {
            neuste = { version: String(neusteVersion).trim(), build_nummer: ausEnv, herkunft: 'env' };
        } else {
            for (const g of geraete) {
                const code = g.build_nummer ?? versionsCode(g.app_version);
                if (g.plattform === 'android' && code !== null &&
                    (neuste.build_nummer === null || code > neuste.build_nummer)) {
                    neuste = { version: g.app_version, build_nummer: code, herkunft: 'geraete' };
                }
            }
        }

        const veraltet = g => {
            if (g.plattform === 'web' || neuste.build_nummer === null) return false;
            const code = g.build_nummer ?? versionsCode(g.app_version);
            return code === null ? null : code < neuste.build_nummer;
        };

        return {
            neuste,
            geraete: geraete.map(g => ({
                member_id: g.member_id,
                name: nameVon(g),
                plattform: g.plattform,
                quelle: g.quelle,
                app_version: g.app_version,
                build_nummer: g.build_nummer,
                os_version: g.os_version,
                geraet_modell: g.geraet_modell,
                erstmals: g.erstmals,
                zuletzt: g.zuletzt,
                veraltet: veraltet(g)
            })),
            ohne_meldung: alt.map(z => ({
                member_id: z.member_id,
                name: nameVon(z),
                plattform: z.plattform,
                zuletzt: z.zuletzt
            }))
        };
    }

    return { tabelleAnlegen, melden, leiseMelden, liste };
}

module.exports = {
    PLATTFORMEN, QUELLEN, SCHEMA_SQL, geraetAusEingabe, geraetAusFcmEingabe, versionsCode, appGeraete
};
