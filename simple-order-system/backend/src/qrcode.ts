// Login-QR-Codes des Vereins erkennen (Kasse, Kueche) - siehe /api/auth/qr-login.
//  - Datenblatt: JSON {"type":"fwv-member-login","token":"fwv-member-..."} oder nacktes Token
//  - Anmeldebon (Bondrucker): https://www.fwv-raura.ch/anmelden.html?code=...
export function qrCodeLesen(roh: unknown): { art: 'datenblatt'; token: string } | { art: 'bon'; code: string } | null {
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
  } catch { /* kein JSON */ }
  return null;
}