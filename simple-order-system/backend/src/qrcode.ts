// Login-QR-Codes des Vereins erkennen (Kasse, Kueche) - siehe /api/auth/qr-login.
//  - Datenblatt: JSON {"type":"fwv-member-login","token":"fwv-member-..."} oder nacktes Token
//  - Anmeldebon (Bondrucker): https://www.fwv-raura.ch/anmelden.html?code=...
//  - Kassen-QR (Zugaenge in der App): {"type":"fwv-kasse-login","passwort":"..."}
//    = das woechentlich rotierende Kassen-Passwort, kein persoenliches Konto
//  - Kassen-Anmeldebon: {"type":"fwv-kasse-bon","code":"..."} (src/kassenbon.ts)
export type QrCode = { art: 'datenblatt'; token: string } | { art: 'bon'; code: string } | { art: 'kasse'; passwort: string } | { art: 'kassenbon'; code: string };
export function qrCodeLesen(roh: unknown): QrCode | null {
  if (typeof roh !== 'string') return null;
  const text = roh.trim();
  if (text.length > 500) return null;
  if (text.startsWith('fwv-member-')) return { art: 'datenblatt', token: text };
  try {
    const u = new URL(text);
    const code = u.searchParams.get('code');
    if (/(^|\.)fwv-raura\.ch$/.test(u.hostname) && u.pathname.endsWith('/anmelden.html') && code && /^[A-Za-z0-9_-]{16,64}$/.test(code)) {
      return { art: 'bon', code };
    }
  } catch { /* keine Adresse */ }
  try {
    const j = JSON.parse(text);
    if (j && j.type === 'fwv-member-login' && typeof j.token === 'string' && j.token.startsWith('fwv-member-')) {
      return { art: 'datenblatt', token: j.token };
    }
    if (j && j.type === 'fwv-kasse-login' && typeof j.passwort === 'string' && j.passwort.length <= 100) {
      return { art: 'kasse', passwort: j.passwort };
    }
    if (j && j.type === 'fwv-kasse-bon' && typeof j.code === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(j.code)) {
      return { art: 'kassenbon', code: j.code };
    }
  } catch { /* kein JSON */ }
  return null;
}