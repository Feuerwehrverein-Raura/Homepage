const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DB_PATH || '/data/fwv-raura.db';

// Initialize database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Database connection error:', err);
        process.exit(1);
    }
    console.log('✅ SQLite database connected:', dbPath);
});

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON');

// Initialize tables
db.serialize(() => {
    // Event registrations
    db.run(`
        CREATE TABLE IF NOT EXISTS event_registrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id TEXT NOT NULL,
            event_title TEXT NOT NULL,
            type TEXT NOT NULL,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT,
            participants INTEGER DEFAULT 1,
            notes TEXT,
            shift_ids TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Newsletter subscribers
    db.run(`
        CREATE TABLE IF NOT EXISTS newsletter_subscribers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            token TEXT,
            confirmed BOOLEAN DEFAULT 0,
            subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Members (pending approval)
    db.run(`
        CREATE TABLE IF NOT EXISTS pending_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            vorname TEXT NOT NULL,
            name TEXT NOT NULL,
            strasse TEXT,
            plz TEXT,
            ort TEXT,
            telefon TEXT,
            mobile TEXT,
            geburtstag TEXT,
            status TEXT DEFAULT 'pending',
            member_data TEXT,
            submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Member mutations (pending changes)
    db.run(`
        CREATE TABLE IF NOT EXISTS member_mutations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            changes TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            approved_at DATETIME,
            approved_by TEXT
        )
    `);

    // OTP codes (temporary)
    db.run(`
        CREATE TABLE IF NOT EXISTS otp_codes (
            email TEXT PRIMARY KEY,
            otp TEXT NOT NULL,
            data TEXT,
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Contact form submissions (log)
    db.run(`
        CREATE TABLE IF NOT EXISTS contact_submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            subject TEXT NOT NULL,
            message TEXT NOT NULL,
            ip_address TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log('✅ Database tables initialized');
});

// Helper functions
function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, changes: this.changes });
        });
    });
}

function getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function allQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

module.exports = {
    db,
    runQuery,
    getQuery,
    allQuery
};
