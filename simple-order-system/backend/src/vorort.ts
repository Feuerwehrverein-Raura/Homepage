// ---------------------------------------------------------------------------
// Kasse vor Ort (T400 im Roten Schopf), Oktober 2026
//
// Dasselbe Backend laeuft zweimal:
//  - in der Cloud (order.fwv-raura.ch) wie bisher
//  - auf dem T400 mit KASSE_VOR_ORT=true, im Schopf-Netz erreichbar unter
//    https://kasse-lokal.fwv-raura.ch. Kasse und Kuechendisplay pruefen, ob
//    dieser Name antwortet, und arbeiten dann dort: Bons direkt an den
//    Drucker, Kueche sieht alles, auch ohne Internet.
//
// Eindeutige Nummern: Der T400 vergibt Bestell-, Positions- und
// Zahlungsnummern ab T400_AB (die Cloud bleibt darunter). Eine Bestellung hat
// deshalb ueberall dieselbe Nummer - auf dem Bon, in der Kasse, in der Kueche
// - und der Abgleich kann in beide Richtungen laufen, ohne zu verwechseln:
//  - T400 -> Cloud: Bestellungen mit geaendert > gesendet (alle 3 s)
//  - Cloud -> T400: alles mit geaendert > Merker (alle 5 s, 30 s Ueberlappung)
// Zusammengefuehrt wird ueberall gleich (mischen): fehlende Bestellungen,
// Positionen und Zahlungen werden mit ihrer Nummer angelegt, Status nie
// zurueckgestuft, "bezahlt"/"fertig" einer Position bleibt, Total = Summe.
// Gedruckt wird nur, wo eine Bestellung entsteht - nie beim Uebernehmen.
// Das Lager bucht nur die Cloud (beim ersten Eintreffen einer T400-Position).
//
// Druckvermerk (orders.bon_fehler): NULL = noch unbekannt, '' = alle Bons
// gedruckt, sonst die Stationen mit Fehler ("kitchen", "bar,kitchen"). Konnte
// die Cloud einen Bon nicht drucken (z.B. WireGuard weg), druckt der T400 ihn
// nach - aber nur bei ausdruecklichem Fehler, nie bei "unbekannt", sonst
// kaeme er doppelt. Gedruckt gilt, sobald eine Seite '' meldet.
//
// Stornos: Die Kasse loescht stornierte Positionen. Damit die andere Seite
// sie nicht wieder einspielt, merkt sich ein Trigger jede geloeschte
// Position (storno_positionen); die Liste reist mit und wird beim Mischen
// zuerst angewendet.
//
// "geaendert" setzen Trigger, aber nur bei echten Aenderungen - sonst wuerde
// jede Uebernahme eine Gegen-Uebernahme ausloesen (Ping-Pong).
// ---------------------------------------------------------------------------
import type express from 'express';
import type pg from 'pg';
import { serverEreignis } from './protokoll.js';

export const VOR_ORT = process.env.KASSE_VOR_ORT === 'true';
const CLOUD = (process.env.CLOUD_ORDER_URL || 'https://order.fwv-raura.ch').replace(/\/$/, '');
const QUELLE = process.env.SYNC_SOURCE || 't400';
// Nummernkreise des T400 (Cloud bleibt darunter).
export const T400_AB = { orders: 500000, order_items: 50000000, order_payments: 50000000 };
// Einstellungen, die nur vor Ort gelten und nie aus der Cloud kommen.
const NUR_LOKAL = new Set(['last_cloud_sync', 'artikel_cache', 'cloud_merker']);

// Status nie zurueckstufen (die Kueche schliesst ab, die andere Seite kennt
// das noch nicht und schickt weiter "paid").
const RANG: Record<string, number> = { pending: 0, paid: 1, completed: 2, cancelled: 3 };
export function statusMischen(a: string | null | undefined, b: string | null | undefined): string {
  const x = a || 'pending';
  const y = b || 'pending';
  return (RANG[y] ?? 0) > (RANG[x] ?? 0) ? y : x;
}

interface Abhaengigkeiten {
  app: express.Express;
  pool: pg.Pool;
  orderApiKey: string;
  inventoryApiUrl: string;
  broadcast: (d: any) => void;
  // Bon fuer die genannten Positionen drucken; liefert die Stationen mit Fehler.
  bonDrucken: (orderId: number, tableNumber: number, items: any[]) => Promise<string[]>;
  setSetting: (k: string, v: string) => Promise<void>;
  getSetting: (k: string) => Promise<string | null>;
}

