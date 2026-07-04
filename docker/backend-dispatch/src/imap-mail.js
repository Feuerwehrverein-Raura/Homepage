/**
 * Webmail-Endpoints fuer den Vorstand: Lesen, Markieren, Loeschen, Antworten, Weiterleiten
 * der Funktions-Postfaecher (aktuar@, kassier@ etc.) per IMAP.
 *
 * Auth: Vorstand-JWT (HS256, type='vorstand'). req.user.role enthaelt den Mailbox-Prefix
 * (z.B. 'aktuar') -> Mailbox = aktuar@fwv-raura.ch. Passwort wird aus
 * shared_mailbox_passwords entschluesselt und zur Laufzeit zur IMAP-Verbindung verwendet.
 *
 * Alle Endpunkte sind /imap/* und werden via Traefik-Routing in api-dispatch eingebunden.
 */

const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');
const MailComposer = require('nodemailer/lib/mail-composer');
const crypto = require('crypto');

const IMAP_HOST = process.env.IMAP_HOST || 'mail.test.juroct.net';
const IMAP_PORT = parseInt(process.env.IMAP_PORT || '993', 10);
const SMTP_HOST = process.env.SMTP_HOST || IMAP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const MAIL_DOMAIN = process.env.MAIL_DOMAIN || 'fwv-raura.ch';

function decryptPassword(encryptedData) {
    if (!encryptedData || !ENCRYPTION_KEY) return null;
    try {
        const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
        const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err) {
        console.error('[IMAP] decrypt failed:', err.message);
        return null;
    }
}

/**
 * Welche Funktions-Postfaecher darf der eingeloggte User sehen?
 * Nur das eigene Funktions-Postfach (aus JWT role -> mailbox-prefix). Andere
 * Mailboxen sind privacy-relevant (Aktuar muss nicht in Mails von Kassier).
 * Sollten geteilte Postfaecher noetig sein, separate Whitelist pflegen.
 */
function allowedAccounts(req) {
    const role = (req.user?.role || '').toLowerCase();
    if (!role || role === 'admin' || role === 'api') return [];
    return [`${role}@${MAIL_DOMAIN}`];
}

/**
 * Async-Variante: Liste der Postfaecher, die der User sehen DARF
 * UND die ein hinterlegtes Passwort haben.
 */
async function availableAccounts(pool, req) {
    const allowed = allowedAccounts(req);
    if (allowed.length === 0) return [];
    const result = await pool.query(
        `SELECT email FROM shared_mailbox_passwords WHERE email = ANY($1::text[])`,
        [allowed]
    );
    return result.rows.map(r => r.email);
}

async function connectImap(pool, account) {
    const result = await pool.query(
        'SELECT encrypted_password FROM shared_mailbox_passwords WHERE email = $1',
        [account]
    );
    if (result.rows.length === 0) {
        throw new Error(`Kein Passwort fuer ${account} hinterlegt`);
    }
    const password = decryptPassword(result.rows[0].encrypted_password);
    if (!password) throw new Error('Passwort konnte nicht entschluesselt werden');

    const client = new ImapFlow({
        host: IMAP_HOST,
        port: IMAP_PORT,
        secure: true,
        auth: { user: account, pass: password },
        logger: false
    });
    await client.connect();
    return client;
}

function decodeAddress(addr) {
    if (!addr) return '';
    if (Array.isArray(addr.value)) {
        return addr.value
            .map(v => v.name ? `${v.name} <${v.address}>` : v.address)
            .join(', ');
    }
    return addr.text || '';
}

/**
 * Mountet alle /imap/* Endpoints. Erwartet eine Auth-Middleware (authVorstand) die
 * req.user setzt mit { email, role, groups }.
 */
