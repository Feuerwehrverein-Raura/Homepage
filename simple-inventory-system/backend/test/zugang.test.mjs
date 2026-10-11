// Regeln, wer ins Lager darf (src/zugang.ts), ohne Netz und Datenbank.
// Laeuft gegen das kompilierte dist/ — `npm test` baut vorher.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  anwendungAusIssuer, gruppenAusClaims, hatLagerGruppe, issuerFuer, jwksFuer,
  lagerZugang, KEIN_LAGER_ZUGRIFF
} from '../dist/zugang.js';

const AUTH = 'https://auth.fwv-raura.ch';

test('Issuer und JWKS je Anwendung', () => {
  assert.equal(issuerFuer(AUTH, 'fwv-members-app'), 'https://auth.fwv-raura.ch/application/o/fwv-members-app/');
  assert.equal(issuerFuer(`${AUTH}/`, 'inventory-system'), 'https://auth.fwv-raura.ch/application/o/inventory-system/');
  assert.equal(jwksFuer(AUTH, 'fwv-members'), 'https://auth.fwv-raura.ch/application/o/fwv-members/jwks/');
});

test('Angenommen werden genau drei Anwendungen', () => {
  assert.equal(anwendungAusIssuer(AUTH, `${AUTH}/application/o/inventory-system/`), 'inventory-system');
  assert.equal(anwendungAusIssuer(AUTH, `${AUTH}/application/o/fwv-members-app/`), 'fwv-members-app');
  assert.equal(anwendungAusIssuer(AUTH, `${AUTH}/application/o/fwv-members/`), 'fwv-members');
  assert.equal(anwendungAusIssuer(AUTH, `${AUTH}/application/o/vorstand/`), null);
  assert.equal(anwendungAusIssuer(AUTH, `${AUTH}/application/o/fwv-members-app`), null, 'ohne Schraegstrich');
  assert.equal(anwendungAusIssuer(AUTH, 'https://boese.example/application/o/fwv-members-app/'), null);
  assert.equal(anwendungAusIssuer(AUTH, undefined), null);
  assert.equal(anwendungAusIssuer(AUTH, 42), null);
});

test('Gruppen: nur Texte, Gross-/Kleinschreibung egal', () => {
  assert.deepEqual(gruppenAusClaims({ groups: ['Lager', 3, null, 'Mitglieder'] }), ['Lager', 'Mitglieder']);
  assert.deepEqual(gruppenAusClaims({ groups: 'Lager' }), []);
  assert.deepEqual(gruppenAusClaims({}), []);
  assert.deepEqual(gruppenAusClaims(null), []);
  for (const g of ['Lager', 'lager', 'LAGER', ' Lager ', 'Vorstand', 'vorstand', 'admin', 'Admin']) {
    assert.equal(hatLagerGruppe([g]), true, g);
  }
  assert.equal(hatLagerGruppe(['Mitglieder']), false);
  assert.equal(hatLagerGruppe(['Lagerist']), false, 'kein Teiltreffer');
  assert.equal(hatLagerGruppe([]), false);
});

test('Inventar-PWA: keine Gruppenpruefung (wie bisher)', () => {
  assert.deepEqual(lagerZugang('inventory-system', {}), { ok: true, anwendung: 'inventory-system' });
  assert.deepEqual(lagerZugang('inventory-system', { groups: ['Mitglieder'] }), { ok: true, anwendung: 'inventory-system' });
});

test('Mitglieder-App und -Web: nur mit Lager, Vorstand oder admin', () => {
  for (const a of ['fwv-members-app', 'fwv-members']) {
    assert.equal(lagerZugang(a, { groups: ['Mitglieder', 'Lager'] }).ok, true);
    assert.equal(lagerZugang(a, { groups: ['Vorstand'] }).ok, true);
    assert.equal(lagerZugang(a, { groups: ['admin'] }).ok, true);
    assert.deepEqual(lagerZugang(a, { groups: ['Mitglieder'] }), { ok: false, status: 403, error: KEIN_LAGER_ZUGRIFF });
    assert.equal(lagerZugang(a, {}).ok, false, 'ohne groups-Claim');
  }
  assert.match(KEIN_LAGER_ZUGRIFF, /Gruppe Lager/);
});

test('Unbekannte Anwendung: ungueltiges Token', () => {
  assert.deepEqual(lagerZugang(null, { groups: ['admin'] }), { ok: false, status: 403, error: 'Invalid token' });
});