const mitLimit = (ms: number) => AbortSignal.timeout(ms);
// Zeitstempel ohne Zeitzone 1:1 weitergeben (beide DBs rechnen gleich).
const ZEIT = (s: string) => `to_char(${s}, 'YYYY-MM-DD"T"HH24:MI:SS.US')`;

export async function vorOrtSchema(pool: pg.Pool): Promise<void> {
  // Erste Fassung (16.10. vormittags) aufraeumen
  await pool.query(`DROP TRIGGER IF EXISTS vor_ort_orders ON orders`);
  await pool.query(`DROP TRIGGER IF EXISTS vor_ort_order_items ON order_items`);
  await pool.query(`DROP TRIGGER IF EXISTS vor_ort_order_payments ON order_payments`);
  await pool.query(`ALTER TABLE orders DROP COLUMN IF EXISTS lokal_geaendert`);
  await pool.query(`ALTER TABLE orders DROP COLUMN IF EXISTS cloud_gesendet`);

  // Beide Seiten: "geaendert" fuer den Abgleich
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS geaendert TIMESTAMPTZ DEFAULT clock_timestamp()`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_geaendert ON orders(geaendert)`);
  if (VOR_ORT) await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS gesendet TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS bon_fehler TEXT`);
  await pool.query(`
    CREATE OR REPLACE FUNCTION abgleich_order_geaendert() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'UPDATE' THEN
        -- ausdruecklich gesetzt (Position/Zahlung geaendert): uebernehmen
        IF NEW.geaendert IS DISTINCT FROM OLD.geaendert THEN RETURN NEW; END IF;
        -- nichts Echtes geaendert (nur gesendet/synced_at): Zeit bleibt
        IF (to_jsonb(NEW) - ARRAY['geaendert','gesendet','synced_at']) =
           (to_jsonb(OLD) - ARRAY['geaendert','gesendet','synced_at']) THEN RETURN NEW; END IF;
      END IF;
      NEW.geaendert := clock_timestamp();
      RETURN NEW;
    END $$ LANGUAGE plpgsql`);
  await pool.query(`
    CREATE OR REPLACE FUNCTION abgleich_kind_geaendert() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        UPDATE orders SET geaendert = clock_timestamp() WHERE id = OLD.order_id;
      ELSE
        UPDATE orders SET geaendert = clock_timestamp() WHERE id = NEW.order_id;
      END IF;
      RETURN NULL;
    END $$ LANGUAGE plpgsql`);
  await pool.query(`DROP TRIGGER IF EXISTS abgleich_orders ON orders`);
  await pool.query(`CREATE TRIGGER abgleich_orders BEFORE INSERT OR UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION abgleich_order_geaendert()`);
  for (const t of ['order_items', 'order_payments']) {
    await pool.query(`DROP TRIGGER IF EXISTS abgleich_${t} ON ${t}`);
    await pool.query(`DROP TRIGGER IF EXISTS abgleich_${t}_upd ON ${t}`);
    await pool.query(`CREATE TRIGGER abgleich_${t} AFTER INSERT OR DELETE ON ${t}
      FOR EACH ROW EXECUTE FUNCTION abgleich_kind_geaendert()`);
    await pool.query(`CREATE TRIGGER abgleich_${t}_upd AFTER UPDATE ON ${t}
      FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION abgleich_kind_geaendert()`);
  }

  // Stornierte (geloeschte) Positionen merken
  await pool.query(`CREATE TABLE IF NOT EXISTS storno_positionen (
      id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL, created_at TIMESTAMPTZ DEFAULT now())`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_storno_order ON storno_positionen(order_id)`);
  await pool.query(`
    CREATE OR REPLACE FUNCTION abgleich_storno_merken() RETURNS trigger AS $$
    BEGIN
      INSERT INTO storno_positionen (id, order_id) VALUES (OLD.id, OLD.order_id) ON CONFLICT (id) DO NOTHING;
      RETURN NULL;
    END $$ LANGUAGE plpgsql`);
  await pool.query(`DROP TRIGGER IF EXISTS abgleich_storno ON order_items`);
  await pool.query(`CREATE TRIGGER abgleich_storno AFTER DELETE ON order_items
    FOR EACH ROW EXECUTE FUNCTION abgleich_storno_merken()`);

  // T400: eigene Nummernkreise
  if (VOR_ORT) {
    for (const [t, ab] of Object.entries(T400_AB)) {
      await pool.query(
        `SELECT setval(pg_get_serial_sequence($1, 'id'), GREATEST($2::bigint, (SELECT COALESCE(MAX(id), 0) FROM ${t})))`,
        [t, ab]);
    }
  }
}