function mountImap(app, pool, authVorstand) {

    // Liste der Postfaecher die der User einsehen darf UND fuer die ein
    // entschluesselbares Passwort hinterlegt ist (sonst klappt der IMAP-Login eh nicht).
    app.get('/imap/accounts', authVorstand, async (req, res) => {
        try {
            const accounts = await availableAccounts(pool, req);
            const allowed = allowedAccounts(req);
            const missing = allowed.filter(a => !accounts.includes(a));
            res.json({ accounts, missing });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Liste der Ordner eines Postfachs
    app.get('/imap/folders', authVorstand, async (req, res) => {
        const account = (req.query.account || '').toLowerCase();
        if (!allowedAccounts(req).includes(account)) {
            return res.status(403).json({ error: 'Kein Zugriff auf dieses Postfach' });
        }
        let client;
        try {
            client = await connectImap(pool, account);
            const list = await client.list();
            // Pro (auswaehlbarem) Ordner die Anzahl ungelesener Nachrichten holen (fuer Badges).
            const folders = [];
            for (const f of list) {
                const flags = Array.from(f.flags || []);
                let unseen = 0;
                if (!flags.includes('\\Noselect')) {
                    try {
                        const st = await client.status(f.path, { unseen: true });
                        unseen = st.unseen || 0;
                    } catch { /* Ordner nicht abfragbar -> 0 */ }
                }
                folders.push({
                    path: f.path,
                    name: f.name,
                    specialUse: f.specialUse || null,
                    flags,
                    unseen
                });
            }
            res.json(folders);
        } catch (err) {
            console.error('[IMAP] /folders failed:', err.message);
            res.status(500).json({ error: err.message });
        } finally {
            if (client) await client.logout().catch(() => {});
        }
    });

    // Helper: Absender-Adressen aus Listen-Result in discovered_contacts speichern.
    // Wird nur fuer "echte" Inbox-Folder aufgerufen (nicht Junk/Trash/Sent).
    async function discoverContactsFromList(messages, account, folder) {
        const isJunkOrTrash = /junk|spam|trash|papierkorb|deleted|gel.scht/i.test(folder);
        if (isJunkOrTrash) return;
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS discovered_contacts (
                    email VARCHAR(200) PRIMARY KEY,
                    name VARCHAR(200),
                    first_account VARCHAR(200),
                    first_seen TIMESTAMP DEFAULT NOW(),
                    last_seen TIMESTAMP DEFAULT NOW(),
                    seen_count INT DEFAULT 1
                );
            `);
        } catch (_) {}
        for (const m of messages) {
            const fromStr = m.from || '';
            const match = fromStr.match(/(?:"?([^"<]+?)"?\s*)?<([^>]+@[^>]+)>/) || fromStr.match(/^([^@\s]+@[^\s]+)$/);
            let email, name;
            if (match) {
                if (match.length >= 3) { name = (match[1] || '').trim(); email = match[2].trim().toLowerCase(); }
                else { email = match[1].trim().toLowerCase(); name = ''; }
            } else continue;
            if (!email || !email.includes('@')) continue;
            // Eigene Funktions-Adresse skip
            if (email === account.toLowerCase()) continue;
            // No-reply, mailer-daemon, etc. skip
            if (/^(no.?reply|noreply|mailer-daemon|postmaster|bounce)/i.test(email)) continue;
            try {
                await pool.query(`
                    INSERT INTO discovered_contacts (email, name, first_account, last_seen, seen_count)
                    VALUES ($1, $2, $3, NOW(), 1)
                    ON CONFLICT (email) DO UPDATE SET
                        name = COALESCE(NULLIF($2, ''), discovered_contacts.name),
                        last_seen = NOW(),
                        seen_count = discovered_contacts.seen_count + 1
                `, [email, name || null, account]);
            } catch (_) {}
        }
    }

    // Liste der Nachrichten in einem Ordner (neueste zuerst)
    app.get('/imap/messages', authVorstand, async (req, res) => {
        const account = (req.query.account || '').toLowerCase();
        const folder = req.query.folder || 'INBOX';
        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
        if (!allowedAccounts(req).includes(account)) {
            return res.status(403).json({ error: 'Kein Zugriff auf dieses Postfach' });
        }
        let client;
        try {
            client = await connectImap(pool, account);
            const lock = await client.getMailboxLock(folder);
            try {
                const status = await client.status(folder, { messages: true, unseen: true });
                if (!status.messages) {
                    return res.json({ messages: [], total: 0, unseen: 0 });
                }
                const start = Math.max(1, status.messages - limit + 1);
                const range = `${start}:${status.messages}`;
                const messages = [];
                for await (const msg of client.fetch(range, {
                    envelope: true, flags: true, internalDate: true, size: true, uid: true
                })) {
                    messages.push({
                        uid: msg.uid,
                        seq: msg.seq,
                        subject: msg.envelope?.subject || '(ohne Betreff)',
                        from: decodeAddress(msg.envelope?.from && { value: msg.envelope.from }),
                        to: decodeAddress(msg.envelope?.to && { value: msg.envelope.to }),
                        date: msg.envelope?.date || msg.internalDate,
                        size: msg.size,
                        seen: msg.flags?.has('\\Seen') || false,
                        flagged: msg.flags?.has('\\Flagged') || false,
                        answered: msg.flags?.has('\\Answered') || false,
                        messageId: msg.envelope?.messageId
                    });
                }
                messages.sort((a, b) => (new Date(b.date) - new Date(a.date)));
                // Auto-Discovery der Absender als Adressbuch-Eintraege (im Hintergrund)
                discoverContactsFromList(messages, account, folder).catch(() => {});
                res.json({ messages, total: status.messages, unseen: status.unseen });
            } finally {
                lock.release();
            }
        } catch (err) {
            console.error('[IMAP] /messages failed:', err.message);
            res.status(500).json({ error: err.message });
        } finally {
            if (client) await client.logout().catch(() => {});
        }
    });

    // Suche in einem Ordner (Betreff ODER Absender ODER Text). Liefert neueste Treffer.
    app.get('/imap/search', authVorstand, async (req, res) => {
        const account = (req.query.account || '').toLowerCase();
        const folder = req.query.folder || 'INBOX';
        const q = (req.query.q || '').trim();
        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
        if (!allowedAccounts(req).includes(account)) {
            return res.status(403).json({ error: 'Kein Zugriff auf dieses Postfach' });
        }
        if (!q) return res.json({ messages: [], total: 0 });
        let client;
        try {
            client = await connectImap(pool, account);
            const lock = await client.getMailboxLock(folder);
            try {
                const uids = await client.search({ or: [{ subject: q }, { from: q }, { body: q }] }, { uid: true });
                if (!uids || uids.length === 0) {
                    return res.json({ messages: [], total: 0 });
                }
                const recent = uids.slice(-limit); // hoechste (neueste) UIDs begrenzen
                const messages = [];
                for await (const msg of client.fetch(recent, {
                    envelope: true, flags: true, internalDate: true, size: true, uid: true
                }, { uid: true })) {
                    messages.push({
                        uid: msg.uid,
                        seq: msg.seq,
                        subject: msg.envelope?.subject || '(ohne Betreff)',
                        from: decodeAddress(msg.envelope?.from && { value: msg.envelope.from }),
                        to: decodeAddress(msg.envelope?.to && { value: msg.envelope.to }),
                        date: msg.envelope?.date || msg.internalDate,
                        size: msg.size,
                        seen: msg.flags?.has('\\Seen') || false,
                        flagged: msg.flags?.has('\\Flagged') || false,
                        answered: msg.flags?.has('\\Answered') || false,
                        messageId: msg.envelope?.messageId
                    });
                }
                messages.sort((a, b) => (new Date(b.date) - new Date(a.date)));
                res.json({ messages, total: uids.length });
            } finally {
                lock.release();
            }
        } catch (err) {
            console.error('[IMAP] /search failed:', err.message);
            res.status(500).json({ error: err.message });
        } finally {
            if (client) await client.logout().catch(() => {});
        }
    });

    // Eine einzelne Nachricht (Body + Anhaenge)
    app.get('/imap/messages/:uid', authVorstand, async (req, res) => {
        const account = (req.query.account || '').toLowerCase();
        const folder = req.query.folder || 'INBOX';
        const uid = parseInt(req.params.uid, 10);
        if (!allowedAccounts(req).includes(account)) {
            return res.status(403).json({ error: 'Kein Zugriff auf dieses Postfach' });
        }
        let client;
        try {
            client = await connectImap(pool, account);
            const lock = await client.getMailboxLock(folder);
            try {
                const { content } = await client.download(uid, undefined, { uid: true });
                const buffers = [];
                for await (const chunk of content) buffers.push(chunk);
                const raw = Buffer.concat(buffers);
                const parsed = await simpleParser(raw);
                // Beim Lesen automatisch \Seen-Flag setzen
                await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true }).catch(() => {});

                res.json({
                    uid,
                    subject: parsed.subject || '(ohne Betreff)',
                    from: parsed.from?.text || '',
                    to: parsed.to?.text || '',
                    cc: parsed.cc?.text || '',
                    date: parsed.date,
                    text: parsed.text || '',
                    html: parsed.html || null,
                    messageId: parsed.messageId,
                    inReplyTo: parsed.inReplyTo,
                    attachments: (parsed.attachments || []).map((a, i) => ({
                        index: i,
                        filename: a.filename || `attachment-${i}`,
                        contentType: a.contentType,
                        size: a.size
                    }))
                });
            } finally {
                lock.release();
            }
        } catch (err) {
            console.error('[IMAP] /messages/:uid failed:', err.message);
            res.status(500).json({ error: err.message });
        } finally {
            if (client) await client.logout().catch(() => {});
        }
    });

    // Anhang downloaden
    app.get('/imap/messages/:uid/attachments/:index', authVorstand, async (req, res) => {
        const account = (req.query.account || '').toLowerCase();
        const folder = req.query.folder || 'INBOX';
        const uid = parseInt(req.params.uid, 10);
        const index = parseInt(req.params.index, 10);
        if (!allowedAccounts(req).includes(account)) {
            return res.status(403).json({ error: 'Kein Zugriff auf dieses Postfach' });
        }
        let client;
        try {
            client = await connectImap(pool, account);
            const lock = await client.getMailboxLock(folder);
            try {
                const { content } = await client.download(uid, undefined, { uid: true });
                const buffers = [];
                for await (const chunk of content) buffers.push(chunk);
                const raw = Buffer.concat(buffers);
                const parsed = await simpleParser(raw);
                const att = (parsed.attachments || [])[index];
                if (!att) return res.status(404).json({ error: 'Anhang nicht gefunden' });
                res.setHeader('Content-Type', att.contentType || 'application/octet-stream');
                res.setHeader('Content-Disposition',
                    `attachment; filename="${(att.filename || 'attachment').replace(/"/g, '')}"`);
                res.send(att.content);
            } finally {
                lock.release();
            }
        } catch (err) {
            console.error('[IMAP] attachment download failed:', err.message);
            res.status(500).json({ error: err.message });
        } finally {
            if (client) await client.logout().catch(() => {});
        }
    });

    // Flags setzen (Read/Unread/Flagged)
    app.post('/imap/messages/:uid/flags', authVorstand, async (req, res) => {
        const account = (req.query.account || req.body?.account || '').toLowerCase();
        const folder = req.query.folder || req.body?.folder || 'INBOX';
        const uid = parseInt(req.params.uid, 10);
        const { add = [], remove = [] } = req.body || {};
        if (!allowedAccounts(req).includes(account)) {
            return res.status(403).json({ error: 'Kein Zugriff auf dieses Postfach' });
        }
        let client;
        try {
            client = await connectImap(pool, account);
            const lock = await client.getMailboxLock(folder);
            try {
                if (add.length) await client.messageFlagsAdd(uid, add, { uid: true });
                if (remove.length) await client.messageFlagsRemove(uid, remove, { uid: true });
                res.json({ success: true });
            } finally {
                lock.release();
            }
        } catch (err) {
            res.status(500).json({ error: err.message });
        } finally {
            if (client) await client.logout().catch(() => {});
        }
    });

    // Helper: holt entschluesseltes Passwort fuer einen Account oder wirft.
    async function getAccountPassword(account) {
        const r = await pool.query(
            'SELECT encrypted_password FROM shared_mailbox_passwords WHERE email = $1',
            [account]
        );
        if (r.rows.length === 0) throw new Error('Kein Passwort hinterlegt');
        const pw = decryptPassword(r.rows[0].encrypted_password);
        if (!pw) throw new Error('Passwort konnte nicht entschluesselt werden');
        return pw;
    }

    // Helper: Mail-Body bauen (text + attachments). attachments-Format:
    // [{ filename, content (base64), contentType }]
    function buildMailData({ account, to, cc, bcc, subject, body, html, inReplyTo, references, attachments }) {
        const headers = {};
        if (inReplyTo) headers['In-Reply-To'] = inReplyTo;
        if (references) headers['References'] = references;
        return {
            from: account, to, cc: cc || undefined, bcc: bcc || undefined,
            subject, text: body || '', html: html || undefined, headers,
            attachments: Array.isArray(attachments) && attachments.length > 0
                ? attachments.map(a => ({
                    filename: a.filename,
                    content: typeof a.content === 'string' ? Buffer.from(a.content, 'base64') : a.content,
                    contentType: a.contentType
                }))
                : undefined
        };
    }

    function buildRaw(mailData) {
        return new Promise((resolve, reject) => {
            new MailComposer(mailData).compile().build((err, msg) => err ? reject(err) : resolve(msg));
        });
    }

    async function appendToSpecialFolder(imapClient, specialUse, fallbackName, raw, flags) {
        const list = await imapClient.list();
        const path = list.find(f => f.specialUse === specialUse)?.path
            || list.find(f => new RegExp(fallbackName, 'i').test(f.name))?.path
            || fallbackName;
        await imapClient.append(path, raw, flags);
    }

    // E-Mail versenden (Neu / Antwort / Weiterleitung).
    // Body: { account, to, cc, bcc, subject, body, html, inReplyTo, references, attachments }
    app.post('/imap/send', authVorstand, async (req, res) => {
        const account = (req.body?.account || '').toLowerCase();
        if (!allowedAccounts(req).includes(account)) {
            return res.status(403).json({ error: 'Kein Zugriff auf dieses Postfach' });
        }
        if (!req.body?.to || !req.body?.subject) {
            return res.status(400).json({ error: 'to + subject erforderlich' });
        }
        let imapClient;
        try {
            const password = await getAccountPassword(account);
            const mailData = buildMailData({ account, ...req.body });

            // SMTP-Versand mit Account-Credentials (STARTTLS auf 587)
            const transporter = nodemailer.createTransport({
                host: SMTP_HOST, port: SMTP_PORT, secure: false, requireTLS: true,
                auth: { user: account, pass: password }
            });
            const info = await transporter.sendMail(mailData);

            // Kopie in Sent ablegen
            try {
                const raw = await buildRaw(mailData);
                imapClient = await connectImap(pool, account);
                await appendToSpecialFolder(imapClient, '\\Sent', 'sent|gesendet', raw, ['\\Seen']);
            } catch (e) { console.warn('[IMAP] Sent-folder append failed:', e.message); }

            res.json({ success: true, messageId: info.messageId });
        } catch (err) {
            console.error('[IMAP] /send failed:', err.message);
            res.status(500).json({ error: err.message });
        } finally {
            if (imapClient) await imapClient.logout().catch(() => {});
        }
    });

    // Entwurf in Drafts-Ordner speichern (nicht senden).
    app.post('/imap/draft', authVorstand, async (req, res) => {
        const account = (req.body?.account || '').toLowerCase();
        if (!allowedAccounts(req).includes(account)) {
            return res.status(403).json({ error: 'Kein Zugriff auf dieses Postfach' });
        }
        let imapClient;
        try {
            await getAccountPassword(account); // existence check
            const mailData = buildMailData({ account, ...req.body });
            const raw = await buildRaw(mailData);
            imapClient = await connectImap(pool, account);
            await appendToSpecialFolder(imapClient, '\\Drafts', 'drafts|entwuerfe', raw, ['\\Draft']);
            res.json({ success: true });
        } catch (err) {
            console.error('[IMAP] /draft failed:', err.message);
            res.status(500).json({ error: err.message });
        } finally {
            if (imapClient) await imapClient.logout().catch(() => {});
        }
    });

    // Nachricht in beliebigen Folder verschieben. Wenn Target = Junk/Spam,
    // wird der Sender aus discovered_contacts entfernt (User markiert ihn als Spam).
    app.post('/imap/messages/:uid/move', authVorstand, async (req, res) => {
        const account = (req.query.account || req.body?.account || '').toLowerCase();
        const folder = req.query.folder || req.body?.folder || 'INBOX';
        const target = req.body?.target;
        const uid = parseInt(req.params.uid, 10);
        if (!allowedAccounts(req).includes(account)) {
            return res.status(403).json({ error: 'Kein Zugriff auf dieses Postfach' });
        }
        if (!target) return res.status(400).json({ error: 'target erforderlich' });
        let client;
        try {
            client = await connectImap(pool, account);
            const lock = await client.getMailboxLock(folder);
            try {
                // Sender extrahieren bevor wir verschieben (fuer Spam-Cleanup)
                let senderEmail = null;
                if (/junk|spam/i.test(target)) {
                    try {
                        const { content } = await client.download(uid, undefined, { uid: true });
                        const buffers = [];
                        for await (const chunk of content) buffers.push(chunk);
                        const parsed = await simpleParser(Buffer.concat(buffers));
                        if (parsed.from?.value?.[0]?.address) {
                            senderEmail = parsed.from.value[0].address.toLowerCase();
                        }
                    } catch (_) {}
                }
                await client.messageMove(uid, target, { uid: true });
                if (senderEmail) {
                    try {
                        await pool.query('DELETE FROM discovered_contacts WHERE email = $1', [senderEmail]);
                    } catch (_) {}
                }
            } finally { lock.release(); }
            res.json({ success: true });
        } catch (err) {
            console.error('[IMAP] /move failed:', err.message);
            res.status(500).json({ error: err.message });
        } finally {
            if (client) await client.logout().catch(() => {});
        }
    });

    // Nachricht in Trash verschieben
    app.delete('/imap/messages/:uid', authVorstand, async (req, res) => {
        const account = (req.query.account || '').toLowerCase();
        const folder = req.query.folder || 'INBOX';
        const uid = parseInt(req.params.uid, 10);
        if (!allowedAccounts(req).includes(account)) {
            return res.status(403).json({ error: 'Kein Zugriff auf dieses Postfach' });
        }
        let client;
        try {
            client = await connectImap(pool, account);
            const lock = await client.getMailboxLock(folder);
            try {
                // Trash-Folder finden (\Trash special-use, sonst "Trash" oder "Papierkorb")
                const list = await client.list();
                let trash = list.find(f => f.specialUse === '\\Trash')?.path
                    || list.find(f => /trash|papierkorb/i.test(f.name))?.path
                    || 'Trash';
                if (folder === trash) {
                    // schon im Papierkorb -> hart loeschen
                    await client.messageFlagsAdd(uid, ['\\Deleted'], { uid: true });
                    await client.expunge(uid, { uid: true }).catch(() => {});
                } else {
                    await client.messageMove(uid, trash, { uid: true });
                }
                res.json({ success: true });
            } finally {
                lock.release();
            }
        } catch (err) {
            res.status(500).json({ error: err.message });
        } finally {
            if (client) await client.logout().catch(() => {});
        }
    });
}

