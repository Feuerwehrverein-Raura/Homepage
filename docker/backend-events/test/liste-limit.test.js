// ?limit= fuer GET /events (liste-limit.js) - Startseite zeigt nur 3 Termine.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { listenLimit, MAX_LIMIT } = require('../src/liste-limit');

test('positive Ganzzahl gilt, gedeckelt auf MAX_LIMIT', () => {
    assert.equal(listenLimit('3'), 3);
    assert.equal(listenLimit(' 12 '), 12);
    assert.equal(listenLimit(1), 1);
    assert.equal(listenLimit(String(MAX_LIMIT)), MAX_LIMIT);
    assert.equal(listenLimit('100000'), MAX_LIMIT);
    assert.equal(listenLimit(['5', '7']), 5);
});

test('alles andere heisst ohne Limit', () => {
    for (const w of [undefined, null, '', '0', '-3', '2.5', '1e3', 'abc', '3; DROP TABLE events']) {
        assert.equal(listenLimit(w), null, String(w));
    }
});

test('GET /events haengt LIMIT parametrisiert nach ORDER BY an', () => {
    const quelle = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
    const start = quelle.indexOf("app.get('/events', ");
    const ende = quelle.indexOf('pool.query(query, params)', start);
    assert.ok(start > 0 && ende > start);
    const route = quelle.slice(start, ende);
    assert.match(route, /listenLimit\(req\.query\.limit\)/);
    const order = route.lastIndexOf('ORDER BY');
    const limit = route.indexOf('LIMIT $${params.length}');
    assert.ok(order > 0 && limit > order, 'LIMIT nach der Sortierung');
    assert.doesNotMatch(route, /LIMIT \$\{limit\}/, 'nicht in den Text eingesetzt');
});

test('upcoming=true: Datum-offen-Anlaesse kommen ans Ende', () => {
    const quelle = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
    assert.match(quelle, /upcoming === 'true'\) \{[\s\S]{0,400}ORDER BY \(e\.datum_offen IS TRUE\), e\.start_date, e\.id/);
});
