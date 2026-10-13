// Logos fuer wiederkehrende Anlaesse: Reihe am Titel erkennen, eigenes Bild
// geht vor.

const test = require('node:test');
const assert = require('node:assert/strict');
const { anlassReihe, anlassLogo } = require('../src/anlass-logo');
const appAnsicht = require('../src/app-ansicht');

test('Reihe am Titel', () => {
    assert.equal(anlassReihe({ title: 'Fasnachtsauftakt 2027' }).reihe, 'fasnacht');
    assert.equal(anlassReihe({ title: 'Fasnachtssamstig 2027' }).reihe, 'fasnacht');
    assert.equal(anlassReihe({ title: 'Chilbi 2026' }).reihe, 'chilbi');
    assert.equal(anlassReihe({ title: 'Preisjassen 2026' }).reihe, 'preisjassen');
    assert.equal(anlassReihe({ title: 'Weihnachtshock 2026' }).reihe, 'weihnachtshock');
    assert.equal(anlassReihe({ title: 'Spaghetti-Plausch 2026' }), null);
    assert.equal(anlassReihe({ title: 'Weihnachtsessen 2026' }), null);
    assert.equal(anlassReihe({ title: 'Jassabend' }), null);
    assert.equal(anlassReihe({}), null);
});

test('Logo: eigenes https-Bild vor Reihe, sonst Reihe, sonst null', () => {
    assert.equal(anlassLogo({ title: 'Chilbi 2026' }), 'https://www.fwv-raura.ch/images/anlaesse/chilbi.png');
    assert.equal(anlassLogo({ title: 'Chilbi 2026', image_url: 'https://x.ch/c.jpg' }), 'https://x.ch/c.jpg');
    assert.equal(anlassLogo({ title: 'Chilbi 2026', image_url: 'http://x.ch/c.jpg' }),
        'https://www.fwv-raura.ch/images/anlaesse/chilbi.png');
    assert.equal(anlassLogo({ title: 'Rega Basel' }), null);
});

test('App-Ansicht liefert app.logo und app.reihe', () => {
    const a = appAnsicht.anlassAnsicht({ title: 'Weihnachtshock 2026', start_date: '2026-12-12T18:00:00Z', shifts: [] });
    assert.equal(a.app.reihe, 'weihnachtshock');
    assert.equal(a.app.logo, 'https://www.fwv-raura.ch/images/anlaesse/weihnachtshock.png');
});
