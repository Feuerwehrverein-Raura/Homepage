import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import pg from 'pg';
import multer from 'multer';
import PaymentService from './payments.js';
import SumUpTerminal from './terminal.js';
import fs from 'fs';
import path from 'path';
import https from 'https';
import crypto from 'crypto';
import { AnlassErmittler, eventsQuelle, twintAntwort, hatService, UUID_MUSTER } from './anlass.js';
import { BELIEBT_SQL, beliebtListe } from './beliebt.js';
import { anzeigeName, anzeigeNameSql } from './anzeigename.js';
import { VOR_ORT, vorOrtSchema, vorOrtEinrichten, cloudPasswortHolen, artikelMerken, artikelAusSpeicher } from './vorort.js';
import { qrCodeLesen } from './qrcode.js';
import { kassenbonSchema, kassenbonAnlegen, kassenbonEinloesen, kassenbonXml } from './kassenbon.js';
import { bestellNr, escapeXml, bonUmbruch, rezeptAusInventar, rezeptBonXml, rezeptBonText, faktorPruefen } from './bon.js';
import { authenticateToken, optionalAuth, requireRole, AuthenticatedRequest, localLogin, refreshLogin, vorOrtToken, signMitgliedPosToken, getAuthMode, getBlockedIps, unblockIp, setSharedPassword, verifyAnyToken } from './auth.js';

// Offline-/Vor-Ort-Modus (Raspberry Pi im LAN). Im Cloud-Betrieb (order.fwv-raura.ch)
// ist LOCAL_MODE aus -> dann wird Authentifizierung erzwungen.
const LOCAL_MODE = process.env.LOCAL_MODE === 'true';

// Nextcloud configuration
const NEXTCLOUD_URL = process.env.NEXTCLOUD_URL || 'https://nextcloud.fwv-raura.ch';
const NEXTCLOUD_USER = process.env.NEXTCLOUD_USER || 'fwv-system';
const NEXTCLOUD_PASSWORD = process.env.NEXTCLOUD_PASSWORD || '';
const NEXTCLOUD_UPLOAD_FOLDER = '/Verein/TWINT';

// Multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images allowed'));
    }
  }
});

const app = express();
const server = createServer(app);
// WebSocket nur mit gueltigem Token. Browser (PWA/Web-Kueche) haengen es als
// ?token= an, die native App schickt es als Authorization-Header. Im Vor-Ort-LAN
// (LOCAL_MODE) bleibt /ws offen wie bisher.
const wss = new WebSocketServer({
  server,
  path: '/ws',
  verifyClient: (info, cb) => {
    if (LOCAL_MODE) return cb(true);
    try {
      const url = new URL(info.req.url || '', 'http://localhost');
      const qToken = url.searchParams.get('token');
      const authHeader = info.req.headers['authorization'];
      const hToken = authHeader && authHeader.split(' ')[1];
      const token = qToken || hToken;
      if (!token) return cb(false, 401, 'No token');
      verifyAnyToken(token)
        .then(() => cb(true))
        .catch(() => cb(false, 403, 'Invalid token'));
    } catch {
      cb(false, 400, 'Bad request');
    }
  }
});

// Trust reverse proxy (Traefik) for X-Forwarded-* headers
app.set('trust proxy', true);

// Kasse vor Ort: Die Oberflaeche kommt von order.fwv-raura.ch (oeffentlich)
// und spricht den T400 im Schopf-Netz an. Chrome verlangt dafuer bei der
// Vorabfrage die Freigabe fuer das private Netz (Private Network Access).
app.use((req, res, next) => {
  if (req.headers['access-control-request-private-network']) {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
  next();
});
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Serve uploaded files (TWINT QR codes etc.)
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/api/uploads', express.static(UPLOADS_DIR));

// Audit logging middleware - logs all API requests
app.use('/api', (req: AuthenticatedRequest, res, next) => {
  const startTime = Date.now();
  const ip = getClientIp(req);
  const method = req.method;
  const path = req.originalUrl;

  // Capture response status after request completes
  res.on('finish', async () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    // Skip logging for high-frequency/noisy endpoints
    if (path === '/api/health' || path.startsWith('/api/orders') && method === 'GET') {
      return;
    }

    try {
      await pool.query(
        `INSERT INTO audit_log (ip, method, path, status_code, user_id, user_email, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [ip, method, path, statusCode, req.user?.id || null, req.user?.email || null, duration]
      );
    } catch (err) {
      // Silently fail - don't break the app if audit logging fails
      console.error('Audit log error:', err);
    }
  });

  next();
});

// Zentrale Auth-Schranke: im Cloud-Betrieb muss (fast) jeder /api-Zugriff ein
// gueltiges Token tragen (Authentik-OIDC ODER signiertes Kassen-/App-Token).
// Oeffentlich bleiben nur Health, Auth-Login, Provider-Webhooks, Sync (eigener
// x-sync-key) und interne Endpoints (eigener API-Key). Im Vor-Ort-LAN (LOCAL_MODE)
// bleibt alles offen wie bisher, damit der Festbetrieb offline weiterlaeuft.
const OPEN_API_PATHS = [
  /^\/health/,
  /^\/auth\/(mode|login|qr-login)/,
  /^\/webhooks\//,
  /^\/sync\//,
  /^\/internal\//,
  /^\/uploads\//,
  // TWINT-QR des Anlasses: <img> schickt kein Token mit (wie /uploads/).
  /^\/twint-qr\/bild\//,
];
app.use('/api', (req: AuthenticatedRequest, res, next) => {
  if (LOCAL_MODE) return next();
  if (req.method === 'OPTIONS') return next();
  if (OPEN_API_PATHS.some((re) => re.test(req.path))) return next();
  return (authenticateToken as express.RequestHandler)(req, res, next);
});

// Auth routes
app.get('/api/auth/mode', (req, res) => {
  res.json(getAuthMode());
});

app.post('/api/auth/login', localLogin);
// Kuechendisplay/Kiosk: gueltiges POS-Token gegen ein frisches tauschen (kein
// OPEN_API_PATH — die Auth-Schranke oben prueft das Token bereits).
app.post('/api/auth/refresh', refreshLogin);
// Kassen-Anmeldebon drucken (src/kassenbon.ts). Gedruckt wird auf dem
// Bar-Drucker (sonst Kueche); nur ePOS kann QR-Codes.
const CLOUD_ORDER_URL = (process.env.CLOUD_ORDER_URL || 'https://order.fwv-raura.ch').replace(/\/$/, '');
async function kassenbonDrucken(code: string, giltBis: Date, von: string): Promise<void> {
  const cfgs = await getPrinterConfig();
  const cfg = cfgs.bar || cfgs.kitchen;
  if (!cfg) throw new Error('Kein Bondrucker eingerichtet');
  if (cfg.protocol !== 'epos') throw new Error('Der Bondrucker kann keine QR-Codes (kein ePOS)');
  await eposSenden(cfg.ip, 'bar', eposHuelle(kassenbonXml(code, giltBis, von, bonLogoXml())));
}
// Cloud: Bon anlegen fuer api-members (Vorstand, mit Druck) und den T400
// (ohne Druck - er druckt selbst). Nur mit X-Order-API-Key.
app.post('/api/internal/kassenbon', async (req, res) => {
  if (req.headers['x-order-api-key'] !== ORDER_API_KEY) return res.status(401).json({ error: 'Invalid API key' });
  const von = String(req.body?.erstellt_von || 'Vorstand').slice(0, 100);
  try {
    const bon = await kassenbonAnlegen(pool, von);
    if (req.body?.drucken) {
      await kassenbonDrucken(bon.code, bon.giltBis, von);
      return res.json({ gilt_bis: bon.giltBis.toISOString() });
    }
    res.json({ code: bon.code, gilt_bis: bon.giltBis.toISOString() });
  } catch (e: any) {
    console.error('Kassen-Anmeldebon (intern):', e?.message || e);
    res.status(502).json({ error: `Bon nicht gedruckt: ${e?.message || e}` });
  }
});
// Kasse: Bon drucken (angemeldet). Am T400 liegt der Bon in der Cloud, damit
// er auch an einer Kasse gilt, die gerade ueber die Cloud laeuft.
app.post('/api/auth/kassenbon', async (req: AuthenticatedRequest, res) => {
  const von = String(req.user?.name || 'Kasse').slice(0, 100);
  try {
    let bon: { code: string; giltBis: Date } | null = null;
    if (VOR_ORT) {
      try {
        const r = await fetch(`${CLOUD_ORDER_URL}/api/internal/kassenbon`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Order-API-Key': ORDER_API_KEY! },
          body: JSON.stringify({ erstellt_von: von, drucken: false }), signal: AbortSignal.timeout(8000),
        });
        const d: any = await r.json();
        if (r.ok && d.code) bon = { code: d.code, giltBis: new Date(d.gilt_bis) };
      } catch { /* ohne Internet: lokal */ }
    }
    if (!bon) bon = await kassenbonAnlegen(pool, von);
    await kassenbonDrucken(bon.code, bon.giltBis, von);
    res.json({ gilt_bis: bon.giltBis.toISOString() });
  } catch (e: any) {
    console.error('Kassen-Anmeldebon:', e?.message || e);
    res.status(502).json({ error: `Bon nicht gedruckt: ${e?.message || e}` });
  }
});

// Kassen-Token fuer den T400 (siehe vorOrtToken in auth.ts); hinter der Auth-Schranke.
app.post('/api/auth/vor-ort-token', vorOrtToken);

// QR-Login mit dem Datenblatt eines Mitglieds oder dem Anmeldebon vom
// Bondrucker (Kasse, Kueche, Kuechen-App). Erkannt werden:
//  - Datenblatt: JSON {"type":"fwv-member-login","token":"fwv-member-..."}
//    oder das nackte Token -> api-members /auth/member/qr-login
//  - Anmeldebon: https://www.fwv-raura.ch/anmelden.html?code=... (einmalig,
//    1 h einloesbar) -> api-members /auth/member/code-login
// Gueltig = aktives Mitglied (Entscheid Stefan, 16.10.2026); Kassen-QR siehe
// src/qrcode.ts. Datenblatt und Bon brauchen
// Internet - auch der T400 fragt bei api-members nach.
const MEMBERS_API_URL = (process.env.MEMBERS_API_URL || 'https://api.fwv-raura.ch').replace(/\/$/, '');
app.post('/api/auth/qr-login', async (req, res) => {
  const gelesen = qrCodeLesen(req.body?.code);
  if (!gelesen) return res.status(400).json({ error: 'Das ist kein Login-Code des Vereins.' });
  // Kassen-QR: wie die Passwort-Anmeldung (gleiche Pruefung und Sperre nach
  // Fehlversuchen), geht auch auf dem T400 ohne Internet.
  if (gelesen.art === 'kasse') {
    req.body = { password: gelesen.passwort };
    return localLogin(req, res);
  }
  // Kassen-Anmeldebon (src/kassenbon.ts): einmalig, 1 h. Am T400 zuerst
  // lokal, sonst in der Cloud einloesen (dort liegen die meisten Bons).
  if (gelesen.art === 'kassenbon') {
    const stand = await kassenbonEinloesen(pool, gelesen.code);
    if (stand === 'ok') {
      console.log('Kassen-Anmeldebon eingeloest');
      return res.json({ token: signMitgliedPosToken('Kasse (Anmeldebon)', null), name: 'Kasse', mode: 'kassenbon' });
    }
    if (stand === 'unbekannt' && VOR_ORT) {
      try {
        const r = await fetch(`${CLOUD_ORDER_URL}/api/auth/qr-login`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: req.body.code }), signal: AbortSignal.timeout(10000),
        });
        return res.status(r.status).json(await r.json().catch(() => ({})));
      } catch {
        return res.status(502).json({ error: 'Dieser Bon kommt vom Vereinsserver - dafür braucht es Internet.' });
      }
    }
    return res.status(401).json({ error: 'Dieser Bon ist schon benutzt oder abgelaufen - bitte einen neuen drucken.' });
  }
  try {
    const r = await fetch(`${MEMBERS_API_URL}/auth/member/${gelesen.art === 'bon' ? 'code-login' : 'qr-login'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gelesen.art === 'bon' ? { code: gelesen.code } : { token: gelesen.token }),
      signal: AbortSignal.timeout(10000),
    });
    if (r.status === 401) {
      return res.status(401).json({ error: gelesen.art === 'bon'
        ? 'Dieser Bon ist schon benutzt oder abgelaufen - bitte einen neuen drucken.'
        : 'Dieser Code ist ungültig oder gesperrt.' });
    }
    if (!r.ok) return res.status(502).json({ error: `Mitgliederverwaltung antwortete ${r.status}` });
    const d: any = await r.json();
    const name = String(d?.user?.name || d?.name || '').slice(0, 100);
    console.log(`QR-Login Kasse/Kueche (${gelesen.art}): ${name || 'Mitglied'}`);
    res.json({ token: signMitgliedPosToken(name, d?.user?.email || null), name, mode: 'qr' });
  } catch (e: any) {
    console.error('QR-Login:', e?.message || e);
    res.status(502).json({ error: 'Anmeldung per QR braucht Internet - bitte später nochmals oder mit Passwort.' });
  }
});

// Blocked IPs management (admin only)
app.get('/api/auth/blocked-ips', authenticateToken, (req: AuthenticatedRequest, res) => {
  res.json(getBlockedIps());
});

app.delete('/api/auth/blocked-ips/:ip', authenticateToken, (req: AuthenticatedRequest, res) => {
  const ip = req.params.ip;
  const success = unblockIp(ip);
  if (success) {
    res.json({ message: `IP ${ip} entsperrt` });
  } else {
    res.status(404).json({ error: 'IP nicht gefunden oder nicht gesperrt' });
  }
});

// Audit log viewing (admin only)
app.get('/api/audit-log', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
    const offset = parseInt(req.query.offset as string) || 0;
    const ip = req.query.ip as string;
    const method = req.query.method as string;
    const path = req.query.path as string;

    let query = 'SELECT * FROM audit_log WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (ip) {
      query += ` AND ip = $${paramIndex++}`;
      params.push(ip);
    }
    if (method) {
      query += ` AND method = $${paramIndex++}`;
      params.push(method.toUpperCase());
    }
    if (path) {
      query += ` AND path LIKE $${paramIndex++}`;
      params.push(`%${path}%`);
    }

    query += ` ORDER BY timestamp DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Also get total count for pagination
    let countQuery = 'SELECT COUNT(*) FROM audit_log WHERE 1=1';
    const countParams: any[] = [];
    paramIndex = 1;

    if (ip) {
      countQuery += ` AND ip = $${paramIndex++}`;
      countParams.push(ip);
    }
    if (method) {
      countQuery += ` AND method = $${paramIndex++}`;
      countParams.push(method.toUpperCase());
    }
    if (path) {
      countQuery += ` AND path LIKE $${paramIndex++}`;
      countParams.push(`%${path}%`);
    }

    const countResult = await pool.query(countQuery, countParams);

    res.json({
      logs: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset
    });
  } catch (error) {
    console.error('Error fetching audit log:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mode: getAuthMode().local ? 'local' : 'online', vor_ort: VOR_ORT });
});

// Database setup
const pool = new pg.Pool({
  host: process.env.DB_HOST || 'postgres',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'orderdb',
  user: process.env.DB_USER || 'orderuser',
  password: process.env.DB_PASSWORD || 'orderpass',
});

// Initialize database
async function initDB() {
  // Keep items table for backwards compatibility but we only use inventory items now
  await pool.query(`
    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      price DECIMAL(10, 2) NOT NULL,
      category VARCHAR(100),
      printer_station VARCHAR(50) DEFAULT 'bar',
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      table_number INTEGER NOT NULL,
      status VARCHAR(50) DEFAULT 'pending',
      total DECIMAL(10, 2),
      payment_method VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add payment_method column if it doesn't exist (for existing databases)
  await pool.query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50)
  `);

  // Sync columns for bidirectional sync
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS sync_source VARCHAR(100)`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS sync_source_id INTEGER`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP`);

  // Anlass der Bestellung (aus api-events, siehe src/anlass.ts) - fuer den
  // Umsatz pro Anlass. Der Titel steht mit drin, damit die Auswertung auch
  // ohne api-events lesbar bleibt.
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS event_id VARCHAR(64)`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS event_titel VARCHAR(255)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_event_id ON orders(event_id)`);

  // Bestellreferenz der Kasse (Oktober 2026): Die Kasse puffert Bestellungen
  // bei schlechter Verbindung und sendet sie nach. Kommt dieselbe Referenz
  // zweimal (Antwort ging verloren), wird nicht doppelt gebucht.
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_ref VARCHAR(64)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_client_ref ON orders(client_ref) WHERE client_ref IS NOT NULL`);

  // Sync queue for offline sync
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id SERIAL PRIMARY KEY,
      entity_type VARCHAR(50) NOT NULL,
      entity_id INTEGER NOT NULL,
      action VARCHAR(20) NOT NULL,
      data JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      synced_at TIMESTAMP,
      error TEXT
    )
  `);

  // Create order_items without foreign key to items (we store item_name directly)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
      item_id VARCHAR(50),
      item_name VARCHAR(255),
      quantity INTEGER NOT NULL,
      price DECIMAL(10, 2) NOT NULL,
      notes TEXT,
      printer_station VARCHAR(50) DEFAULT 'bar'
    )
  `);

  // Add columns if they don't exist (migration for existing DBs)
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS item_name VARCHAR(255)`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS printer_station VARCHAR(50) DEFAULT 'bar'`);

  // Drop foreign key constraint if it exists
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_item_id_fkey;
    EXCEPTION WHEN undefined_object THEN NULL;
    END $$;
  `);

  // Change item_id to VARCHAR if it's still INTEGER
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE order_items ALTER COLUMN item_id TYPE VARCHAR(50) USING item_id::VARCHAR;
    EXCEPTION WHEN others THEN NULL;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
      provider VARCHAR(50) NOT NULL,
      payment_id VARCHAR(255),
      payment_url TEXT,
      qr_code_url TEXT,
      amount DECIMAL(10, 2) NOT NULL,
      currency VARCHAR(3) DEFAULT 'CHF',
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Settings table for printer configuration etc.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ============================================
  // SPLIT PAYMENT & PER-ITEM PAYMENT SUPPORT
  // ============================================

  // Track partial payments for an order (split bills)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_payments (
      id SERIAL PRIMARY KEY,
      order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
      amount DECIMAL(10, 2) NOT NULL,
      payment_method VARCHAR(50) NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add paid status to order_items for per-item payment tracking
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS paid BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS payment_id INTEGER REFERENCES order_payments(id)`);

  // Add completed status to order_items for kitchen confirmation (separate from paid)
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP`);

  // Audit log for tracking API access
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ip VARCHAR(45) NOT NULL,
      method VARCHAR(10) NOT NULL,
      path VARCHAR(500) NOT NULL,
      status_code INTEGER,
      user_id VARCHAR(100),
      user_email VARCHAR(255),
      duration_ms INTEGER,
      error TEXT
    )
  `);

  // Create index for faster queries on audit_log
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_ip ON audit_log(ip)`);

  // Gemeinsames Kassen-/Kuechen-Passwort (eine Zeile). Wird woechentlich rotiert
  // und unter "meine Zugaenge" angezeigt. Nur ueber den internen, API-Key-
  // geschuetzten Endpoint auslesbar — nie ueber eine oeffentliche Route.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pos_credentials (
      id INTEGER PRIMARY KEY DEFAULT 1,
      password TEXT NOT NULL,
      rotated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT pos_credentials_single_row CHECK (id = 1)
    )
  `);

  await vorOrtSchema(pool);
  await kassenbonSchema(pool);

  console.log('Database initialized');
}

// Get setting from database
async function getSetting(key: string): Promise<string | null> {
  const result = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
  return result.rows[0]?.value || null;
}

// Set setting in database
async function setSetting(key: string, value: string): Promise<void> {
  await pool.query(`
    INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
    ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
  `, [key, value]);
}

// WebSocket broadcast
function broadcast(data: any) {
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(data));
    }
  });
}

// ============================================
// REAL-TIME SYNC
// ============================================

const CLOUD_SYNC_ENABLED = process.env.CLOUD_SYNC_ENABLED === 'true';
const SYNC_CLOUD_URL = process.env.CLOUD_API_URL || '';
const SYNC_KEY = process.env.CLOUD_SYNC_KEY || '';
const SYNC_SOURCE = process.env.SYNC_SOURCE || 'local';

// Queue an order for sync to cloud
async function queueOrderSync(orderId: number, action: 'create' | 'update') {
  if (!CLOUD_SYNC_ENABLED || !SYNC_CLOUD_URL) return;

  try {
    const result = await pool.query(`
      SELECT o.*,
        json_agg(json_build_object(
          'item_id', oi.item_id, 'item_name', oi.item_name,
          'quantity', oi.quantity, 'price', oi.price,
          'notes', oi.notes, 'printer_station', oi.printer_station
        )) FILTER (WHERE oi.id IS NOT NULL) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.id = $1
      GROUP BY o.id
    `, [orderId]);

    if (result.rows.length === 0) return;

    await pool.query(`
      INSERT INTO sync_queue (entity_type, entity_id, action, data)
      VALUES ('order', $1, $2, $3)
    `, [orderId, action, JSON.stringify(result.rows[0])]);

    syncToCloud();
  } catch (error) {
    console.error('Queue sync error:', error);
  }
}

// Background sync to cloud
async function syncToCloud() {
  if (!CLOUD_SYNC_ENABLED || !SYNC_CLOUD_URL || !SYNC_KEY) return;

  try {
    const pending = await pool.query(`
      SELECT * FROM sync_queue WHERE synced_at IS NULL ORDER BY created_at LIMIT 50
    `);

    if (pending.rows.length === 0) return;

    const orders = pending.rows.filter(r => r.entity_type === 'order').map(r => r.data);
    if (orders.length === 0) return;

    const response = await fetch(`${SYNC_CLOUD_URL}/sync/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Sync-Key': SYNC_KEY },
      body: JSON.stringify({ orders, source: SYNC_SOURCE })
    });

    if (response.ok) {
      await pool.query(`UPDATE sync_queue SET synced_at = NOW() WHERE id = ANY($1)`, [pending.rows.map(r => r.id)]);
      console.log(`Synced ${orders.length} orders to cloud`);
    }
  } catch (error) {
    console.error('Sync to cloud error:', error);
  }
}

