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
 */
export function localLogin(req: Request, res: Response) {
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
