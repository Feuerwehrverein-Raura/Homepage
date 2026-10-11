/**
 * Ausleihe — reine Regeln ohne Netz und ohne Datenbank, damit sie sich
 * testen lassen (test/ausleihe-regeln.test.mjs). Die Routen stehen in
 * ausleihe-routen.ts.
 *
 * Entscheid (docs/flutter-entscheidung.md, "Ausleihe"): Mitglieder leihen
 * Lager-Artikel mit Menge und ganze Kisten (Lagerorte samt Inhalt) selbst
 * aus, ohne Freigabe. Kuenftige Ausleihen zaehlen als Reservierung.
 *
 * Verfuegbarkeit eines Artikels fuer einen Zeitraum:
 *   Besitz  = Bestand im Lager (items.quantity) + was gerade ausgegeben ist
 *             (beim Ausgeben wird ausgebucht, beim Zuruecknehmen wieder
 *             eingebucht)
 *   belegt  = Mengen aller Ausleihen (reserviert oder ausgegeben), die den
 *             Zeitraum ueberschneiden — direkt als Position und als Inhalt
 *             einer ausgeliehenen Kiste. Eine ausgegebene Ausleihe belegt
 *             bis zur Rueckgabe, auch ueber ihr "bis" hinaus (ueberfaellig).
 *   frei    = Besitz − belegt (nie unter 0)
 * Eine Kiste ist frei, wenn keine ueberschneidende Ausleihe sie hat.
 */

export type Status = 'reserviert' | 'ausgegeben' | 'zurueckgegeben' | 'abgesagt';
export type Zustand = 'ok' | 'beschaedigt' | 'fehlt';

export const STATUS: readonly Status[] = ['reserviert', 'ausgegeben', 'zurueckgegeben', 'abgesagt'];
export const ZUSTAENDE: readonly Zustand[] = ['ok', 'beschaedigt', 'fehlt'];

/** Ausleihen, die Material belegen. */
export const OFFEN: readonly Status[] = ['reserviert', 'ausgegeben'];

