/**
 * Authentik JWT Validation Middleware
 *
 * Validates access tokens from Authentik OIDC
 */

// DEUTSCH: Bibliothek zum Verifizieren und Dekodieren von JSON Web Tokens (JWT)
const jwt = require('jsonwebtoken');
// DEUTSCH: Client-Bibliothek um öffentliche Schlüssel von Authentik (JWKS-Endpunkt) abzurufen
const jwksClient = require('jwks-rsa');

// DEUTSCH: URL des Authentik Identity Providers (aus Umgebungsvariable oder Standardwert)
const AUTHENTIK_URL = process.env.AUTHENTIK_URL || 'https://auth.fwv-raura.ch';

// DEUTSCH: Wir akzeptieren Tokens von zwei Authentik-Providern:
//  - fwv-members      -> Web-Frontend (confidential client, Backend-Exchange mit client_secret)
//  - fwv-members-app  -> Native Android-App (public client, PKCE-Flow ohne client_secret)
// Beide haben eigene JWKS-Endpoints und eigene Issuer-URLs, aber die User-Daten
// im Token (sub, email, groups) sind identisch.
const ISSUERS = [
    `${AUTHENTIK_URL}/application/o/fwv-members/`,
    `${AUTHENTIK_URL}/application/o/fwv-members-app/`
];

const jwksClients = {
    'fwv-members': jwksClient({
        jwksUri: `${AUTHENTIK_URL}/application/o/fwv-members/jwks/`,
        cache: true, cacheMaxAge: 600000, rateLimit: true, jwksRequestsPerMinute: 10
    }),
    'fwv-members-app': jwksClient({
        jwksUri: `${AUTHENTIK_URL}/application/o/fwv-members-app/jwks/`,
        cache: true, cacheMaxAge: 600000, rateLimit: true, jwksRequestsPerMinute: 10
    })
};

// DEUTSCH: Hilfsfunktion — holt den passenden öffentlichen Schlüssel anhand der Key-ID (kid).
// Versucht beide JWKS-Endpoints, da wir nicht im Voraus wissen welcher Provider den Token ausgegeben hat.
function getKey(header, callback) {
    const tryClient = (slug, fallback) => {
        jwksClients[slug].getSigningKey(header.kid, (err, key) => {
            if (err) {
                if (fallback) return tryClient(fallback, null);
                return callback(err);
            }
            callback(null, key.getPublicKey());
        });
    };
    tryClient('fwv-members', 'fwv-members-app');
}

/**
 * DEUTSCH: Middleware — prüft ob ein gültiger Authentik-Token (RS256) im Authorization-Header mitgesendet wurde.
 * Wird für Mitglieder-Authentifizierung über Authentik OIDC verwendet.
 * Bei Erfolg: Benutzer-Infos werden in req.user gespeichert und die Anfrage wird weitergeleitet.
 * Bei Fehler: 401 (kein Token) oder 403 (ungültiger Token).
 */
function authenticateToken(req, res, next) {
    // DEUTSCH: Token aus "Authorization: Bearer <TOKEN>" Header extrahieren
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    console.log('authenticateToken called, token present:', !!token);

    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    // DEUTSCH: Token mit RS256-Algorithmus verifizieren — beide Issuer (Web + App) akzeptieren
    jwt.verify(token, getKey, {
        algorithms: ['RS256'],
        issuer: ISSUERS
    }, (err, decoded) => {
        if (err) {
            console.error('Token verification failed:', err.message);
            return res.status(403).json({ error: 'Invalid token' });
        }

        console.log('Token verified successfully for:', decoded.email);

        // DEUTSCH: Benutzer-Infos aus dem dekodierten Token in req.user speichern
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
 * DEUTSCH: Middleware — prüft ob der Benutzer eine bestimmte Rolle/Gruppe hat.
 * Verwendung: requireRole('vorstand', 'admin') — Benutzer muss mindestens eine der Rollen haben.
 * Muss NACH authenticateToken/authenticateAny verwendet werden (braucht req.user).
 */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        // DEUTSCH: Prüfe ob eine der geforderten Rollen in den Benutzer-Gruppen enthalten ist
        const userGroups = req.user.groups || [];
        const hasRole = roles.some(role => userGroups.includes(role));

        if (!hasRole) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        next();
    };
}

/**
 * DEUTSCH: Middleware — prüft den API-Key im Header "X-API-Key".
 * Wird für interne Service-zu-Service-Kommunikation verwendet (z.B. Events-Backend ruft Members-Backend auf).
 */
function requireApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Invalid API key' });
    }

    next();
}

/**
 * DEUTSCH: Kombinierte Middleware — akzeptiert 3 Authentifizierungsarten in dieser Reihenfolge:
 * 1. API-Key (für interne Service-Aufrufe) → Benutzer wird als "admin" behandelt
 * 2. Vorstand JWT (HS256, IMAP-basiert) → Für Vorstandsmitglieder
 * 3. Authentik JWT (RS256, OIDC) → Für normale Mitglieder
 * Wird bei Endpunkten verwendet die sowohl vom Vorstand als auch von Mitgliedern erreichbar sein sollen.
 */
function authenticateAny(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    const authHeader = req.headers['authorization'];

    // DEUTSCH: 1. Versuch: Interner API-Key
    if (apiKey && apiKey === process.env.API_KEY) {
        req.user = { id: 'api', name: 'API Service', groups: ['admin'] };
        return next();
    }

    // DEUTSCH: 2. Versuch: Vorstand JWT (HS256, mit JWT_SECRET signiert)
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
                // DEUTSCH: Kein gültiger Vorstand-Token, versuche Authentik
            }
        }

        // DEUTSCH: 3. Versuch: Authentik JWT (RS256)
        return authenticateToken(req, res, next);
    }

    return res.status(401).json({ error: 'Authentication required' });
}

/**
 * DEUTSCH: Middleware — NUR für Vorstand-Zugänge (IMAP-basierte Tokens).
 * Prüft ob der Token mit JWT_SECRET (HS256) signiert ist UND type='vorstand' enthält.
 * Wird bei Endpunkten verwendet die ausschliesslich dem Vorstand vorbehalten sind.
 */
function authenticateVorstand(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        // DEUTSCH: Token mit dem gemeinsamen JWT_SECRET verifizieren (HS256)
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // DEUTSCH: Sicherstellen dass es sich um einen Vorstand-Token handelt
        if (decoded.type !== 'vorstand') {
            return res.status(403).json({ error: 'Vorstand access required' });
        }

        req.user = {
            id: decoded.email,
            email: decoded.email,
            role: decoded.role,
            groups: decoded.groups || ['vorstand']
        };

        next();
    } catch (err) {
        console.error('Vorstand token verification failed:', err.message);
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
}

// DEUTSCH: Alle Middleware-Funktionen exportieren damit sie in index.js verwendet werden können
module.exports = {
    authenticateToken,     // Authentik OIDC Token (RS256) — für Mitglieder
    requireRole,           // Rollenprüfung — z.B. requireRole('vorstand')
    requireApiKey,         // API-Key Prüfung — für interne Service-Aufrufe
    authenticateAny,       // Kombiniert: API-Key ODER Vorstand-JWT ODER Authentik-JWT
    authenticateVorstand   // NUR Vorstand IMAP-Token (HS256)
};
