/**
 * Auth Middleware for Order System
 * Supports both:
 * - Authentik JWT (online mode)
 * - Simple password auth (local/offline mode)
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import crypto from 'crypto';

const AUTHENTIK_URL = process.env.AUTHENTIK_URL || 'https://auth.fwv-raura.ch';
const AUTHENTIK_CLIENT_SECRET = process.env.AUTHENTIK_CLIENT_SECRET || '';
const LOCAL_MODE = process.env.LOCAL_MODE === 'true';
// ADMIN_PASSWORD dient nur noch als Fallback im Offline-/LOCAL_MODE (Vor-Ort-Pi).
// Kein oeffentlicher Default mehr (Audit HIGH: 'fwv2026' entfernt).
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

// JWT_SECRET signiert die Kassen-/Kuechen-Tokens, die Zugriff gewaehren. In Produktion
// MUSS es gesetzt und ausreichend lang sein — mit dem alten oeffentlichen Default liesse
// sich sonst ein gueltiges Token faelschen. Fail-closed statt unsicherem Default.
if (!LOCAL_MODE && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16)) {
  console.error('FATAL: JWT_SECRET fehlt oder ist zu kurz (>=16 Zeichen erforderlich). Abbruch.');
  process.exit(1);
}
export const JWT_SECRET = process.env.JWT_SECRET || 'local-order-system-secret';

// Token-Lebensdauer der Passwort-Logins. Grosszuegig, damit Kiosk-Geraete (Kuechen-
// Display) nicht mitten im Fest ausloggen. Rotation des Passworts sperrt kuenftige
// Logins, macht aber bereits ausgestellte Tokens nicht ungueltig.
const POS_TOKEN_TTL: jwt.SignOptions['expiresIn'] = (process.env.POS_TOKEN_TTL as any) || '30d';

// Gemeinsames, woechentlich rotierendes Kassen-/Kuechen-Passwort. index.ts laedt bzw.
// rotiert es aus der DB und setzt es hier via setSharedPassword().
let sharedPassword: string | null = null;
export function setSharedPassword(pw: string | null): void { sharedPassword = pw; }

// Timing-sicherer Vergleich — verhindert, dass die Antwortzeit das Passwort verraet.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// Rate limiting for failed login attempts
const MAX_FAILED_ATTEMPTS = 3;
const BLOCK_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

interface FailedAttempt {
  count: number;
  blockedUntil?: number;
}

const failedAttempts = new Map<string, FailedAttempt>();

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',');
    return ips[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function isIpBlocked(ip: string): { blocked: boolean; remainingMinutes?: number } {
  const attempt = failedAttempts.get(ip);
  if (!attempt || !attempt.blockedUntil) {
    return { blocked: false };
  }

  const now = Date.now();
  if (now < attempt.blockedUntil) {
    const remainingMinutes = Math.ceil((attempt.blockedUntil - now) / 60000);
    return { blocked: true, remainingMinutes };
  }

  // Block expired, reset
  failedAttempts.delete(ip);
  return { blocked: false };
}

function recordFailedAttempt(ip: string): void {
  const attempt = failedAttempts.get(ip) || { count: 0 };
  attempt.count++;

  if (attempt.count >= MAX_FAILED_ATTEMPTS) {
    attempt.blockedUntil = Date.now() + BLOCK_DURATION_MS;
    console.log(`IP ${ip} blocked for 24 hours after ${attempt.count} failed login attempts`);
  }

  failedAttempts.set(ip, attempt);
}

function clearFailedAttempts(ip: string): void {
  failedAttempts.delete(ip);
}

// JWKS client to get public keys from Authentik (only used in online mode with RS256)
const client = LOCAL_MODE ? null : jwksClient({
  jwksUri: `${AUTHENTIK_URL}/application/o/order-system/jwks/`,
  cache: true,
  cacheMaxAge: 600000,
  rateLimit: true,
  jwksRequestsPerMinute: 10
});

function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  if (!client) {
    return callback(new Error('JWKS client not available in local mode'));
  }
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      return callback(err);
    }
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}

/**
 * Verify Authentik token - supports both RS256 (JWKS) and HS256 (client secret)
 */
function verifyAuthentikToken(token: string): Promise<any> {
  return new Promise((resolve, reject) => {
    // First try HS256 with client secret (Authentik default)
    if (AUTHENTIK_CLIENT_SECRET) {
      try {
        const decoded = jwt.verify(token, AUTHENTIK_CLIENT_SECRET, {
          algorithms: ['HS256'],
          issuer: `${AUTHENTIK_URL}/application/o/order-system/`
        });
        return resolve(decoded);
      } catch (hs256Error) {
        // Erwartungsgemaess bei RS256-Tokens (id_token) -> still auf JWKS/RS256 weiter.
        // Kein Log: laeuft jetzt bei jedem Request und wuerde die Logs fluten.
      }
    }

    // Fall back to RS256 with JWKS
    jwt.verify(token, getKey, {
      algorithms: ['RS256'],
      issuer: `${AUTHENTIK_URL}/application/o/order-system/`
    }, (err, decoded) => {
      if (err) {
        // Fail-closed (Audit HIGH): kein unsigniertes jwt.decode-Fallback mehr —
        // nur gueltig per JWKS (RS256) bzw. HS256 signierte Tokens werden akzeptiert.
        return reject(err);
      }
      resolve(decoded);
    });
  });
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    groups: string[];
  };
}