// Pull updates from cloud
async function syncFromCloud() {
  if (!CLOUD_SYNC_ENABLED || !SYNC_CLOUD_URL || !SYNC_KEY) return;

  try {
    const lastSyncResult = await pool.query("SELECT value FROM settings WHERE key = 'last_cloud_sync'");
    const lastSync = lastSyncResult.rows[0]?.value || '1970-01-01T00:00:00Z';

    const response = await fetch(`${SYNC_CLOUD_URL}/sync/orders?since=${encodeURIComponent(lastSync)}`, {
      headers: { 'X-Sync-Key': SYNC_KEY }
    });

    if (!response.ok) return;
    const data = await response.json() as { orders?: any[]; timestamp?: string };

    const client = await pool.connect();
    const ordersToPrint: { orderId: number; tableNumber: number; items: any[] }[] = [];

    try {
      await client.query('BEGIN');
      let imported = 0;

      for (const order of data.orders || []) {
        if (order.sync_source === SYNC_SOURCE) continue;

        const existing = await client.query(
          'SELECT id FROM orders WHERE sync_source = $1 AND sync_source_id = $2',
          [order.sync_source || 'cloud', order.id]
        );
        if (existing.rows.length > 0) continue;

        const orderResult = await client.query(`
          INSERT INTO orders (table_number, status, total, payment_method, created_at, sync_source, sync_source_id, synced_at, event_id, event_titel)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9) RETURNING id, table_number, status, total, payment_method, created_at
        `, [order.table_number, order.status, order.total, order.payment_method, order.created_at, order.sync_source || 'cloud', order.id,
            order.event_id || null, order.event_titel || null]);

        const insertedOrder = orderResult.rows[0];
        const insertedItems: any[] = [];

        for (const item of (order.items || [])) {
          const itemResult = await client.query(`
            INSERT INTO order_items (order_id, item_id, item_name, quantity, price, notes, printer_station)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
          `, [insertedOrder.id, item.item_id, item.item_name, item.quantity, item.price, item.notes, item.printer_station]);
          insertedItems.push(itemResult.rows[0]);
        }

        // Queue for printing and broadcasting if order is pending (open)
        if (order.status === 'pending') {
          // Broadcast to kitchen display
          broadcast({
            type: 'new_order',
            order: {
              id: insertedOrder.id,
              table_number: insertedOrder.table_number,
              status: insertedOrder.status,
              total: insertedOrder.total,
              payment_method: insertedOrder.payment_method,
              created_at: insertedOrder.created_at,
              items: insertedItems
            }
          });

          // Queue for printing after transaction commits
          ordersToPrint.push({
            orderId: insertedOrder.id,
            tableNumber: insertedOrder.table_number,
            items: insertedItems
          });
        }

        imported++;
      }

      await client.query(`
        INSERT INTO settings (key, value, updated_at) VALUES ('last_cloud_sync', $1, NOW())
        ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
      `, [data.timestamp]);

      await client.query('COMMIT');

      // Print receipts after successful commit
      for (const orderToPrint of ordersToPrint) {
        try {
          const druckfehler = await printReceipt(orderToPrint.orderId, orderToPrint.tableNumber, orderToPrint.items);
          meldeDruckfehler(druckfehler, orderToPrint.orderId);
          if (druckfehler.length === 0) {
            console.log(`Printed synced order #${orderToPrint.orderId} from cloud`);
          }
        } catch (printError) {
          console.error(`Failed to print synced order #${orderToPrint.orderId}:`, printError);
          meldeDruckfehler([{
            station: 'alle',
            meldung: printError instanceof Error ? printError.message : String(printError),
            art: 'fehler'
          }], orderToPrint.orderId);
        }
      }

      if (imported > 0) console.log(`Imported ${imported} orders from cloud`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Sync from cloud error:', error);
  }
}

// Start periodic sync (every 30 seconds)
if (CLOUD_SYNC_ENABLED) {
  setInterval(() => { syncToCloud(); syncFromCloud(); }, 30000);
}

// Auto-cancel orders older than 2 hours
const ORDER_AUTO_CANCEL_HOURS = parseInt(process.env.ORDER_AUTO_CANCEL_HOURS || '2');
const ORDER_AUTO_CANCEL_MS = ORDER_AUTO_CANCEL_HOURS * 60 * 60 * 1000;

async function autoCancelOldOrders() {
  try {
    const cutoffTime = new Date(Date.now() - ORDER_AUTO_CANCEL_MS).toISOString();

    // Find and cancel old pending orders
    const result = await pool.query(`
      UPDATE orders
      SET status = 'cancelled'
      WHERE status = 'pending'
        AND created_at < $1
      RETURNING id, table_number
    `, [cutoffTime]);

    if (result.rows.length > 0) {
      console.log(`Auto-cancelled ${result.rows.length} orders older than ${ORDER_AUTO_CANCEL_HOURS}h:`,
        result.rows.map(r => `#${r.id}`).join(', '));

      // Broadcast cancellations to kitchen display
      for (const order of result.rows) {
        broadcast({ type: 'order_completed', order_id: order.id });
        // Queue for cloud sync
        queueOrderSync(order.id, 'update');
      }
    }

    // Auto-complete old paid orders (paid but not yet completed after 2h)
    const completedResult = await pool.query(`
      UPDATE orders
      SET status = 'completed'
      WHERE status = 'paid'
        AND created_at < $1
      RETURNING id, table_number
    `, [cutoffTime]);

    if (completedResult.rows.length > 0) {
      console.log(`Auto-completed ${completedResult.rows.length} paid orders older than ${ORDER_AUTO_CANCEL_HOURS}h:`,
        completedResult.rows.map((r: any) => `#${r.id}`).join(', '));

      for (const order of completedResult.rows) {
        broadcast({ type: 'order_completed', order_id: order.id });
        queueOrderSync(order.id, 'update');
      }
    }
  } catch (error) {
    console.error('Auto-cancel error:', error);
  }
}

// Run auto-cancel check every 5 minutes
setInterval(autoCancelOldOrders, 5 * 60 * 1000);
// Also run once at startup (after 30 seconds to let DB initialize)
setTimeout(autoCancelOldOrders, 30000);

// Inventory API integration
const INVENTORY_API_URL = process.env.INVENTORY_API_URL || 'http://inventory-backend:3000';
// Fail-closed (Audit CRITICAL): kein hartkodierter Default mehr. Fehlt der Key,
// bricht der Prozess ab, statt still mit dem oeffentlich bekannten Wert zu laufen.
const ORDER_API_KEY = process.env.ORDER_API_KEY;
if (!ORDER_API_KEY) {
  console.error('FATAL: ORDER_API_KEY nicht gesetzt — interne API-Authentifizierung waere unsicher. Abbruch.');
  process.exit(1);
}

// Kasse vor Ort (T400) und Annahme ihrer Bestellungen in der Cloud - src/vorort.ts
vorOrtEinrichten({
  app, pool, orderApiKey: ORDER_API_KEY, inventoryApiUrl: INVENTORY_API_URL, broadcast, setSetting, getSetting,
  bonDrucken: async (orderId, tableNumber, items) => {
    const f = await printReceipt(orderId, tableNumber, items);
    meldeDruckfehler(f, orderId);
    return f.filter((x) => x.art === 'fehler').map((x) => x.station);
  },
});

// ============================================
// GEMEINSAMES KASSEN-/KUECHEN-PASSWORT (woechentliche Rotation)
// ============================================
const POS_ROTATION_DAYS = parseInt(process.env.POS_ROTATION_DAYS || '7', 10);

// Starkes, gut lesbares Passwort ohne mehrdeutige Zeichen (0/O, 1/l/I).
function generatePosPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(16);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out.match(/.{1,4}/g)!.join('-'); // Format: xxxx-xxxx-xxxx-xxxx
}

// Laedt das aktuelle Passwort, legt es beim ersten Start an und rotiert bei
// Faelligkeit. Im LOCAL_MODE (Vor-Ort-Pi) keine eigene Rotation — dort gilt
// ADMIN_PASSWORD, damit Cloud und Offline nicht auseinanderlaufen.
async function loadOrRotatePosPassword(): Promise<void> {
  if (LOCAL_MODE) return;
  // T400: Passwort der Cloud uebernehmen, keine eigene Rotation.
  if (VOR_ORT) {
    const pw = await cloudPasswortHolen(ORDER_API_KEY!);
    if (pw) setSharedPassword(pw);
    return;
  }
  try {
    const r = await pool.query('SELECT password, rotated_at FROM pos_credentials WHERE id = 1');
    if (r.rows.length === 0) {
      const pw = generatePosPassword();
      await pool.query('INSERT INTO pos_credentials (id, password, rotated_at) VALUES (1, $1, NOW())', [pw]);
      setSharedPassword(pw);
      console.log('POS shared password initialized');
      return;
    }
    const { password, rotated_at } = r.rows[0];
    const ageDays = (Date.now() - new Date(rotated_at).getTime()) / 86400000;
    if (ageDays >= POS_ROTATION_DAYS) {
      const pw = generatePosPassword();
      await pool.query('UPDATE pos_credentials SET password = $1, rotated_at = NOW() WHERE id = 1', [pw]);
      setSharedPassword(pw);
      console.log(`POS shared password rotated (age ${Math.floor(ageDays)}d)`);
    } else {
      setSharedPassword(password);
    }
  } catch (e: any) {
    console.error('POS password load/rotate error:', e.message);
  }
}

// Interner Endpoint: aktuelles Passwort fuer die Anzeige unter "meine Zugaenge".
// Nur mit gueltigem X-Order-API-Key (Container-zu-Container), nie oeffentlich.
app.get('/api/internal/pos-credential', async (req, res) => {
  const key = req.headers['x-order-api-key'];
  if (key !== ORDER_API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  try {
    const r = await pool.query('SELECT password, rotated_at FROM pos_credentials WHERE id = 1');
    if (r.rows.length === 0) return res.status(404).json({ error: 'not initialized' });
    const { password, rotated_at } = r.rows[0];
    const next = new Date(new Date(rotated_at).getTime() + POS_ROTATION_DAYS * 86400000);
    res.json({ password, rotated_at, next_rotation: next.toISOString(), rotation_days: POS_ROTATION_DAYS });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Routes: Items (ONLY from Inventory system)
app.get('/api/items', async (req, res) => {
  try {
    // Fetch all items from inventory system
    const response = await fetch(`${INVENTORY_API_URL}/api/items/sellable`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      console.error('Inventory API returned:', response.status);
      // T400 ohne Internet: letzte gute Liste
      return res.json((await artikelAusSpeicher(getSetting)) || []);
    }

    const inventoryItems = await response.json() as any[];
    // Map inventory items to order system format
    const items = inventoryItems.map((item) => ({
      id: item.id, // Use actual inventory ID (no prefix needed)
      name: item.name,
      price: parseFloat(item.price),
      category: item.category,
      printer_station: item.printer_station || 'bar',
      stock: item.stock,
      source: 'inventory'
    }));

    // Sort by category then name
    items.sort((a, b) => {
      if (a.category !== b.category) {
        return (a.category || '').localeCompare(b.category || '');
      }
      return a.name.localeCompare(b.name);
    });

    await artikelMerken(setSetting, items);
    res.json(items);
  } catch (error) {
    console.error('Inventory API error:', error);
    res.json((await artikelAusSpeicher(getSetting)) || []); // T400: letzte gute Liste
  }
});

// ============================================
// ANLASS (api-events) UND TWINT-QR - siehe src/anlass.ts
// ============================================
// Im Docker-Netz "proxy" heisst der Container fwv-api-events. Die Kasse vor
// Ort (LOCAL_MODE) setzt EVENTS_API_URL=https://api.fwv-raura.ch.
const EVENTS_API_URL = process.env.EVENTS_API_URL || 'http://fwv-api-events:3000';
const anlassErmittler = new AnlassErmittler(
  eventsQuelle({ baseUrl: EVENTS_API_URL, schluessel: ORDER_API_KEY }),
  () => getSetting('kasse_anlass_id'),
);

// Im Hintergrund aktuell halten, damit Bestellungen nie auf api-events
// warten (sie nehmen nur den gemerkten Stand).
function anlassAuffrischen() {
  anlassErmittler.ermitteln()
    .then((stand) => { if (stand.fehler) console.warn('Anlass von api-events:', stand.fehler); })
    .catch(() => {});
}
setTimeout(anlassAuffrischen, 5000);
setInterval(anlassAuffrischen, 60 * 1000);

// TWINT-QR fuer die Zahlung: { url, anlass: {id, titel} | null,
// quelle: 'anlass'|'einstellung'|'standard', modus: 'automatisch'|'manuell' }.
// Reihenfolge (src/anlass.ts twintAntwort): QR des gewaehlten bzw. laufenden
// Anlasses -> settings.twint_qr_url nur falls noch gesetzt (Altbestand) ->
// Vereins-Standard /twint-qr.png. Fehler -> Vereins-Standard.
app.get('/api/twint-qr', async (req, res) => {
  let einstellung: string | null = null;
  try {
    einstellung = await getSetting('twint_qr_url');
  } catch {
    einstellung = null;
  }
  try {
    const stand = await anlassErmittler.ermitteln();
    res.json(twintAntwort(stand, einstellung));
  } catch {
    res.json(twintAntwort({ anlass: null, modus: 'automatisch' }, einstellung));
  }
});

// Bild des Anlass-QR durchreichen. So braucht der Browser der Kasse keine
// zweite Adresse, und api-events muss fuer die Kasse nicht erreichbar sein.
app.get('/api/twint-qr/bild/:eventId', async (req, res) => {
  const { eventId } = req.params;
  if (!UUID_MUSTER.test(eventId)) return res.status(404).json({ error: 'Kein QR-Code' });
  try {
    const r = await fetch(`${EVENTS_API_URL.replace(/\/+$/, '')}/events/${encodeURIComponent(eventId)}/twint-qr`, {
      signal: AbortSignal.timeout(5000),
    });
    const typ = r.headers.get('content-type') || '';
    if (!r.ok || !typ.startsWith('image/')) return res.status(404).json({ error: 'Kein QR-Code' });
    res.setHeader('Content-Type', typ);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch (error: any) {
    console.error('TWINT-QR des Anlasses nicht geladen:', error?.message || error);
    res.status(502).json({ error: 'QR-Code nicht erreichbar' });
  }
});

// Aktueller Anlass fuer Kopfzeile und Einstellungen.
app.get('/api/anlass', async (req, res) => {
  try {
    const stand = await anlassErmittler.ermitteln();
    res.json({
      anlass: stand.anlass,
      modus: stand.modus,
      auswahl: await getSetting('kasse_anlass_id'),
      erreichbar: !stand.fehler,
      // Tische nur bei Anlaessen mit Service (src/anlass.ts hatService).
      hat_service: hatService(stand),
    });
  } catch {
    res.json({ anlass: null, modus: 'automatisch', auswahl: null, erreichbar: false, hat_service: false });
  }
});

// Meistverkaufte Artikel (src/beliebt.ts): { anlass_id, items: [{ item_id,
// anlass, tage30 }] }, beliebteste zuerst. Bei einem Fehler eine leere Liste -
// die Kasse sortiert dann wie bisher nach Namen.
app.get('/api/items/beliebt', async (req, res) => {
  const anlass = anlassErmittler.gemerkt()?.anlass || null;
  try {
    const r = await pool.query(BELIEBT_SQL, [anlass ? anlass.id : null]);
    res.json({ anlass_id: anlass ? anlass.id : null, items: beliebtListe(r.rows) });
  } catch (error: any) {
    console.error('Meistverkaufte Artikel:', error?.message || error);
    res.json({ anlass_id: anlass ? anlass.id : null, items: [] });
  }
});

// Laufende und kommende Anlaesse fuer die Auswahl in den Einstellungen.
app.get('/api/anlass/liste', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const quelle = eventsQuelle({ baseUrl: EVENTS_API_URL, schluessel: ORDER_API_KEY });
    res.json({ anlaesse: await quelle.liste() });
  } catch (error: any) {
    console.error('Anlass-Liste von api-events:', error?.message || error);
    res.status(502).json({ error: 'Anlaesse nicht erreichbar (api-events)', anlaesse: [] });
  }
});

// Auswahl setzen: { event_id: null } = automatisch, sonst ein bestimmter Anlass.
app.put('/api/anlass/auswahl', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const id = req.body?.event_id ? String(req.body.event_id) : '';
  if (id && !UUID_MUSTER.test(id)) return res.status(400).json({ error: 'Ungueltige Anlass-ID' });
  try {
    await setSetting('kasse_anlass_id', id);
    anlassErmittler.leeren();
    const stand = await anlassErmittler.ermitteln();
    res.json({ anlass: stand.anlass, modus: stand.modus, auswahl: id || null, erreichbar: !stand.fehler,
      hat_service: hatService(stand) });
  } catch (error: any) {
    res.status(500).json({ error: `Auswahl nicht gespeichert: ${error?.message || error}` });
  }
});

// Admin routes for items - require authentication (creates in inventory system)
app.post('/api/items', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, price, category, printer_station } = req.body;

    // Create item in inventory system
    const response = await fetch(`${INVENTORY_API_URL}/api/items/from-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Order-API-Key': ORDER_API_KEY,
      },
      body: JSON.stringify({
        name,
        sale_price: price,
        sale_category: category,
        printer_station: printer_station || 'bar'
      })
    });

    if (response.ok) {
      const inventoryItem = await response.json() as any;
      return res.json({
        id: inventoryItem.id,
        name: inventoryItem.name,
        price: inventoryItem.sale_price,
        category: inventoryItem.sale_category,
        printer_station: inventoryItem.printer_station,
        source: 'inventory'
      });
    } else {
      const error = await response.json() as any;
      console.error('Inventory API error:', error);
      return res.status(response.status).json({ error: error.error || 'Failed to create item in inventory' });
    }
  } catch (error) {
    console.error('Inventory API error:', error);
    res.status(500).json({ error: 'Verbindung zum Inventar-System fehlgeschlagen' });
  }
});

// Update item in inventory system
app.put('/api/items/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { name, price, category, printer_station, sellable } = req.body;

    const response = await fetch(`${INVENTORY_API_URL}/api/items/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Order-API-Key': ORDER_API_KEY
      },
      body: JSON.stringify({
        name,
        sale_price: price,
        sale_category: category,
        printer_station: printer_station || 'bar',
        sellable: sellable !== false
      })
    });

    if (response.ok) {
      const item = await response.json() as any;
      res.json(item);
    } else {
      res.status(response.status).json({ error: 'Failed to update item in inventory' });
    }
  } catch (error) {
    console.error('Inventory API error:', error);
    res.status(500).json({ error: 'Verbindung zum Inventar-System fehlgeschlagen' });
  }
});

