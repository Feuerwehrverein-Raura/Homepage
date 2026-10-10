// Gemeinsamer Aufbau der Test-Datenbank: Schema frisch aus init.sql und allen
// Migrationen, damit die Tests gegen dasselbe Schema laufen wie die
// Produktion. ACHTUNG: leert die Datenbank — nur TEST_DATABASE_URL verwenden.

const fs = require('node:fs');
const path = require('node:path');

async function schemaAufbauen(pool) {
    const pg = path.join(__dirname, '..', '..', 'postgres');
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await pool.query(fs.readFileSync(path.join(pg, 'init.sql'), 'utf8'));
    const migrationen = fs.readdirSync(path.join(pg, 'migrations')).filter(f => f.endsWith('.sql')).sort();
    for (const datei of migrationen) {
        await pool.query(fs.readFileSync(path.join(pg, 'migrations', datei), 'utf8'));
    }
}

module.exports = { schemaAufbauen };