/**
 * Verifiziert ein Token sicher. Reihenfolge:
 *  1) Eigenes signiertes Kassen-/App-Token (HS256, JWT_SECRET) — schnell, offline.
 *  2) Sonst Authentik-OIDC-Token (JWKS RS256 / HS256 Client-Secret) — nur online.
 * Beide Wege sind kryptographisch geprueft; kein unsigniertes Fallback (Audit HIGH).
 */
export function verifyAnyToken(token: string): Promise<{ id: string; email: string; name: string; groups: string[] }> {
  return new Promise((resolve, reject) => {
    // 1) Eigenes signiertes Token (Kasse/Kueche via Passwort-Login)
    try {
      const d = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as any;
      return resolve({ id: d.id, email: d.email, name: d.name, groups: d.groups || [] });
    } catch {
      // kein eigenes Token -> ggf. Authentik pruefen
    }
    if (LOCAL_MODE) {
      return reject(new Error('Invalid local token'));
    }
    // 2) Authentik-OIDC (Browser: PWA / Web-Kueche)
    verifyAuthentikToken(token)
      .then((d: any) => resolve({
        id: d.sub || d.id,
        email: d.email,
        name: d.name || d.preferred_username,
        groups: d.groups || []
      }))
      .catch(reject);
  });
}

/**
 * Passwort-Login fuer Kasse (PWA) und Kueche (Android-App).
 * Prueft gegen das gemeinsame, woechentlich rotierende Shared-Passwort und gibt ein
 * signiertes Token zurueck. Aktiv in Produktion UND im Offline-/LOCAL_MODE (dort
 * Fallback auf ADMIN_PASSWORD, falls kein Shared-Passwort gesetzt ist).
 * Rate-Limit: 3 Fehlversuche -> IP fuer 24h gesperrt.
 */
export function localLogin(req: Request, res: Response) {
  const ip = getClientIp(req);
  const { password } = req.body;

  // Check if IP is blocked
  const blockStatus = isIpBlocked(ip);
  if (blockStatus.blocked) {
    const hours = Math.floor((blockStatus.remainingMinutes || 0) / 60);
    const minutes = (blockStatus.remainingMinutes || 0) % 60;
    return res.status(429).json({
      error: `IP gesperrt nach zu vielen fehlgeschlagenen Versuchen. Entsperrt in ${hours}h ${minutes}min.`
    });
  }

  const expected = sharedPassword || (LOCAL_MODE ? ADMIN_PASSWORD : '');
  if (!expected) {
    // Kein Passwort konfiguriert -> Login sicher verweigern statt offen lassen.
    return res.status(503).json({ error: 'Kassen-Login noch nicht konfiguriert.' });
  }

  if (typeof password !== 'string' || !safeEqual(password, expected)) {
    recordFailedAttempt(ip);
    const attempt = failedAttempts.get(ip);
    const remaining = MAX_FAILED_ATTEMPTS - (attempt?.count || 0);

    if (remaining > 0) {
      return res.status(401).json({
        error: `Falsches Passwort. Noch ${remaining} Versuche übrig.`
      });
    } else {
      return res.status(429).json({
        error: 'IP für 24 Stunden gesperrt nach zu vielen fehlgeschlagenen Versuchen.'
      });
    }
  }

  // Successful login - clear failed attempts
  clearFailedAttempts(ip);

  const token = jwt.sign(
    {
      id: 'pos-shared',
      email: 'kasse@fwv-raura.ch',
      name: 'Kasse/Kueche',
      groups: ['pos']
    },
    JWT_SECRET,
    { expiresIn: POS_TOKEN_TTL }
  );

  res.json({ token, mode: LOCAL_MODE ? 'local' : 'shared' });
}

/**
 * Middleware to verify token (supports both Authentik and local mode)
 */
export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  verifyAnyToken(token)
    .then((user) => { req.user = user; next(); })
    .catch((err) => {
      console.error('Token verification failed:', err.message);
      return res.status(403).json({ error: 'Invalid token' });
    });
}

/**
 * Middleware to check if user has required role/group
 */
export function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const userGroups = req.user.groups || [];
    const hasRole = roles.some(role => userGroups.includes(role));

    if (!hasRole) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

/**
 * Optional authentication - continues even without token
 */
export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return next();
  }

  verifyAnyToken(token)
    .then((user) => { req.user = user; next(); })
    .catch(() => next());
}

/**
 * Get auth mode info
 */
export function getAuthMode() {
  return {
    local: LOCAL_MODE,
    authentikUrl: LOCAL_MODE ? null : AUTHENTIK_URL
  };
}

/**
 * Get all blocked IPs (for admin)
 */
export function getBlockedIps(): Array<{ ip: string; blockedUntil: Date; attempts: number }> {
  const blocked: Array<{ ip: string; blockedUntil: Date; attempts: number }> = [];
  const now = Date.now();

  failedAttempts.forEach((attempt, ip) => {
    if (attempt.blockedUntil && attempt.blockedUntil > now) {
      blocked.push({
        ip,
        blockedUntil: new Date(attempt.blockedUntil),
        attempts: attempt.count
      });
    }
  });

  return blocked;
}

/**
 * Unblock an IP (for admin)
 */
export function unblockIp(ip: string): boolean {
  if (failedAttempts.has(ip)) {
    failedAttempts.delete(ip);
    console.log(`IP ${ip} manually unblocked by admin`);
    return true;
  }
  return false;
}