// Delete item from inventory system
app.delete('/api/items/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const response = await fetch(`${INVENTORY_API_URL}/api/items/${id}`, {
      method: 'DELETE',
      headers: {
        'X-Order-API-Key': ORDER_API_KEY
      }
    });

    if (response.ok) {
      res.json({ success: true });
    } else {
      res.status(response.status).json({ error: 'Failed to delete from inventory' });
    }
  } catch (error) {
    console.error('Inventory API error:', error);
    res.status(500).json({ error: 'Verbindung zum Inventar-System fehlgeschlagen' });
  }
});

// Routes: Orders (item_name and printer_station stored directly in order_items)
app.get('/api/orders', async (req, res) => {
  try {
    // Include 'completed' status for table orders (kitchen confirmed but not yet fully paid)
    const result = await pool.query(`
      SELECT o.*,
        json_agg(
          json_build_object(
            'id', oi.id,
            'item_name', oi.item_name,
            'quantity', oi.quantity,
            'price', oi.price,
            'notes', oi.notes,
            'printer_station', oi.printer_station,
            'paid', COALESCE(oi.paid, false),
            'paid_at', oi.paid_at,
            'completed', COALESCE(oi.completed, false),
            'completed_at', oi.completed_at
          )
        ) FILTER (WHERE oi.id IS NOT NULL) as items,
        COALESCE((SELECT SUM(op.amount) FROM order_payments op WHERE op.order_id = o.id), 0) as paid_amount
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.status IN ('pending', 'paid', 'completed')
        AND o.created_at > NOW() - INTERVAL '24 hours'
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/orders', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { table_number, items } = req.body;

    // Nachgesendete Bestellung (Puffer der Kasse): schon gebucht -> dieselbe
    // Bestellung zurueck, ohne neuen Bon und ohne zweite Lagerbuchung.
    const clientRef = typeof req.body.client_ref === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(req.body.client_ref)
      ? req.body.client_ref : null;
    if (clientRef) {
      const vorhanden = await client.query('SELECT * FROM orders WHERE client_ref = $1', [clientRef]);
      if (vorhanden.rows.length) {
        await client.query('ROLLBACK');
        return res.json({ ...vorhanden.rows[0], druckfehler: [], wiederholt: true });
      }
    }
    // Zeitpunkt der Erfassung auf dem Tablet (nur bei nachgesendeten, hoechstens 24 h alt).
    const erfasst = clientRef && typeof req.body.erfasst_um === 'string' ? new Date(req.body.erfasst_um) : null;
    // ISO in UTC; die DB rechnet in ihre Zeitzone um (wie CURRENT_TIMESTAMP).
    const erfasstUm = erfasst && !isNaN(erfasst.getTime()) && Date.now() - erfasst.getTime() < 86400000 && erfasst.getTime() <= Date.now() + 60000
      ? erfasst.toISOString() : null;

    // Calculate total
    const total = items.reduce((sum: number, item: any) =>
      sum + (item.price * item.quantity), 0
    );

    // Anlass der Bestellung: der gemerkte Stand (src/anlass.ts) - hier wird
    // nie auf api-events gewartet.
    const anlass = anlassErmittler.gemerkt()?.anlass || null;

    // Create order
    const orderResult = await client.query(
      'INSERT INTO orders (table_number, total, event_id, event_titel, client_ref, created_at) VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, CURRENT_TIMESTAMP)) RETURNING *',
      [table_number, total, anlass ? anlass.id : null, anlass ? anlass.titel.substring(0, 255) : null, clientRef, erfasstUm]
    );
    const order = orderResult.rows[0];

    // Add order items (store item_name and printer_station directly)
    // Support both item.name and item.item_name from frontend
    for (const item of items) {
      await client.query(
        'INSERT INTO order_items (order_id, item_id, item_name, quantity, price, notes, printer_station) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [order.id, item.id, anzeigeName(item.item_name || item.name) || null, item.quantity, item.price, item.notes || null, item.printer_station || 'bar']
      );
    }

    await client.query('COMMIT');

    // Reduce inventory stock (all items come from inventory now)
    try {
      const inventoryItems = items.map((item: any) => ({ id: item.id, quantity: item.quantity }));

      // T400: Das Lager bucht die Cloud, wenn die Bestellung dort ankommt.
      if (inventoryItems.length > 0 && !VOR_ORT) {
        await fetch(`${INVENTORY_API_URL}/api/items/sell`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Order-API-Key': ORDER_API_KEY
          },
          body: JSON.stringify({
            items: inventoryItems,
            order_id: order.id,
            order_source: 'kasse'
          })
        });
      }
    } catch (inventoryError) {
      console.error('Failed to update inventory:', inventoryError);
      // Don't fail the order, just log the error
    }

    // Bon drucken. Ein Fehlschlag darf die Bestellung nicht zurueckrollen —
    // sie ist bezahlt und im Buch. Er muss aber sichtbar werden, deshalb
    // reisen die Fehler in der Antwort mit bis in die Oberflaeche.
    let druckfehler: Druckfehler[] = [];
    try {
      druckfehler = await printReceipt(order.id, table_number, items);
    } catch (printError) {
      console.error('Print error:', printError);
      druckfehler = [{
        station: 'alle',
        meldung: printError instanceof Error ? printError.message : String(printError),
        art: 'fehler'
      }];
    }

    meldeDruckfehler(druckfehler, order.id);
    // Druckvermerk fuer den Abgleich (src/vorort.ts): '' = gedruckt, sonst Stationen mit Fehler
    await pool.query('UPDATE orders SET bon_fehler = $1 WHERE id = $2',
      [druckfehler.filter((f) => f.art === 'fehler').map((f) => f.station).join(','), order.id]).catch(() => {});

    // Broadcast to kitchen display
    broadcast({ type: 'new_order', order: { ...order, items } });

    // Queue for cloud sync
    queueOrderSync(order.id, 'create');

    res.json({ ...order, druckfehler });
  } catch (error: any) {
    await client.query('ROLLBACK');
    // Gleiche Referenz gleichzeitig zweimal: die andere Anfrage hat gebucht.
    if (error?.code === '23505' && typeof req.body?.client_ref === 'string') {
      const vorhanden = await pool.query('SELECT * FROM orders WHERE client_ref = $1', [req.body.client_ref]);
      if (vorhanden.rows.length) return res.json({ ...vorhanden.rows[0], druckfehler: [], wiederholt: true });
    }
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

// Get open orders for a specific table
app.get('/api/orders/open/:tableNumber', async (req, res) => {
  try {
    const { tableNumber } = req.params;
    const result = await pool.query(`
      SELECT o.*,
        json_agg(
          json_build_object(
            'id', oi.id,
            'item_name', oi.item_name,
            'quantity', oi.quantity,
            'price', oi.price,
            'notes', oi.notes,
            'printer_station', oi.printer_station,
            'paid', COALESCE(oi.paid, false),
            'paid_at', oi.paid_at
          )
        ) FILTER (WHERE oi.id IS NOT NULL) as items,
        COALESCE((SELECT SUM(op.amount) FROM order_payments op WHERE op.order_id = o.id), 0) as paid_amount
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.status IN ('pending', 'paid') AND o.table_number = $1
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `, [tableNumber]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Add items to an existing order
app.post('/api/orders/:id/items', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const { items } = req.body;

    // Check if order exists and is still pending
    const orderCheck = await client.query(
      'SELECT * FROM orders WHERE id = $1 AND status = $2',
      [id, 'pending']
    );

    if (orderCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found or already closed' });
    }

    const order = orderCheck.rows[0];

    // Calculate additional total
    const additionalTotal = items.reduce((sum: number, item: any) =>
      sum + (item.price * item.quantity), 0
    );

    // Add order items (store item_name and printer_station directly)
    // Support both item.name and item.item_name from frontend
    for (const item of items) {
      await client.query(
        'INSERT INTO order_items (order_id, item_id, item_name, quantity, price, notes, printer_station) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [id, item.id, anzeigeName(item.item_name || item.name) || null, item.quantity, item.price, item.notes || null, item.printer_station || 'bar']
      );
    }

    // Update order total
    const newTotal = parseFloat(order.total) + additionalTotal;
    await client.query(
      'UPDATE orders SET total = $1 WHERE id = $2',
      [newTotal, id]
    );

    await client.query('COMMIT');

    // Reduce inventory stock (all items come from inventory now)
    try {
      const inventoryItems = items.map((item: any) => ({ id: item.id, quantity: item.quantity }));

      // T400: Das Lager bucht die Cloud, wenn die Bestellung dort ankommt.
      if (inventoryItems.length > 0 && !VOR_ORT) {
        await fetch(`${INVENTORY_API_URL}/api/items/sell`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Order-API-Key': ORDER_API_KEY
          },
          body: JSON.stringify({
            items: inventoryItems,
            order_id: id,
            order_source: 'kasse'
          })
        });
      }
    } catch (inventoryError) {
      console.error('Failed to update inventory:', inventoryError);
    }

    // Bon fuer die Nachbestellung. Fehler wie oben: nicht verschlucken.
    let druckfehler: Druckfehler[] = [];
    try {
      druckfehler = await printReceipt(parseInt(id), order.table_number, items);
    } catch (printError) {
      console.error('Print error:', printError);
      druckfehler = [{
        station: 'alle',
        meldung: printError instanceof Error ? printError.message : String(printError),
        art: 'fehler'
      }];
    }

    meldeDruckfehler(druckfehler, parseInt(id));

    // Broadcast update
    broadcast({ type: 'order_updated', order_id: id });

    // Queue for cloud sync
    queueOrderSync(parseInt(id), 'update');

    res.json({ success: true, total: newTotal, druckfehler });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Add items error:', error);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

app.patch('/api/orders/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(
      'UPDATE orders SET status = $1 WHERE id = $2',
      ['completed', id]
    );
    broadcast({ type: 'order_completed', order_id: id });

    // Queue for cloud sync
    queueOrderSync(parseInt(id), 'update');

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Cancel/Stornieren individual order item
// Note: Items can only be cancelled if:
// 1. They are not already paid
// 2. They are not already completed by kitchen
app.delete('/api/orders/:orderId/items/:itemId', async (req, res) => {
  try {
    const { orderId, itemId } = req.params;

    // Check if item exists
    const itemResult = await pool.query(
      'SELECT * FROM order_items WHERE id = $1 AND order_id = $2',
      [itemId, orderId]
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Artikel nicht gefunden' });
    }

    const item = itemResult.rows[0];

    // Von der Kueche bestaetigt: nur mit ausdruecklicher Rueckfrage in der
    // Kasse (?trotz_kueche=1) - z.B. falsch getippt oder nie serviert.
    if (item.completed && req.query.trotz_kueche !== '1') {
      return res.status(400).json({
        error: 'Küche hat diesen Artikel bereits bestätigt - kann nicht mehr storniert werden.'
      });
    }

    // Check if item is paid - cannot cancel
    if (item.paid) {
      return res.status(400).json({ error: 'Bereits bezahlte Artikel können nicht storniert werden' });
    }

    // Delete the item
    await pool.query('DELETE FROM order_items WHERE id = $1', [itemId]);

    // Update order total
    const totalResult = await pool.query(
      'SELECT COALESCE(SUM(price * quantity), 0) as new_total FROM order_items WHERE order_id = $1',
      [orderId]
    );
    const newTotal = totalResult.rows[0].new_total;

    await pool.query('UPDATE orders SET total = $1 WHERE id = $2', [newTotal, orderId]);

    // Check if order has no more items - if so, mark as cancelled
    const remainingItems = await pool.query(
      'SELECT COUNT(*) as count FROM order_items WHERE order_id = $1',
      [orderId]
    );

    if (parseInt(remainingItems.rows[0].count) === 0) {
      await pool.query('UPDATE orders SET status = $1 WHERE id = $2', ['cancelled', orderId]);
      broadcast({ type: 'order_completed', order_id: orderId }); // Remove from display
    } else {
      broadcast({ type: 'order_updated', order_id: orderId, total: newTotal });
    }

    // Queue for cloud sync
    queueOrderSync(parseInt(orderId), 'update');

    res.json({ success: true, message: 'Artikel storniert', new_total: newTotal });
  } catch (error) {
    console.error('Error cancelling item:', error);
    res.status(500).json({ error: 'Fehler beim Stornieren' });
  }
});

// Mark individual order item(s) as completed by kitchen
app.patch('/api/orders/:orderId/items/complete', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { item_ids } = req.body; // Array of item IDs to mark as completed

    if (!item_ids || !Array.isArray(item_ids) || item_ids.length === 0) {
      return res.status(400).json({ error: 'Keine Artikel angegeben' });
    }

    // Mark items as completed
    await pool.query(
      `UPDATE order_items
       SET completed = true, completed_at = NOW()
       WHERE order_id = $1 AND id = ANY($2)`,
      [orderId, item_ids]
    );

    // Check if all items in order are now completed - if so, mark order as completed
    const uncompletedResult = await pool.query(
      `SELECT COUNT(*) as count FROM order_items
       WHERE order_id = $1 AND (completed = false OR completed IS NULL)`,
      [orderId]
    );

    if (parseInt(uncompletedResult.rows[0].count) === 0) {
      await pool.query('UPDATE orders SET status = $1 WHERE id = $2', ['completed', orderId]);
    }

    broadcast({ type: 'items_completed', order_id: orderId, item_ids });

    res.json({ success: true, message: 'Artikel als erledigt markiert' });
  } catch (error) {
    console.error('Error completing items:', error);
    res.status(500).json({ error: 'Fehler beim Markieren als erledigt' });
  }
});

// Update order status with payment method
// Bestellung stornieren (Tisch aufloesen). Bereits erfasste Teilzahlungen
// bleiben in order_payments und damit in der Abrechnung.
app.post('/api/orders/:id/cancel', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Ungueltige Bestellung' });
    const r = await pool.query(
      `UPDATE orders SET status = 'cancelled' WHERE id = $1 AND status <> 'cancelled' RETURNING id`, [id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Bestellung nicht gefunden oder schon storniert' });
    broadcast({ type: 'order_completed', order_id: id });
    broadcast({ type: 'order_updated', order_id: id, status: 'cancelled' });
    res.json({ success: true });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/orders/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, payment_method } = req.body;

    await pool.query(
      'UPDATE orders SET status = $1, payment_method = $2 WHERE id = $3',
      [status || 'paid', payment_method || null, id]
    );

    broadcast({ type: 'order_updated', order_id: id, status, payment_method });

    // Queue for cloud sync
    queueOrderSync(parseInt(id), 'update');

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Order history (for admin view)
app.get('/api/orders/history', async (req, res) => {
  try {
    const { date, status, anlass, limit = 100 } = req.query;

    let query = `
      SELECT o.*,
        json_agg(
          json_build_object(
            'id', oi.id,
            'item_name', COALESCE(oi.item_name, 'Unbekannt'),
            'quantity', oi.quantity,
            'price', oi.price,
            'notes', oi.notes
          )
        ) FILTER (WHERE oi.id IS NOT NULL) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
    `;
    const params: any[] = [];

    const conditions: string[] = [];

    if (date) {
      params.push(date);
      conditions.push(`DATE(o.created_at) = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`o.status = $${params.length}`);
    }

    // Nach Anlass filtern: ?anlass=<event_id>, ?anlass=ohne fuer Bestellungen ohne Anlass
    if (anlass === 'ohne') {
      conditions.push('o.event_id IS NULL');
    } else if (anlass) {
      params.push(String(anlass));
      conditions.push(`o.event_id = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' GROUP BY o.id ORDER BY o.created_at DESC';

    params.push(limit);
    query += ` LIMIT $${params.length}`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Anlaesse, zu denen es Bestellungen gibt (Filter in der History), mit Umsatz.
app.get('/api/orders/history/anlaesse', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT event_id, MAX(event_titel) AS event_titel, COUNT(*)::int AS bestellungen,
             COALESCE(SUM(total) FILTER (WHERE status IN ('paid', 'completed')), 0) AS umsatz,
             MAX(created_at) AS zuletzt
        FROM orders
       WHERE event_id IS NOT NULL
       GROUP BY event_id
       ORDER BY MAX(created_at) DESC`);
    res.json(r.rows);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ============================================
// SPLIT PAYMENT & PER-ITEM PAYMENT ENDPOINTS
// ============================================

// Get order details with payment status per item
app.get('/api/orders/:id/details', async (req, res) => {
  try {
    const { id } = req.params;

    // Get order with items and their paid status
    const orderResult = await pool.query(`
      SELECT o.*,
        json_agg(
          json_build_object(
            'id', oi.id,
            'item_name', oi.item_name,
            'quantity', oi.quantity,
            'price', oi.price,
            'notes', oi.notes,
            'printer_station', oi.printer_station,
            'paid', COALESCE(oi.paid, false),
            'paid_at', oi.paid_at,
            'payment_id', oi.payment_id
          )
        ) FILTER (WHERE oi.id IS NOT NULL) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.id = $1
      GROUP BY o.id
    `, [id]);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    }

    const order = orderResult.rows[0];

    // Get all partial payments for this order
    const paymentsResult = await pool.query(`
      SELECT * FROM order_payments WHERE order_id = $1 ORDER BY created_at DESC
    `, [id]);

    // Calculate totals
    const items = order.items || [];
    const totalAmount = items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
    const paidAmount = items.filter((item: any) => item.paid).reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
    const unpaidAmount = totalAmount - paidAmount;

    res.json({
      ...order,
      payments: paymentsResult.rows,
      total_amount: totalAmount,
      paid_amount: paidAmount,
      unpaid_amount: unpaidAmount,
      fully_paid: unpaidAmount <= 0
    });
  } catch (error) {
    console.error('Order details error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get unpaid items for an order
app.get('/api/orders/:id/unpaid-items', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT id, item_name, quantity, price, notes, printer_station
      FROM order_items
      WHERE order_id = $1 AND (paid = false OR paid IS NULL)
      ORDER BY id
    `, [id]);

    const items = result.rows;
    const totalUnpaid = items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);

    res.json({
      items,
      total_unpaid: totalUnpaid
    });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Pay specific items (mark items as paid)
app.post('/api/orders/:id/pay-items', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const { item_ids, payment_method, description } = req.body;

    if (!item_ids || !Array.isArray(item_ids) || item_ids.length === 0) {
      return res.status(400).json({ error: 'item_ids muss ein Array mit mindestens einem Artikel sein' });
    }

    // Verify items belong to this order and are not already paid
    const itemsCheck = await client.query(`
      SELECT id, item_name, quantity, price, paid
      FROM order_items
      WHERE order_id = $1 AND id = ANY($2)
    `, [id, item_ids]);

    if (itemsCheck.rows.length !== item_ids.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Einige Artikel gehören nicht zu dieser Bestellung' });
    }

    const alreadyPaid = itemsCheck.rows.filter((item: any) => item.paid);
    if (alreadyPaid.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Einige Artikel wurden bereits bezahlt',
        already_paid: alreadyPaid.map((item: any) => item.item_name)
      });
    }

    // Calculate payment amount
    const paymentAmount = itemsCheck.rows.reduce((sum: number, item: any) =>
      sum + (item.price * item.quantity), 0);

    // Create payment record
    const paymentResult = await client.query(`
      INSERT INTO order_payments (order_id, amount, payment_method, description)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [id, paymentAmount, payment_method || 'cash', description || null]);

    const payment = paymentResult.rows[0];

    // Mark items as paid
    await client.query(`
      UPDATE order_items
      SET paid = true, paid_at = NOW(), payment_id = $1
      WHERE id = ANY($2)
    `, [payment.id, item_ids]);

    // Check if all items are now paid
    const unpaidCheck = await client.query(`
      SELECT COUNT(*) as unpaid_count FROM order_items
      WHERE order_id = $1 AND (paid = false OR paid IS NULL)
    `, [id]);

    const allPaid = parseInt(unpaidCheck.rows[0].unpaid_count) === 0;

    // If all items paid, update order status
    if (allPaid) {
      await client.query(`
        UPDATE orders SET status = 'paid', payment_method = $2 WHERE id = $1
      `, [id, payment_method || 'split']);
    }

    await client.query('COMMIT');

    // Broadcast update
    broadcast({
      type: 'order_updated',
      order_id: id,
      payment: payment,
      all_paid: allPaid
    });

    // Queue for cloud sync
    queueOrderSync(parseInt(id), 'update');

    res.json({
      success: true,
      payment: payment,
      paid_items: itemsCheck.rows.map((item: any) => item.item_name),
      all_paid: allPaid
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Pay items error:', error);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

// Split payment - pay a specific amount (not tied to specific items)
app.post('/api/orders/:id/split-payment', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const { amount, payment_method, description } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Betrag muss grösser als 0 sein' });
    }

    // Get order and calculate remaining amount
    const orderResult = await client.query(`
      SELECT o.id, o.total, o.status,
        COALESCE(SUM(op.amount), 0) as already_paid
      FROM orders o
      LEFT JOIN order_payments op ON o.id = op.order_id
      WHERE o.id = $1
      GROUP BY o.id
    `, [id]);

    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    }

    const order = orderResult.rows[0];
    const remaining = parseFloat(order.total) - parseFloat(order.already_paid);

    if (amount > remaining + 0.01) { // Small tolerance for rounding
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Betrag übersteigt den offenen Betrag',
        remaining: remaining.toFixed(2)
      });
    }

    // Create payment record
    const paymentResult = await client.query(`
      INSERT INTO order_payments (order_id, amount, payment_method, description)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [id, amount, payment_method || 'cash', description || null]);

    const payment = paymentResult.rows[0];

    // Check if order is fully paid
    const newRemaining = remaining - amount;
    const allPaid = newRemaining <= 0.01;

    if (allPaid) {
      await client.query(`
        UPDATE orders SET status = 'paid', payment_method = 'split' WHERE id = $1
      `, [id]);
    }

    await client.query('COMMIT');

    // Broadcast update
    broadcast({
      type: 'order_updated',
      order_id: id,
      payment: payment,
      all_paid: allPaid
    });

    // Queue for cloud sync
    queueOrderSync(parseInt(id), 'update');

    res.json({
      success: true,
      payment: payment,
      remaining: Math.max(0, newRemaining).toFixed(2),
      all_paid: allPaid
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Split payment error:', error);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

// Get all payments for an order (split payments)
app.get('/api/orders/:id/payments', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT op.*,
        json_agg(
          json_build_object(
            'id', oi.id,
            'item_name', oi.item_name,
            'quantity', oi.quantity,
            'price', oi.price
          )
        ) FILTER (WHERE oi.id IS NOT NULL) as paid_items
      FROM order_payments op
      LEFT JOIN order_items oi ON oi.payment_id = op.id
      WHERE op.order_id = $1
      GROUP BY op.id
      ORDER BY op.created_at DESC
    `, [id]);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Daily statistics
app.get('/api/stats/daily', async (req, res) => {
  try {
    // Business day runs from 12:00 to 12:00 next day
    const now = new Date();
    const currentHour = now.getHours();

    // If before 12:00, the business day started yesterday at 12:00
    // If after 12:00, the business day started today at 12:00
    const startDate = new Date(now);
    if (currentHour < 12) {
      startDate.setDate(startDate.getDate() - 1);
    }
    startDate.setHours(12, 0, 0, 0);

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);

    // Format for display (the date when the business day started)
    const displayDate = startDate.toISOString().split('T')[0];

    const result = await pool.query(`
      SELECT
        COUNT(*) as total_orders,
        COALESCE(SUM(total), 0) as total_revenue,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_orders,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders
      FROM orders
      WHERE created_at >= $1 AND created_at < $2
    `, [startDate.toISOString(), endDate.toISOString()]);

    // Best selling items for this business day
    const itemsResult = await pool.query(`
      SELECT
        COALESCE(${anzeigeNameSql('oi.item_name')}, 'Sonderposten') as name,
        SUM(oi.quantity) as total_sold,
        SUM(oi.quantity * oi.price) as total_revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.created_at >= $1 AND o.created_at < $2
      GROUP BY ${anzeigeNameSql('oi.item_name')}
      ORDER BY total_sold DESC
      LIMIT 10
    `, [startDate.toISOString(), endDate.toISOString()]);

    res.json({
      date: displayDate,
      summary: result.rows[0],
      top_items: itemsResult.rows
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Send daily report via email
app.post('/api/stats/send-report', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const userEmail = req.user?.email;
    if (!userEmail) {
      return res.status(400).json({ error: 'Keine E-Mail-Adresse im Token gefunden' });
    }

    // Get current business day stats (12:00-12:00)
    const now = new Date();
    const currentHour = now.getHours();
    const startDate = new Date(now);
    if (currentHour < 12) {
      startDate.setDate(startDate.getDate() - 1);
    }
    startDate.setHours(12, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);
    const displayDate = startDate.toISOString().split('T')[0];

    // Get summary
    const summaryResult = await pool.query(`
      SELECT
        COUNT(*) as total_orders,
        COALESCE(SUM(total), 0) as total_revenue,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_orders,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders
      FROM orders
      WHERE created_at >= $1 AND created_at < $2
    `, [startDate.toISOString(), endDate.toISOString()]);

    // Get payment breakdown
    const paymentResult = await pool.query(`
      SELECT
        COALESCE(payment_method, 'unbekannt') as payment_method,
        COUNT(*) as count,
        COALESCE(SUM(total), 0) as total
      FROM orders
      WHERE created_at >= $1 AND created_at < $2 AND status = 'paid'
      GROUP BY payment_method
    `, [startDate.toISOString(), endDate.toISOString()]);

    // Get top items
    const itemsResult = await pool.query(`
      SELECT
        COALESCE(${anzeigeNameSql('oi.item_name')}, 'Sonderposten') as name,
        SUM(oi.quantity) as total_sold,
        SUM(oi.quantity * oi.price) as total_revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.created_at >= $1 AND o.created_at < $2
      GROUP BY ${anzeigeNameSql('oi.item_name')}
      ORDER BY total_sold DESC
      LIMIT 10
    `, [startDate.toISOString(), endDate.toISOString()]);

    const summary = summaryResult.rows[0];
    const topItems = itemsResult.rows;
    const payments = paymentResult.rows;

    // Format email content
    const paymentLines = payments.map((p: any) =>
      `  ${p.payment_method === 'cash' ? 'Bar' : p.payment_method === 'sumup' ? 'SumUp' : p.payment_method}: ${p.count}x = CHF ${parseFloat(p.total).toFixed(2)}`
    ).join('\n');

    const itemLines = topItems.map((item: any, i: number) =>
      `  ${i + 1}. ${item.name} - ${item.total_sold}x = CHF ${parseFloat(item.total_revenue).toFixed(2)}`
    ).join('\n');

    const emailBody = `
TAGESBERICHT KASSE
==================
Datum: ${displayDate} (12:00 - 12:00)

ZUSAMMENFASSUNG
---------------
Bestellungen: ${summary.total_orders}
Umsatz: CHF ${parseFloat(summary.total_revenue).toFixed(2)}
Bezahlt: ${summary.paid_orders}
Offen: ${summary.pending_orders}

${payments.length > 0 ? `ZAHLUNGSARTEN\n-------------\n${paymentLines}\n` : ''}
${topItems.length > 0 ? `MEISTVERKAUFTE ARTIKEL\n----------------------\n${itemLines}` : ''}

--
Feuerwehrverein Raura - Kassensystem
    `.trim();

    // Send via main API email endpoint
    const emailApiUrl = process.env.EMAIL_API_URL || 'https://www.fwv-raura.ch/api/email/send';

    const emailResponse = await fetch(emailApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: userEmail,
        subject: `Tagesbericht Kasse - ${displayDate}`,
        body: emailBody
      })
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error('Email API error:', errorText);
      return res.status(500).json({ error: 'E-Mail konnte nicht gesendet werden' });
    }

    console.log(`Daily report sent to ${userEmail}`);
    res.json({ success: true, sentTo: userEmail });
  } catch (error) {
    console.error('Send report error:', error);
    res.status(500).json({ error: 'Fehler beim Senden des Berichts' });
  }
});

// Settings API endpoints
app.get('/api/settings', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await pool.query('SELECT key, value FROM settings');
    const settings: { [key: string]: string } = {};
    result.rows.forEach(row => {
      settings[row.key] = row.value;
    });
    res.json(settings);
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Einstellungen' });
  }
});

app.put('/api/settings', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const settings = req.body;

    for (const [key, value] of Object.entries(settings)) {
      // Die Anlass-Auswahl hat ihre eigene Route (PUT /api/anlass/auswahl).
      // Das Formular schickt alle geladenen Einstellungen zurueck - sonst
      // ueberschriebe ein alter Stand die gerade getroffene Auswahl.
      if (key === 'kasse_anlass_id') continue;
      await setSetting(key, String(value));
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Save settings error:', error);
    res.status(500).json({ error: 'Fehler beim Speichern der Einstellungen' });
  }
});

// Test printer connection
app.post('/api/settings/test-printer', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { station, ip, port, protocol } = req.body;

    if (!ip) {
      return res.status(400).json({ error: 'IP-Adresse erforderlich' });
    }

    const printerConfig = { ip, port: parseInt(port) || 9100, protocol: protocol || 'raw' };

    // Try to print a test receipt
    await printToNetworkPrinter(printerConfig, station || 'test', 0, 0, [
      { quantity: 1, item_name: 'DRUCKER TEST', notes: 'Verbindung erfolgreich!' }
    ]);

    res.json({ success: true, message: `Testdruck an ${ip} gesendet` });
  } catch (error: any) {
    console.error('Test printer error:', error);
    res.status(500).json({ error: `Drucker nicht erreichbar: ${error.message}` });
  }
});

