/**
 * Authentik JWT Validation Middleware (SHARED)
 *
 * DEUTSCH: Gemeinsame/geteilte Auth-Middleware.
 * Wird als Vorlage/Referenz für die Backend-spezifischen auth-middleware.js Dateien verwendet.
 * Einfachste Version: Unterstützt nur Authentik JWT (RS256) und API-Key — KEIN Vorstand-JWT.
 */

// DEUTSCH: JWT-Bibliothek
const jwt = require('jsonwebtoken');
// DEUTSCH: JWKS-Client für öffentliche Schlüssel von Authentik
const jwksClient = require('jwks-rsa');

// DEUTSCH: Authentik URL
const AUTHENTIK_URL = process.env.AUTHENTIK_URL || 'https://auth.fwv-raura.ch';

// DEUTSCH: JWKS-Client — holt RS256-Schlüssel von Authentik
const client = jwksClient({
    jwksUri: `${AUTHENTIK_URL}/application/o/fwv-raura/.well-known/jwks.json`,
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 10
});

// DEUTSCH: Holt den öffentlichen Schlüssel anhand der Key-ID
function getKey(header, callback) {
    client.getSigningKey(header.kid, (err, key) => {
        if (err) {
            return callback(err);
        }
        const signingKey = key.getPublicKey();
        callback(null, signingKey);
    });
}

/**
 * DEUTSCH: Prüft Authentik JWT-Token (RS256) — für Mitglieder-Authentifizierung.
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    jwt.verify(token, getKey, {
        algorithms: ['RS256'],
        issuer: AUTHENTIK_URL
    }, (err, decoded) => {
        if (err) {
            console.error('Token verification failed:', err.message);
            return res.status(403).json({ error: 'Invalid token' });
        }

        // Add user info to request
        req.user = {
            id: decoded.sub,
            email: decoded.email,
            name: decoded.name,
            preferred_username: decoded.preferred_username,
            groups: decoded.groups || []
        };

        next();
    });
}

/**
 * DEUTSCH: Prüft ob der Benutzer eine der geforderten Rollen hat.
 */
function requireRole(...roles) {
    return (req, res, next) => {
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
 * DEUTSCH: Prüft API-Key — für interne Service-Aufrufe.
 */
function requireApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Invalid API key' });
    }

    next();
}

/**
 * DEUTSCH: Kombinierte Auth (einfache Version) — akzeptiert:
 * 1. API-Key (interne Service-Aufrufe)
 * 2. Authentik JWT (RS256, Mitglieder)
 * Hinweis: Diese Shared-Version unterstützt KEINEN Vorstand-JWT!
 * Die Backend-spezifischen Versionen (members, events, dispatch) haben zusätzlich Vorstand-Support.
 */
function authenticateAny(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    const authHeader = req.headers['authorization'];

    // DEUTSCH: 1. Versuch: API-Key
    if (apiKey && apiKey === process.env.API_KEY) {
        req.user = { id: 'api', name: 'API Service', groups: ['admin'] };
        return next();
    }

    // DEUTSCH: 2. Versuch: Authentik JWT
    if (authHeader) {
        return authenticateToken(req, res, next);
    }

    return res.status(401).json({ error: 'Authentication required' });
}

// DEUTSCH: Exportierte Middleware-Funktionen (Shared/Vorlage)
module.exports = {
    authenticateToken,  // Authentik OIDC (RS256)
    requireRole,        // Rollenprüfung
    requireApiKey,      // API-Key — interne Aufrufe
    authenticateAny     // Kombiniert: API-Key / Authentik (ohne Vorstand-Support!)
};
