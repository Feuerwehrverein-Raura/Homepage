// ---------------------------------------------------------------------------
// Kasse <-> Anlass (Oktober 2026)
//
// Die Kasse kennt selbst keine Anlaesse. Sie fragt api-events, welcher
// Anlass gerade laeuft (GET /events/kasse/aktuell, Regel dort in
// src/kasse-anlass.js: Beginn - 2 h bis Ende + 2 h, Ortszeit Zuerich, bei
// mehreren der zuletzt begonnene). Daraus:
//  - der TWINT-QR an der Kasse: eigener QR des Anlasses, sonst der
//    Vereins-Standard frontend/public/twint-qr.png
//  - event_id/event_titel an jeder neuen Bestellung (Umsatz pro Anlass)
//  - die Anzeige "Aktueller Anlass" in Kopfzeile und Einstellungen
//
// In den Einstellungen kann statt "automatisch" ein bestimmter Anlass
// gewaehlt werden (settings.kasse_anlass_id) - etwa wenn ein Fest ueber
// Mitternacht laenger dauert als eingetragen.
//
// Grundsatz: api-events darf die Kasse nie aufhalten. Abfragen haben ein
// kurzes Zeitlimit, das Ergebnis wird 60 s gemerkt, und bei einem Fehler
// gilt der letzte bekannte Stand (oder kein Anlass -> Vereins-Standard).
// Bestellungen warten gar nicht: sie nehmen den gemerkten Stand.
// ---------------------------------------------------------------------------

export interface KassenAnlass {
  id: string;
  titel: string;
  beginn: string | null;
  ende: string | null;
  ort: string | null;
  twint_qr_url: string | null;
  // Hat der Anlass Service (Schicht mit Bereich/Name "Service")? Dann zeigt
  // die Kasse Tische und die Bestellart "Tisch". Regel in api-events
  // (src/kasse-anlass.js hatService).
  hat_service: boolean;
  // Schluessel des Anlasses bei den Rezepten im Inventar
  // (event_recipes.event_slug). Fehlt bei aelterem api-events.
  slug?: string | null;
}

export type Modus = 'automatisch' | 'manuell';

export interface AnlassStand {
  anlass: KassenAnlass | null;
  modus: Modus;
  // Gesetzt, wenn api-events nicht antwortete; anlass ist dann der letzte
  // bekannte Stand (oder null).
  fehler?: string;
}

export interface AnlassQuelle {
  aktuell(): Promise<KassenAnlass | null>;
  einer(id: string): Promise<KassenAnlass | null>;
  liste(): Promise<KassenAnlass[]>;
}

type FetchFn = (url: string, init?: any) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

export const UUID_MUSTER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Antwort von api-events (englische Feldnamen) -> Kassen-Sicht.
export function ausEvents(e: any): KassenAnlass | null {
  if (!e || !e.id) return null;
  return {
    id: String(e.id),
    titel: String(e.title || ''),
    beginn: e.start_date || null,
    ende: e.end_date || null,
    ort: e.location || null,
    twint_qr_url: e.twint_qr_url || null,
    hat_service: e.hat_service === true,
    slug: e.slug ? String(e.slug) : null,
  };
}

// Hat die Kasse gerade Service? Kein Anlass (oder nichts erreichbar und
// nichts gemerkt) -> false. Faellt api-events nur kurz aus, gilt der letzte
// bekannte Anlass weiter (AnlassErmittler) - und damit auch sein Service.
export function hatService(stand: AnlassStand | null | undefined): boolean {
  return stand?.anlass?.hat_service === true;
}