/**
 * Adressbuch-Endpoints. Liefert eine kombinierte Liste aus:
 *  - shared_contacts (Vorstand-bearbeitbar)
 *  - members (read-only — alle aktiven Mitglieder mit E-Mail)
 * Auto-Vervollstaendigung im Compose-Dialog matcht gegen Name + Email.
 */
function mountContacts(app, pool, authVorstand) {
    app.get('/contacts', authVorstand, async (req, res) => {
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS shared_contacts (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    name VARCHAR(200) NOT NULL,
                    email VARCHAR(200) NOT NULL,
                    phone VARCHAR(50),
                    organisation VARCHAR(200),
                    notes TEXT,
                    created_by VARCHAR(200),
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_shared_contacts_email ON shared_contacts(email);
            `);
            const shared = await pool.query(
                `SELECT id, name, email, phone, organisation, notes, created_by, updated_at
                 FROM shared_contacts ORDER BY name`
            );
            const members = await pool.query(`
                SELECT id, vorname, nachname, email, mobile, telefon, funktion
                FROM members
                WHERE COALESCE(status,'') NOT IN ('Ausgetreten','Verstorben','Austritt_beantragt')
                  AND email IS NOT NULL AND email != ''
                ORDER BY nachname, vorname
            `);
            // Auto-discovered (aus eingehenden Mails) — nur die, die NICHT bereits in
            // shared oder members vorkommen, sonst Doppel-Eintraege.
            const knownEmails = new Set([
                ...shared.rows.map(c => (c.email || '').toLowerCase()),
                ...members.rows.map(m => (m.email || '').toLowerCase())
            ]);
            let discoveredRows = [];
            try {
                const r = await pool.query(`
                    SELECT email, name, last_seen, seen_count
                    FROM discovered_contacts
                    ORDER BY seen_count DESC, last_seen DESC
                `);
                discoveredRows = r.rows.filter(d => !knownEmails.has((d.email || '').toLowerCase()));
            } catch (_) {}

            res.json({
                shared: shared.rows.map(c => ({ ...c, source: 'shared' })),
                members: members.rows.map(m => ({
                    id: 'member:' + m.id, source: 'member',
                    name: `${m.vorname || ''} ${m.nachname || ''}`.trim(),
                    email: m.email, phone: m.mobile || m.telefon || '',
                    organisation: m.funktion || 'FWV Raura', notes: ''
                })),
                discovered: discoveredRows.map(d => ({
                    id: 'discovered:' + d.email, source: 'discovered',
                    name: d.name || d.email.split('@')[0],
                    email: d.email, phone: '', organisation: '',
                    notes: `Automatisch erkannt — ${d.seen_count}× gesehen, zuletzt ${new Date(d.last_seen).toLocaleDateString('de-CH')}`
                }))
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/contacts', authVorstand, async (req, res) => {
        const { name, email, phone, organisation, notes } = req.body || {};
        if (!name || !email) return res.status(400).json({ error: 'name + email erforderlich' });
        try {
            const r = await pool.query(
                `INSERT INTO shared_contacts (name, email, phone, organisation, notes, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                [name, email, phone || null, organisation || null, notes || null, req.user.email || null]
            );
            res.status(201).json(r.rows[0]);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.put('/contacts/:id', authVorstand, async (req, res) => {
        const { name, email, phone, organisation, notes } = req.body || {};
        try {
            const r = await pool.query(
                `UPDATE shared_contacts SET
                    name = COALESCE($1, name), email = COALESCE($2, email),
                    phone = $3, organisation = $4, notes = $5, updated_at = NOW()
                 WHERE id = $6 RETURNING *`,
                [name ?? null, email ?? null, phone ?? null, organisation ?? null, notes ?? null, req.params.id]
            );
            if (r.rows.length === 0) return res.status(404).json({ error: 'Nicht gefunden' });
            res.json(r.rows[0]);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.delete('/contacts/:id', authVorstand, async (req, res) => {
        try {
            const r = await pool.query('DELETE FROM shared_contacts WHERE id = $1 RETURNING id', [req.params.id]);
            if (r.rows.length === 0) return res.status(404).json({ error: 'Nicht gefunden' });
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
}

module.exports = { mountImap, mountContacts };
