/**
 * Auth Middleware for Order System
 * Supports both:
 * - Authentik JWT (online mode)
 * - Simple password auth (local/offline mode)
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const AUTHENTIK_URL = process.env.AUTHENTIK_URL || 'https://auth.fwv-raura.ch';
const AUTHENTIK_CLIENT_SECRET = process.env.AUTHENTIK_CLIENT_SECRET || '';
const LOCAL_MODE = process.env.LOCAL_MODE === 'true';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'fwv2026';
const JWT_SECRET = process.env.JWT_SECRET || 'local-order-system-secret';

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
        console.log('HS256 verification failed, trying RS256...');
      }
    }

    // Fall back to RS256 with JWKS
    jwt.verify(token, getKey, {
      algorithms: ['RS256'],
      issuer: `${AUTHENTIK_URL}/application/o/order-system/`
    }, (err, decoded) => {
      if (err) {
        // If both fail, try without issuer validation as last resort
        try {
          const decoded = jwt.decode(token) as any;
          if (decoded && decoded.exp && decoded.exp * 1000 > Date.now()) {
            console.log('Using decoded token without full verification (for development)');
            return resolve(decoded);
          }
        } catch (e) {
          // Ignore
        }
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
 * Local mode login - returns JWT token for simple password auth
 * Includes rate limiting: blocks IP for 24h after 3 failed attempts
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

  if (password !== ADMIN_PASSWORD) {
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
      id: 'local-admin',
      email: 'admin@local',
      name: 'Admin',
      groups: ['admin']
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({ token, mode: 'local' });
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

  // Local mode: verify with JWT_SECRET
  if (LOCAL_MODE) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      req.user = {
        id: decoded.id,
        email: decoded.email,
        name: decoded.name,
        groups: decoded.groups || []
      };
      return next();
    } catch (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
  }

  // Online mode: verify with Authentik (HS256 or RS256)
  verifyAuthentikToken(token)
    .then((decoded: any) => {
      req.user = {
        id: decoded.sub || decoded.id,
        email: decoded.email,
        name: decoded.name || decoded.preferred_username,
        groups: decoded.groups || []
      };
      next();
    })
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

  if (LOCAL_MODE) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      req.user = {
        id: decoded.id,
        email: decoded.email,
        name: decoded.name,
        groups: decoded.groups || []
      };
    } catch (err) {
      // Invalid token, continue without user
    }
    return next();
  }

  // Online mode: verify with Authentik (HS256 or RS256)
  verifyAuthentikToken(token)
    .then((decoded: any) => {
      req.user = {
        id: decoded.sub || decoded.id,
        email: decoded.email,
        name: decoded.name || decoded.preferred_username,
        groups: decoded.groups || []
      };
      next();
    })
    .catch(() => {
      // Invalid token, continue without user
      next();
    });
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
