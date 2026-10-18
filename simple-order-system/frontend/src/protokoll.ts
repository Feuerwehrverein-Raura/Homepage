// Geraete-Protokoll der Web-Kasse fuer die Fehlersuche im Nachhinein (wie
// flutter/kasse/lib/src/protokoll.dart): sammelt Ereignisse, schickt sie alle
// 20 s an POST /api/kasse/ereignisse (Backend src/protokoll.ts). Ohne
// Verbindung bleiben sie im localStorage (hoechstens 1000).

const KEY = 'kasse_protokoll';
type Ereignis = Record<string, unknown>;

let warteschlange: Ereignis[] = [];
try {
  const alt = JSON.parse(localStorage.getItem(KEY) || '[]');
  if (Array.isArray(alt)) warteschlange = alt;
} catch { /* leer */ }

let basis: () => string = () => '/api';
let geraet: () => string = () => '';
let ort: () => string = () => '';
let originalFetch: typeof fetch = (...a) => fetch(...a);
const version = (import.meta.env.VITE_APP_VERSION as string | undefined) || document.querySelector('script[type="module"][src*="index-"]')?.getAttribute('src')?.match(/index-([^.]+)\.js/)?.[1] || 'dev';

export function protokollEinrichten(o: { basis: () => string; geraet: () => string; ort: () => string; fetch: typeof fetch }) {
  basis = o.basis; geraet = o.geraet; ort = o.ort; originalFetch = o.fetch;
}

function speichern() {
  try { localStorage.setItem(KEY, JSON.stringify(warteschlange)); } catch { /* voll */ }
}

/** Ereignis festhalten. typ kurz und maschinenlesbar (z.B. zahlung_ok). */
export function protokoll(typ: string, extra: { meldung?: string; bestellung?: number | null; daten?: unknown } = {}) {
  warteschlange.push({
    zeit: new Date().toISOString(), typ, geraet: geraet(), quelle: 'pwa', version, ort: ort(),
    ...(extra.meldung ? { meldung: String(extra.meldung).slice(0, 1000) } : {}),
    ...(Number.isInteger(extra.bestellung) ? { bestellung: extra.bestellung } : {}),
    ...(extra.daten !== undefined ? { daten: extra.daten } : {}),
  });
  if (warteschlange.length > 1000) warteschlange = warteschlange.slice(-1000);
  speichern();
}

let sendet = false;
export async function protokollSenden() {
  if (sendet || !warteschlange.length) return;
  sendet = true;
  const paket = warteschlange.slice(0, 100);
  try {
    const r = await originalFetch(`${basis()}/kasse/ereignisse`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ereignisse: paket }),
    });
    if (r.ok) {
      warteschlange = warteschlange.slice(paket.length);
      speichern();
    }
  } catch { /* spaeter */ } finally {
    sendet = false;
  }
}

setInterval(protokollSenden, 20000);
window.addEventListener('error', (e) => protokoll('js_fehler', { meldung: e.message, daten: { datei: e.filename, zeile: e.lineno } }));
window.addEventListener('unhandledrejection', (e) => protokoll('js_fehler', { meldung: String((e.reason && (e.reason.stack || e.reason.message)) || e.reason).slice(0, 800) }));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') protokollSenden(); });
