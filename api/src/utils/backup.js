/**
 * backup.js - SQLite Datenbank-Backup mit Syncthing-Integration
 *
 * Features:
 * - Atomare Backups mit SQLite .backup Befehl
 * - Automatische stündliche Backups
 * - Cleanup alter Backups (>24h)
 * - Syncthing-kompatibel (fwv-raura-latest.db)
 *
 * Konfiguration über Umgebungsvariablen:
 * - DB_PATH: Pfad zur SQLite-Datenbank
 * - BACKUP_DIR: Backup-Verzeichnis (z.B. /sync/backups für Syncthing)
 * - BACKUP_INTERVAL: Intervall in ms (Standard: 1 Stunde)
 */
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

// Konfiguration aus Umgebungsvariablen
const DB_PATH = process.env.DB_PATH || '/data/fwv-raura.db';
const BACKUP_DIR = process.env.BACKUP_DIR || '/sync/backups';  // Syncthing-Ordner
const BACKUP_INTERVAL = process.env.BACKUP_INTERVAL || 3600000;  // 1 Stunde

/**
 * Erstellt atomares SQLite-Backup
 *
 * Verwendet SQLite's .backup Befehl für konsistente Backups
 * auch während laufender Schreiboperationen.
 *
 * @returns {Promise<string>} Pfad zur Backup-Datei
 */
async function createBackup() {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(BACKUP_DIR, `fwv-raura-${timestamp}.db`);

        // Ensure backup directory exists
        await fs.mkdir(BACKUP_DIR, { recursive: true });

        // Use SQLite's built-in backup command (atomic and safe)
        await new Promise((resolve, reject) => {
            exec(`sqlite3 ${DB_PATH} ".backup '${backupFile}'"`, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });

        console.log(`✅ Database backup created: ${backupFile}`);

        // Create latest symlink for Syncthing
        const latestLink = path.join(BACKUP_DIR, 'fwv-raura-latest.db');
        try {
            await fs.unlink(latestLink);
        } catch (err) {
            // Ignore if doesn't exist
        }
        await fs.copyFile(backupFile, latestLink);

        // Cleanup old backups (keep last 24 hours)
        await cleanupOldBackups();

        return backupFile;
    } catch (error) {
        console.error('❌ Backup failed:', error);
        throw error;
    }
}

/**
 * Löscht Backups die älter als 24 Stunden sind
 *
 * Behält fwv-raura-latest.db (Syncthing-Link)
 * Löscht nur .db Dateien
 */
async function cleanupOldBackups() {
    try {
        const files = await fs.readdir(BACKUP_DIR);
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours

        for (const file of files) {
            if (file === 'fwv-raura-latest.db') continue;
            if (!file.endsWith('.db')) continue;

            const filePath = path.join(BACKUP_DIR, file);
            const stats = await fs.stat(filePath);

            if (now - stats.mtime.getTime() > maxAge) {
                await fs.unlink(filePath);
                console.log(`🗑️  Deleted old backup: ${file}`);
            }
        }
    } catch (error) {
        console.error('Cleanup error:', error);
    }
}

/**
 * Aktiviert WAL-Modus (Write-Ahead Logging) für SQLite
 *
 * WAL ermöglicht bessere Parallelität:
 * - Lesezugriffe blockieren Schreibzugriffe nicht
 * - Bessere Performance bei vielen gleichzeitigen Zugriffen
 *
 * @param {Object} db - SQLite Datenbank-Instanz
 */
function enableWAL(db) {
    return new Promise((resolve, reject) => {
        db.run('PRAGMA journal_mode=WAL', (err) => {
            if (err) {
                reject(err);
            } else {
                console.log('✅ WAL mode enabled');
                resolve();
            }
        });
    });
}

/**
 * Startet automatischen Backup-Scheduler
 *
 * Erstellt sofort ein initiales Backup und danach
 * periodisch nach BACKUP_INTERVAL.
 */
function startBackupSchedule() {
    console.log(`🕐 Backup schedule started (every ${BACKUP_INTERVAL / 1000}s)`);

    // Initial backup
    createBackup().catch(err => console.error('Initial backup failed:', err));

    // Periodic backups
    setInterval(() => {
        createBackup().catch(err => console.error('Scheduled backup failed:', err));
    }, BACKUP_INTERVAL);
}

module.exports = {
    createBackup,
    cleanupOldBackups,
    enableWAL,
    startBackupSchedule
};
