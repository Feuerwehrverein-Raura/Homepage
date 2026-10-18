// ---------------------------------------------------------------------------
// Bar-Licht (Oktober 2026): Kommt eine Bar-Bestellung, blinkt Spot 1 im
// Roten Schopf, bis die Bar sie quittiert (am Bar-Bildschirm "erledigt") -
// der Bildschirm der Bar haengt hinten und wird leicht uebersehen.
// Hoechstens 5 Minuten; danach steht der Spot wieder wie vorher.
//
// Spot 1 = Shelly 2PM "Regler 1", Kanal 1, hinter der Zentrale (Pro 3EM,
// 192.168.88.84) im eigenen WLAN 192.168.33.x. Erreichbar ueber deren Range
// Extender: der Port (mport) wird bei jedem Mal ueber WiFi.ListAPClients
// erfragt, er kann sich beim Neuverbinden aendern (wie der Kiosk-Dienst,
// memory/servers/RoterSchopf-T400). Nur am T400 - die Cloud erreicht das
// Schopf-Netz nicht.
//
// Abschalten: Einstellung barlicht = 'aus' (Web-Kasse/Datenbank).
// Anpassen per Umgebung: BARLICHT_ZENTRALE, BARLICHT_GERAET, BARLICHT_KANAL.
// ---------------------------------------------------------------------------

const ZENTRALE = process.env.BARLICHT_ZENTRALE || '192.168.88.84';
const GERAET = process.env.BARLICHT_GERAET || '192.168.33.4';
const KANAL = Number(process.env.BARLICHT_KANAL || 1);
const BLINKEN = 3;
const TAKT_MS = 450;

let laeuft = false;
// Bestellungen, deren Bar-Positionen noch nicht quittiert (erledigt) sind
const offen = new Set<number>();
const HOECHSTENS_MS = 5 * 60 * 1000;

const warten = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rpc(basis: string, pfad: string): Promise<any> {
  // Die Zentrale ist unter Last traege: zweimal versuchen
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(`${basis}/rpc/${pfad}`, { signal: AbortSignal.timeout(6000) });
      if (r.ok) return await r.json();
    } catch { /* nochmals */ }
  }
  throw new Error(`${pfad} ohne Antwort`);
}

/** Noch offene (nicht erledigte) Bar-Positionen der beobachteten Bestellungen? */
type Offen = (ids: number[]) => Promise<number[]>;

/**
 * Bar-Bestellung melden: Spot 1 blinkt (je drei Blitze, dann kurze Pause),
 * bis die Bar alle gemeldeten Bestellungen quittiert (= ihre Bar-Positionen
 * als erledigt markiert) hat - hoechstens 5 Minuten. Danach steht der Spot
 * wieder wie vorher. Laeuft im Hintergrund, wirft nie.
 */
export function barlichtMelden(bestellung: number, nochOffen: Offen,
  melden: (typ: string, meldung: string) => void = () => {}): void {
  offen.add(bestellung);
  if (laeuft) return;
  laeuft = true;
  (async () => {
    const start = Date.now();
    let basis = '';
    let vorher: boolean | null = null;
    try {
      const liste = await rpc(`http://${ZENTRALE}`, 'WiFi.ListAPClients');
      const klient = (liste?.ap_clients || []).find((c: any) => c.ip === GERAET);
      if (!klient?.mport) throw new Error(`Spot-Geraet ${GERAET} nicht bei der Zentrale angemeldet`);
      basis = `http://${ZENTRALE}:${klient.mport}`;
      vorher = !!(await rpc(basis, `Switch.GetStatus?id=${KANAL}`))?.output;
      while (offen.size && Date.now() - start < HOECHSTENS_MS) {
        for (let i = 0; i < BLINKEN; i++) {
          await rpc(basis, `Switch.Set?id=${KANAL}&on=${!vorher}`);
          await warten(TAKT_MS);
          await rpc(basis, `Switch.Set?id=${KANAL}&on=${vorher}`);
          await warten(TAKT_MS);
        }
        await warten(1500);
        // quittiert? (erledigte Bestellungen aus der Beobachtung nehmen)
        const rest = new Set(await nochOffen([...offen]).catch(() => [...offen]));
        for (const id of [...offen]) if (!rest.has(id)) offen.delete(id);
      }
      if (offen.size) melden('barlicht_zeitende', `nicht quittiert nach 5 min: ${[...offen].join(', ')}`);
    } catch (e: any) {
      melden('barlicht_fehler', String(e?.message || e));
    } finally {
      // Zustand sicher zuruecksetzen
      if (basis && vorher !== null) {
        try { await rpc(basis, `Switch.Set?id=${KANAL}&on=${vorher}`); } catch { /* egal */ }
      }
      offen.clear();
      laeuft = false;
    }
  })();
}
