/**
 * Authentik JWT Validation Middleware
 *
 * DEUTSCH: Authentifizierungs-Middleware für das Dispatch-Backend (Versand: E-Mail, Pingen, PDF).
 * Validiert Tokens von Authentik OIDC und Vorstand IMAP-Login.
 * Hinweis: Verwendet einen anderen JWKS-Endpunkt als Members/Events (fwv-raura statt fwv-members).
 */

// DEUTSCH: JWT-Bibliothek zum Verifizieren von Tokens
const jwt = require('jsonwebtoken');
// DEUTSCH: Client zum Abrufen öffentlicher Schlüssel von Authentik
const jwksClient = require('jwks-rsa');

// DEUTSCH: Authentik URL (Identity Provider)
const AUTHENTIK_URL = process.env.AUTHENTIK_URL || 'https://auth.fwv-raura.ch';

// DEUTSCH: JWKS-Client — holt RS256-Schlüssel vom Authentik JWKS-Endpunkt
const client = jwksClient({
    jwksUri: `${AUTHENTIK_URL}/application/o/fwv-members/jwks/`,
    cache: true,
    cacheMaxAge: 600000,
    rateLimit: true,
    jwksRequestsPerMinute: 10
});

// DEUTSCH: Holt den öffentlichen Schlüssel anhand der Key-ID im Token-Header
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
 * DEUTSCH: Prüft Authentik JWT-Token (RS256).
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
 * DEUTSCH: Prüft API-Key — für interne Service-zu-Service-Aufrufe.
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

    // DEUTSCH: 2. Versuch: Vorstand JWT (HS256)
    if (authHeader) {
        const token = authHeader.split(' ')[1];
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
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

// DEUTSCH: Exportierte Middleware-Funktionen für das Dispatch-Backend
module.exports = {
    authenticateToken,  // Authentik OIDC (RS256)
    requireRole,        // Rollenprüfung
    requireApiKey,      // API-Key — interne Aufrufe
    authenticateAny     // Kombiniert: API-Key / Vorstand / Authentik
};
