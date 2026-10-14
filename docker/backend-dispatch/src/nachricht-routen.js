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

/** Handler fuer POST /dispatch/brief. [vorschauPdf](html, rand, zonen) -> Buffer. */
function briefErstellen({ pool, vorschauPdf }) {
    return async (req, res) => {
        try {
            const { subject, body, member_id, vorschau = false, zonen = false } = req.body || {};
            if (!member_id || !UUID.test(String(member_id))) {
                return res.status(400).json({ error: 'member_id erforderlich' });
            }
            if (!String(body || '').trim()) {
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
                absender: await absenderLaden(pool)
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
            res.status(500).json({ error: error.message });
        }
    };
}

/** Brief im Versandprotokoll festhalten (send-post, send-pdf-post schrieben
 *  bisher nichts - Verlauf und Pingen-Liste blieben leer). Staging-Briefe
 *  sind im Betreff markiert. Fehler hier brechen den Versand nicht ab. */
async function briefProtokollieren(pool, { memberId, recipient, subject, letterId, staging }) {
    try {
        await pool.query(
            `INSERT INTO dispatch_log (type, member_id, recipient_address, subject, status, external_id, sent_at)
             VALUES ('pingen', $1, $2, $3, 'sent', $4, NOW())`,
            [
                memberId && UUID.test(String(memberId)) ? memberId : null,
                JSON.stringify({
                    name: recipient?.name,
                    street: recipient?.street,
                    zip: recipient?.zip,
                    city: recipient?.city
                }),
                `${staging ? '[Staging] ' : ''}${subject || 'Brief'}`.slice(0, 300),
                letterId || null
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

module.exports = { briefErstellen, briefProtokollieren, absenderLaden, variablenEinsetzen };
