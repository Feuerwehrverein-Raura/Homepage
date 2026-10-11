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
 *
 * Dazu die Mitglieder-Tokens von api-members (QR-Code, Anmeldebon,
 * App-Passwort, Passwort-Reset; HS256, `type: 'member'`, ohne Issuer). Deren
 * Schluessel kennt das Inventar nicht — es fragt api-members
 * (GET /auth/member/pruefen), ob das Token gilt und welche Authentik-Gruppen
 * das Mitglied hat. Danach gilt dieselbe Regel wie fuer die Mitglieder-App
 * ([MITGLIEDER_TOKEN] statt einer Authentik-Anwendung).
 */

/** Authentik-Anwendung (Provider-Slug) der Inventar-PWA. */
export const INVENTAR_ANWENDUNG = 'inventory-system';

/** Anwendungen der Mitglieder (App und Web). */
export const MITGLIEDER_ANWENDUNGEN = ['fwv-members-app', 'fwv-members'] as const;

/** Alle Anwendungen, deren Tokens das Inventar annimmt. */
export const ANWENDUNGEN = [INVENTAR_ANWENDUNG, ...MITGLIEDER_ANWENDUNGEN] as const;

/**
 * Pseudo-Anwendung fuer Mitglieder-Tokens von api-members — fuer
 * [lagerZugang]/[ausleiheZugang] wie eine Mitglieder-Anwendung.
 */
export const MITGLIEDER_TOKEN = 'api-members';

/**
 * Ist das (noch ungepruefte) Token ein Mitglieder-Token von api-members?
 * Typ 'member' und kein Issuer — Authentik-Tokens haben immer einen.
 */
export function istMitgliederToken(claims: { type?: unknown; iss?: unknown } | null | undefined): boolean {
  return !!claims && claims.type === 'member' && (claims.iss === undefined || claims.iss === null);
}

/** Antwort von GET /auth/member/pruefen (api-members), gelesen. */
export type MitgliedPruefung = {
  memberId: string;
  email: string;
  name: string;
  groups: string[];
  /** Ablauf des Tokens (Sekunden seit 1970), falls angegeben. */
  exp: number | null;
};

/**
 * Liest die Antwort von api-members. null, wenn das Token nicht gilt oder
 * die Antwort keinen Sinn ergibt.
 */
export function mitgliedPruefungLesen(antwort: unknown): MitgliedPruefung | null {
  if (!antwort || typeof antwort !== 'object') return null;
  const a = antwort as Record<string, unknown>;
  if (a.valid !== true) return null;
  const id = a.member_id;
  if ((typeof id !== 'string' || !id) && typeof id !== 'number') return null;
  const text = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    memberId: String(id),
    email: text(a.email),
    name: text(a.name),
    groups: gruppenAusClaims({ groups: a.groups }),
    exp: typeof a.exp === 'number' && Number.isFinite(a.exp) ? a.exp : null
  };
}

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

/**
 * Ausleihe: JEDES Mitglied darf mit dem Token der Mitglieder-App bzw.
 * -Web ausleihen und seine eigenen Ausleihen sehen; verwalten (alle
 * Ausleihen, Externe erfassen, ausgeben, zuruecknehmen) nur mit der Gruppe
 * Lager, Vorstand oder admin. Tokens der Inventar-PWA zaehlen als Lager
 * (wer die PWA oeffnen darf, regelt Authentik).
 */
export type AusleiheEntscheid =
  | { ok: true; anwendung: string; lager: boolean }
  | { ok: false; status: 401 | 403; error: string };

export function ausleiheZugang(anwendung: string | null, claims: { groups?: unknown }): AusleiheEntscheid {
  if (anwendung === null) return { ok: false, status: 403, error: 'Invalid token' };
  if (anwendung === INVENTAR_ANWENDUNG) return { ok: true, anwendung, lager: true };
  return { ok: true, anwendung, lager: hatLagerGruppe(gruppenAusClaims(claims)) };
}