// Upload TWINT QR code - saves locally or to Nextcloud.
// Altbestand (Oktober 2026): Die Oberflaeche bietet das nicht mehr an. Der
// QR kommt vom Anlass (api-events), sonst gilt der Vereins-Standard
// /twint-qr.png. Ein hier gesetztes Bild gilt nur, solange es gesetzt ist.
app.post('/api/settings/upload-twint-qr', authenticateToken, upload.single('qrcode'), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Keine Datei hochgeladen' });
    }

    const ext = req.file.mimetype.split('/')[1] || 'png';
    const filename = `twint-qr.${ext}`;

    // Save file locally
    const filePath = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(filePath, req.file.buffer);
    const localUrl = `/api/uploads/${filename}`;

    // Save URL to settings
    await setSetting('twint_qr_url', localUrl);

    // Also try Nextcloud upload if configured (non-blocking)
    if (NEXTCLOUD_PASSWORD) {
      try {
        const ncFilename = `twint-qr-${Date.now()}.${ext}`;
        const uploadPath = `${NEXTCLOUD_UPLOAD_FOLDER}/${ncFilename}`;
        const webdavUrl = `${NEXTCLOUD_URL}/remote.php/dav/files/${NEXTCLOUD_USER}${uploadPath}`;

        const folderUrl = `${NEXTCLOUD_URL}/remote.php/dav/files/${NEXTCLOUD_USER}${NEXTCLOUD_UPLOAD_FOLDER}`;
        await fetch(folderUrl, {
          method: 'MKCOL',
          headers: {
            'Authorization': `Basic ${Buffer.from(`${NEXTCLOUD_USER}:${NEXTCLOUD_PASSWORD}`).toString('base64')}`
          }
        }).catch(() => {});

        await fetch(webdavUrl, {
          method: 'PUT',
          headers: {
            'Authorization': `Basic ${Buffer.from(`${NEXTCLOUD_USER}:${NEXTCLOUD_PASSWORD}`).toString('base64')}`,
            'Content-Type': req.file.mimetype
          },
          body: req.file.buffer
        });
        console.log('TWINT QR also uploaded to Nextcloud');
      } catch (ncError) {
        console.log('Nextcloud upload skipped (not critical):', ncError);
      }
    }

    res.json({
      success: true,
      url: localUrl,
      message: 'QR-Code erfolgreich gespeichert'
    });

  } catch (error: any) {
    console.error('Upload error:', error);
    res.status(500).json({ error: `Upload fehlgeschlagen: ${error.message}` });
  }
});

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Helper to get client IP (handles reverse proxy headers)
function getClientIp(req: any): string {
  // Cloudflare sets this header
  const cfConnectingIp = req.headers['cf-connecting-ip'];
  if (cfConnectingIp) {
    return cfConnectingIp.trim();
  }

  // Traefik and other proxies set these headers
  const xRealIp = req.headers['x-real-ip'];
  if (xRealIp) {
    return xRealIp.trim();
  }

  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // Take the first IP (original client)
    return forwarded.split(',')[0].trim();
  }

  // Express's req.ip when trust proxy is enabled
  if (req.ip && !req.ip.startsWith('172.') && !req.ip.startsWith('10.') && !req.ip.startsWith('192.168.')) {
    return req.ip.replace(/^::ffff:/, '');
  }

  // Fallback to direct connection IP
  const remoteAddr = req.socket?.remoteAddress || req.ip || 'unknown';
  // Remove IPv6 prefix if present (::ffff:192.168.1.1 -> 192.168.1.1)
  return remoteAddr.replace(/^::ffff:/, '');
}

