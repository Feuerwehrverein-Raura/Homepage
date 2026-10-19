// ---------------------------------------------------------------------------
// Schweizer Zeit fuer Bons und Tagesabrechnung (Oktober 2026)
//
// Der Container laeuft in UTC (kein TZ gesetzt). toLocaleTimeString ohne
// timeZone druckte deshalb UTC auf die Bons, und der Geschaeftstag 12-12 Uhr
// begann um 14 Uhr Schweizer Zeit. Bewusst NICHT process.env.TZ umstellen:
// pg liest "timestamp without time zone" (die DB speichert UTC) als lokale
// Zeit - mit TZ=Europe/Zurich verrutschten alle Zeitstempel und der Abgleich.
// ---------------------------------------------------------------------------
export const ZONE = 'Europe/Zurich';

export const uhrzeit = (d: Date) => d.toLocaleTimeString('de-CH', { timeZone: ZONE, hour: '2-digit', minute: '2-digit' });
export const datum = (d: Date) => d.toLocaleDateString('de-CH', { timeZone: ZONE });

function teile(d: Date) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second };
}

/** Schweizer Wanduhrzeit (Jahr, Monat 1-12, Tag, Stunde) als Zeitpunkt */
export function schweizZeitpunkt(y: number, m: number, d: number, h: number): Date {
  const versuch = Date.UTC(y, m - 1, d, h);
  const t = teile(new Date(versuch));
  const wand = Date.UTC(t.y, t.m - 1, t.d, t.h, t.min, t.s);
  return new Date(versuch - (wand - versuch));
}

/** Geschaeftstag 12:00-12:00 Schweizer Zeit, in dem `jetzt` liegt. */
export function geschaeftstag(jetzt = new Date()): { start: Date; ende: Date; tag: string } {
  const t = teile(jetzt);
  let basis = Date.UTC(t.y, t.m - 1, t.d);
  if (t.h < 12) basis -= 86400000;
  const b = new Date(basis);
  const n = new Date(basis + 86400000);
  return {
    start: schweizZeitpunkt(b.getUTCFullYear(), b.getUTCMonth() + 1, b.getUTCDate(), 12),
    ende: schweizZeitpunkt(n.getUTCFullYear(), n.getUTCMonth() + 1, n.getUTCDate(), 12),
    tag: b.toISOString().slice(0, 10),
  };
}
