const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { parseStringPromise } = require('xml2js');
const zlib = require('zlib');
const { promisify } = require('util');

const gunzip = promisify(zlib.gunzip);

class DmarcService {
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
        this.domain = config.domain || 'fwv-raura.ch';
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

    async fetchReports() {
        return this.withClient(async (client) => {
            const lock = await client.getMailboxLock('INBOX');
            try {
                const status = await client.status('INBOX', { messages: true });
                if (status.messages === 0) return [];

                const reports = [];
                for await (const msg of client.fetch('1:*', {
                    uid: true,
                    envelope: true,
                    source: true
                })) {
                    try {
                        const parsed = await simpleParser(msg.source);
                        const xmlData = await this.extractXml(parsed);
                        if (!xmlData) continue;

                        const report = await this.parseReport(xmlData);
                        if (!report) continue;

                        // Filter for our domain
                        if (report.domain !== this.domain) continue;

                        report.uid = msg.uid;
                        report.receivedDate = parsed.date;
                        reports.push(report);
                    } catch (e) {
                        // Skip unparseable messages
                    }
                }
                return reports.sort((a, b) =>
                    new Date(b.dateEnd) - new Date(a.dateEnd)
                );
            } finally {
                lock.release();
            }
        });
    }

    async extractXml(parsed) {
        if (!parsed.attachments || parsed.attachments.length === 0) {
            return null;
        }

        for (const att of parsed.attachments) {
            const name = (att.filename || '').toLowerCase();
            let content = att.content;

            if (name.endsWith('.gz') || att.contentType === 'application/gzip') {
                try {
                    content = await gunzip(content);
                } catch (e) {
                    continue;
                }
            } else if (name.endsWith('.zip') || att.contentType === 'application/zip') {
                try {
                    content = await this.extractZip(content);
                } catch (e) {
                    continue;
                }
            }

            if (name.endsWith('.xml') || name.endsWith('.gz') || name.endsWith('.zip')) {
                return content.toString('utf-8');
            }
        }
        return null;
    }

    async extractZip(buffer) {
        // Simple ZIP extraction — DMARC ZIPs contain a single XML
        // Local file header signature = 0x04034b50
        const sig = buffer.readUInt32LE(0);
        if (sig !== 0x04034b50) throw new Error('Not a ZIP');

        const nameLen = buffer.readUInt16LE(26);
        const extraLen = buffer.readUInt16LE(28);
        const method = buffer.readUInt16LE(8);
        const compSize = buffer.readUInt32LE(18);
        const dataOffset = 30 + nameLen + extraLen;
        const compData = buffer.slice(dataOffset, dataOffset + compSize);

        if (method === 0) {
            return compData; // stored
        } else if (method === 8) {
            return promisify(zlib.inflateRaw)(compData); // deflated
        }
        throw new Error(`Unsupported ZIP method: ${method}`);
    }

    async parseReport(xml) {
        const result = await parseStringPromise(xml, {
            explicitArray: false,
            ignoreAttrs: false
        });

        const feedback = result.feedback;
        if (!feedback) return null;

        const meta = feedback.report_metadata || {};
        const policy = feedback.policy_published || {};
        const records = feedback.record
            ? (Array.isArray(feedback.record) ? feedback.record : [feedback.record])
            : [];

        const dateBegin = meta.date_range?.begin
            ? new Date(parseInt(meta.date_range.begin) * 1000).toISOString()
            : null;
        const dateEnd = meta.date_range?.end
            ? new Date(parseInt(meta.date_range.end) * 1000).toISOString()
            : null;

        const rows = records.map(r => {
            const row = r.row || {};
            const authResults = r.auth_results || {};
            const policyEval = row.policy_evaluated || {};
            const count = parseInt(row.count || '0');

            const spfResults = authResults.spf
                ? (Array.isArray(authResults.spf) ? authResults.spf : [authResults.spf])
                : [];
            const dkimResults = authResults.dkim
                ? (Array.isArray(authResults.dkim) ? authResults.dkim : [authResults.dkim])
                : [];

            return {
                sourceIp: row.source_ip || '',
                count,
                disposition: policyEval.disposition || '',
                dkim: policyEval.dkim || '',
                spf: policyEval.spf || '',
                headerFrom: r.identifiers?.header_from || '',
                authSpf: spfResults.map(s => ({
                    domain: s.domain || '',
                    result: s.result || ''
                })),
                authDkim: dkimResults.map(d => ({
                    domain: d.domain || '',
                    result: d.result || '',
                    selector: d.selector || ''
                }))
            };
        });

        return {
            orgName: meta.org_name || '',
            email: meta.email || '',
            reportId: meta.report_id || '',
            dateBegin,
            dateEnd,
            domain: policy.domain || '',
            policy: policy.p || '',
            subdomainPolicy: policy.sp || '',
            pct: policy.pct || '100',
            adkim: policy.adkim || '',
            aspf: policy.aspf || '',
            records: rows
        };
    }

    aggregateStats(reports) {
        let totalMessages = 0;
        let passMessages = 0;
        let failMessages = 0;
        const sourceIps = {};
        const orgs = {};

        for (const report of reports) {
            if (!orgs[report.orgName]) {
                orgs[report.orgName] = { pass: 0, fail: 0, total: 0 };
            }
            for (const row of report.records) {
                totalMessages += row.count;
                const pass = row.dkim === 'pass' || row.spf === 'pass';
                if (pass) {
                    passMessages += row.count;
                    orgs[report.orgName].pass += row.count;
                } else {
                    failMessages += row.count;
                    orgs[report.orgName].fail += row.count;
                }
                orgs[report.orgName].total += row.count;

                if (!sourceIps[row.sourceIp]) {
                    sourceIps[row.sourceIp] = {
                        ip: row.sourceIp,
                        pass: 0,
                        fail: 0,
                        total: 0
                    };
                }
                if (pass) {
                    sourceIps[row.sourceIp].pass += row.count;
                } else {
                    sourceIps[row.sourceIp].fail += row.count;
                }
                sourceIps[row.sourceIp].total += row.count;
            }
        }

        const passRate = totalMessages > 0
            ? Math.round((passMessages / totalMessages) * 100)
            : 0;

        return {
            totalMessages,
            passMessages,
            failMessages,
            passRate,
            reportCount: reports.length,
            sourceIps: Object.values(sourceIps)
                .sort((a, b) => b.total - a.total),
            organizations: Object.entries(orgs)
                .map(([name, stats]) => ({ name, ...stats }))
                .sort((a, b) => b.total - a.total)
        };
    }
}

module.exports = DmarcService;