// Get printer configuration (from database first, fallback to env vars)
async function getPrinterConfig(): Promise<{ [key: string]: { ip: string; port: number; protocol: string } | null }> {
  const barIp = await getSetting('printer_bar_ip') || process.env.PRINTER_BAR_IP;
  const barPort = await getSetting('printer_bar_port') || process.env.PRINTER_BAR_PORT || '9100';
  const barProtocol = await getSetting('printer_bar_protocol') || process.env.PRINTER_BAR_PROTOCOL || 'raw';
  const kitchenIp = await getSetting('printer_kitchen_ip') || process.env.PRINTER_KITCHEN_IP;
  const kitchenPort = await getSetting('printer_kitchen_port') || process.env.PRINTER_KITCHEN_PORT || '9100';
  const kitchenProtocol = await getSetting('printer_kitchen_protocol') || process.env.PRINTER_KITCHEN_PROTOCOL || 'raw';

  return {
    bar: barIp ? { ip: barIp, port: parseInt(barPort), protocol: barProtocol } : null,
    kitchen: kitchenIp ? { ip: kitchenIp, port: parseInt(kitchenPort), protocol: kitchenProtocol } : null
  };
}

// Import escpos for network printing
import escpos from 'escpos';
import Network from 'escpos-network';

// Tischnummer als lesbaren Text (0 = Bar)
function tableLabel(tableNumber: number): string {
  return tableNumber === 0 ? 'BAR' : `TISCH ${tableNumber}`;
}

