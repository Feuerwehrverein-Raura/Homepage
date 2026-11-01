// Routen-Bausteine fuer den Nachricht-Versand (Vorstand, Flutter-App).
//
// POST /dispatch/brief {subject, body, member_id, vorschau?, zonen?}
//   baut den Brief fuer EIN Mitglied im offiziellen Layout
//   (nachricht-layout.js) und gibt {html, pdf_margin, recipient, subject}
//   zurueck - genau das, was /dispatch/send-post erwartet. Mit vorschau=true
//   zusaetzlich pdf_base64 (wie /dispatch/preview-pdf, zonen=true mit
//   Pingen-Zonen). Die App braucht so kein eigenes Brief-HTML mehr.
//
// Die Abhaengigkeiten (Datenbank, PDF-Renderer) kommen von aussen, damit die
// Tests ohne Datenbank und Puppeteer laufen (test/nachricht.test.js).

const L = require('./nachricht-layout');
const E = require('./einladung-layout');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Absender: der (erste) Aktuar laut Funktion. */
async function aktuarLaden(pool) {
    const r = await pool.query(
        `SELECT vorname, nachname, strasse, plz, ort FROM members
         WHERE funktion ILIKE '%aktuar%' ORDER BY nachname, vorname LIMIT 1`
    );
    return r.rows[0] || null;
}

async function absenderLaden(pool) {
    return L.absenderZeile(await aktuarLaden(pool));
}

/** Einladung fuer ein Mitglied: Einleitung (Platzhalter von Mitglied und
 *  Anlass ersetzt) im Einladungs-Layout. [laden] = E.einladungDaten, in Tests
 *  ersetzbar. Wirft, wenn der Anlass fehlt. */
async function einladungInhalt(pool, eventId, text, mitglied, laden = E.einladungDaten, textHtml = null) {
    const daten = await laden(pool, eventId);
    if (!daten) throw Object.assign(new Error('Anlass nicht gefunden'), { status: 404 });
    // Einleitung aus dem Editor der Website (HTML) oder reiner Text (App).
    const introHtml = textHtml != null
        ? E.anlassPlatzhalter(L.editorHtml(textHtml, mitglied), Object.fromEntries(
            Object.entries(daten.anlass).map(([k, v]) => [k, typeof v === 'string' ? L.escapeHtml(v) : v])))
        : L.textZuHtml(E.anlassPlatzhalter(L.platzhalterErsetzen(text, mitglied), daten.anlass));
    return E.einladungHtml({ ...daten, introHtml });
}

/** Handler fuer POST /dispatch/brief. [vorschauPdf](html, rand, zonen) -> Buffer. */
function briefErstellen({ pool, vorschauPdf, einladungDaten = E.einladungDaten }) {
    return async (req, res) => {
        try {
            // vorlage 'einladung' + event_id: Inhalt im Einladungs-Layout
            // (einladung-layout.js), body ist dann die Einleitung.
            // body_html: Text aus dem Editor der Website (L.editorHtml).
            const { subject, body, body_html, member_id, vorschau = false, zonen = false, vorlage, event_id } = req.body || {};
            const textHtml = typeof body_html === 'string' && body_html.trim() ? body_html : null;
            if (!member_id || !UUID.test(String(member_id))) {
                return res.status(400).json({ error: 'member_id erforderlich' });
            }
            if (!String(body || '').trim() && !textHtml) {
                return res.status(400).json({ error: 'Text erforderlich' });
            }
            const r = await pool.query('SELECT * FROM members WHERE id = $1', [member_id]);
            const mitglied = r.rows[0];
            if (!mitglied) return res.status(404).json({ error: 'Mitglied nicht gefunden' });
            if (!L.hatPostadresse(mitglied)) {
                return res.status(400).json({ error: 'Mitglied hat keine vollständige Adresse' });
            }
            const html = L.briefHtml({
                betreff: subject,
                text: body,
                mitglied,
                absender: await absenderLaden(pool),
                textHtml,
                inhaltHtml: vorlage === 'einladung'
                    ? await einladungInhalt(pool, event_id, body, mitglied, einladungDaten, textHtml)
                    : null
            });
            const antwort = {
                html,
                pdf_margin: L.BRIEF_RAND,
                recipient: L.empfaenger(mitglied),
                subject: L.platzhalterErsetzen(subject, mitglied).trim() || 'Brief'
            };
            if (vorschau === true) {
                const pdf = await vorschauPdf(html, L.BRIEF_RAND, zonen === true);
                antwort.pdf_base64 = Buffer.from(pdf).toString('base64');
            }
            res.json(antwort);
        } catch (error) {
            res.status(error.status || 500).json({ error: error.message });
        }
    };
}

