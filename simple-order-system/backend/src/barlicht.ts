// ---------------------------------------------------------------------------
// Bar-Licht (Oktober 2026): Kommt eine Bar-Bestellung, blinkt Spot 1 im
// Roten Schopf, bis die Bar sie quittiert (am Bar-Bildschirm "erledigt") -
// der Bildschirm der Bar haengt hinten und wird leicht uebersehen.
// Hoechstens 5 Minuten; danach steht der Spot wieder wie vorher.
//
// Lampen: Spot 1 (Shelly 2PM "Regler 1", Kanal 1, 192.168.33.4:1) und die
// Girlande Bar (Regler 2, Kanal 1, 192.168.33.5:1), hinter der Zentrale
// (Pro 3EM, 192.168.88.84) im eigenen WLAN 192.168.33.x. Erreichbar ueber deren Range
// Extender: der Port (mport) wird bei jedem Mal ueber WiFi.ListAPClients
// erfragt, er kann sich beim Neuverbinden aendern (wie der Kiosk-Dienst,
// memory/servers/RoterSchopf-T400). Nur am T400 - die Cloud erreicht das
// Schopf-Netz nicht.
//
// Abschalten: Einstellung barlicht = 'aus' (Web-Kasse/Datenbank).
// Anpassen per Umgebung: BARLICHT_ZENTRALE, BARLICHT_LAMPEN ("ip:kanal,...").
// ---------------------------------------------------------------------------

const ZENTRALE = process.env.BARLICHT_ZENTRALE || '192.168.88.84';
const LAMPEN = (process.env.BARLICHT_LAMPEN || '192.168.33.4:1,192.168.33.5:1')
  .split(',').map((x) => x.trim()).filter(Boolean)
  .map((x) => ({ geraet: x.split(':')[0], kanal: Number(x.split(':')[1] || 0) }));
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
    // je Lampe: Adresse ueber den Range Extender und Zustand vorher
    const lampen: { basis: string; kanal: number; vorher: boolean }[] = [];
    const setzen = async (an: (l: { vorher: boolean }) => boolean) => {
      // nacheinander - der Range Extender verkraftet wenig Gleichzeitiges
      for (const l of lampen) await rpc(l.basis, `Switch.Set?id=${l.kanal}&on=${an(l)}`);
    };
    try {
      const liste = await rpc(`http://${ZENTRALE}`, 'WiFi.ListAPClients');
      for (const { geraet, kanal } of LAMPEN) {
        const klient = (liste?.ap_clients || []).find((c: any) => c.ip === geraet);
        if (!klient?.mport) { melden('barlicht_fehler', `Lampe ${geraet} nicht bei der Zentrale angemeldet`); continue; }
        const basis = `http://${ZENTRALE}:${klient.mport}`;
        lampen.push({ basis, kanal, vorher: !!(await rpc(basis, `Switch.GetStatus?id=${kanal}`))?.output });
      }
      if (!lampen.length) throw new Error('keine Lampe erreichbar');
      while (offen.size && Date.now() - start < HOECHSTENS_MS) {
        for (let i = 0; i < BLINKEN; i++) {
          await setzen((l) => !l.vorher);
          await warten(TAKT_MS);
          await setzen((l) => l.vorher);
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
      for (const l of lampen) {
        try { await rpc(l.basis, `Switch.Set?id=${l.kanal}&on=${l.vorher}`); } catch { /* egal */ }
      }
      offen.clear();
      laeuft = false;
    }
  })();
}

/** Laufendes Blinken beenden (Schalter aus): Lampen gehen zurueck wie vorher. */
export function barlichtStoppen(): void {
  offen.clear();
}
