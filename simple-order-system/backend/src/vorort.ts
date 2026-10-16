// ---------------------------------------------------------------------------
// Kasse vor Ort (T400 im Roten Schopf), Oktober 2026
//
// Dasselbe Backend laeuft zweimal:
//  - in der Cloud (order.fwv-raura.ch) wie bisher
//  - auf dem T400 mit KASSE_VOR_ORT=true, erreichbar im Schopf-Netz unter
//    https://kasse-lokal.fwv-raura.ch. Die Kassen-Oberflaeche (aus der Cloud
//    geladen) prueft, ob dieser Name antwortet, und arbeitet dann lokal:
//    Bons gehen direkt an den Drucker, auch ohne Internet.
//
// Abgleich nur in eine Richtung: Der T400 schickt jede Bestellung mit ihrem
// ganzen Stand (Positionen, Zahlungen, Status) in die Cloud, auch spaetere
// Aenderungen. Erkannt werden Aenderungen ueber Trigger (lokal_geaendert >
// cloud_gesendet). Die Cloud nimmt per Upsert an (sync_source/sync_source_id),
// druckt nichts, bucht das Lager ab und meldet neue Bestellungen dem
// Kuechendisplay. Der alte Zwei-Wege-Sync (sync_queue) bleibt aus: Er schickte
// nur das Anlegen (Zahlungen gingen verloren) und druckte Cloud-Bestellungen
// vor Ort ein zweites Mal.
//
// Vom T400 aus geholt (die Cloud ist fuehrend): Artikel (zwischengespeichert,
// falls das Internet weg ist), Einstellungen, Kassen-Passwort.
// ---------------------------------------------------------------------------
import type express from 'express';
import type pg from 'pg';

export const VOR_ORT = process.env.KASSE_VOR_ORT === 'true';
const CLOUD = (process.env.CLOUD_ORDER_URL || 'https://order.fwv-raura.ch').replace(/\/$/, '');
const QUELLE = process.env.SYNC_SOURCE || 't400';
// Einstellungen, die nur vor Ort gelten und nie aus der Cloud kommen.
const NUR_LOKAL = new Set(['last_cloud_sync', 'artikel_cache']);

// Status nie zurueckstufen: Die Kueche schliesst in der Cloud ab, der T400
// kennt das nicht und schickt weiter "paid".
const RANG: Record<string, number> = { pending: 0, paid: 1, completed: 2, cancelled: 3 };
export function statusMischen(cloud: string | null | undefined, lokal: string | null | undefined): string {
  const a = cloud || 'pending';
  const b = lokal || 'pending';
  return (RANG[b] ?? 0) > (RANG[a] ?? 0) ? b : a;
}

interface Abhaengigkeiten {
  app: express.Express;
  pool: pg.Pool;
  orderApiKey: string;
  inventoryApiUrl: string;
  broadcast: (d: any) => void;
  setSetting: (k: string, v: string) => Promise<void>;
  getSetting: (k: string) => Promise<string | null>;
}

const mitLimit = (ms: number) => AbortSignal.timeout(ms);

