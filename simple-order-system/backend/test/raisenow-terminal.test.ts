// RaiseNow Digital Terminal (src/raisenow-terminal.ts): Link pruefen,
// Einstellung, provider-Vermerk. Laeuft ohne Datenbank: npm test.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TERMINAL_STANDARD_URL,
  pruefeTerminalUrl,
  terminalStand,
  pruefeTerminalEinstellungen,
  pruefeZahlungsProvider,
} from '../src/raisenow-terminal.js';

test('pruefeTerminalUrl: gueltige Links', () => {
  assert.equal(pruefeTerminalUrl('https://terminal.raisenow.io/swndq'), 'https://terminal.raisenow.io/swndq');
  assert.equal(pruefeTerminalUrl('  https://terminal.raisenow.io/swndq/  '), 'https://terminal.raisenow.io/swndq');
  assert.equal(pruefeTerminalUrl('https://TERMINAL.raisenow.io/Ab_c-1'), 'https://terminal.raisenow.io/Ab_c-1');
});

test('pruefeTerminalUrl: alles andere abgewiesen', () => {
  for (const falsch of [
    'http://terminal.raisenow.io/swndq',
    'https://terminal.raisenow.io/',
    'https://terminal.raisenow.io',
    'https://terminal.raisenow.io/swndq/mehr',
    'https://terminal.raisenow.io/swndq?amount=5',
    'https://terminal.raisenow.io/swndq?',
    'https://terminal.raisenow.io/swndq#x',
    'https://terminal.raisenow.io:8443/swndq',
    'https://user@terminal.raisenow.io/swndq',
    'https://terminal.raisenow.io.boese.ch/swndq',
    'https://boese.ch/terminal.raisenow.io/swndq',
    'javascript:alert(1)',
    'https://terminal.raisenow.io/%2e%2e',
    'https://terminal.raisenow.io/sw%20ndq',
    '',
    null,
    42,
  ]) {
    assert.equal(pruefeTerminalUrl(falsch), null, String(falsch));
  }
});

test('terminalStand: Standard-Link, wenn nichts oder Ungueltiges gespeichert', () => {
  assert.deepEqual(terminalStand(null), { url: TERMINAL_STANDARD_URL });
  assert.deepEqual(terminalStand('https://example.com/x'), { url: TERMINAL_STANDARD_URL });
  assert.deepEqual(terminalStand('https://terminal.raisenow.io/abc'), { url: 'https://terminal.raisenow.io/abc' });
});

test('pruefeTerminalEinstellungen: andere Schluessel bleiben unberuehrt', () => {
  assert.deepEqual(pruefeTerminalEinstellungen({ printer_bar_ip: '1.2.3.4' }), { werte: {} });
  assert.deepEqual(
    pruefeTerminalEinstellungen({ raisenow_terminal_url: 'https://terminal.raisenow.io/abc/' }),
    { werte: { raisenow_terminal_url: 'https://terminal.raisenow.io/abc' } }
  );
  assert.deepEqual(
    pruefeTerminalEinstellungen({ raisenow_terminal_url: '' }),
    { werte: { raisenow_terminal_url: TERMINAL_STANDARD_URL } }
  );
  assert.ok('fehler' in pruefeTerminalEinstellungen({ raisenow_terminal_url: 'https://evil.example/' }));
});

test('pruefeZahlungsProvider: nur raisenow_terminal und nur fuer TWINT', () => {
  assert.deepEqual(pruefeZahlungsProvider(undefined, 'cash'), { vermerken: false });
  assert.deepEqual(pruefeZahlungsProvider('', 'twint'), { vermerken: false });
  assert.deepEqual(pruefeZahlungsProvider('raisenow_terminal', 'twint'), { vermerken: true });
  assert.ok('fehler' in pruefeZahlungsProvider('raisenow_terminal', 'cash'));
  assert.ok('fehler' in pruefeZahlungsProvider('sumup', 'twint'));
});
