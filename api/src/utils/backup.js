const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

const DB_PATH = process.env.DB_PATH || '/data/fwv-raura.db';
const BACKUP_DIR = process.env.BACKUP_DIR || '/sync/backups';
const BACKUP_INTERVAL = process.env.BACKUP_INTERVAL || 3600000; // 1 hour

/**
 * Create SQLite backup using .backup command
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
 * Cleanup backups older than 24 hours
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
 * Enable WAL mode for better concurrent access
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
 * Start automatic backup interval
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