export async function vorOrtSchema(pool: pg.Pool): Promise<void> {
  // Beide Seiten: Zuordnung der Positionen/Zahlungen beim Upsert.
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS sync_source_id INTEGER`);
  await pool.query(`ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS sync_source_id INTEGER`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_sync ON orders(sync_source, sync_source_id)`);
  if (!VOR_ORT) return;
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS lokal_geaendert TIMESTAMPTZ DEFAULT clock_timestamp()`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS cloud_gesendet TIMESTAMPTZ`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_lokal_geaendert ON orders(lokal_geaendert)`);
  await pool.query(`
    CREATE OR REPLACE FUNCTION vor_ort_order_geaendert() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'UPDATE' AND NEW.cloud_gesendet IS DISTINCT FROM OLD.cloud_gesendet THEN
        NEW.lokal_geaendert := OLD.lokal_geaendert;
      ELSE
        NEW.lokal_geaendert := clock_timestamp();
      END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql`);
  await pool.query(`
    CREATE OR REPLACE FUNCTION vor_ort_kind_geaendert() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        UPDATE orders SET lokal_geaendert = clock_timestamp() WHERE id = OLD.order_id;
      ELSE
        UPDATE orders SET lokal_geaendert = clock_timestamp() WHERE id = NEW.order_id;
      END IF;
      RETURN NULL;
    END $$ LANGUAGE plpgsql`);
  await pool.query(`DROP TRIGGER IF EXISTS vor_ort_orders ON orders`);
  await pool.query(`CREATE TRIGGER vor_ort_orders BEFORE INSERT OR UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION vor_ort_order_geaendert()`);
  for (const t of ['order_items', 'order_payments']) {
    await pool.query(`DROP TRIGGER IF EXISTS vor_ort_${t} ON ${t}`);
    await pool.query(`CREATE TRIGGER vor_ort_${t} AFTER INSERT OR UPDATE OR DELETE ON ${t}
      FOR EACH ROW EXECUTE FUNCTION vor_ort_kind_geaendert()`);
  }
}

// Zeitstempel ohne Zeitzone 1:1 weitergeben (beide DBs rechnen gleich).
const ZEIT = (s: string) => `to_char(${s}, 'YYYY-MM-DD"T"HH24:MI:SS.US')`;

export function vorOrtEinrichten(d: Abhaengigkeiten): void {
  const { app, pool, orderApiKey, broadcast } = d;

  // ---- Cloud: Bestellungen vom T400 annehmen ------------------------------
  app.post('/api/internal/vor-ort/bestellungen', async (req, res) => {
    if (req.headers['x-order-api-key'] !== orderApiKey) return res.status(401).json({ error: 'Invalid API key' });
    const quelle = typeof req.body?.quelle === 'string' && /^[a-z0-9-]{1,40}$/.test(req.body.quelle) ? req.body.quelle : null;
    const liste = Array.isArray(req.body?.bestellungen) ? req.body.bestellungen.slice(0, 100) : null;
    if (!quelle || !liste) return res.status(400).json({ error: 'quelle und bestellungen noetig' });

    const ok: number[] = [];
    const fehler: { id: number; meldung: string }[] = [];
    for (const b of liste) {
      try {
        await bestellungAnnehmen(quelle, b);
        ok.push(b.id);
      } catch (e: any) {
        console.error(`Vor-Ort-Bestellung ${quelle}#${b?.id}:`, e?.message || e);
        fehler.push({ id: b?.id, meldung: String(e?.message || e) });
      }
    }
    res.json({ ok, fehler });
  });

  async function bestellungAnnehmen(quelle: string, b: any): Promise<void> {
    const lokaleId = Number(b?.id);
    if (!Number.isInteger(lokaleId) || lokaleId <= 0) throw new Error('ungueltige id');
    const client = await pool.connect();
    let neu = false;
    let cloudId = 0;
    const neueArtikel: { id: number; quantity: number }[] = [];
    try {
      await client.query('BEGIN');
      let vorhanden = (await client.query(
        'SELECT id, status FROM orders WHERE sync_source = $1 AND sync_source_id = $2 FOR UPDATE', [quelle, lokaleId])).rows[0];
      let ueberRef = false;
      if (!vorhanden && typeof b.client_ref === 'string' && b.client_ref) {
        // Gepufferte Bestellung, die (auch) direkt in der Cloud gelandet ist.
        vorhanden = (await client.query('SELECT id, status FROM orders WHERE client_ref = $1 FOR UPDATE', [b.client_ref])).rows[0];
        if (vorhanden) {
          ueberRef = true;
          await client.query('UPDATE orders SET sync_source = $1, sync_source_id = $2 WHERE id = $3', [quelle, lokaleId, vorhanden.id]);
        }
      }
      if (!vorhanden) {
        neu = true;
        const r = await client.query(
          `INSERT INTO orders (table_number, status, total, payment_method, created_at, sync_source, sync_source_id, synced_at, event_id, event_titel, client_ref)
           VALUES ($1, $2, $3, $4, COALESCE($5::timestamp, CURRENT_TIMESTAMP), $6, $7, NOW(), $8, $9, $10) RETURNING id`,
          [b.table_number ?? 0, b.status || 'pending', b.total ?? 0, b.payment_method || null, b.created_at || null,
           quelle, lokaleId, b.event_id || null, b.event_titel || null, b.client_ref || null]);
        cloudId = r.rows[0].id;
      } else {
        cloudId = vorhanden.id;
        await client.query(
          `UPDATE orders SET status = $1, total = $2, payment_method = COALESCE($3, payment_method), synced_at = NOW(),
             event_id = COALESCE(event_id, $4), event_titel = COALESCE(event_titel, $5), table_number = $6
           WHERE id = $7`,
          [statusMischen(vorhanden.status, b.status), b.total ?? 0, b.payment_method || null,
           b.event_id || null, b.event_titel || null, b.table_number ?? 0, cloudId]);
      }

      const positionen: any[] = Array.isArray(b.items) ? b.items : [];
      if (ueberRef) {
        // Positionen der Cloud-Kopie in Reihenfolge den lokalen zuordnen.
        const alt = (await client.query(
          'SELECT id FROM order_items WHERE order_id = $1 AND sync_source_id IS NULL ORDER BY id', [cloudId])).rows;
        const lokal = [...positionen].sort((x, y) => x.id - y.id);
        for (let i = 0; i < Math.min(alt.length, lokal.length); i++) {
          await client.query('UPDATE order_items SET sync_source_id = $1 WHERE id = $2', [lokal[i].id, alt[i].id]);
        }
      }
      for (const p of positionen) {
        const pid = Number(p.id);
        if (!Number.isInteger(pid)) continue;
        const da = (await client.query(
          'SELECT id FROM order_items WHERE order_id = $1 AND sync_source_id = $2', [cloudId, pid])).rows[0];
        if (da) {
          await client.query(
            `UPDATE order_items SET quantity = $1, price = $2, notes = $3, paid = $4, paid_at = $5,
               completed = (COALESCE(completed, false) OR $6), completed_at = COALESCE(completed_at, $7)
             WHERE id = $8`,
            [p.quantity, p.price, p.notes || null, !!p.paid, p.paid_at || null, !!p.completed, p.completed_at || null, da.id]);
        } else {
          await client.query(
            `INSERT INTO order_items (order_id, item_id, item_name, quantity, price, notes, printer_station, paid, paid_at, completed, completed_at, sync_source_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [cloudId, p.item_id ?? null, p.item_name || null, p.quantity, p.price, p.notes || null, p.printer_station || 'bar',
             !!p.paid, p.paid_at || null, !!p.completed, p.completed_at || null, pid]);
          if (p.item_id) neueArtikel.push({ id: Number(p.item_id) || p.item_id, quantity: p.quantity });
        }
      }
      // Lokal geloeschte Positionen (Stornos) auch in der Cloud entfernen.
      const ids = positionen.map((p) => Number(p.id)).filter(Number.isInteger);
      await client.query(
        'DELETE FROM order_items WHERE order_id = $1 AND sync_source_id IS NOT NULL AND NOT (sync_source_id = ANY($2::int[]))',
        [cloudId, ids]);

      for (const z of (Array.isArray(b.payments) ? b.payments : [])) {
        const zid = Number(z.id);
        if (!Number.isInteger(zid)) continue;
        const da = (await client.query(
          'SELECT id FROM order_payments WHERE order_id = $1 AND sync_source_id = $2', [cloudId, zid])).rows[0];
        if (!da) {
          await client.query(
            `INSERT INTO order_payments (order_id, amount, payment_method, description, created_at, sync_source_id)
             VALUES ($1, $2, $3, $4, COALESCE($5::timestamp, CURRENT_TIMESTAMP), $6)`,
            [cloudId, z.amount, z.payment_method || 'cash', z.description || null, z.created_at || null, zid]);
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }

    // Nach dem Commit: Kuechendisplay und Lager (nur fuer Neues).
    if (neu) {
      const items = (await pool.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY id', [cloudId])).rows;
      const order = (await pool.query('SELECT * FROM orders WHERE id = $1', [cloudId])).rows[0];
      broadcast({ type: 'new_order', order: { ...order, items } });
    } else {
      broadcast({ type: 'order_updated', orderId: cloudId });
    }
    if (neueArtikel.length) {
      fetch(`${d.inventoryApiUrl}/api/items/sell`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Order-API-Key': orderApiKey },
        body: JSON.stringify({ items: neueArtikel, order_id: cloudId, order_source: 'kasse' }),
        signal: mitLimit(10000),
      }).catch((e) => console.error('Lager (Vor-Ort-Bestellung):', e?.message || e));
    }
  }

  // ---- Cloud: Einstellungen fuer den T400 ---------------------------------
  app.get('/api/internal/vor-ort/einstellungen', async (req, res) => {
    if (req.headers['x-order-api-key'] !== orderApiKey) return res.status(401).json({ error: 'Invalid API key' });
    const r = await pool.query('SELECT key, value FROM settings');
    res.json(Object.fromEntries(r.rows.filter((z) => !NUR_LOKAL.has(z.key)).map((z) => [z.key, z.value])));
  });

  if (!VOR_ORT) return;

  // ---- T400: Bestellungen in die Cloud schicken ---------------------------
  let sendet = false;
  let letzterFehler = '';
  async function senden(): Promise<void> {
    if (sendet) return;
    sendet = true;
    try {
      const offen = (await pool.query(
        `SELECT o.id, o.client_ref, o.table_number, o.status, o.total, o.payment_method, o.event_id, o.event_titel,
                ${ZEIT('o.created_at')} AS created_at, o.lokal_geaendert::text AS stand
         FROM orders o
         WHERE o.lokal_geaendert > COALESCE(o.cloud_gesendet, 'epoch')
         ORDER BY o.lokal_geaendert LIMIT 50`)).rows;
      if (!offen.length) return;
      const ids = offen.map((o) => o.id);
      const items = (await pool.query(
        `SELECT id, order_id, item_id, item_name, quantity, price, notes, printer_station,
                COALESCE(paid, false) AS paid, ${ZEIT('paid_at')} AS paid_at,
                COALESCE(completed, false) AS completed, ${ZEIT('completed_at')} AS completed_at
         FROM order_items WHERE order_id = ANY($1::int[]) ORDER BY id`, [ids])).rows;
      const zahlungen = (await pool.query(
        `SELECT id, order_id, amount, payment_method, description, ${ZEIT('created_at')} AS created_at
         FROM order_payments WHERE order_id = ANY($1::int[]) ORDER BY id`, [ids])).rows;
      const bestellungen = offen.map((o) => ({
        ...o,
        stand: undefined,
        items: items.filter((i) => i.order_id === o.id),
        payments: zahlungen.filter((z) => z.order_id === o.id),
      }));
      const r = await fetch(`${CLOUD}/api/internal/vor-ort/bestellungen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Order-API-Key': orderApiKey },
        body: JSON.stringify({ quelle: QUELLE, bestellungen }),
        signal: mitLimit(20000),
      });
      if (!r.ok) throw new Error(`Cloud antwortete ${r.status}`);
      const antwort: any = await r.json();
      const gut = new Set<number>(antwort.ok || []);
      for (const o of offen) {
        if (!gut.has(o.id)) continue;
        // Nur als gesendet markieren, wenn sich seither nichts geaendert hat.
        await pool.query(
          'UPDATE orders SET cloud_gesendet = $2::timestamptz WHERE id = $1 AND lokal_geaendert = $2::timestamptz',
          [o.id, o.stand]);
      }
      if (antwort.fehler?.length) console.error('Cloud lehnte Bestellungen ab:', JSON.stringify(antwort.fehler));
      if (letzterFehler) { console.log('Cloud-Abgleich wieder in Ordnung'); letzterFehler = ''; }
    } catch (e: any) {
      const m = String(e?.message || e);
      if (m !== letzterFehler) console.error('Cloud-Abgleich:', m);
      letzterFehler = m;
    } finally {
      sendet = false;
    }
  }
  setInterval(senden, 15000);
  setTimeout(senden, 5000);

  // Stand fuer Anzeige/Ampel: wie viele Bestellungen noch nicht in der Cloud sind.
  app.get('/api/vor-ort/stand', async (_req, res) => {
    const r = await pool.query(
      `SELECT count(*)::int AS offen FROM orders WHERE lokal_geaendert > COALESCE(cloud_gesendet, 'epoch')`);
    res.json({ vor_ort: true, offen: r.rows[0].offen, fehler: letzterFehler || null });
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
