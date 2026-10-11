// Gruppen fuer Mitglieder-Tokens (HS256, type 'member').
//
// Wer sich per QR-Code, Anmeldebon, App-Passwort oder Passwort-Reset
// anmeldet, bekommt ein Token von diesem Backend statt von Authentik. Damit
// er dieselben Rechte hat wie nach der Anmeldung ueber Authentik (Lager,
// Vorstand, admin, ...), steht im Token derselbe `groups`-Claim: die NAMEN
// seiner Authentik-Gruppen, so wie sie Authentik ins OIDC-Token schreibt
// (Standard-Profil-Mapping: direkte Gruppen, Name unveraendert).
//
// Kein Authentik-Konto oder Authentik nicht erreichbar -> keine Gruppen
// (wie bisher), mit Eintrag im Log. Reine Bausteine ohne Datenbank und ohne
// Express, damit sie sich testen lassen (test/member-gruppen.test.js).

const jwt = require('jsonwebtoken');

/** Wie lange eine Gruppen-Antwort von Authentik gilt (ms). */
const GRUPPEN_CACHE_MS = 60 * 1000;

function namenAus(liste) {
    if (!Array.isArray(liste)) return null;
    return liste
        .map(g => (g && typeof g === 'object' ? g.name : null))
        .filter(n => typeof n === 'string' && n.trim())
        .map(n => n.trim());
}

/**
 * Liefert `gruppenFuer(authentikUserId)` -> Promise<string[] | null>.
 * null heisst: unbekannt (kein Konto, kein API-Token, Fehler) — der Aufrufer
 * stellt dann wie bisher ein Token ohne Gruppen aus.
 *
 * Fragt GET /api/v3/core/users/{pk}/ (Feld `groups_obj`, dieselbe API wie
 * syncMemberAuthentikGroups). Fehlt `groups_obj` (andere Authentik-Version),
 * dann GET /api/v3/core/groups/?members_by_pk={pk}. Erfolgreiche Antworten
 * werden [cacheMs] lang behalten, Fehler nicht.
 */
function gruppenAbfrage({
    authentikUrl, apiToken, cacheMs = GRUPPEN_CACHE_MS,
    abrufen = globalThis.fetch, jetzt = Date.now, log = console
} = {}) {
    const cache = new Map();
    const basis = String(authentikUrl || '').replace(/\/+$/, '');

    async function json(pfad) {
        const r = await abrufen(`${basis}${pfad}`, {
            headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' },
            signal: AbortSignal.timeout(5000)
        });
        if (!r.ok) throw new Error(`Authentik ${pfad}: HTTP ${r.status}`);
        return r.json();
    }

    async function gruppenFuer(authentikUserId) {
        if (authentikUserId === null || authentikUserId === undefined || authentikUserId === '') return null;
        if (!apiToken || !basis) {
            log.warn('Mitglieder-Token ohne Gruppen: AUTHENTIK_API_TOKEN/AUTHENTIK_URL fehlt');
            return null;
        }
        const pk = encodeURIComponent(String(authentikUserId));
        const treffer = cache.get(pk);
        if (treffer && treffer.bis > jetzt()) return treffer.gruppen;
        try {
            const user = await json(`/api/v3/core/users/${pk}/`);
            let gruppen = namenAus(user && user.groups_obj);
            if (gruppen === null) {
                const seite = await json(`/api/v3/core/groups/?members_by_pk=${pk}&page_size=200`);
                gruppen = namenAus(seite && seite.results) || [];
            }
            cache.set(pk, { gruppen, bis: jetzt() + cacheMs });
            return gruppen;
        } catch (e) {
            log.error(`Authentik-Gruppen fuer ${authentikUserId} nicht lesbar — Token ohne Gruppen:`, e.message);
            return null;
        }
    }

    gruppenFuer.vergessen = (authentikUserId) => {
        if (authentikUserId === undefined) cache.clear();
        else cache.delete(encodeURIComponent(String(authentikUserId)));
    };
    return gruppenFuer;
}

/** Inhalt eines Mitglieder-Tokens (Form unveraendert, nur `groups` gefuellt). */
function memberJwtInhalt({ memberId, email, name, benutzername }, gruppen) {
    return {
        sub: memberId, member_id: memberId, email, name, benutzername,
        type: 'member', groups: Array.isArray(gruppen) ? gruppen : []
    };
}

/**
 * Prueft ein Mitglieder-Token (HS256, type 'member') mit [secret]. Gibt den
 * Inhalt zurueck oder null (falsche Signatur, abgelaufen, anderer Typ —
 * auch Vorstand- und Organisator-Tokens sind hier nicht gemeint).
 */
function mitgliedTokenPruefen(token, secret) {
    if (!token || !secret) return null;
    try {
        const d = jwt.verify(token, secret, { algorithms: ['HS256'] });
        if (!d || d.type !== 'member') return null;
        if (!(d.sub || d.member_id)) return null;
        return d;
    } catch (_) {
        return null;
    }
}

/** Antwort von GET /auth/member/pruefen. */
function pruefAntwort(inhalt, mitglied, aktuelleGruppen) {
    return {
        valid: true,
        member_id: mitglied.id,
        email: mitglied.email || null,
        name: `${mitglied.vorname || ''} ${mitglied.nachname || ''}`.trim() || inhalt.name || null,
        benutzername: mitglied.benutzername || null,
        groups: Array.isArray(aktuelleGruppen) ? aktuelleGruppen
            : (Array.isArray(inhalt.groups) ? inhalt.groups : []),
        exp: inhalt.exp
    };
}

module.exports = { GRUPPEN_CACHE_MS, gruppenAbfrage, memberJwtInhalt, mitgliedTokenPruefen, pruefAntwort };
