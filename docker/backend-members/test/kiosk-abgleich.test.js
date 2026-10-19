// Titelliste abgleichen (src/kiosk-abgleich.js) ohne Datenbank: Was trifft,
// was knapp ist und was nicht treffen darf.

const test = require('node:test');
const assert = require('node:assert/strict');
const { kioskZeileSaeubern, kioskKandidat, kioskAbgleichen } = require('../src/kiosk-abgleich');

// So meldet der Laptop seine Titel: MPD-Pfad, Interpret und Titel aus den Tags.
const SAMMLUNG = [
    { pfad: 'Queen/A Night at the Opera/11 Bohemian Rhapsody.mp3', interpret: 'Queen', titel: 'Bohemian Rhapsody' },
    { pfad: 'Queen/Jazz/12 Don\'t Stop Me Now.mp3', interpret: 'Queen', titel: 'Don\'t Stop Me Now' },
    { pfad: 'Beatles/Let It Be/06 Let It Be.flac', interpret: 'Beatles', titel: 'Let It Be' },
    { pfad: 'Partyhits/DJ Ötzi - Hey Baby.mp3', interpret: 'DJ Ötzi', titel: 'Hey Baby (Uhh, Ahh)' },
    { pfad: 'Schlager/Helene Fischer/Atemlos durch die Nacht.mp3', interpret: 'Helene Fischer', titel: 'Atemlos durch die Nacht' },
    { pfad: 'Diverses/Love Night.mp3', interpret: 'Irgendwer', titel: 'Love Night' },
    { pfad: 'Diverses/K.I.Z - Kannibalenlied.mp3', interpret: 'K.I.Z', titel: 'Kannibalenlied' }
].map(kioskKandidat);

function abgleich(text) {
    return kioskAbgleichen(text.split('\n').map(kioskZeileSaeubern).filter(Boolean), SAMMLUNG);
}

test('Genaue Zeilen treffen sicher, trotz Ordner und Tracknummer im Pfad', () => {
    const r = abgleich('Queen - Bohemian Rhapsody\nBohemian Rhapsody - Queen\nHelene Fischer – Atemlos durch die Nacht');
    assert.deepEqual(r.fehlend, []);
    assert.equal(r.gefunden.length, 2, 'doppelte Zeile nur einmal');
    assert.ok(r.gefunden.every(t => t.sicher));
});

test('Schreibweisen: Apostroph, The, Akzente, Klammern, Zusaetze', () => {
    const r = abgleich([
        'Queen - Dont Stop Me Now (2011 Remaster)',
        'The Beatles - Let It Be - Remastered 2009',
        'DJ Otzi - Hey Baby [Official Video]',
        'K.I.Z - Kannibalenlied - Live'
    ].join('\n'));
    assert.deepEqual(r.fehlend, []);
    assert.deepEqual(r.gefunden.map(t => t.titel),
        ['Don\'t Stop Me Now', 'Let It Be', 'Hey Baby (Uhh, Ahh)', 'Kannibalenlied']);
});

test('Spotify-Export mit Album: Titel und Interpret vollstaendig drin genuegt', () => {
    const r = abgleich('1. Bohemian Rhapsody - Remastered 2011 · Queen · A Night At The Opera');
    assert.equal(r.gefunden.length, 1);
    assert.equal(r.gefunden[0].titel, 'Bohemian Rhapsody');
});

test('CSV: erste zwei Felder', () => {
    const r = abgleich('"Atemlos durch die Nacht","Helene Fischer","Farbenspiel","3:40"');
    assert.equal(r.gefunden.length, 1);
});

test('Zufaellige Wortueberschneidung trifft nicht', () => {
    const r = abgleich('Queen - Another One Bites the Dust\nLove Story - Taylor Swift\nRhapsody in Blue - Gershwin\nTitel');
    assert.deepEqual(r.gefunden, []);
    assert.equal(r.fehlend.length, 4);
});
