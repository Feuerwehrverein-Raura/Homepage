// Authentik-Gruppen verwalten (Vorstand in der Mitglieder-App).
//
// Der Vorstand nimmt Mitglieder in Gruppen auf oder entfernt sie - etwa
// "Roter Schopf" oder "Lager", die in der App eigene Reiter freischalten.
// Bisher ging das nur direkt in Authentik.
//
// Nie verwaltbar: admin, jede Gruppe mit Superuser-Rechten und die
// technischen Gruppen (Authentik selbst, Dienstkonten, LDAP-Suche). Wer
// hier Vorstand ist, soll sich nicht selbst zum Authentik-Administrator
// machen und keine Systemkonten umhaengen koennen. Diese Regel prueft das
// Backend bei JEDER Aenderung neu, nicht nur beim Auflisten.
//
// Vorstand, Social Media und Mitglieder setzt das Backend ausserdem selbst
// nach der Funktion eines Mitglieds (syncMemberAuthentikGroups). Sie sind
// verwaltbar, aber als "automatisch" markiert: Der naechste Abgleich kann
// eine Aenderung von Hand wieder ueberschreiben.
//
// Reine Bausteine ohne Express und ohne Datenbank, damit sie sich gegen ein
// nachgebautes Authentik testen lassen (test/authentik-gruppen.test.js).

const GESPERRT = ['admin', 'service accounts', 'ldap-suche'];
/** Alles, was mit "authentik " anfaengt: Admins, Read-only, Agent-Users. */
const GESPERRT_PRAEFIX = 'authentik ';
const AUTOMATISCH = ['vorstand', 'social-media', 'social media', 'mitglieder'];

/** Darf diese Anfrage Gruppen verwalten? Vorstand oder admin, ohne Gross/klein. */
function darfGruppenVerwalten(gruppen) {
    if (!Array.isArray(gruppen)) return false;
    return gruppen.some(g => typeof g === 'string' &&
        ['vorstand', 'admin'].includes(g.trim().toLowerCase()));
}

function istGesperrt(gruppe) {
    if (!gruppe || typeof gruppe !== 'object') return true;
    if (gruppe.is_superuser) return true;
    const name = String(gruppe.name || '').trim().toLowerCase();
    return GESPERRT.includes(name) || name.startsWith(GESPERRT_PRAEFIX);
}

function gruppenVerwaltung({
    authentikUrl, apiToken, abrufen = globalThis.fetch, log = console
} = {}) {
    const basis = String(authentikUrl || '').replace(/\/+$/, '');

    async function anfrage(pfad, { methode = 'GET', daten } = {}) {
        if (!basis || !apiToken) throw new Error('AUTHENTIK_URL/AUTHENTIK_API_TOKEN fehlt');
        const r = await abrufen(`${basis}${pfad}`, {
            method: methode,
            headers: {
                Authorization: `Bearer ${apiToken}`, Accept: 'application/json',
                ...(daten ? { 'Content-Type': 'application/json' } : {})
            },
            body: daten ? JSON.stringify(daten) : undefined,
            signal: AbortSignal.timeout(8000)
        });
        if (!r.ok) {
            const fehler = new Error(`Authentik ${methode} ${pfad}: HTTP ${r.status}`);
            fehler.status = r.status;
            throw fehler;
        }
        const roh = await r.text();
        return roh.trim() ? JSON.parse(roh) : {};
    }

    /**
     * Alle verwaltbaren Gruppen, nach Name, mit den Authentik-Benutzer-pks
     * ihrer Mitglieder. Gesperrte Gruppen fehlen ganz.
     */
    async function liste() {
        const gruppen = [];
        let seite = 1;
        // Authentik blaettert; mehr als ein paar Dutzend Gruppen hat der
        // Verein nicht, die Schleife ist nur Vorsicht.
        while (seite && seite < 20) {
            const d = await anfrage(`/api/v3/core/groups/?page=${seite}&page_size=100&include_users=false`);
            for (const g of d.results || []) gruppen.push(g);
            seite = d.pagination && d.pagination.next ? d.pagination.next : 0;
        }
        return gruppen
            .filter(g => !istGesperrt(g))
            .map(g => ({
                pk: String(g.pk),
                name: String(g.name),
                automatisch: AUTOMATISCH.includes(String(g.name).trim().toLowerCase()),
                benutzer: Array.isArray(g.users) ? g.users.map(Number) : []
            }))
            .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    }

    /** Die Gruppe holen und pruefen; wirft bei gesperrter oder fehlender. */
    async function verwaltbar(gruppePk) {
        let g;
        try {
            g = await anfrage(`/api/v3/core/groups/${encodeURIComponent(gruppePk)}/?include_users=false`);
        } catch (e) {
            if (e.status === 404) {
                const f = new Error('Gruppe nicht gefunden');
                f.status = 404;
                throw f;
            }
            throw e;
        }
        if (istGesperrt(g)) {
            const f = new Error('Diese Gruppe lässt sich hier nicht verwalten');
            f.status = 403;
            throw f;
        }
        return g;
    }

    async function hinzufuegen(gruppePk, benutzerPk) {
        const g = await verwaltbar(gruppePk);
        await anfrage(`/api/v3/core/groups/${encodeURIComponent(g.pk)}/add_user/`,
            { methode: 'POST', daten: { pk: Number(benutzerPk) } });
        log.log(`Authentik: Benutzer ${benutzerPk} in Gruppe "${g.name}" aufgenommen`);
        return { name: g.name };
    }

    async function entfernen(gruppePk, benutzerPk) {
        const g = await verwaltbar(gruppePk);
        await anfrage(`/api/v3/core/groups/${encodeURIComponent(g.pk)}/remove_user/`,
            { methode: 'POST', daten: { pk: Number(benutzerPk) } });
        log.log(`Authentik: Benutzer ${benutzerPk} aus Gruppe "${g.name}" entfernt`);
        return { name: g.name };
    }

    return { liste, hinzufuegen, entfernen };
}

/**
 * Antwort fuer die App: jede Gruppe mit den Vereinsmitgliedern darin
 * (Name aus der Mitgliederdatenbank, ueber authentik_user_id). Konten ohne
 * Mitglied (Dienstkonten, Altlasten) werden nur gezaehlt.
 */
function gruppenAnsicht(liste, mitglieder) {
    const nachKonto = new Map();
    for (const m of mitglieder) {
        if (m.authentik_user_id !== null && m.authentik_user_id !== undefined) {
            nachKonto.set(String(m.authentik_user_id), m);
        }
    }
    return {
        gruppen: liste.map(g => {
            const drin = [];
            let weitere = 0;
            for (const pk of g.benutzer) {
                const m = nachKonto.get(String(pk));
                if (m) drin.push({ id: m.id, vorname: m.vorname, nachname: m.nachname });
                else weitere++;
            }
            drin.sort((a, b) => `${a.nachname} ${a.vorname}`.localeCompare(`${b.nachname} ${b.vorname}`, 'de'));
            return { pk: g.pk, name: g.name, automatisch: g.automatisch, mitglieder: drin, weitere_konten: weitere };
        })
    };
}

module.exports = { gruppenVerwaltung, gruppenAnsicht, darfGruppenVerwalten, istGesperrt };