// ---------------------------------------------------------------------------
// Datum (immer Text YYYY-MM-DD, Ortszeit Zuerich)

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Gueltiges Datum YYYY-MM-DD? (auch 2026-02-30 wird abgelehnt) */
export function istDatum(wert: unknown): wert is string {
  if (typeof wert !== 'string' || !ISO.test(wert)) return false;
  const d = new Date(`${wert}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === wert;
}

/** Heute in Zuerich als YYYY-MM-DD. */
export function heuteZuerich(jetzt: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Zurich' }).format(jetzt);
}

export function tageDazu(datum: string, tage: number): string {
  const d = new Date(`${datum}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

export function tageZwischen(von: string, bis: string): number {
  return Math.round((Date.parse(`${bis}T00:00:00Z`) - Date.parse(`${von}T00:00:00Z`)) / 86400000);
}

/** 2026-10-12 -> 12.10.2026 */
export function datumText(d: string): string {
  const [j, m, t] = d.split('-');
  return `${t}.${m}.${j}`;
}

/** "12.10.2026" oder "12.10.2026 – 14.10.2026" */
export function zeitraumText(von: string, bis: string): string {
  return von === bis ? datumText(von) : `${datumText(von)} – ${datumText(bis)}`;
}

/** Ueberschneiden sich [a1, a2] und [b1, b2] (Tage einschliesslich)? */
export function ueberschneidet(a1: string, a2: string, b1: string, b2: string): boolean {
  return a1 <= b2 && b1 <= a2;
}

/**
 * Bis wann belegt eine Ausleihe das Material? Ausgegebene bis zur
 * Rueckgabe, mindestens bis heute.
 */
export function belegtBis(status: Status, bis: string, heute: string): string {
  return status === 'ausgegeben' && bis < heute ? heute : bis;
}

// ---------------------------------------------------------------------------
// Verfuegbarkeit

export interface ArtikelBestand {
  id: number;
  /** items.quantity */
  bestand: number;
  /** gerade ausgegeben (Ausleihen mit Status ausgegeben) */
  unterwegs: number;
}

export interface Belegung {
  /** Artikel-Menge (direkt oder als Kisten-Inhalt). */
  item_id?: number | null;
  /** Ganze Kiste. */
  location_id?: number | null;
  menge: number;
}

export interface Verfuegbarkeit {
  frei: Map<number, number>;
  kistenBelegt: Set<number>;
}

/**
 * [belegungen] sind die Positionen aller Ausleihen, die den Zeitraum
 * ueberschneiden (Kisten zusaetzlich mit ihrem Inhalt als Artikel-Zeilen).
 */
export function verfuegbarkeit(artikel: ArtikelBestand[], belegungen: Belegung[]): Verfuegbarkeit {
  const belegt = new Map<number, number>();
  const kistenBelegt = new Set<number>();
  for (const b of belegungen) {
    if (b.location_id != null) kistenBelegt.add(Number(b.location_id));
    if (b.item_id != null) {
      const id = Number(b.item_id);
      belegt.set(id, (belegt.get(id) ?? 0) + Number(b.menge || 0));
    }
  }
  const frei = new Map<number, number>();
  for (const a of artikel) {
    const besitz = Number(a.bestand || 0) + Number(a.unterwegs || 0);
    frei.set(a.id, Math.max(0, besitz - (belegt.get(a.id) ?? 0)));
  }
  return { frei, kistenBelegt };
}

export interface Bedarf {
  /** Artikel direkt ausgeliehen */
  artikel: { item_id: number; menge: number; name: string; einheit: string | null; ausleihbar: boolean }[];
  /** Kisten mit ihrem heutigen Inhalt */
  kisten: {
    location_id: number;
    name: string;
    ausleihbar: boolean;
    inhalt: { item_id: number; menge: number; name: string; einheit: string | null }[];
  }[];
}

/** Menge zur Anzeige: "5 Stück", "1 Flasche". */
export function mengeText(menge: number, einheit: string | null | undefined): string {
  return einheit ? `${menge} ${einheit}` : `${menge}`;
}

/**
 * Passt die Anfrage in den Zeitraum? Gibt eine deutsche Meldung zurueck
 * (fuer 409) oder null. Artikel, die direkt UND in einer Kiste verlangt
 * werden, zaehlen zusammen.
 */
export function anfragePruefen(bedarf: Bedarf, v: Verfuegbarkeit, zeitraum: string): string | null {
  for (const k of bedarf.kisten) {
    if (!k.ausleihbar) return `«${k.name}» kann nicht ausgeliehen werden.`;
    if (v.kistenBelegt.has(k.location_id)) {
      return `«${k.name}» ist am ${zeitraum} schon ausgeliehen oder reserviert.`;
    }
  }
  const summe = new Map<number, { menge: number; name: string; einheit: string | null }>();
  for (const a of bedarf.artikel) {
    if (!a.ausleihbar) return `«${a.name}» kann nicht ausgeliehen werden.`;
    const s = summe.get(a.item_id) ?? { menge: 0, name: a.name, einheit: a.einheit };
    s.menge += a.menge;
    summe.set(a.item_id, s);
  }
  for (const k of bedarf.kisten) {
    for (const i of k.inhalt) {
      const s = summe.get(i.item_id) ?? { menge: 0, name: i.name, einheit: i.einheit };
      s.menge += i.menge;
      summe.set(i.item_id, s);
    }
  }
  for (const [id, s] of summe) {
    const frei = v.frei.get(id) ?? 0;
    if (s.menge > frei) {
      return frei <= 0
        ? `«${s.name}» ist am ${zeitraum} schon ganz ausgeliehen oder reserviert.`
        : `Von «${s.name}» sind am ${zeitraum} nur noch ${mengeText(frei, s.einheit)} frei.`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Anzeige (die App zeigt nur an, was hier fertig gebaut wird)

export interface AusleiheZeile {
  id: number;
  status: Status;
  von: string;
  bis: string;
  art: 'mitglied' | 'extern';
  mitglied_email: string | null;
  mitglied_name: string | null;
  extern_name: string | null;
  extern_organisation: string | null;
}

export const STATUS_TEXT: Record<Status, string> = {
  reserviert: 'Reserviert',
  ausgegeben: 'Ausgegeben',
  zurueckgegeben: 'Zurückgegeben',
  abgesagt: 'Abgesagt'
};

export const ZUSTAND_TEXT: Record<Zustand, string> = {
  ok: 'In Ordnung',
  beschaedigt: 'Beschädigt',
  fehlt: 'Fehlt'
};

export function istUeberfaellig(a: { status: Status; bis: string }, heute: string): boolean {
  return a.status === 'ausgegeben' && a.bis < heute;
}

export function ausleiherText(a: AusleiheZeile): string {
  if (a.art === 'extern') {
    return [a.extern_name, a.extern_organisation].filter(Boolean).join(', ') || 'Extern';
  }
  return a.mitglied_name || a.mitglied_email || 'Mitglied';
}

/**
 * Was die App ueber Status und erlaubte Aktionen braucht. [eigene]: die
 * anfragende Person hat die Ausleihe selbst ausgeliehen.
 */
export function appBlock(a: AusleiheZeile, heute: string, sicht: { lager: boolean; eigene: boolean }) {
  const ueberfaellig = istUeberfaellig(a, heute);
  let hinweis: string | null = null;
  if (ueberfaellig) {
    const tage = tageZwischen(a.bis, heute);
    hinweis = tage === 1 ? 'Seit 1 Tag überfällig' : `Seit ${tage} Tagen überfällig`;
  } else if (a.status === 'ausgegeben') {
    hinweis = a.bis === heute ? 'Heute zurückbringen' : `Zurück bis ${datumText(a.bis)}`;
  } else if (a.status === 'reserviert') {
    hinweis = a.von < heute ? 'Noch nicht abgeholt' : a.von === heute ? 'Heute abholen' : `Abholen ab ${datumText(a.von)}`;
  }
  return {
    status_text: ueberfaellig ? 'Überfällig' : STATUS_TEXT[a.status],
    status_farbe: ueberfaellig ? 'rot' : a.status === 'reserviert' ? 'gelb' : a.status === 'ausgegeben' ? 'gruen' : 'grau',
    zeitraum_text: zeitraumText(a.von, a.bis),
    ausleiher_text: ausleiherText(a),
    hinweis,
    ueberfaellig,
    kann_absagen: a.status === 'reserviert' && (sicht.lager || sicht.eigene),
    kann_ausgeben: a.status === 'reserviert' && sicht.lager,
    kann_zuruecknehmen: a.status === 'ausgegeben' && sicht.lager
  };
}

// ---------------------------------------------------------------------------
// Rueckgabe

export interface RueckgabeEingabe {
  /** Ausgeliehen */
  menge: number;
  /** Zurueck ins Lager (in Ordnung bzw. trotz Schaden brauchbar) */
  zurueck: unknown;
  zustand: unknown;
}

/**
 * Prueft eine Rueckgabe-Zeile. Regeln:
 *  - zurueck ist eine ganze Zahl von 0 bis zur ausgeliehenen Menge; nur das
 *    wird wieder eingebucht.
 *  - "ok" verlangt, dass alles zurueck ist.
 *  - "fehlt" verlangt, dass etwas fehlt (zurueck < menge).
 *  - "beschaedigt": Rest ist kaputt (bleibt ausgebucht) oder alles zurueck,
 *    aber mit Schaden.
 * Gibt eine Meldung zurueck oder null.
 */
export function rueckgabePruefen(e: RueckgabeEingabe, name: string): string | null {
  const z = Number(e.zurueck);
  if (!Number.isInteger(z) || z < 0 || z > e.menge) {
    return `«${name}»: zurück muss eine ganze Zahl von 0 bis ${e.menge} sein.`;
  }
  if (!ZUSTAENDE.includes(e.zustand as Zustand)) return `«${name}»: Zustand fehlt (ok, beschaedigt oder fehlt).`;
  if (e.zustand === 'ok' && z !== e.menge) return `«${name}»: Bei «In Ordnung» muss alles zurück sein.`;
  if (e.zustand === 'fehlt' && z === e.menge) return `«${name}»: Es ist alles zurück — dann fehlt nichts.`;
  return null;
}

// ---------------------------------------------------------------------------
// Erinnerungen

export interface ErinnerungsZeile {
  id: number;
  status: Status;
  bis: string;
  erinnert_vorher_am: string | null;
  erinnert_ueberfaellig_am: string | null;
}

export type ErinnerungsArt = 'vorher' | 'ueberfaellig';

/**
 * Welche Erinnerungen sind heute faellig? Hoechstens eine pro Ausleihe und
 * Tag:
 *  - "vorher": ausgegeben, Rueckgabe morgen, noch nie daran erinnert.
 *  - "ueberfaellig": ausgegeben, Rueckgabe vorbei, heute noch nicht erinnert.
 * [erstes]: erste Ueberfaellig-Erinnerung (dann bekommt auch das Lager
 * Bescheid).
 */
export function faelligeErinnerungen(
  zeilen: ErinnerungsZeile[],
  heute: string
): { id: number; art: ErinnerungsArt; erstes: boolean }[] {
  const morgen = tageDazu(heute, 1);
  const aus: { id: number; art: ErinnerungsArt; erstes: boolean }[] = [];
  for (const z of zeilen) {
    if (z.status !== 'ausgegeben') continue;
    if (z.bis < heute) {
      if (z.erinnert_ueberfaellig_am == null || z.erinnert_ueberfaellig_am < heute) {
        aus.push({ id: z.id, art: 'ueberfaellig', erstes: z.erinnert_ueberfaellig_am == null });
      }
    } else if (z.bis === morgen && z.erinnert_vorher_am == null) {
      aus.push({ id: z.id, art: 'vorher', erstes: true });
    }
  }
  return aus;
}
