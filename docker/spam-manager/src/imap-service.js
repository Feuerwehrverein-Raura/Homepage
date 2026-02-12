const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

class ImapService {
    constructor(config) {
        this.config = {
            host: config.host || 'mail.test.juroct.net',
            port: config.port || 993,
            secure: true,
            auth: {
                user: config.user,
                pass: config.password
            },
            logger: false
        };
    }

    async withClient(fn) {
        const client = new ImapFlow(this.config);
        await client.connect();
        try {
            return await fn(client);
        } finally {
            await client.logout();
        }
    }

    async listReports() {
        return this.withClient(async (client) => {
            const lock = await client.getMailboxLock('INBOX');
            try {
                const status = await client.status('INBOX', { messages: true });
                if (status.messages === 0) return [];

                const messages = [];
                for await (const msg of client.fetch('1:*', {
                    uid: true,
                    envelope: true,
                    source: true,
                    flags: true
                })) {
                    try {
                        const parsed = await simpleParser(msg.source);
                        messages.push(this.extractReportData(msg.uid, parsed, msg.flags));
                    } catch (parseErr) {
                        console.error(`Failed to parse message UID ${msg.uid}:`, parseErr.message);
                        messages.push({
                            uid: msg.uid,
                            date: null,
                            from: { address: 'unknown', name: 'Parse Error' },
                            subject: `(Parsing fehlgeschlagen: ${parseErr.message})`,
                            error: true
                        });
                    }
                }
                return messages.sort((a, b) => (b.date || 0) - (a.date || 0));
            } finally {
                lock.release();
            }
        });
    }

    async getReport(uid) {
        return this.withClient(async (client) => {
            const lock = await client.getMailboxLock('INBOX');
            try {
                const msg = await client.fetchOne(String(uid), {
                    uid: true,
                    source: true,
                    flags: true
                }, { uid: true });
                if (!msg) return null;
                const parsed = await simpleParser(msg.source);
                const report = this.extractReportData(uid, parsed, msg.flags);
                report.fullHeaders = this.headersToObject(parsed.headers);
                report.textBody = parsed.text || '';
                report.htmlBody = parsed.html || '';
                return report;
            } finally {
                lock.release();
            }
        });
    }

    async deleteMessage(uid) {
        return this.withClient(async (client) => {
            const lock = await client.getMailboxLock('INBOX');
            try {
                await client.messageDelete(String(uid), { uid: true });
            } finally {
                lock.release();
            }
        });
    }

    extractReportData(uid, parsed, flags) {
        const headers = parsed.headers;

        const receivedHeaders = headers.get('received');
        const serverIps = this.extractIpsFromReceived(
            Array.isArray(receivedHeaders) ? receivedHeaders : [receivedHeaders]
        );

        const authResults = String(headers.get('authentication-results') || '');

        const fromValue = parsed.from?.value?.[0] || { address: 'unknown', name: '' };
        const senderDomain = fromValue.address ? fromValue.address.split('@')[1] : '';

        return {
            uid,
            date: parsed.date,
            from: fromValue,
            senderDomain,
            to: (parsed.to?.value || []).map(t => t.address),
            subject: parsed.subject || '(kein Betreff)',
            returnPath: String(headers.get('return-path') || ''),
            serverIps,
            spf: this.extractAuthResult(authResults, 'spf'),
            dkim: this.extractAuthResult(authResults, 'dkim'),
            dmarc: this.extractAuthResult(authResults, 'dmarc'),
            forwardedBy: this.detectForwarder(parsed),
            textPreview: (parsed.text || '').substring(0, 500),
            flags: flags ? [...flags] : [],
            seen: flags ? flags.has('\\Seen') : false
        };
    }

    extractIpsFromReceived(receivedArray) {
        const ips = [];
        for (const header of receivedArray) {
            if (!header) continue;
            const headerStr = typeof header === 'object' ? JSON.stringify(header) : String(header);
            const ipMatches = headerStr.match(/\[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]/g);
            if (ipMatches) {
                ips.push(...ipMatches.map(m => m.replace(/[[\]]/g, '')));
            }
        }
        return [...new Set(ips)].filter(ip =>
            !ip.startsWith('127.') &&
            !ip.startsWith('10.') &&
            !ip.startsWith('192.168.') &&
            !ip.match(/^172\.(1[6-9]|2\d|3[01])\./)
        );
    }

    extractAuthResult(authResults, type) {
        const regex = new RegExp(`${type}=([a-z]+)`, 'i');
        const match = authResults.match(regex);
        return match ? match[1].toLowerCase() : 'unknown';
    }

    detectForwarder(parsed) {
        const resentFrom = parsed.headers.get('resent-from');
        if (resentFrom) {
            if (typeof resentFrom === 'object' && resentFrom.value) {
                return resentFrom.value[0]?.address || String(resentFrom);
            }
            return String(resentFrom);
        }
        const xForwardedTo = parsed.headers.get('x-forwarded-to');
        if (xForwardedTo) return String(xForwardedTo);
        return null;
    }

    headersToObject(headers) {
        const obj = {};
        for (const [key, value] of headers) {
            obj[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
        }
        return obj;
    }
}

module.exports = ImapService;