// escapeXml und bonUmbruch stehen in src/bon.ts (getestet).

// Vereinslogo als ePOS-Rasterbild (einmal geladen). null-sicher.
let bonLogoCache: string | null = null;
function bonLogoXml(): string {
  if (bonLogoCache !== null) return bonLogoCache;
  bonLogoCache = '';
  try {
    const datei = path.join(process.cwd(), 'assets', 'logo-bon.json');
    if (fs.existsSync(datei)) {
      const l = JSON.parse(fs.readFileSync(datei, 'utf8'));
      if (Number.isInteger(l.width) && Number.isInteger(l.height) && typeof l.raster === 'string') {
        bonLogoCache = `<text align="center"/><image width="${l.width}" height="${l.height}" color="color_1" mode="mono">${l.raster}</image><text>&#10;</text>`;
      }
    }
  } catch (err) {
    console.error('Bon-Logo nicht lesbar:', err);
  }
  return bonLogoCache;
}

// ePOS-Print-Inhalt (<text/>, <image/>, <cut/> ...) in die SOAP-Huelle packen
// und per HTTPS an den Drucker schicken.
function eposHuelle(inhalt: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">
${inhalt}
    </epos-print>
  </s:Body>
</s:Envelope>`;
}

function eposSenden(ip: string, station: string, eposXml: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: ip,
      port: 443,
      path: '/cgi-bin/epos/service.cgi?devid=local_printer&timeout=30000',
      method: 'POST',
      rejectUnauthorized: false,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(eposXml),
        'SOAPAction': '""'
      }
    };

    const req = https.request(options, (res: any) => {
      let data = '';
      res.on('data', (chunk: any) => data += chunk);
      res.on('end', () => {
        if (data.includes('success="true"')) {
          console.log(`Printed to ${station} printer via ePOS (${ip})`);
          resolve();
        } else {
          const codeMatch = data.match(/code="([^"]+)"/);
          reject(new Error(`ePOS print failed: ${codeMatch ? codeMatch[1] : 'unknown error'}`));
        }
      });
    });

    req.on('error', (e: any) => reject(e));
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('ePOS print timeout')); });
    req.write(eposXml);
    req.end();
  });
}


// Print via Epson ePOS-Print (HTTPS/XML) - fuer TM-m30III und neuere Modelle
async function printViaEpos(
  ip: string,
  station: string,
  orderId: number,
  tableNumber: number,
  items: any[]
): Promise<void> {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('de-CH');

  let itemsXml = '';
  items.forEach((item: any) => {
    // Doppelte Breite: 24 Zeichen pro Zeile (80-mm-Drucker). Umbruch zwischen
    // Woertern statt mitten im Wort, Folgezeilen unter dem Namen eingerueckt.
    const zeilen = bonUmbruch(item.quantity + 'x ', anzeigeName(item.item_name), 24);
    itemsXml += `<text em="true" width="2" height="2"/><text>${zeilen.map(escapeXml).join('&#10;')}&#10;</text>`;
    if (item.notes) {
      itemsXml += `<text em="false" width="1" height="2"/><text>  -&gt; ${escapeXml(item.notes)}&#10;</text>`;
    }
  });

  // Vereinslogo oben auf jedem Bon (assets/logo-bon.json: fertiges
  // 1-Bit-Rasterbild fuer ePOS, aus images/logo.png erzeugt). Fehlt die
  // Datei, wird ohne Logo gedruckt.
  const logoXml = bonLogoXml();

  // Bar und Kueche drucken auf denselben Drucker: der Kuechen-Bon traegt
  // gross "KUECHE". "BAR" (Tisch 0) wird nicht mehr gedruckt, nur "TISCH n".
  const kopfZeilen: string[] = [];
  if (station === 'kitchen') kopfZeilen.push('KÜCHE');
  if (tableNumber !== 0) kopfZeilen.push(tableLabel(tableNumber));
  const kopfXml = kopfZeilen.map((z) =>
    `<text align="center" font="font_a" em="true" width="3" height="3"/><text>${escapeXml(z)}&#10;</text>`
  ).join('');

  const eposXml = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">
      ${logoXml}
      ${kopfXml}
      <text align="center" width="1" height="1" em="false"/>
      <text>&#10;</text>
      <text align="left" width="1" height="2"/>
      <text>Bestell-Nr: ${bestellNr(orderId)}&#10;</text>
      <text>${escapeXml(dateStr)} ${escapeXml(timeStr)}&#10;</text>
      <text width="1" height="1"/>
      <text>================================&#10;</text>
      ${itemsXml}
      <text em="false" width="1" height="1"/>
      <text>================================&#10;</text>
      ${tableNumber !== 0 ? `<text>&#10;</text><text align="center" em="true" width="3" height="3"/><text>${escapeXml(tableLabel(tableNumber))}&#10;</text><text width="1" height="1"/>` : ''}
      <feed line="3"/>
      <cut type="feed"/>
    </epos-print>
  </s:Body>
