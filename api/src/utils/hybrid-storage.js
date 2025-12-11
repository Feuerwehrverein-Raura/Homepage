/**
 * Hybrid Storage System
 *
 * - SQLite für schnelle, transaktionale Daten (Anmeldungen, Newsletter, OTPs)
 * - GitHub für statische Daten und Backups (Events, Vorstand, Mitglieder-Stammdaten)
 *
 * Best of both worlds:
 * - Schnelle Writes in SQLite
 * - Git-History für wichtige Änderungen
 * - Offline-Fähigkeit
 */

const { runQuery, getQuery, allQuery } = require('./database');
const { loadJSON, saveJSON } = require('./github');

/**
 * Save event registration to SQLite + optionally sync to GitHub
 */
async function saveEventRegistration(registration, syncToGitHub = false) {
    // Fast write to SQLite
    const result = await runQuery(
        `INSERT INTO event_registrations
        (event_id, event_title, type, name, email, phone, participants, notes, shift_ids)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            registration.eventId,
            registration.eventTitle,
            registration.type,
            registration.name,
            registration.email,
            registration.phone || null,
            registration.participants || 1,
            registration.notes || null,
            JSON.stringify(registration.shiftIds || [])
        ]
    );

    // Optional: Sync to GitHub for backup
    if (syncToGitHub) {
        try {
            const { data: anmeldungen, sha } = await loadJSON('anmeldungen_data.json');
            const list = anmeldungen || { lastUpdated: new Date().toISOString(), registrations: [] };

            list.registrations.push({
                ...registration,
                id: result.id,
                timestamp: new Date().toISOString()
            });
            list.lastUpdated = new Date().toISOString();

            await saveJSON(
                'anmeldungen_data.json',
                list,
                `Event-Anmeldung: ${registration.name}`,
                sha
            );
        } catch (error) {
            console.warn('GitHub sync failed (non-critical):', error.message);
        }
    }

    return result;
}

/**
 * Get event registrations from SQLite
 */
async function getEventRegistrations(eventId = null) {
    if (eventId) {
        return await allQuery(
            'SELECT * FROM event_registrations WHERE event_id = ? ORDER BY timestamp DESC',
            [eventId]
        );
    } else {
        return await allQuery(
            'SELECT * FROM event_registrations ORDER BY timestamp DESC'
        );
    }
}

/**
 * Save newsletter subscriber to SQLite + GitHub backup
 */
async function saveNewsletterSubscriber(email, syncToGitHub = false) {
    await runQuery(
        `INSERT OR REPLACE INTO newsletter_subscribers (email, confirmed, subscribed_at)
         VALUES (?, 1, datetime('now'))`,
        [email]
    );

    if (syncToGitHub) {
        try {
            const { data: subscribers, sha } = await loadJSON('newsletter_subscribers.json');
            const list = subscribers || { lastUpdated: new Date().toISOString(), subscribers: [] };

            if (!list.subscribers.find(s => s.email === email)) {
                list.subscribers.push({
                    email,
                    subscribedAt: new Date().toISOString(),
                    confirmed: true
                });
                list.lastUpdated = new Date().toISOString();

                await saveJSON('newsletter_subscribers.json', list, `Newsletter: ${email}`, sha);
            }
        } catch (error) {
            console.warn('GitHub sync failed (non-critical):', error.message);
        }
    }
}

module.exports = {
    saveEventRegistration,
    getEventRegistrations,
    saveNewsletterSubscriber
};