// Bestellung samt Positionen und Zahlungen fuer den Abgleich lesen.
async function bestellungenLesen(db: pg.Pool | pg.PoolClient, where: string, params: any[], limit: number) {
  const orders = (await db.query(
    `SELECT o.id, o.client_ref, o.table_number, o.status, o.total, o.payment_method, o.event_id, o.event_titel, o.bon_fehler,
            ${ZEIT('o.created_at')} AS created_at, o.geaendert::text AS stand
     FROM orders o WHERE ${where} ORDER BY o.geaendert LIMIT ${limit}`, params)).rows;
  if (!orders.length) return [];
  const ids = orders.map((o: any) => o.id);
  const items = (await db.query(
    `SELECT id, order_id, item_id, item_name, quantity, price, notes, printer_station,
            COALESCE(paid, false) AS paid, ${ZEIT('paid_at')} AS paid_at,
            COALESCE(completed, false) AS completed, ${ZEIT('completed_at')} AS completed_at
     FROM order_items WHERE order_id = ANY($1::int[]) ORDER BY id`, [ids])).rows;
  const zahlungen = (await db.query(
    `SELECT id, order_id, amount, payment_method, description, ${ZEIT('created_at')} AS created_at
     FROM order_payments WHERE order_id = ANY($1::int[]) ORDER BY id`, [ids])).rows;
  const stornos = (await db.query(
    'SELECT id, order_id FROM storno_positionen WHERE order_id = ANY($1::int[])', [ids])).rows;
  return orders.map((o: any) => ({
    ...o,
    items: items.filter((i: any) => i.order_id === o.id),
    payments: zahlungen.filter((z: any) => z.order_id === o.id),
    storniert: stornos.filter((x: any) => x.order_id === o.id).map((x: any) => x.id),
  }));
}

interface MischErgebnis {
  id: number;
  neu: boolean;
  neueArtikel: { id: any; quantity: number }[];
  statusVorher: string | null;
  statusNachher: string;
  fertigeArtikel: number[];
  geaendert: boolean;
}

// Druckvermerke zusammenfuehren (siehe oben).
export function bonMischen(a: string | null | undefined, b: string | null | undefined): string | null {
  const x = a ?? null;
  const y = b ?? null;
  if (x === '' || y === '') return '';
  if (x === null) return y;
  if (y === null) return x;
  const yy = new Set(y.split(',').filter(Boolean));
  return x.split(',').filter((st) => yy.has(st)).join(',');
}

