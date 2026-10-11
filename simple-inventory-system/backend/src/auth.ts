/**
 * Auth Middleware for the Inventory System
 * Supports both:
 * - Authentik JWT (online mode) — Inventar-PWA ohne Gruppenpruefung,
 *   Mitglieder-App/-Web nur mit Gruppe Lager/Vorstand/admin (zugang.ts)
 * - Simple password auth (local/offline mode)
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import {
  anwendungAusIssuer, Entscheid, gruppenAusClaims, issuerFuer, jwksFuer, lagerZugang
} from './zugang.js';

const AUTHENTIK_URL = process.env.AUTHENTIK_URL || 'https://auth.fwv-raura.ch';
const LOCAL_MODE = process.env.LOCAL_MODE === 'true';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'fwv2026';
const JWT_SECRET = process.env.JWT_SECRET || 'local-inventory-system-secret';

// JWKS-Clients je Authentik-Anwendung (nur online). Welche Anwendungen
// angenommen werden und wer davon ins Lager darf, steht in zugang.ts.
const jwksClients = new Map<string, jwksClient.JwksClient>();

function clientFuer(anwendung: string): jwksClient.JwksClient {
  let c = jwksClients.get(anwendung);
  if (!c) {
    c = jwksClient({
      jwksUri: jwksFuer(AUTHENTIK_URL, anwendung),
      cache: true,
      cacheMaxAge: 600000,
      rateLimit: true,
      jwksRequestsPerMinute: 10
    });
    jwksClients.set(anwendung, c);
  }
  return c;
}

type Benutzer = NonNullable<AuthenticatedRequest['user']>;
type Pruefung = { user: Benutzer; entscheid: Entscheid };

/**
 * Prueft ein Authentik-Token (RS256): Issuer bestimmt die Anwendung und
 * damit den JWKS-Endpunkt; danach entscheidet lagerZugang() ueber die
 * Gruppen. Fehler (Signatur, Ablauf, fremder Issuer) -> Error.
 */
function authentikPruefen(token: string): Promise<Pruefung> {
  return new Promise((resolve, reject) => {
    const ungeprueft = jwt.decode(token, { json: true });
    const anwendung = anwendungAusIssuer(AUTHENTIK_URL, ungeprueft?.iss);
    if (!anwendung) return reject(new Error('unbekannter Issuer'));
    const client = clientFuer(anwendung);
    const getKey = (header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) => {
      client.getSigningKey(header.kid, (err, key) => {
        if (err) return callback(err);
        callback(null, key?.getPublicKey());
      });
    };
    jwt.verify(token, getKey, {
      algorithms: ['RS256'],
      issuer: issuerFuer(AUTHENTIK_URL, anwendung)
    }, (err, decoded: any) => {
      if (err || !decoded) return reject(err || new Error('leeres Token'));
      resolve({
        user: {
          id: decoded.sub,
          email: decoded.email,
          name: decoded.name,
          groups: gruppenAusClaims(decoded)
        },
        entscheid: lagerZugang(anwendung, decoded)
      });
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
 */
export function localLogin(req: Request, res: Response) {
  // Passwort-Login nur im lokalen Dev-Modus (Audit HIGH). In Produktion via Authentik-OIDC.
  if (!LOCAL_MODE) {
    return res.status(403).json({ error: 'Passwort-Login in Produktion deaktiviert — bitte via Authentik anmelden.' });
  }
  const { password } = req.body;

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }

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

  // Online mode: verify with Authentik JWKS (Anwendung aus dem Issuer)
  authentikPruefen(token).then(({ user, entscheid }) => {
    if (!entscheid.ok) {
      return res.status(entscheid.status).json({ error: entscheid.error });
    }
    req.user = user;
    next();
  }, (err: Error) => {
    console.error('Token verification failed:', err.message);
    res.status(403).json({ error: 'Invalid token' });
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

  // Ohne Lager-Berechtigung zaehlt das Token hier wie keins.
  authentikPruefen(token).then(({ user, entscheid }) => {
    if (entscheid.ok) req.user = user;
    next();
  }, () => next());
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
