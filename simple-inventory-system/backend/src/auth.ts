/**
 * Auth Middleware for the Inventory System
 * Supports:
 * - Authentik JWT (online mode) — Inventar-PWA ohne Gruppenpruefung,
 *   Mitglieder-App/-Web nur mit Gruppe Lager/Vorstand/admin (zugang.ts)
 * - Mitglieder-Tokens von api-members (QR-Code, Anmeldebon, App-Passwort,
 *   Passwort-Reset; HS256) — geprueft per GET /auth/member/pruefen bei
 *   api-members (kein gemeinsames Geheimnis), dann dieselbe Gruppenregel
 * - Simple password auth (local/offline mode)
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import {
  anwendungAusIssuer, ausleiheZugang, AusleiheEntscheid, Entscheid, gruppenAusClaims,
  hatLagerGruppe, issuerFuer, istMitgliederToken, jwksFuer, lagerZugang, MITGLIEDER_TOKEN,
  MitgliedPruefung, mitgliedPruefungLesen
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
type Pruefung = { user: Benutzer; entscheid: Entscheid; ausleihe: AusleiheEntscheid };

/** Fehler mit HTTP-Status (403 ungueltig, 503 Pruefung nicht moeglich). */
class PruefFehler extends Error {
  constructor(message: string, readonly status: 403 | 503) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Mitglieder-Tokens von api-members (HS256, type 'member')
//
// Das Inventar kennt deren Schluessel nicht und soll ihn auch nicht kennen.
// Es fragt api-members, ob das Token gilt und welche Authentik-Gruppen das
// Mitglied hat, und merkt sich die Antwort 60 s (Schluessel: SHA-256 des
// Tokens, nie das Token selbst; hoechstens bis zum Ablauf des Tokens).
// ---------------------------------------------------------------------------

const MITGLIED_CACHE_MS = 60 * 1000;
const MITGLIED_CACHE_MAX = 2000;
const mitgliedCache = new Map<string, { bis: number; ergebnis: MitgliedPruefung | null }>();

function membersApiUrl(): string {
  return (process.env.MEMBERS_API_URL || 'http://api-members:3000').replace(/\/+$/, '');
}

function merken(schluessel: string, ergebnis: MitgliedPruefung | null) {
  const jetzt = Date.now();
  if (mitgliedCache.size >= MITGLIED_CACHE_MAX) {
    for (const [k, v] of mitgliedCache) if (v.bis <= jetzt) mitgliedCache.delete(k);
    if (mitgliedCache.size >= MITGLIED_CACHE_MAX) mitgliedCache.clear();
  }
  let bis = jetzt + MITGLIED_CACHE_MS;
  if (ergebnis?.exp) bis = Math.min(bis, ergebnis.exp * 1000);
  mitgliedCache.set(schluessel, { bis, ergebnis });
}

async function mitgliedTokenFragen(token: string): Promise<MitgliedPruefung> {
  const schluessel = crypto.createHash('sha256').update(token).digest('hex');
  const gemerkt = mitgliedCache.get(schluessel);
  if (gemerkt && gemerkt.bis > Date.now()) {
    if (!gemerkt.ergebnis) throw new PruefFehler('Invalid token', 403);
    return gemerkt.ergebnis;
  }
  let antwort: globalThis.Response;
  try {
    antwort = await fetch(`${membersApiUrl()}/auth/member/pruefen`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(5000)
    });
  } catch (e) {
    console.error('Mitglieder-Token: api-members nicht erreichbar:', (e as Error).message);
    throw new PruefFehler('Die Anmeldung kann gerade nicht geprüft werden. Bitte später erneut versuchen.', 503);
  }
  if (antwort.status === 401 || antwort.status === 403) {
    merken(schluessel, null);
    throw new PruefFehler('Invalid token', 403);
  }
  if (!antwort.ok) {
    console.error('Mitglieder-Token: api-members antwortet mit', antwort.status);
    throw new PruefFehler('Die Anmeldung kann gerade nicht geprüft werden. Bitte später erneut versuchen.', 503);
  }
  const ergebnis = mitgliedPruefungLesen(await antwort.json().catch(() => null));
  merken(schluessel, ergebnis);
  if (!ergebnis) throw new PruefFehler('Invalid token', 403);
  return ergebnis;
}

/** Mitglieder-Token: api-members fragen, dann dieselbe Regel wie fuer die App. */
async function mitgliedPruefen(token: string): Promise<Pruefung> {
  const m = await mitgliedTokenFragen(token);
  const claims = { groups: m.groups };
  return {
    user: { id: m.memberId, email: m.email, name: m.name, groups: m.groups },
    entscheid: lagerZugang(MITGLIEDER_TOKEN, claims),
    ausleihe: ausleiheZugang(MITGLIEDER_TOKEN, claims)
  };
}

/** Authentik-Token oder Mitglieder-Token von api-members. */
function tokenPruefen(token: string): Promise<Pruefung> {
  const ungeprueft = jwt.decode(token, { json: true });
  if (istMitgliederToken(ungeprueft)) return mitgliedPruefen(token);
  return authentikPruefen(token);
}

function fehlerStatus(err: unknown): number {
  return err instanceof PruefFehler ? err.status : 403;
}

function fehlerText(err: unknown): string {
  return err instanceof PruefFehler ? err.message : 'Invalid token';
}

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
        entscheid: lagerZugang(anwendung, decoded),
        ausleihe: ausleiheZugang(anwendung, decoded)
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
  /** Darf das Lager verwalten (Gruppe Lager/Vorstand/admin, Inventar-PWA). */
  lager?: boolean;
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
      req.lager = true;
      return next();
    } catch (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
  }

  // Online mode: Authentik (JWKS, Anwendung aus dem Issuer) oder
  // Mitglieder-Token (api-members fragen)
  tokenPruefen(token).then(({ user, entscheid }) => {
    if (!entscheid.ok) {
      return res.status(entscheid.status).json({ error: entscheid.error });
    }
    req.user = user;
    req.lager = true;
    next();
  }, (err: Error) => {
    console.error('Token verification failed:', err.message);
    res.status(fehlerStatus(err)).json({ error: fehlerText(err) });
  });
}

/**
 * Fuer die Ausleihe: nimmt die Tokens der Mitglieder-App und -Web auch
 * OHNE Lager-Gruppe an (jedes Mitglied darf ausleihen). [req.lager] sagt,
 * ob die Person verwalten darf. Mitglieder-Tokens (QR-Code, Anmeldebon,
 * App-Passwort, Passwort-Reset) gelten genauso, sobald api-members sie
 * bestaetigt — mit den Authentik-Gruppen des Mitglieds.
 */
export function authenticateAusleihe(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
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
      req.lager = hatLagerGruppe(req.user.groups);
      return next();
    } catch (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
  }
  tokenPruefen(token).then(({ user, ausleihe }) => {
    if (!ausleihe.ok) {
      return res.status(ausleihe.status).json({ error: ausleihe.error });
    }
    req.user = user;
    req.lager = ausleihe.lager;
    next();
  }, (err: Error) => {
    console.error('Token verification failed:', err.message);
    res.status(fehlerStatus(err)).json({ error: fehlerText(err) });
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
  tokenPruefen(token).then(({ user, entscheid }) => {
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
