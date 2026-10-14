// Der abonnierbare Kalender (/calendar/ics) zeigt nur echte Termine.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('ICS ohne offene Daten, Entwuerfe, Vorschlaege, Abgelehnte und Abgesagte', () => {
    const quelle = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
    const route = quelle.slice(quelle.indexOf("app.get('/calendar/ics'"));
    const abfrage = route.slice(0, route.indexOf('ical('));
    for (const s of ['cancelled', 'draft', 'proposed', 'rejected']) assert.match(abfrage, new RegExp(`'${s}'`));
    assert.match(abfrage, /COALESCE\(datum_offen, false\) = false/);
    assert.match(route.slice(0, 1500), /id: `\$\{event\.id\}@fwv-raura\.ch`/);
});
