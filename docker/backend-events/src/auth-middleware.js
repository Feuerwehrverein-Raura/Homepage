/**
 * Authentik JWT Validation Middleware
 *
 * Validates access tokens from Authentik OIDC
 */

const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const AUTHENTIK_URL = process.env.AUTHENTIK_URL || 'https://auth.fwv-raura.ch';

// JWKS client to get public keys from Authentik
const client = jwksClient({
    jwksUri: `${AUTHENTIK_URL}/application/o/fwv-members/jwks/`,
    cache: true,
    cacheMaxAge: 600000, // 10 minutes
    rateLimit: true,
    jwksRequestsPerMinute: 10
});

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
 * Middleware to verify Authentik JWT token
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
 * Middleware to check if user has required role/group
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
 * Middleware to check API key for internal service calls
 */
function requireApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Invalid API key' });
    }

    next();
}

/**
 * Combined middleware: accepts either JWT or API key
 */
function authenticateAny(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    const authHeader = req.headers['authorization'];

    // First try API key
    if (apiKey && apiKey === process.env.API_KEY) {
        req.user = { id: 'api', name: 'API Service', groups: ['admin'] };
        return next();
    }

    // Then try Vorstand JWT (HS256 with JWT_SECRET)
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

        // Try Authentik JWT (RS256)
        return authenticateToken(req, res, next);
    }

    return res.status(401).json({ error: 'Authentication required' });
}

module.exports = {
    authenticateToken,
    requireRole,
    requireApiKey,
    authenticateAny
};
