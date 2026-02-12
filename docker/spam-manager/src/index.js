const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const axios = require('axios');
const { authenticateToken } = require('./auth-middleware');
const ImapService = require('./imap-service');
const MailcowService = require('./mailcow-service');
const BlocklistStore = require('./blocklist-store');

const app = express();
const PORT = process.env.PORT || 3000;
const SERVICE_NAME = 'spam-manager';

function log(level, message, data = {}) {
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), service: SERVICE_NAME, level, message, ...data }));
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const imapService = new ImapService({
    host: process.env.IMAP_HOST || 'mail.test.juroct.net',
    port: parseInt(process.env.IMAP_PORT || '993'),
    user: process.env.SPAM_IMAP_USER || 'spam@fwv-raura.ch',
    password: process.env.SPAM_IMAP_PASSWORD
});

const mailcowService = new MailcowService(
    process.env.MAILCOW_API_URL || 'https://mail.test.juroct.net',
    process.env.MAILCOW_API_KEY
);

const blocklistStore = new BlocklistStore(process.env.BLOCKLIST_FILE || '/app/data/blocklist.json');

// Health
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: SERVICE_NAME, version: process.env.APP_VERSION || '0.0.0' });
});

// OIDC token exchange
app.post('/api/auth/callback', async (req, res) => {
    try {
        const { code, redirect_uri } = req.body;
        const AUTHENTIK_URL = process.env.AUTHENTIK_URL || 'https://auth.fwv-raura.ch';
        const SLUG = process.env.AUTHENTIK_APP_SLUG || 'spam-manager';

        const tokenResponse = await axios.post(
            `${AUTHENTIK_URL}/application/o/token/`,
            new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri,
                client_id: process.env.AUTHENTIK_CLIENT_ID,
                client_secret: process.env.AUTHENTIK_CLIENT_SECRET
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        res.json({
            access_token: tokenResponse.data.access_token,
            id_token: tokenResponse.data.id_token
        });
    } catch (error) {
        log('ERROR', 'Auth callback failed', { error: error.response?.data || error.message });
        res.status(500).json({ error: 'Authentication failed' });
    }
});

// === REPORTS ===

app.get('/api/reports', authenticateToken, async (req, res) => {
    try {
        const reports = await imapService.listReports();
        res.json(reports);
    } catch (error) {
        log('ERROR', 'Failed to list reports', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch spam reports' });
    }
});

app.get('/api/reports/:uid', authenticateToken, async (req, res) => {
    try {
        const report = await imapService.getReport(parseInt(req.params.uid));
        if (!report) return res.status(404).json({ error: 'Report not found' });
        res.json(report);
    } catch (error) {
        log('ERROR', 'Failed to get report', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch report' });
    }
});

app.delete('/api/reports/:uid', authenticateToken, async (req, res) => {
    try {
        await imapService.deleteMessage(parseInt(req.params.uid));
        log('INFO', 'Report deleted', { uid: req.params.uid, by: req.user.email });
        res.json({ success: true });
    } catch (error) {
        log('ERROR', 'Failed to delete report', { error: error.message });
        res.status(500).json({ error: 'Failed to delete report' });
    }
});

// === BLOCKING ===

app.post('/api/block/email', authenticateToken, async (req, res) => {
    try {
        const { email, reportUid } = req.body;
        if (!email) return res.status(400).json({ error: 'Email required' });

        const result = await mailcowService.blockSenderEmail(email);
        const entry = blocklistStore.addEntry({
            type: 'email',
            value: email,
            blockedBy: req.user.email,
            reportUid,
            mailcowPolicyId: extractPolicyId(result.data)
        });
        log('INFO', 'Sender email blocked', { email, by: req.user.email });
        res.json(entry);
    } catch (error) {
        log('ERROR', 'Failed to block email', { error: error.message });
        res.status(500).json({ error: 'Failed to block sender' });
    }
});

app.post('/api/block/domain', authenticateToken, async (req, res) => {
    try {
        const { domain, reportUid } = req.body;
        if (!domain) return res.status(400).json({ error: 'Domain required' });

        const result = await mailcowService.blockSenderDomain(domain);
        const entry = blocklistStore.addEntry({
            type: 'domain',
            value: domain,
            blockedBy: req.user.email,
            reportUid,
            mailcowPolicyId: extractPolicyId(result.data)
        });
        log('INFO', 'Sender domain blocked', { domain, by: req.user.email });
        res.json(entry);
    } catch (error) {
        log('ERROR', 'Failed to block domain', { error: error.message });
        res.status(500).json({ error: 'Failed to block domain' });
    }
});

app.post('/api/block/ip', authenticateToken, async (req, res) => {
    try {
        const { ip, reportUid } = req.body;
        if (!ip) return res.status(400).json({ error: 'IP required' });

        const entry = blocklistStore.addEntry({
            type: 'ip',
            value: ip,
            blockedBy: req.user.email,
            reportUid
        });
        log('INFO', 'Server IP blocked', { ip, by: req.user.email });
        res.json(entry);
    } catch (error) {
        log('ERROR', 'Failed to block IP', { error: error.message });
        res.status(500).json({ error: 'Failed to block IP' });
    }
});

// === BLOCKLIST ===

app.get('/api/blocklist', authenticateToken, async (req, res) => {
    try {
        const local = blocklistStore.getAll();
        let mailcow = [];
        try {
            mailcow = await mailcowService.getBlacklist();
        } catch (e) {
            log('ERROR', 'Failed to fetch Mailcow blacklist', { error: e.message });
        }
        res.json({ local, mailcow });
    } catch (error) {
        log('ERROR', 'Failed to get blocklist', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch blocklist' });
    }
});

app.delete('/api/block/:id', authenticateToken, async (req, res) => {
    try {
        const entries = blocklistStore.getAll();
        const entry = entries.find(e => e.id === req.params.id);
        if (!entry) return res.status(404).json({ error: 'Entry not found' });

        if (entry.mailcowPolicyId && (entry.type === 'email' || entry.type === 'domain')) {
            try {
                await mailcowService.removeBlacklistEntry(entry.mailcowPolicyId);
            } catch (e) {
                log('ERROR', 'Failed to remove from Mailcow', { error: e.message });
            }
        }

        blocklistStore.removeEntry(req.params.id);
        log('INFO', 'Block entry removed', { id: req.params.id, value: entry.value, by: req.user.email });
        res.json({ success: true });
    } catch (error) {
        log('ERROR', 'Failed to remove block', { error: error.message });
        res.status(500).json({ error: 'Failed to remove block' });
    }
});

// Rspamd HTTP map endpoint (unauthenticated - Rspamd polls this)
app.get('/api/maps/blocked-ips', (req, res) => {
    const ips = blocklistStore.getBlockedIps();
    res.type('text/plain').send(ips.join('\n') + '\n');
});

function extractPolicyId(data) {
    if (Array.isArray(data) && data[0]?.prefid) return data[0].prefid;
    if (data?.prefid) return data.prefid;
    return null;
}

// SPA fallback
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/')) {
        res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
    }
});

app.listen(PORT, () => {
    log('INFO', `${SERVICE_NAME} started on port ${PORT}`);
});
