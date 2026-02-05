/**
 * Authentik JWT Validation Middleware
 *
 * DEUTSCH: Authentifizierungs-Middleware für das Events-Backend.
 * Validiert Zugangs-Tokens von Authentik OIDC (Mitglieder) und Vorstand IMAP-Tokens.
 */

// DEUTSCH: Bibliothek zum Verifizieren von JSON Web Tokens
const jwt = require('jsonwebtoken');
// DEUTSCH: Client zum Abrufen der öffentlichen Schlüssel von Authentik (JWKS-Endpunkt)
const jwksClient = require('jwks-rsa');

// DEUTSCH: URL des Authentik Identity Providers
const AUTHENTIK_URL = process.env.AUTHENTIK_URL || 'https://auth.fwv-raura.ch';

// DEUTSCH: JWKS-Client konfigurieren — holt öffentliche RS256-Schlüssel von Authentik
// Cache: 10 Min, max 10 Anfragen/Min
const client = jwksClient({
    jwksUri: `${AUTHENTIK_URL}/application/o/fwv-members/jwks/`,
    cache: true,
    cacheMaxAge: 600000,
    rateLimit: true,
    jwksRequestsPerMinute: 10
});

// DEUTSCH: Holt den passenden öffentlichen Schlüssel anhand der Key-ID (kid) im Token-Header
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
 * Speichert Benutzer-Infos (id, email, name, gruppen) in req.user.
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    jwt.verify(token, getKey, {
        algorithms: ['RS256'],
        issuer: `${AUTHENTIK_URL}/application/o/fwv-members/`
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
 * DEUTSCH: Prüft ob der Benutzer eine der geforderten Rollen/Gruppen hat.
 * Verwendung: requireRole('vorstand', 'admin')
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
 * DEUTSCH: Prüft API-Key im Header — für interne Service-zu-Service-Aufrufe.
 */
function requireApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Invalid API key' });
    }

    next();
}

/**
 * DEUTSCH: Kombinierte Auth — akzeptiert: 1. API-Key, 2. Vorstand-JWT (HS256), 3. Authentik-JWT (RS256)
 */
function authenticateAny(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    const authHeader = req.headers['authorization'];

    // DEUTSCH: 1. Versuch: Interner API-Key
    if (apiKey && apiKey === process.env.API_KEY) {
        req.user = { id: 'api', name: 'API Service', groups: ['admin'] };
        return next();
    }

    // DEUTSCH: 2. Versuch: Vorstand JWT (HS256 mit JWT_SECRET)
    if (authHeader) {
        const token = authHeader.split(' ')[1];
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fwv-raura-secret-key');
                if (decoded.type === 'vorstand') {
                    req.user = {
                        id: decoded.email,
                        email: decoded.email,
                        name: decoded.role,
                        role: decoded.role,
                        groups: decoded.groups || ['vorstand']
                    };
                    return next();
                }
            } catch (e) {
                // Not a valid Vorstand token, try Authentik
            }
        }

        // DEUTSCH: 3. Versuch: Authentik JWT (RS256)
        return authenticateToken(req, res, next);
    }

    return res.status(401).json({ error: 'Authentication required' });
}

// DEUTSCH: Exportierte Middleware-Funktionen für das Events-Backend
module.exports = {
    authenticateToken,  // Authentik OIDC (RS256) — Mitglieder
    requireRole,        // Rollenprüfung
    requireApiKey,      // API-Key — interne Aufrufe
    authenticateAny     // Kombiniert: API-Key / Vorstand / Authentik
};