// Abfragen bei api-events mit dem geteilten Kassen-Schluessel.
export function eventsQuelle(opts: {
  baseUrl: string;
  schluessel: string;
  timeoutMs?: number;
  fetchFn?: FetchFn;
}): AnlassQuelle {
  const basis = opts.baseUrl.replace(/\/+$/, '');
  const timeoutMs = opts.timeoutMs ?? 2500;
  const fetchFn: FetchFn = opts.fetchFn ?? ((url, init) => fetch(url, init) as any);
  const holen = async (pfad: string) => {
    const r = await fetchFn(`${basis}${pfad}`, {
      headers: { 'X-Order-API-Key': opts.schluessel, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`api-events antwortete ${r.status}`);
    return r.json();
  };
  return {
    async aktuell() {
      const d = await holen('/events/kasse/aktuell');
      return ausEvents(d?.anlass);
    },
    async einer(id: string) {
      if (!UUID_MUSTER.test(id)) return null;
      const d = await holen(`/events/kasse/anlaesse/${encodeURIComponent(id)}`);
      return ausEvents(d?.anlass);
    },
    async liste() {
      const d = await holen('/events/kasse/anlaesse');
      return (Array.isArray(d?.anlaesse) ? d.anlaesse : []).map(ausEvents).filter(Boolean) as KassenAnlass[];
    },
  };
}

// Ermittelt den Anlass der Kasse und merkt ihn sich.
export class AnlassErmittler {
  private stand: AnlassStand | null = null;
  private zeit = 0;
  private laufend: Promise<AnlassStand> | null = null;
  // Letzter erfolgreich geholter Anlass je Modus/Auswahl - fuer Ausfaelle.
  private letzterGuter: { schluessel: string; anlass: KassenAnlass | null } | null = null;

  constructor(
    private quelle: AnlassQuelle,
    private auswahlLesen: () => Promise<string | null>,
    private merkMs = 60_000,
    private jetzt: () => number = Date.now,
  ) {}

  // Gemerkter Stand ohne zu warten (fuer Bestellungen) - oder null.
  gemerkt(): AnlassStand | null {
    return this.stand;
  }

  // Vergessen (nach einer Aenderung der Auswahl).
  leeren(): void {
    this.stand = null;
    this.zeit = 0;
  }

  async ermitteln(): Promise<AnlassStand> {
    if (this.stand && this.jetzt() - this.zeit < this.merkMs) return this.stand;
    if (!this.laufend) {
      this.laufend = this.neuHolen().finally(() => { this.laufend = null; });
    }
    return this.laufend;
  }

  private async neuHolen(): Promise<AnlassStand> {
    let auswahl: string | null = null;
    try {
      auswahl = await this.auswahlLesen();
    } catch {
      auswahl = null;
    }
    const modus: Modus = auswahl ? 'manuell' : 'automatisch';
    const schluessel = auswahl || 'automatisch';
    let stand: AnlassStand;
    try {
      const anlass = auswahl ? await this.quelle.einer(auswahl) : await this.quelle.aktuell();
      this.letzterGuter = { schluessel, anlass };
      stand = { anlass, modus };
    } catch (e: any) {
      const frueher = this.letzterGuter && this.letzterGuter.schluessel === schluessel
        ? this.letzterGuter.anlass : null;
      stand = { anlass: frueher, modus, fehler: e?.message || String(e) };
    }
    this.stand = stand;
    this.zeit = this.jetzt();
    return stand;
  }
}

// ?v=<Zeitstempel> aus der Bild-Adresse von api-events - damit ein neues
// Bild auch an der Kasse eine neue Adresse hat (Browser-Cache).
export function bildVersion(twintQrUrl: string | null): string | null {
  if (!twintQrUrl) return null;
  const m = twintQrUrl.match(/[?&]v=([0-9A-Za-z_-]+)/);
  return m ? m[1] : null;
}

// Vereins-Standard: frontend/public/twint-qr.png (das Bild liegt im
// Kassen-Frontend, gleiche Adresse). Gilt, wenn der Anlass keinen eigenen QR hat.
export const VEREINS_QR_URL = '/twint-qr.png';

export interface TwintAntwort {
  url: string;
  anlass: { id: string; titel: string } | null;
  // anlass: eigener QR des Anlasses; einstellung: altes Bild aus den
  // Kassen-Einstellungen (settings.twint_qr_url, nur wenn gesetzt);
  // standard: Vereins-Standard /twint-qr.png.
  quelle: 'anlass' | 'einstellung' | 'standard';
  modus: Modus;
}

// Antwort fuer GET /api/twint-qr. Reihenfolge: eigener QR des (gewaehlten
// oder automatisch laufenden) Anlasses -> settings.twint_qr_url, falls noch
// gesetzt (Altbestand, live leer) -> Vereins-Standard /twint-qr.png.
export function twintAntwort(stand: AnlassStand, einstellungUrl: string | null): TwintAntwort {
  const anlass = stand.anlass ? { id: stand.anlass.id, titel: stand.anlass.titel } : null;
  if (stand.anlass && stand.anlass.twint_qr_url) {
    const v = bildVersion(stand.anlass.twint_qr_url);
    return {
      url: `/api/twint-qr/bild/${encodeURIComponent(stand.anlass.id)}${v ? `?v=${v}` : ''}`,
      anlass,
      quelle: 'anlass',
      modus: stand.modus,
    };
  }
  if (einstellungUrl && einstellungUrl.trim()) {
    return { url: einstellungUrl.trim(), anlass, quelle: 'einstellung', modus: stand.modus };
  }
  return { url: VEREINS_QR_URL, anlass, quelle: 'standard', modus: stand.modus };
}
