// Nachricht-Entwuerfe (src/entwuerfe.js): Eingabe pruefen ohne Datenbank;
// die Routen gegen eine echte Datenbank, wenn TEST_DATABASE_URL gesetzt ist.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { entwurfSchema, entwurfLesen, mountEntwuerfe } = require('../src/entwuerfe');

test('Entwurf: Betreff oder Text noetig, Art und Wahl bereinigt', () => {
    assert.equal(entwurfLesen({}).fehler, 'Betreff oder Text fehlt');
    assert.equal(entwurfLesen({ betreff: '  ', text: '' }).fehler, 'Betreff oder Text fehlt');
    const e = entwurfLesen({ betreff: 'GV', art: 'fax', wahl: [1], anlass_id: 'kein-uuid' });
    assert.deepEqual(e, { betreff: 'GV', text: '', art: 'auto', wahl: null, anlassId: null });
    assert.equal(entwurfLesen({ text: 'x', art: 'post' }).art, 'post');
});

const DB = process.env.TEST_DATABASE_URL;
test('Entwuerfe: anlegen, aendern, auflisten, loeschen', { skip: !DB && 'TEST_DATABASE_URL nicht gesetzt' }, async (t) => {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: DB });
    t.after(() => pool.end());
    await pool.query('DROP TABLE IF EXISTS nachricht_entwuerfe');
    await entwurfSchema(pool);
    const app = express();
    app.use(express.json());
    let name = 'Anna Aktuar';
    mountEntwuerfe(app, pool, [(req, res, next) => { req.user = { name }; next(); }]);
    const server = app.listen(0);
    t.after(() => server.close());
    const basis = `http://127.0.0.1:${server.address().port}/dispatch/entwuerfe`;
    const senden = (methode, url, daten) => fetch(url, {
        method: methode, headers: { 'Content-Type': 'application/json' }, body: daten && JSON.stringify(daten),
    });

    assert.equal((await senden('POST', basis, { betreff: '' })).status, 400);
    const neu = await (await senden('POST', basis, {
        betreff: 'GV 2027', text: 'Liebe {{vorname}}', art: 'email', wahl: { gruppe: 'aktiv' },
    })).json();
    assert.equal(neu.erstellt_von, 'Anna Aktuar');
    assert.deepEqual(neu.wahl, { gruppe: 'aktiv' });

    name = 'Paul Praesident';
    const geaendert = await (await senden('PUT', `${basis}/${neu.id}`, { betreff: 'GV 2027', text: 'Neu' })).json();
    assert.equal(geaendert.text, 'Neu');
    assert.equal(geaendert.geaendert_von, 'Paul Praesident');
    assert.equal(geaendert.erstellt_von, 'Anna Aktuar');

    const liste = await (await fetch(basis)).json();
    assert.deepEqual(liste.map((e) => e.betreff), ['GV 2027']);
    assert.equal((await senden('PUT', `${basis}/00000000-0000-0000-0000-000000000000`, { text: 'x' })).status, 404);

    assert.equal((await senden('DELETE', `${basis}/${neu.id}`)).status, 200);
    assert.deepEqual(await (await fetch(basis)).json(), []);
});