</s:Envelope>`;

  return eposSenden(ip, station, eposXml);
}

// Print via Raw TCP (ESC/POS) - fuer TM-T20III und aeltere Modelle
async function printViaRawTcp(
  printerConfig: { ip: string; port: number },
  station: string,
  orderId: number,
  tableNumber: number,
  items: any[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const device = new Network(printerConfig.ip, printerConfig.port);
    const printer = new escpos.Printer(device);

    device.open((err: any) => {
      if (err) {
        console.error(`Printer ${station} (${printerConfig.ip}) connection error:`, err);
        reject(err);
        return;
      }

      try {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
        const dateStr = now.toLocaleDateString('de-CH');

        printer
          .font('a')
          .align('ct')
          .style('b')
          .size(2, 2)
          .text(tableLabel(tableNumber))
          .size(1, 1)
          .text('')
          .align('lt')
          .style('normal')
          .text(`Bestellung: ${bestellNr(orderId)}`)
          .text(`Zeit: ${dateStr} ${timeStr}`)
          .text(`Station: ${station.toUpperCase()}`)
          .text('--------------------------------')
          .style('b');

        items.forEach((item: any) => {
          printer.text(`${item.quantity}x ${anzeigeName(item.item_name)}`);
          if (item.notes) {
            printer.style('normal').text(`   -> ${item.notes}`).style('b');
          }
        });

        printer
          .text('--------------------------------')
          .text('')
          .align('ct')
          .size(2, 2)
          .text(tableLabel(tableNumber))
          .size(1, 1)
          .text('')
          .cut()
          .close(() => {
            console.log(`Printed to ${station} printer (${printerConfig.ip})`);
            resolve();
          });
      } catch (printError) {
        console.error('Print formatting error:', printError);
        device.close(() => {});
        reject(printError);
      }
    });
  });
}

// Print to a specific network printer (dispatches to ePOS or Raw TCP)
async function printToNetworkPrinter(
  printerConfig: { ip: string; port: number; protocol?: string },
  station: string,
  orderId: number,
  tableNumber: number,
  items: any[]
): Promise<void> {
  if (printerConfig.protocol === 'epos') {
    return printViaEpos(printerConfig.ip, station, orderId, tableNumber, items);
  }
  return printViaRawTcp(printerConfig, station, orderId, tableNumber, items);
}

// Ergebnis eines Druckauftrags. Frueher hat printReceipt Fehler nur auf die
// Konsole geschrieben und ist stillschweigend weitergelaufen: Die Bestellung
// galt als erledigt, an der Bar wusste niemand davon, und der Gast wartete auf
// ein Bier, dessen Bon nie gedruckt wurde. Jetzt wandern die Fehler bis in die
// Oberflaeche.
export interface Druckfehler {
  station: string;
  meldung: string;
  // 'fehler'      = Drucker war eingerichtet, hat aber abgelehnt oder
  //                 nicht geantwortet
  // 'kein-drucker' = fuer diese Station ist gar kein Drucker hinterlegt,
  //                 es wurde also nichts gedruckt
  art: 'fehler' | 'kein-drucker';
}

// Printer function (ESC/POS)
async function printReceipt(orderId: number, tableNumber: number, items: any[]): Promise<Druckfehler[]> {
  const druckfehler: Druckfehler[] = [];
  try {
    // Get printer configuration from database
    const printerConfigs = await getPrinterConfig();

    // Group items by printer station
    const stations = items.reduce((acc: any, item: any) => {
      const station = item.printer_station || 'bar';
      if (!acc[station]) acc[station] = [];
      acc[station].push(item);
      return acc;
    }, {});

    // For each station, print a receipt
    for (const [station, stationItems] of Object.entries(stations)) {
      const printerConfig = printerConfigs[station];

      if (printerConfig) {
        // Print to network printer
        try {
          await printToNetworkPrinter(printerConfig, station, orderId, tableNumber, stationItems as any[]);
        } catch (printErr) {
          console.error(`Failed to print to ${station}:`, printErr);
          // Andere Stationen trotzdem bedienen — ein defekter Kuechendrucker
          // darf den Bon fuer die Bar nicht verhindern. Gemeldet wird er aber.
          druckfehler.push({
            station,
            meldung: printErr instanceof Error ? printErr.message : String(printErr),
            art: 'fehler'
          });
        }
      } else {
        // Fallback: Log to console if no printer configured
        console.log(`\n=== PRINT TO ${station.toUpperCase()} (No printer configured) ===`);
        console.log(`Table: ${tableNumber}`);
        console.log(`Order: #${orderId}`);
        console.log(`Time: ${new Date().toLocaleTimeString()}`);
        console.log('---');

        (stationItems as any[]).forEach((item: any) => {
          console.log(`${item.quantity}x ${anzeigeName(item.item_name)}`);
          if (item.notes) console.log(`   Note: ${item.notes}`);
        });

        console.log('===========================\n');

        // Auch das ist eine Nichtlieferung: Fuer diese Station ist kein
        // Drucker hinterlegt, der Bon existiert nur in der Container-Konsole.
        druckfehler.push({
          station,
          meldung: 'Kein Drucker eingerichtet',
          art: 'kein-drucker'
        });
      }
    }

    return druckfehler;

  } catch (error) {
    console.error('Print error:', error);
    throw error;
  }
}

// Meldet Druckfehler an alle offenen Bildschirme (Kasse, Kuechendisplay).
// Zusaetzlich zur Antwort auf die Bestellung: Wer die Bestellung nicht selbst
// ausgeloest hat, erfaehrt sonst nichts davon — und beim Nachdruck aus der
// Cloud gibt es ueberhaupt keine Antwort, an die sich etwas haengen liesse.
function meldeDruckfehler(druckfehler: Druckfehler[], orderId: number) {
  if (!druckfehler || druckfehler.length === 0) return;
  for (const f of druckfehler) {
    console.error(`Bestellung #${orderId}: Bon fuer "${f.station}" nicht gedruckt — ${f.meldung}`);
  }
  broadcast({ type: 'print_failed', order_id: orderId, druckfehler });
}

// Payment Service
const paymentService = new PaymentService();

// Routes: Terminal Status & Pairing
// ---------------------------------------------------------------------------
// Rezepte auf den Bondrucker (Oktober 2026)
//
// Rezepte liegen im Inventar. Gedruckt wird aus dem Inventar heraus (Rezept
// bzw. Rezepte eines Anlasses); das Inventar-Backend ruft dazu diesen
// internen Endpoint auf, weil nur die Kasse den Bondrucker (WireGuard) kennt.
//   POST /api/internal/rezepte/:id/drucken  { station?: 'kitchen'|'bar', anzahl?, anlass? }
//   nur mit X-Order-API-Key (Container-zu-Container)
// Bon-Aufbau: src/bon.ts (rezeptBonXml / rezeptBonText).
// ---------------------------------------------------------------------------

function inventarHolen(pfad: string): Promise<any> {
  return fetch(`${INVENTORY_API_URL}${pfad}`, {
    headers: { 'X-Order-API-Key': ORDER_API_KEY!, Accept: 'application/json' },
    signal: AbortSignal.timeout(6000),
  }) as any;
}

// Textfassung auf einen raw/ESC-POS-Drucker.
function rezeptViaRawTcp(printerConfig: { ip: string; port: number }, zeilen: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const device = new Network(printerConfig.ip, printerConfig.port);
    const printer = new escpos.Printer(device);
    device.open((err: any) => {
      if (err) { reject(err); return; }
      try {
        printer.font('a').align('ct').style('b').size(2, 2).text(zeilen[0]).size(1, 1).align('lt').style('normal');
        for (const z of zeilen.slice(1)) printer.text(z);
        printer.text('').cut().close(() => resolve());
      } catch (e) {
        device.close(() => {});
        reject(e);
      }
    });
  });
}

app.post('/api/internal/rezepte/:rezeptId/drucken', async (req, res) => {
  if (req.headers['x-order-api-key'] !== ORDER_API_KEY) return res.status(401).json({ error: 'Invalid API key' });
  const id = Number(req.params.rezeptId);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Ungueltige Rezept-Nummer' });
  const station = req.body?.station === undefined || req.body?.station === null || req.body?.station === ''
    ? 'kitchen' : req.body.station;
  if (station !== 'kitchen' && station !== 'bar') return res.status(400).json({ error: 'Station muss kitchen oder bar sein' });
  const faktor = faktorPruefen(req.body?.anzahl);
  if (faktor === null) return res.status(400).json({ error: 'Anzahl muss eine Zahl zwischen 0 und 100 sein' });

  let rezept;
  try {
    const r = await inventarHolen(`/api/recipes/${id}`);
    if (r.status === 404) return res.status(404).json({ error: 'Rezept nicht gefunden' });
    if (!r.ok) throw new Error(`Inventar antwortete ${r.status}`);
    const roh: any = await r.json();
    if (roh && roh.active === false) return res.status(404).json({ error: 'Rezept nicht gefunden' });
    rezept = rezeptAusInventar(roh);
    if (!rezept) return res.status(404).json({ error: 'Rezept nicht gefunden' });
  } catch (err: any) {
    console.error('Rezept holen:', err?.message || err);
    return res.status(502).json({ error: 'Rezept konnte nicht geladen werden (Inventar nicht erreichbar)' });
  }

  const cfg = (await getPrinterConfig())[station];
  const stationName = station === 'kitchen' ? 'Küche' : 'Bar';
  if (!cfg) return res.status(409).json({ error: `Kein Drucker für ${stationName} eingerichtet` });

  // Anlass-Titel vom Inventar (Event-Ansicht), sonst der laufende Anlass.
  const anlassBody = typeof req.body?.anlass === 'string' ? req.body.anlass.trim().slice(0, 80) : '';
  const anlass = anlassBody || anlassErmittler.gemerkt()?.anlass?.titel || null;
  try {
    if (cfg.protocol === 'epos') {
      await eposSenden(cfg.ip, station, eposHuelle(rezeptBonXml(rezept, faktor, { anlass, logoXml: bonLogoXml() })));
    } else {
      await rezeptViaRawTcp(cfg, rezeptBonText(rezept, faktor, { anlass }));
    }
    res.json({ ok: true, station, rezept: { id: rezept.id, name: rezept.name }, anzahl: faktor });
  } catch (err: any) {
    console.error(`Rezept-Bon (${station}, ${cfg.ip}):`, err?.message || err);
    res.status(502).json({ error: `Drucker ${stationName} nicht erreichbar: ${err?.message || err}` });
  }
});

