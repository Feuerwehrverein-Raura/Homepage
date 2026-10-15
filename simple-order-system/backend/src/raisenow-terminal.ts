// ---------------------------------------------------------------------------
// RaiseNow "Digital Terminal" fuer TWINT an der Kasse (Oktober 2026)
//
// Statt des festen TWINT-QR kann die Kasse das Digital Terminal des Vereins
// zeigen (Touchpoint "TWINT Zahlungen", https://terminal.raisenow.io/swndq).
// Dort tippt die Kassierin den Betrag ein, "Einkassieren" zeigt einen
// TWINT-QR MIT Betrag, und nach dem Scannen meldet das Terminal die Zahlung.
// Einen Betrag per URL nimmt das Terminal nicht an - deshalb zeigt die Kasse
// den Betrag gross an und bietet "Betrag kopieren".
//
// Die Kasse bekommt vom Terminal keine Rueckmeldung (keine Schnittstelle,
// kein Webhook fuer diesen Touchpoint). Die Kassierin bestaetigt, sobald das
// Terminal "Zahlung erfolgreich" zeigt. Vermerkt wird das in payments mit
// provider 'raisenow_terminal' und status 'manuell_bestaetigt'.
//
// Einstellung (Tabelle settings, gespeichert ueber PUT /api/settings, gilt
// fuer alle Geraete):
//   raisenow_terminal_url    https://terminal.raisenow.io/<kennung>
// Ein-/Ausschalten geschieht PRO GERAET im Browser (localStorage
// 'kasse.raisenow_terminal', Standard aus) - so laesst sich das Terminal auf
// einem Geraet ausprobieren, ohne die Tablets an der Kasse zu veraendern.
// ---------------------------------------------------------------------------

export const TERMINAL_STANDARD_URL = 'https://terminal.raisenow.io/swndq';
export const TERMINAL_PROVIDER = 'raisenow_terminal';
export const TERMINAL_ZAHLUNG_STATUS = 'manuell_bestaetigt';

export const SCHLUESSEL_URL = 'raisenow_terminal_url';

const KENNUNG = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Prueft einen Terminal-Link. Erlaubt ist nur
 * https://terminal.raisenow.io/<kennung> (ohne Port, Benutzer, Abfrage,
 * Anker oder weitere Pfadteile; ein Schraegstrich am Ende wird entfernt).
 * Gibt den bereinigten Link zurueck oder null.
 */
export function pruefeTerminalUrl(wert: unknown): string | null {
  if (typeof wert !== 'string') return null;
  const roh = wert.trim();
  if (!roh || roh.length > 200) return null;
  let u: URL;
  try {
    u = new URL(roh);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  if (u.hostname !== 'terminal.raisenow.io') return null;
  if (u.port || u.username || u.password) return null;
  if (u.search || u.hash) return null;
  // Auch ein leeres "?" oder "#" zaehlt als Zusatz.
  if (/[?#]/.test(roh)) return null;
  const kennung = u.pathname.replace(/^\/+/, '').replace(/\/$/, '');
  if (!KENNUNG.test(kennung)) return null;
  return `https://terminal.raisenow.io/${kennung}`;
}

export interface TerminalStand {
  url: string;
}

/** Stand fuer die Kasse aus der gespeicherten Einstellung. */
export function terminalStand(url: string | null): TerminalStand {
  return { url: pruefeTerminalUrl(url) || TERMINAL_STANDARD_URL };
}

/**
 * Prueft das Terminal-Feld in einem PUT /api/settings. Andere Schluessel
 * bleiben unberuehrt. Gibt die bereinigten Werte zurueck oder einen Fehler.
 */
export function pruefeTerminalEinstellungen(
  eingabe: Record<string, unknown>
): { werte: Record<string, string> } | { fehler: string } {
  const werte: Record<string, string> = {};
  if (SCHLUESSEL_URL in eingabe) {
    const roh = eingabe[SCHLUESSEL_URL];
    if (roh === '' || roh === null || roh === undefined) {
      werte[SCHLUESSEL_URL] = TERMINAL_STANDARD_URL;
    } else {
      const url = pruefeTerminalUrl(roh);
      if (!url) {
        return { fehler: 'Terminal-Link ungueltig: erlaubt ist nur https://terminal.raisenow.io/<kennung>' };
      }
      werte[SCHLUESSEL_URL] = url;
    }
  }
  return { werte };
}

/**
 * Darf eine Zahlung mit diesem provider vermerkt werden? Erlaubt ist nur
 * das Terminal, und nur fuer TWINT. undefined/leer = kein Vermerk.
 */
export function pruefeZahlungsProvider(
  provider: unknown,
  zahlungsart: unknown
): { vermerken: boolean } | { fehler: string } {
  if (provider === undefined || provider === null || provider === '') return { vermerken: false };
  if (provider !== TERMINAL_PROVIDER) return { fehler: 'Unbekannter provider' };
  if (zahlungsart !== 'twint') return { fehler: 'RaiseNow-Terminal nur fuer TWINT' };
  return { vermerken: true };
}
