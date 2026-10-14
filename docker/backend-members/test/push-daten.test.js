// FCM-Daten eines Pushs (src/push-daten.js): nur Strings, leere Werte fallen
// weg, Ziel fuer Vorlagen-Mitteilungen.

const test = require('node:test');
const assert = require('node:assert/strict');
const { fcmDaten, vorlageZiel } = require('../src/push-daten');

test('fcmDaten: notificationType zuerst, alles als String', () => {
    assert.deepEqual(fcmDaten('event_update', { eventId: 'e1', ziel: 'anlass' }), {
        notificationType: 'event_update', eventId: 'e1', ziel: 'anlass'
    });
    assert.deepEqual(fcmDaten('general', { year: 2026 }), { notificationType: 'general', year: '2026' });
    assert.deepEqual(fcmDaten('general'), { notificationType: 'general' });
    assert.deepEqual(fcmDaten('general', null), { notificationType: 'general' });
});

test('fcmDaten: null und undefined fallen weg (kein "undefined" in der App)', () => {
    assert.deepEqual(fcmDaten('general', { template: 'X', ziel: null, eventId: undefined }), {
        notificationType: 'general', template: 'X'
    });
    // Leerer Text bleibt (bewusst gesetzt).
    assert.deepEqual(fcmDaten('general', { year: '' }), { notificationType: 'general', year: '' });
});

test('vorlageZiel: Datenaenderung ins Profil, sonst kein Ziel', () => {
    assert.equal(vorlageZiel('Datenänderung bestätigt'), 'profil');
    assert.equal(vorlageZiel('Willkommen neues Mitglied'), null);
});
