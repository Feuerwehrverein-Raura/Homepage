/**
 * Wer darf ins Lager? Reine Regeln ohne Netz und ohne Datenbank, damit sie
 * sich testen lassen (test/zugang.test.mjs).
 *
 * Angenommen werden Authentik-Tokens von drei Anwendungen:
 *  - inventory-system  -> Inventar-PWA. Wer sie oeffnen darf, regelt die
 *                         Authentik-Policy der Anwendung; hier keine
 *                         Gruppenpruefung (unveraendert).
 *  - fwv-members-app   -> Mitglieder-App (Flutter, PKCE).
 *  - fwv-members       -> Mitglieder-Web.
 * Die beiden Mitglieder-Anwendungen kann JEDES Mitglied verwenden. Deren
 * Tokens gelten deshalb nur mit der Gruppe Lager, Vorstand oder admin
 * (Gross-/Kleinschreibung egal) — der `groups`-Claim kommt aus dem
 * Standard-Profil-Mapping von Authentik.
 */

/** Authentik-Anwendung (Provider-Slug) der Inventar-PWA. */
export const INVENTAR_ANWENDUNG = 'inventory-system';

/** Anwendungen der Mitglieder (App und Web). */
export const MITGLIEDER_ANWENDUNGEN = ['fwv-members-app', 'fwv-members'] as const;

/** Alle Anwendungen, deren Tokens das Inventar annimmt. */
export const ANWENDUNGEN = [INVENTAR_ANWENDUNG, ...MITGLIEDER_ANWENDUNGEN] as const;

/** Gruppen mit Lager-Berechtigung (klein geschrieben verglichen). */
export const LAGER_GRUPPEN = ['lager', 'vorstand', 'admin'] as const;

export const KEIN_LAGER_ZUGRIFF =
  'Kein Zugriff aufs Lager. Dafür braucht es die Gruppe Lager oder Vorstand — bitte beim Vorstand melden.';

/** Issuer einer Authentik-Anwendung, z.B. https://auth…/application/o/fwv-members-app/ */
export function issuerFuer(authentikUrl: string, anwendung: string): string {
  return `${authentikUrl.replace(/\/+$/, '')}/application/o/${anwendung}/`;
}

/** JWKS-Adresse einer Authentik-Anwendung. */
export function jwksFuer(authentikUrl: string, anwendung: string): string {
  return `${issuerFuer(authentikUrl, anwendung)}jwks/`;
}

/**
 * Welche angenommene Anwendung hat das Token ausgestellt? null, wenn der
 * Issuer keiner davon ist (dann wird das Token abgelehnt).
 */
export function anwendungAusIssuer(authentikUrl: string, iss: unknown): string | null {
  if (typeof iss !== 'string') return null;
  for (const a of ANWENDUNGEN) {
    if (iss === issuerFuer(authentikUrl, a)) return a;
  }
  return null;
}

/** Gruppen aus dem Claim; alles, was kein Text ist, faellt weg. */
export function gruppenAusClaims(claims: { groups?: unknown } | null | undefined): string[] {
  const g = claims?.groups;
  return Array.isArray(g) ? g.filter((x): x is string => typeof x === 'string') : [];
}

export function hatLagerGruppe(gruppen: readonly string[]): boolean {
  return gruppen.some((g) => (LAGER_GRUPPEN as readonly string[]).includes(g.trim().toLowerCase()));
}

export type Entscheid =
  | { ok: true; anwendung: string }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Entscheidet nach der Signaturpruefung, ob das Token ins Lager darf.
 * [anwendung] ist das Ergebnis von [anwendungAusIssuer].
 */
export function lagerZugang(anwendung: string | null, claims: { groups?: unknown }): Entscheid {
  if (anwendung === null) return { ok: false, status: 403, error: 'Invalid token' };
  if (anwendung === INVENTAR_ANWENDUNG) return { ok: true, anwendung };
  if (hatLagerGruppe(gruppenAusClaims(claims))) return { ok: true, anwendung };
  return { ok: false, status: 403, error: KEIN_LAGER_ZUGRIFF };
}
