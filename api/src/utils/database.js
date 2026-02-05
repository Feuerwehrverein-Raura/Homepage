/**
 * database.js - SQLite Datenbank-Initialisierung und Wrapper
 *
 * Tabellen:
 * - event_registrations: Event-Anmeldungen (Helfer/Teilnehmer)
 * - newsletter_subscribers: Newsletter-Abonnenten
 * - pending_members: Pendente Mitgliedschaftsanträge
 * - member_mutations: Datenänderungsanfragen
 * - otp_codes: Temporäre OTP-Codes
 * - contact_submissions: Kontaktformular-Log
 *
 * Wrapper-Funktionen: runQuery, getQuery, allQuery (Promise-basiert)
 */
const sqlite3 = require('sqlite3').verbose();  // .verbose() für bessere Fehlermeldungen
const path = require('path');

// Datenbankpfad aus Umgebungsvariable oder Standard
const dbPath = process.env.DB_PATH || '/data/fwv-raura.db';

// ========== DATENBANKVERBINDUNG ==========
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Database connection error:', err);
        process.exit(1);  // Bei Fehler Server beenden
    }
    console.log('✅ SQLite database connected:', dbPath);
});

// ========== DATENBANK-OPTIMIERUNGEN ==========
db.run('PRAGMA foreign_keys = ON');    // Fremdschlüssel aktivieren
db.run('PRAGMA journal_mode = WAL');   // Write-Ahead Logging für bessere Parallelität

// ========== TABELLEN INITIALISIERUNG ==========
// db.serialize() stellt sicher, dass alle Statements sequentiell ausgeführt werden
db.serialize(() => {
    // Tabelle: Event-Anmeldungen (Helfer und Teilnehmer)
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

    // Tabelle: Newsletter-Abonnenten
    db.run(`
        CREATE TABLE IF NOT EXISTS newsletter_subscribers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            token TEXT,
            confirmed BOOLEAN DEFAULT 0,
            subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Tabelle: Pendente Mitgliedschaftsanträge (warten auf Vorstand-Genehmigung)
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

    // Tabelle: Datenänderungsanfragen von Mitgliedern
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

    // Tabelle: OTP-Codes (temporär, 5 Min gültig)
    db.run(`
        CREATE TABLE IF NOT EXISTS otp_codes (
            email TEXT PRIMARY KEY,
            otp TEXT NOT NULL,
            data TEXT,
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Tabelle: Kontaktformular-Log (für Audit/Debugging)
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

// ========== PROMISE-BASIERTE WRAPPER ==========
// SQLite3 verwendet Callbacks, diese Wrapper ermöglichen async/await

/**
 * Führt INSERT, UPDATE oder DELETE aus
 * @param {string} sql - SQL Statement mit ? Platzhaltern
 * @param {Array} params - Parameter für Platzhalter
 * @returns {Promise<{id: number, changes: number}>} lastID und Anzahl Änderungen
 */
function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            // this.lastID = ID des eingefügten Datensatzes
            // this.changes = Anzahl geänderter Zeilen
            else resolve({ id: this.lastID, changes: this.changes });
        });
    });
}

/**
 * Holt eine einzelne Zeile (SELECT ... LIMIT 1)
 * @param {string} sql - SQL SELECT Statement
 * @param {Array} params - Parameter für Platzhalter
 * @returns {Promise<Object|undefined>} Zeile als Objekt oder undefined
 */
function getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

/**
 * Holt alle Zeilen eines SELECT
 * @param {string} sql - SQL SELECT Statement
 * @param {Array} params - Parameter für Platzhalter
 * @returns {Promise<Array>} Array von Zeilen-Objekten
 */
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
