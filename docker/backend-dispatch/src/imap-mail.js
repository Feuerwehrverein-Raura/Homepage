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
const crypto = require('crypto');

const IMAP_HOST = process.env.IMAP_HOST || 'mail.test.juroct.net';
const IMAP_PORT = parseInt(process.env.IMAP_PORT || '993', 10);
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
            const folders = list.map(f => ({
                path: f.path,
                name: f.name,
                specialUse: f.specialUse || null,
                flags: Array.from(f.flags || [])
            }));
            res.json(folders);
        } catch (err) {
            console.error('[IMAP] /folders failed:', err.message);
            res.status(500).json({ error: err.message });
        } finally {
            if (client) await client.logout().catch(() => {});
        }
    });

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

module.exports = { mountImap };