app.get('/api/terminal/status', async (req, res) => {
  try {
    const status = await paymentService.sumup.getTerminalStatus();
    res.json(status);
  } catch (error) {
    console.error('Terminal status error:', error);
    res.status(500).json({ 
      error: 'Terminal status unavailable',
      reader_id: process.env.SUMUP_READER_ID
    });
  }
});

app.post('/api/terminal/pair', async (req, res) => {
  try {
    const { pairing_code } = req.body;
    
    if (!pairing_code || pairing_code.length !== 4) {
      return res.status(400).json({ error: 'Invalid pairing code (4 digits required)' });
    }
    
    const result = await paymentService.sumup.pairTerminal(pairing_code);
    
    res.json({
      success: true,
      reader_id: result.reader_id,
      name: result.name,
      message: `Terminal paired successfully! Add SUMUP_READER_ID=${result.reader_id} to your .env file`
    });
  } catch (error) {
    console.error('Terminal pairing error:', error);
    res.status(500).json({ error: 'Terminal pairing failed' });
  }
});

// Routes: Payments
app.post('/api/payments/create', async (req, res) => {
  try {
    const { orderId, provider } = req.body;
    
    // Get order details
    const orderResult = await pool.query(
      'SELECT * FROM orders WHERE id = $1',
      [orderId]
    );
    
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const order = orderResult.rows[0];
    
    // Create payment request
    const paymentRequest = {
      amount: parseFloat(order.total),
      currency: 'CHF',
      orderId: orderId.toString(),
      tableNumber: order.table_number,
      description: `Tisch ${order.table_number} - Bestellung ${bestellNr(orderId)}`,
    };
    
    let paymentResult;
    let paymentUrl, qrCodeUrl, paymentId;
    
    // Handle different payment providers
    if (provider === 'sumup-terminal') {
      // Check terminal status first
      try {
        const terminalStatus = await paymentService.sumup.getTerminalStatus();
        
        if (terminalStatus.status !== 'online') {
          return res.status(503).json({ 
            error: 'Terminal offline',
            message: `Das SumUp 3G Terminal ist ${terminalStatus.status}. Bitte prüfen Sie die Verbindung.`
          });
        }
      } catch (error) {
        return res.status(503).json({ 
          error: 'Terminal not available',
          message: 'Das SumUp 3G Terminal ist nicht erreichbar.'
        });
      }
      
      // Send to terminal
      paymentResult = await paymentService.sumup.createTerminalCheckout(paymentRequest);
      paymentId = paymentResult.id;
      paymentUrl = null; // Terminal payment has no URL
      
    } else if (provider === 'sumup') {
      // Online SumUp checkout
      paymentResult = await paymentService.createPayment(paymentRequest, 'sumup');
      paymentId = paymentResult.id;
      paymentUrl = `https://pay.sumup.com/checkout/${paymentResult.id}`;
      
    } else if (provider === 'raisenow' || provider === 'twint') {
      // RaiseNow/TWINT
      paymentResult = await paymentService.createPayment(paymentRequest, provider);
      paymentUrl = paymentResult.paylink_url;
      qrCodeUrl = paymentResult.qr_code_url;
      paymentId = paymentResult.reference;
      
    } else {
      return res.status(400).json({ error: 'Unknown payment provider' });
    }
    
    // Store payment in database
    const insertResult = await pool.query(
      `INSERT INTO payments (order_id, provider, payment_id, payment_url, qr_code_url, amount, currency, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [orderId, provider, paymentId, paymentUrl, qrCodeUrl, order.total, 'CHF', 'pending']
    );
    
    res.json(insertResult.rows[0]);
  } catch (error) {
    console.error('Payment creation error:', error);
    res.status(500).json({ error: 'Failed to create payment' });
  }
});

app.get('/api/payments/order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC',
      [orderId]
    );
    
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/payments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM payments WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Webhook endpoint for RaiseNow
app.post('/api/webhooks/raisenow', async (req, res) => {
  try {
    const signature = req.headers['x-raisenow-signature'] as string;
    const payload = JSON.stringify(req.body);
    
    // Verify signature
    const raisenow = (paymentService as any).raisenow;
    if (!raisenow.verifyWebhookSignature(payload, signature)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    // Parse event
    const event = raisenow.parseWebhookEvent(req.body);
    
    // Update payment status
    await pool.query(
      'UPDATE payments SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE payment_id = $2',
      [event.status, event.reference]
    );
    
    // If payment successful, mark order as completed
    if (event.status === 'completed' || event.status === 'success') {
      const paymentResult = await pool.query(
        'SELECT order_id FROM payments WHERE payment_id = $1',
        [event.reference]
      );
      
      if (paymentResult.rows.length > 0) {
        await pool.query(
          'UPDATE orders SET status = $1 WHERE id = $2',
          ['paid', paymentResult.rows[0].order_id]
        );
      }
    }
    
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Webhook endpoint for SumUp
app.post('/api/webhooks/sumup', async (req, res) => {
  try {
    const { id, status, checkout_reference } = req.body;
    
    // Update payment status
    await pool.query(
      'UPDATE payments SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE payment_id = $2',
      [status, id]
    );
    
    // If payment successful, mark order as paid
    if (status === 'PAID') {
      await pool.query(
        'UPDATE orders SET status = $1 WHERE id = $2',
        ['paid', parseInt(checkout_reference)]
      );
    }
    
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ============================================
// SYNC API (for Local <-> Cloud synchronization)
// ============================================

const CLOUD_SYNC_KEY = process.env.CLOUD_SYNC_KEY || '';
const CLOUD_API_URL = process.env.CLOUD_API_URL || '';

// Middleware to verify sync key
function verifySyncKey(req: any, res: any, next: any) {
  const syncKey = req.headers['x-sync-key'];
  if (!CLOUD_SYNC_KEY || syncKey !== CLOUD_SYNC_KEY) {
    return res.status(401).json({ error: 'Invalid sync key' });
  }
  next();
}

// Get all orders since a timestamp (for local to pull from cloud)
app.get('/api/sync/orders', verifySyncKey, async (req, res) => {
  try {
    const since = req.query.since ? new Date(req.query.since as string) : new Date(0);
    const result = await pool.query(`
      SELECT o.*,
        json_agg(
          json_build_object(
            'id', oi.id,
            'item_id', oi.item_id,
            'item_name', oi.item_name,
            'quantity', oi.quantity,
            'price', oi.price,
            'notes', oi.notes,
            'printer_station', oi.printer_station
          )
        ) FILTER (WHERE oi.id IS NOT NULL) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.created_at >= $1
      GROUP BY o.id
      ORDER BY o.created_at ASC
    `, [since]);

    res.json({
      orders: result.rows,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Sync orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Upload orders from local to cloud
app.post('/api/sync/orders', verifySyncKey, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { orders, source } = req.body;
    let imported = 0;

    for (const order of orders) {
      // Check if order already exists (by source and original ID)
      const existing = await client.query(
        'SELECT id FROM orders WHERE sync_source = $1 AND sync_source_id = $2',
        [source, order.id]
      );

      if (existing.rows.length > 0) continue; // Skip existing

      // Insert order
      const orderResult = await client.query(`
        INSERT INTO orders (table_number, status, total, payment_method, created_at, sync_source, sync_source_id, event_id, event_titel)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `, [order.table_number, order.status, order.total, order.payment_method, order.created_at, source, order.id,
          order.event_id || null, order.event_titel || null]);

      const newOrderId = orderResult.rows[0].id;

      // Insert order items
      for (const item of (order.items || [])) {
        await client.query(`
          INSERT INTO order_items (order_id, item_id, item_name, quantity, price, notes, printer_station)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [newOrderId, item.item_id, item.item_name, item.quantity, item.price, item.notes, item.printer_station]);
      }

      imported++;
    }

    await client.query('COMMIT');
    res.json({ success: true, imported });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Sync upload error:', error);
    res.status(500).json({ error: 'Failed to upload orders' });
  } finally {
    client.release();
  }
});

// Get daily stats (for sync)
app.get('/api/sync/stats', verifySyncKey, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];

    const result = await pool.query(`
      SELECT
        COUNT(*) as order_count,
        COALESCE(SUM(total), 0) as total_revenue,
        COUNT(CASE WHEN payment_method = 'bar' THEN 1 END) as cash_count,
        COALESCE(SUM(CASE WHEN payment_method = 'bar' THEN total END), 0) as cash_total,
        COUNT(CASE WHEN payment_method = 'card' THEN 1 END) as card_count,
        COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total END), 0) as card_total
      FROM orders
      WHERE DATE(created_at) = $1 AND status IN ('paid', 'completed')
    `, [date]);

    res.json({
      date,
      stats: result.rows[0]
    });
  } catch (error) {
    console.error('Sync stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Full bidirectional sync
app.post('/api/sync/full', verifySyncKey, async (req, res) => {
  try {
    const { lastSync, localOrders, source } = req.body;
    const since = lastSync ? new Date(lastSync) : new Date(0);

    // 1. Get orders from cloud that are newer than lastSync
    const cloudOrders = await pool.query(`
      SELECT o.*,
        json_agg(
          json_build_object(
            'id', oi.id,
            'item_id', oi.item_id,
            'item_name', oi.item_name,
            'quantity', oi.quantity,
            'price', oi.price,
            'notes', oi.notes,
            'printer_station', oi.printer_station
          )
        ) FILTER (WHERE oi.id IS NOT NULL) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.created_at >= $1 AND (o.sync_source IS NULL OR o.sync_source != $2)
      GROUP BY o.id
      ORDER BY o.created_at ASC
    `, [since, source]);

    // 2. Import local orders to cloud
    const client = await pool.connect();
    let imported = 0;

    try {
      await client.query('BEGIN');

      for (const order of (localOrders || [])) {
        const existing = await client.query(
          'SELECT id FROM orders WHERE sync_source = $1 AND sync_source_id = $2',
          [source, order.id]
        );

        if (existing.rows.length > 0) continue;

        const orderResult = await client.query(`
          INSERT INTO orders (table_number, status, total, payment_method, created_at, sync_source, sync_source_id, event_id, event_titel)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id
        `, [order.table_number, order.status, order.total, order.payment_method, order.created_at, source, order.id,
            order.event_id || null, order.event_titel || null]);

        const newOrderId = orderResult.rows[0].id;

        for (const item of (order.items || [])) {
          await client.query(`
            INSERT INTO order_items (order_id, item_id, item_name, quantity, price, notes, printer_station)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [newOrderId, item.item_id, item.item_name, item.quantity, item.price, item.notes, item.printer_station]);
        }

        imported++;
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    res.json({
      success: true,
      cloudOrders: cloudOrders.rows,
      imported,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Full sync error:', error);
    res.status(500).json({ error: 'Sync failed' });
  }
});

// Sync items/products from inventory
app.get('/api/sync/items', verifySyncKey, async (req, res) => {
  try {
    // Fetch from inventory system
    const response = await fetch(`${INVENTORY_API_URL}/api/items/sellable`);
    if (!response.ok) {
      return res.status(502).json({ error: 'Inventory API unavailable' });
    }

    const items = await response.json();
    res.json({
      items,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Sync items error:', error);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server
const PORT = process.env.PORT || 3000;

initDB()
  .then(async () => {
    // Gemeinsames Kassen-/Kuechen-Passwort laden bzw. initial anlegen und in die
    // Auth-Schicht setzen; danach regelmaessig auf faellige Rotation pruefen.
    await loadOrRotatePosPassword();
    setInterval(loadOrRotatePosPassword, 6 * 60 * 60 * 1000);
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  });
