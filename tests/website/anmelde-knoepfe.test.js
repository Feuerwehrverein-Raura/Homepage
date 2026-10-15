// Anmelde-Formulare: Knopf waehrend des Sendens gesperrt, Text des Servers
// sichtbar, Personenzahl klar beschriftet. Anlass: Spaghetti-Plausch 2026,
// vier Anmeldungen derselben Person in 5 Sekunden (vorstand.html "Person
// hinzufuegen" ohne Sperre). Reine Quelltext-Pruefung - die Seiten haben
// keine eigene Test-Umgebung.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const seite = name => fs.readFileSync(
    path.join(__dirname, '..', '..', 'docker', 'frontend-website', name), 'utf8');

/** Rumpf einer Funktion/eines Handlers ab [anfang] bis zum naechsten [ende]. */
function abschnitt(text, anfang, ende) {
    const a = text.indexOf(anfang);
    assert.ok(a >= 0, `nicht gefunden: ${anfang}`);
    const b = text.indexOf(ende, a + anfang.length);
    return text.slice(a, b < 0 ? undefined : b);
}

test('events.html: Personenzahl klar beschriftet', () => {
    const html = seite('events.html');
    assert.equal(html.split('Wie viele Personen kommen, dich eingeschlossen? *').length - 1, 2,
        'Teilnehmer- und GV-Formular');
    assert.ok(!html.includes('>Anzahl Personen *<'));
});

test('events.html: Knopf gesperrt, Text des Servers wird gezeigt', () => {
    const html = seite('events.html');
    for (const fn of ['async submitParticipantRegistration(', 'async submitGVRegistration(']) {
        const rumpf = abschnitt(html, fn, '\n            }\n\n');
        assert.match(rumpf, /submitBtn\.disabled = true/, fn);
        assert.match(rumpf, /finally \{[\s\S]*submitBtn\.disabled = false/, fn);
        assert.match(rumpf, /vomServer: !!result\.message/, fn);
        assert.match(rumpf, /alert\(error\.vomServer \? error\.message :/, fn);
    }
    assert.match(abschnitt(html, 'async continueAsGuest(', 'showSuccessAndRedirect(serverMessage)'),
        /if \(this\.sendetAlsGast\) return;/);
});

test('vorstand.html: "Person hinzufuegen" sperrt den Knopf und zeigt den 409-Text', () => {
    const html = seite('vorstand.html');
    assert.match(html, /<button id="add-person-save" onclick="saveAddPerson\(\)"/);
    const rumpf = abschnitt(html, 'async function saveAddPerson()', '\n        }\n');
    assert.match(rumpf, /if \(saveBtn\?\.disabled\) return;/);
    assert.match(rumpf, /saveBtn\.disabled = true/);
    assert.match(rumpf, /throw new Error\(result\.error \|\| 'Fehler beim Hinzufuegen'\)/);
    assert.match(rumpf, /finally \{[\s\S]*saveBtn\.disabled = false/);
});

test('event-dashboard.html: Teilnehmer hinzufuegen sperrt den Knopf', () => {
    const html = seite('event-dashboard.html');
    const rumpf = abschnitt(html, "getElementById('add-participant-form').addEventListener('submit'", '</script>');
    assert.match(rumpf, /if \(submitBtn\?\.disabled\) return;/);
    assert.match(rumpf, /finally \{[\s\S]*submitBtn\.disabled = false/);
});