// Eine Bestellung der anderen Seite einarbeiten. In einer Transaktion.
export async function mischen(client: pg.PoolClient, b: any, quelle: string | null): Promise<MischErgebnis> {
  const id = Number(b?.id);
  if (!Number.isInteger(id) || id <= 0) throw new Error('ungueltige id');
  const erg: MischErgebnis = { id, neu: false, neueArtikel: [], statusVorher: null, statusNachher: b.status || 'pending', fertigeArtikel: [], geaendert: false };

  const da = (await client.query('SELECT id, status, bon_fehler, geaendert::text AS stand FROM orders WHERE id = $1 FOR UPDATE', [id])).rows[0];
  if (!da && typeof b.client_ref === 'string' && b.client_ref) {
    // Gepufferte Bestellung, die auf beiden Seiten angelegt wurde (Antwort
    // ging verloren, Kasse wechselte den Ort): nur den Status abgleichen.
    const andere = (await client.query('SELECT id, status FROM orders WHERE client_ref = $1 FOR UPDATE', [b.client_ref])).rows[0];
    if (andere) {
      const s = statusMischen(andere.status, b.status);
      await client.query('UPDATE orders SET status = $1, payment_method = COALESCE(payment_method, $2) WHERE id = $3',
        [s, b.payment_method || null, andere.id]);
      return { ...erg, id: andere.id, statusVorher: andere.status, statusNachher: s, geaendert: s !== andere.status };
    }
  }

  if (!da) {
    erg.neu = true;
    await client.query(
      `INSERT INTO orders (id, table_number, status, total, payment_method, created_at, sync_source, sync_source_id, synced_at, event_id, event_titel, client_ref, bon_fehler)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamp, CURRENT_TIMESTAMP), $7, $1, NOW(), $8, $9, $10, $11)`,
      [id, b.table_number ?? 0, b.status || 'pending', b.total ?? 0, b.payment_method || null, b.created_at || null,
       quelle, b.event_id || null, b.event_titel || null, b.client_ref || null, b.bon_fehler ?? null]);
  } else {
    erg.statusVorher = da.status;
    erg.statusNachher = statusMischen(da.status, b.status);
    await client.query(
      `UPDATE orders SET status = $1, payment_method = COALESCE($2, payment_method),
         event_id = COALESCE(event_id, $3), event_titel = COALESCE(event_titel, $4), table_number = $5, bon_fehler = $7
       WHERE id = $6`,
      [erg.statusNachher, b.payment_method || null, b.event_id || null, b.event_titel || null, b.table_number ?? 0, id,
       bonMischen(da.bon_fehler, b.bon_fehler)]);
  }

  // Stornos zuerst: geloeschte Positionen nie wieder anlegen.
  for (const sid of (Array.isArray(b.storniert) ? b.storniert : [])) {
    const n = Number(sid);
    if (!Number.isInteger(n)) continue;
    await client.query('INSERT INTO storno_positionen (id, order_id) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [n, id]);
    await client.query('DELETE FROM order_items WHERE id = $1 AND order_id = $2', [n, id]);
  }
  for (const p of (Array.isArray(b.items) ? b.items : [])) {
    const pid = Number(p.id);
    if (!Number.isInteger(pid)) continue;
    if ((await client.query('SELECT 1 FROM storno_positionen WHERE id = $1', [pid])).rows.length) continue;
    const alt = (await client.query('SELECT id, order_id, completed FROM order_items WHERE id = $1', [pid])).rows[0];
    if (alt && alt.order_id !== id) continue; // gehoert zu einer anderen Bestellung - nie anfassen
    if (alt) {
      await client.query(
        `UPDATE order_items SET quantity = $1, price = $2, notes = $3,
           paid = (COALESCE(paid, false) OR $4), paid_at = COALESCE(paid_at, $5::timestamp),
           completed = (COALESCE(completed, false) OR $6), completed_at = COALESCE(completed_at, $7::timestamp)
         WHERE id = $8`,
        [p.quantity, p.price, p.notes || null, !!p.paid, p.paid_at || null, !!p.completed, p.completed_at || null, pid]);
      if (p.completed && !alt.completed) erg.fertigeArtikel.push(pid);
    } else {
      await client.query(
        `INSERT INTO order_items (id, order_id, item_id, item_name, quantity, price, notes, printer_station, paid, paid_at, completed, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamp, $11, $12::timestamp)`,
        [pid, id, p.item_id ?? null, p.item_name || null, p.quantity, p.price, p.notes || null, p.printer_station || 'bar',
         !!p.paid, p.paid_at || null, !!p.completed, p.completed_at || null]);
      if (p.item_id) erg.neueArtikel.push({ id: Number(p.item_id) || p.item_id, quantity: p.quantity });
    }
  }
  for (const z of (Array.isArray(b.payments) ? b.payments : [])) {
    const zid = Number(z.id);
    if (!Number.isInteger(zid)) continue;
    await client.query(
      `INSERT INTO order_payments (id, order_id, amount, payment_method, description, created_at)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamp, CURRENT_TIMESTAMP)) ON CONFLICT (id) DO NOTHING`,
      [zid, id, z.amount, z.payment_method || 'cash', z.description || null, z.created_at || null]);
  }
  // Total = Summe der Positionen (beide Seiten rechnen gleich).
  await client.query(
    `UPDATE orders SET total = COALESCE((SELECT SUM(price * quantity) FROM order_items WHERE order_id = $1), 0) WHERE id = $1`, [id]);
  const nach = (await client.query('SELECT geaendert::text AS stand FROM orders WHERE id = $1', [id])).rows[0];
  erg.geaendert = erg.neu || !da || nach.stand !== da.stand;
  return erg;
}

export function vorOrtEinrichten(d: Abhaengigkeiten): void {
  const { app, pool, orderApiKey, broadcast } = d;

  // Kueche und Kassen dieser Seite ueber Uebernommenes informieren.
  async function melden(e: MischErgebnis): Promise<void> {
    if (!e.geaendert) return;
    if (e.neu) {
      const order = (await pool.query('SELECT * FROM orders WHERE id = $1', [e.id])).rows[0];
      const items = (await pool.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY id', [e.id])).rows;
      if (order && order.status !== 'completed' && order.status !== 'cancelled') {
        broadcast({ type: 'new_order', order: { ...order, items } });
      }
      return;
    }
    if (e.statusNachher === 'completed' && e.statusVorher !== 'completed') {
      broadcast({ type: 'order_completed', order_id: e.id });
    } else if (e.fertigeArtikel.length) {
      broadcast({ type: 'items_completed', order_id: e.id, item_ids: e.fertigeArtikel });
    }
    broadcast({ type: 'order_updated', order_id: e.id, status: e.statusNachher });
  }

  // T400: Bons nachdrucken, die die Cloud ausdruecklich nicht drucken konnte.
  async function bonNachdrucken(id: number): Promise<void> {
    const o = (await pool.query('SELECT id, table_number, status, bon_fehler FROM orders WHERE id = $1', [id])).rows[0];
    if (!o || !o.bon_fehler || o.status === 'cancelled') return;
    const stationen = o.bon_fehler.split(',').filter(Boolean);
    const items = (await pool.query(
      'SELECT * FROM order_items WHERE order_id = $1 AND printer_station = ANY($2::text[]) ORDER BY id', [id, stationen])).rows;
    if (!items.length) return;
    const rest = await d.bonDrucken(id, o.table_number, items);
    await pool.query('UPDATE orders SET bon_fehler = $1 WHERE id = $2', [rest.join(','), id]);
    console.log(`Bon #${id} nachgedruckt (${stationen.join(',')})${rest.length ? ', weiterhin Fehler: ' + rest.join(',') : ''}`);
  }

  async function einarbeiten(liste: any[], quelle: string | null, lagerBuchen: boolean, alsGesendet: boolean) {
    const ok: number[] = [];
    const fehler: { id: number; meldung: string }[] = [];
    for (const b of liste) {
      const client = await pool.connect();
      let e: MischErgebnis | null = null;
      try {
        await client.query('BEGIN');
        // T400: offene eigene Aenderungen vor dem Mischen merken
        let offenVorher = false;
        if (alsGesendet) {
          const r = (await client.query('SELECT geaendert > COALESCE(gesendet, \'epoch\') AS offen FROM orders WHERE id = $1', [b.id])).rows[0];
          offenVorher = !!r?.offen;
        }
        e = await mischen(client, b, quelle);
        // Was von der Cloud kam, nicht wieder zurueckschicken - ausser es gab
        // vorher schon eigene, noch nicht gesendete Aenderungen.
        if (alsGesendet && !offenVorher) {
          await client.query('UPDATE orders SET gesendet = geaendert WHERE id = $1', [e.id]);
        }
        await client.query('COMMIT');
        ok.push(b.id);
      } catch (err: any) {
        await client.query('ROLLBACK').catch(() => {});
        fehler.push({ id: b?.id, meldung: String(err?.message || err) });
        e = null;
      } finally {
        client.release();
      }
      if (!e) continue;
      melden(e).catch(() => {});
      if (alsGesendet && e.id < T400_AB.orders) {
        await bonNachdrucken(e.id).catch((err) => console.error(`Nachdruck #${e?.id}:`, err?.message || err));
      }
      if (lagerBuchen && e.neueArtikel.length) {
        fetch(`${d.inventoryApiUrl}/api/items/sell`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Order-API-Key': orderApiKey },
          body: JSON.stringify({ items: e.neueArtikel, order_id: e.id, order_source: 'kasse' }),
          signal: mitLimit(10000),
        }).catch((err) => console.error('Lager (Vor-Ort-Bestellung):', err?.message || err));
      }
    }
    if (fehler.length) {
      console.error('Abgleich: nicht uebernommen:', JSON.stringify(fehler));
      serverEreignis(pool, 'abgleich_fehler', 'nicht uebernommen', { daten: fehler });
    }
    return { ok, fehler };
  }

  // ---- Cloud: Bestellungen vom T400 annehmen ------------------------------
  app.post('/api/internal/vor-ort/bestellungen', async (req, res) => {
    if (req.headers['x-order-api-key'] !== orderApiKey) return res.status(401).json({ error: 'Invalid API key' });
    const quelle = typeof req.body?.quelle === 'string' && /^[a-z0-9-]{1,40}$/.test(req.body.quelle) ? req.body.quelle : null;
    const liste = Array.isArray(req.body?.bestellungen) ? req.body.bestellungen.slice(0, 100) : null;
    if (!quelle || !liste) return res.status(400).json({ error: 'quelle und bestellungen noetig' });
    res.json(await einarbeiten(liste, quelle, true, false));
  });

  // ---- Cloud: Aenderungen fuer den T400 -----------------------------------
  app.get('/api/internal/vor-ort/aenderungen', async (req, res) => {
    if (req.headers['x-order-api-key'] !== orderApiKey) return res.status(401).json({ error: 'Invalid API key' });
    const seit = typeof req.query.seit === 'string' && !isNaN(Date.parse(req.query.seit)) ? req.query.seit : null;
    if (!seit) return res.status(400).json({ error: 'seit noetig' });
    try {
      // 30 s Ueberlappung: spaet bestaetigte Transaktionen nicht verpassen.
      const liste = await bestellungenLesen(pool, `o.geaendert > ($1::timestamptz - interval '30 seconds')`, [seit], 200);
      res.json({ bestellungen: liste.map(({ stand, ...b }: any) => b), bis: liste.length ? liste[liste.length - 1].stand : seit, mehr: liste.length === 200 });
    } catch (e: any) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  // ---- Cloud: Einstellungen fuer den T400 ---------------------------------
  app.get('/api/internal/vor-ort/einstellungen', async (req, res) => {
    if (req.headers['x-order-api-key'] !== orderApiKey) return res.status(401).json({ error: 'Invalid API key' });
    const r = await pool.query('SELECT key, value FROM settings');
    res.json(Object.fromEntries(r.rows.filter((z) => !NUR_LOKAL.has(z.key)).map((z) => [z.key, z.value])));
  });

  if (!VOR_ORT) return;

  // ---- T400: Bestellungen in die Cloud schicken ---------------------------
  let sendet = false;
  let sendeFehler = '';
  async function senden(): Promise<void> {
    if (sendet) return;
    sendet = true;
    try {
      const offen = await bestellungenLesen(pool, `o.geaendert > COALESCE(o.gesendet, 'epoch')`, [], 50);
      if (!offen.length) return;
      const r = await fetch(`${CLOUD}/api/internal/vor-ort/bestellungen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Order-API-Key': orderApiKey },
        body: JSON.stringify({ quelle: QUELLE, bestellungen: offen.map(({ stand, ...b }: any) => b) }),
        signal: mitLimit(20000),
      });
      if (!r.ok) throw new Error(`Cloud antwortete ${r.status}`);
      const antwort: any = await r.json();
      const gut = new Set<number>(antwort.ok || []);
      for (const o of offen) {
        if (!gut.has(o.id)) continue;
        // Nur als gesendet markieren, wenn sich seither nichts geaendert hat.
        await pool.query('UPDATE orders SET gesendet = $2::timestamptz WHERE id = $1 AND geaendert = $2::timestamptz', [o.id, o.stand]);
      }
      if (antwort.fehler?.length) {
        console.error('Cloud lehnte Bestellungen ab:', JSON.stringify(antwort.fehler));
        serverEreignis(pool, 'abgleich_abgelehnt', 'Cloud lehnte Bestellungen ab', { daten: antwort.fehler });
      }
      if (sendeFehler) { console.log('Senden an die Cloud wieder in Ordnung'); serverEreignis(pool, 'cloud_senden_ok', 'wieder in Ordnung'); sendeFehler = ''; }
    } catch (e: any) {
      const m = String(e?.message || e);
      if (m !== sendeFehler) { console.error('Senden an die Cloud:', m); serverEreignis(pool, 'cloud_senden_fehler', m); }
      sendeFehler = m;
    } finally {
      sendet = false;
    }
  }
  // Alle 3 s: Faellt der T400 aus, fehlt der Cloud hoechstens das (z.B. eine
  // Teilzahlung) - je kuerzer, desto kleiner das Risiko doppelt zu kassieren.
  setInterval(senden, 3000);
  setTimeout(senden, 3000);

  // ---- T400: Aenderungen aus der Cloud holen ------------------------------
  let holt = false;
  let holFehler = '';
  async function holen(): Promise<void> {
    if (holt) return;
    holt = true;
    try {
      for (let runde = 0; runde < 10; runde++) {
        // Beim ersten Mal: die letzten 12 h (offene Bestellungen fuer die Kueche)
        const seit = (await d.getSetting('cloud_merker')) || new Date(Date.now() - 12 * 3600000).toISOString();
        const r = await fetch(`${CLOUD}/api/internal/vor-ort/aenderungen?seit=${encodeURIComponent(seit)}`, {
          headers: { 'X-Order-API-Key': orderApiKey }, signal: mitLimit(20000),
        });
        if (!r.ok) throw new Error(`Cloud antwortete ${r.status}`);
        const a: any = await r.json();
        const liste = Array.isArray(a.bestellungen) ? a.bestellungen : [];
        if (liste.length) await einarbeiten(liste, 'cloud', false, true);
        if (a.bis && a.bis !== seit) await d.setSetting('cloud_merker', a.bis);
        if (!a.mehr) break;
      }
      if (holFehler) { console.log('Holen aus der Cloud wieder in Ordnung'); serverEreignis(pool, 'cloud_holen_ok', 'wieder in Ordnung'); holFehler = ''; }
    } catch (e: any) {
      const m = String(e?.message || e);
      if (m !== holFehler) { console.error('Holen aus der Cloud:', m); serverEreignis(pool, 'cloud_holen_fehler', m); }
      holFehler = m;
    } finally {
      holt = false;
    }
  }
  setInterval(holen, 5000);
  setTimeout(holen, 4000);

  // Stand fuer Anzeige/Ampel
  app.get('/api/vor-ort/stand', async (_req, res) => {
    const r = await pool.query(`SELECT count(*)::int AS offen FROM orders WHERE geaendert > COALESCE(gesendet, 'epoch')`);
    res.json({ vor_ort: true, offen: r.rows[0].offen, senden: sendeFehler || null, holen: holFehler || null });
  });

  // ---- T400: Einstellungen aus der Cloud holen -----------------------------
  async function einstellungenHolen(): Promise<void> {
    try {
      const r = await fetch(`${CLOUD}/api/internal/vor-ort/einstellungen`, {
        headers: { 'X-Order-API-Key': orderApiKey }, signal: mitLimit(10000),
      });
      if (!r.ok) throw new Error(`Cloud antwortete ${r.status}`);
      const s: Record<string, string> = await r.json() as any;
      for (const [k, v] of Object.entries(s)) {
        if (NUR_LOKAL.has(k) || typeof v !== 'string') continue;
        if ((await d.getSetting(k)) !== v) await d.setSetting(k, v);
      }
    } catch (e: any) {
      console.error('Einstellungen aus der Cloud:', e?.message || e);
    }
  }
  setInterval(einstellungenHolen, 5 * 60 * 1000);
  setTimeout(einstellungenHolen, 3000);
}

// T400: Kassen-Passwort der Cloud uebernehmen (statt eigener Rotation), damit
// Kuechen-App und Kasse vor Ort mit demselben Passwort anmelden.
export async function cloudPasswortHolen(orderApiKey: string): Promise<string | null> {
  try {
    const r = await fetch(`${CLOUD}/api/internal/pos-credential`, {
      headers: { 'X-Order-API-Key': orderApiKey }, signal: mitLimit(10000),
    });
    if (!r.ok) return null;
    const d: any = await r.json();
    return typeof d?.password === 'string' ? d.password : null;
  } catch {
    return null;
  }
}

// Artikel-Zwischenspeicher (T400): letzte gute Liste aus dem Inventar.
export async function artikelMerken(setSetting: (k: string, v: string) => Promise<void>, items: any[]): Promise<void> {
  if (!VOR_ORT || !items.length) return;
  try { await setSetting('artikel_cache', JSON.stringify(items)); } catch { /* egal */ }
}
export async function artikelAusSpeicher(getSetting: (k: string) => Promise<string | null>): Promise<any[] | null> {
  if (!VOR_ORT) return null;
  try {
    const s = await getSetting('artikel_cache');
    const l = s ? JSON.parse(s) : null;
    return Array.isArray(l) ? l : null;
  } catch {
    return null;
  }
}