/** Handler fuer POST /dispatch/email-vorschau {member_id, subject, body,
 *  body_html?, layout?, event_id?}: die E-Mail genau so, wie /email/bulk sie
 *  fuer dieses Mitglied baut - fuer die Vorschau auf der Website. */
function emailVorschau({ pool, einladungDaten = E.einladungDaten }) {
    return async (req, res) => {
        try {
            const { subject, body, body_html, member_id, layout, event_id } = req.body || {};
            if (!member_id || !UUID.test(String(member_id))) {
                return res.status(400).json({ error: 'member_id erforderlich' });
            }
            const r = await pool.query('SELECT * FROM members WHERE id = $1', [member_id]);
            const mitglied = r.rows[0];
            if (!mitglied) return res.status(404).json({ error: 'Mitglied nicht gefunden' });
            const textHtml = typeof body_html === 'string' && body_html.trim() ? body_html : null;
            const html = L.emailHtml({
                betreff: subject,
                text: body,
                mitglied,
                absender: await absenderLaden(pool),
                textHtml,
                inhaltHtml: layout === 'einladung' && event_id
                    ? await einladungInhalt(pool, event_id, body, mitglied, einladungDaten, textHtml)
                    : null
            });
            res.json({
                html,
                to: mitglied.versand_email || mitglied.email || null,
                subject: L.platzhalterErsetzen(subject, mitglied).trim()
            });
        } catch (error) {
            res.status(error.status || 500).json({ error: error.message });
        }
    };
}

/** Brief im Versandprotokoll festhalten (send-post, send-pdf-post schrieben
 *  bisher nichts - Verlauf und Pingen-Liste blieben leer). Staging-Briefe
 *  sind im Betreff markiert. Fehler hier brechen den Versand nicht ab. */
async function briefProtokollieren(pool, { memberId, recipient, subject, letterId, staging, eventId }) {
    try {
        await pool.query(
            `INSERT INTO dispatch_log (type, member_id, recipient_address, subject, status, external_id, event_id, sent_at)
             VALUES ('pingen', $1, $2, $3, 'sent', $4, $5, NOW())`,
            [
                memberId && UUID.test(String(memberId)) ? memberId : null,
                JSON.stringify({
                    name: recipient?.name,
                    street: recipient?.street,
                    zip: recipient?.zip,
                    city: recipient?.city
                }),
                `${staging ? '[Staging] ' : ''}${subject || 'Brief'}`.slice(0, 300),
                letterId || null,
                eventId && UUID.test(String(eventId)) ? eventId : null
            ]
        );
    } catch (error) {
        console.error('[DISPATCH] Protokoll fehlgeschlagen:', error.message);
    }
}

/** Variablen in einen Text einsetzen ({{name}}); alsHtml escaped die Werte.
 *  Fuer /email/send - bisher nur, wenn eine Vorlage gewaehlt war. */
function variablenEinsetzen(text, variablen, alsHtml = false) {
    if (!text || !variablen || typeof variablen !== 'object') return text;
    return String(text).replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (ganz, name) => {
        if (!Object.prototype.hasOwnProperty.call(variablen, name)) return ganz;
        const wert = String(variablen[name] ?? '');
        return alsHtml ? L.escapeHtml(wert) : wert;
    });
}

module.exports = {
    einladungInhalt, emailVorschau, briefErstellen, briefProtokollieren, absenderLaden, variablenEinsetzen };
