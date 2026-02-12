const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const AUTHENTIK_URL = process.env.AUTHENTIK_URL || 'https://auth.fwv-raura.ch';
const AUTHENTIK_APP_SLUG = process.env.AUTHENTIK_APP_SLUG || 'spam-manager';

const client = jwksClient({
    jwksUri: `${AUTHENTIK_URL}/application/o/${AUTHENTIK_APP_SLUG}/jwks/`,
    cache: true,
    cacheMaxAge: 600000,
    rateLimit: true,
    jwksRequestsPerMinute: 10
});

function getKey(header, callback) {
    client.getSigningKey(header.kid, (err, key) => {
        if (err) return callback(err);
        callback(null, key.getPublicKey());
    });
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    jwt.verify(token, getKey, {
        algorithms: ['RS256'],
        issuer: `${AUTHENTIK_URL}/application/o/${AUTHENTIK_APP_SLUG}/`
    }, (err, decoded) => {
        if (err) {
            console.error('Token verification failed:', err.message);
            return res.status(403).json({ error: 'Invalid token' });
        }

        const groups = decoded.groups || [];
        if (!groups.includes('admin')) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        req.user = {
            id: decoded.sub,
            email: decoded.email,
            name: decoded.name,
            groups
        };
        next();
    });
}

module.exports = { authenticateToken };
