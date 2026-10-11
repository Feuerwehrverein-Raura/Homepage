// Regeln, wer ins Lager darf (src/zugang.ts), ohne Netz und Datenbank.
// Laeuft gegen das kompilierte dist/ — `npm test` baut vorher.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  anwendungAusIssuer, ausleiheZugang, gruppenAusClaims, hatLagerGruppe, issuerFuer, istMitgliederToken,
  jwksFuer, lagerZugang, KEIN_LAGER_ZUGRIFF, MITGLIEDER_TOKEN, mitgliedPruefungLesen
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

test('Mitglieder-Tokens von api-members erkennen (QR-Code, Anmeldebon, App-Passwort)', () => {
  assert.equal(istMitgliederToken({ type: 'member', sub: 'u1' }), true);
  assert.equal(istMitgliederToken({ type: 'member', iss: `${AUTH}/application/o/fwv-members-app/` }), false,
    'mit Issuer: Authentik-Token');
  assert.equal(istMitgliederToken({ type: 'vorstand' }), false);
  assert.equal(istMitgliederToken({ type: 'event-organizer' }), false);
  assert.equal(istMitgliederToken({ iss: AUTH }), false);
  assert.equal(istMitgliederToken(null), false);
});

test('Mitglieder-Tokens: dieselbe Gruppenregel wie die Mitglieder-App', () => {
  assert.equal(lagerZugang(MITGLIEDER_TOKEN, { groups: ['Mitglieder', 'Lager'] }).ok, true);
  assert.equal(lagerZugang(MITGLIEDER_TOKEN, { groups: ['vorstand'] }).ok, true);
  assert.deepEqual(lagerZugang(MITGLIEDER_TOKEN, { groups: ['Mitglieder'] }),
    { ok: false, status: 403, error: KEIN_LAGER_ZUGRIFF });
  assert.deepEqual(ausleiheZugang(MITGLIEDER_TOKEN, { groups: ['Mitglieder'] }),
    { ok: true, anwendung: MITGLIEDER_TOKEN, lager: false }, 'jedes Mitglied darf ausleihen');
  assert.deepEqual(ausleiheZugang(MITGLIEDER_TOKEN, { groups: ['Lager'] }),
    { ok: true, anwendung: MITGLIEDER_TOKEN, lager: true });
});

test('Antwort von api-members lesen', () => {
  assert.deepEqual(
    mitgliedPruefungLesen({ valid: true, member_id: 'u1', email: 'e@x.ch', name: 'Erika', groups: ['Lager', 3], exp: 99 }),
    { memberId: 'u1', email: 'e@x.ch', name: 'Erika', groups: ['Lager'], exp: 99 });
  assert.deepEqual(mitgliedPruefungLesen({ valid: true, member_id: 'u1', email: null }),
    { memberId: 'u1', email: '', name: '', groups: [], exp: null });
  assert.equal(mitgliedPruefungLesen({ valid: false, member_id: 'u1' }), null);
  assert.equal(mitgliedPruefungLesen({ valid: 'true', member_id: 'u1' }), null);
  assert.equal(mitgliedPruefungLesen({ valid: true }), null, 'ohne Mitglied');
  assert.equal(mitgliedPruefungLesen(null), null);
  assert.equal(mitgliedPruefungLesen('valid'), null);
});
