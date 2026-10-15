// RaiseNow "Digital Terminal" fuer TWINT (Oktober 2026).
//
// Das Terminal (Touchpoint "TWINT Zahlungen") zeigt nach "Einkassieren"
// einen TWINT-QR MIT Betrag und meldet die Zahlung sofort. Einen Betrag per
// URL nimmt es nicht an - die Kassierin tippt ihn dort nochmals ein. Die
// Kasse zeigt ihn dafuer gross an und kann ihn kopieren.
//
// Ein/aus gilt PRO GERAET (localStorage, Standard aus). Der Link kommt vom
// Backend (GET /api/raisenow-terminal, Einstellung raisenow_terminal_url).
// Backend: src/raisenow-terminal.ts.

import { useState } from 'react';

export const TERMINAL_STANDARD_URL = 'https://terminal.raisenow.io/swndq';
export const TERMINAL_PROVIDER = 'raisenow_terminal';
const GERAET_SCHLUESSEL = 'kasse.raisenow_terminal';

// Gleiche Regel wie im Backend (pruefeTerminalUrl).
export function pruefeTerminalUrl(wert: string): string | null {
  const roh = wert.trim();
  if (!roh || /[?#]/.test(roh)) return null;
  try {
    const u = new URL(roh);
    if (u.protocol !== 'https:' || u.hostname !== 'terminal.raisenow.io') return null;
    if (u.port || u.username || u.password) return null;
    const kennung = u.pathname.replace(/^\/+/, '').replace(/\/$/, '');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(kennung)) return null;
    return `https://terminal.raisenow.io/${kennung}`;
  } catch {
    return null;
  }
}

export function terminalAufGeraet(): boolean {
  try {
    return window.localStorage.getItem(GERAET_SCHLUESSEL) === '1';
  } catch {
    return false;
  }
}

export function setzeTerminalAufGeraet(an: boolean): boolean {
  try {
    if (an) window.localStorage.setItem(GERAET_SCHLUESSEL, '1');
    else window.localStorage.removeItem(GERAET_SCHLUESSEL);
    return true;
  } catch {
    return false;
  }
}

// Umschalter Terminal / fester QR-Code
export function TwintModusWahl({ festerQr, onFesterQr }: { festerQr: boolean; onFesterQr: (f: boolean) => void }) {
  const knopf = (aktiv: boolean) =>
    `py-2 px-2 rounded-md text-sm font-medium transition touch-manipulation min-h-[44px] ${
      aktiv ? 'bg-white shadow text-black' : 'text-gray-600 hover:text-gray-800'
    }`;
  return (
    <div className="grid grid-cols-2 gap-1 bg-gray-100 rounded-lg p-1 mb-3">
      <button type="button" onClick={() => onFesterQr(false)} className={knopf(!festerQr)}>
        RaiseNow-Terminal
      </button>
      <button type="button" onClick={() => onFesterQr(true)} className={knopf(festerQr)}>
        Fester QR-Code
      </button>
    </div>
  );
}

// Betrag gross, "Betrag kopieren", Terminal in neuem Fenster, Hinweis.
export function TerminalBetrag({ betrag, url }: { betrag: number; url: string }) {
  const [kopiert, setKopiert] = useState<'ok' | 'fehler' | null>(null);
  const text = betrag.toFixed(2);

  const kopieren = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('keine Zwischenablage');
      await navigator.clipboard.writeText(text);
      setKopiert('ok');
    } catch {
      setKopiert('fehler');
    }
    window.setTimeout(() => setKopiert(null), 2500);
  };

  return (
    <div className="space-y-3">
      <div className="bg-purple-50 border-2 border-purple-300 rounded-xl p-4 text-center">
        <div className="text-3xl sm:text-4xl font-bold text-purple-900 break-words">CHF {text}</div>
        <div className="text-sm text-purple-800 mt-1">im Terminal eingeben</div>
        <button
          type="button"
          onClick={kopieren}
          disabled={betrag <= 0}
          className="mt-3 w-full bg-purple-700 hover:bg-purple-800 active:bg-purple-900 text-white py-3 rounded-lg font-semibold touch-manipulation min-h-[48px] disabled:bg-gray-400"
        >
          {kopiert === 'ok' ? '✓ Betrag kopiert' : '📋 Betrag kopieren'}
        </button>
        {kopiert === 'fehler' && (
          <p className="text-xs text-orange-700 mt-2">Kopieren geht hier nicht - bitte {text} von Hand eintippen.</p>
        )}
      </div>

      {/* Ausweichweg, falls die eingebettete Seite auf einem Geraet nicht
          laeuft (z.B. Drittanbieter-Cookies gesperrt). Auf schmalen
          Geraeten prominent, auf breiten dezent. */}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full text-center py-3 rounded-lg font-semibold touch-manipulation min-h-[48px] bg-black text-white sm:bg-gray-100 sm:text-gray-800 sm:hover:bg-gray-200"
      >
        ↗ Terminal in neuem Fenster öffnen
      </a>

      <p className="text-sm bg-yellow-50 border border-yellow-300 text-yellow-900 rounded-lg p-3">
        Erst bestätigen, wenn das Terminal ‹Zahlung erfolgreich› zeigt.
      </p>
    </div>
  );
}

// Das eingebettete Terminal
export function TerminalFenster({ url }: { url: string }) {
  return (
    <iframe
      src={url}
      title="RaiseNow Terminal (TWINT)"
      allow="clipboard-read; clipboard-write; payment"
      referrerPolicy="strict-origin"
      className="w-full h-[70vh] min-h-[460px] max-h-[820px] border-2 border-gray-200 rounded-xl bg-white"
    />
  );
}
