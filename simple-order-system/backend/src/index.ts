import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import pg from 'pg';
import PaymentService from './payments.js';
import SumUpTerminal from './terminal.js';
import { authenticateToken, optionalAuth, requireRole, AuthenticatedRequest, localLogin, getAuthMode } from './auth.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Trust reverse proxy (Traefik) for X-Forwarded-* headers
app.set('trust proxy', true);

app.use(cors());
app.use(express.json());

// Auth routes
app.get('/api/auth/mode', (req, res) => {
  res.json(getAuthMode());
});

app.post('/api/auth/login', localLogin);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mode: getAuthMode().local ? 'local' : 'online' });
});

// Database setup
const pool = new pg.Pool({
  host: process.env.DB_HOST || 'postgres',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'orderdb',
  user: process.env.DB_USER || 'orderuser',
  password: process.env.DB_PASSWORD || 'orderpass',
});

// Initialize database
async function initDB() {
  // Keep items table for backwards compatibility but we only use inventory items now
  await pool.query(`
    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      price DECIMAL(10, 2) NOT NULL,
      category VARCHAR(100),
      printer_station VARCHAR(50) DEFAULT 'bar',
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      table_number INTEGER NOT NULL,
      status VARCHAR(50) DEFAULT 'pending',
      total DECIMAL(10, 2),
      payment_method VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add payment_method column if it doesn't exist (for existing databases)
  await pool.query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50)
  `);

  // Sync columns for bidirectional sync
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS sync_source VARCHAR(100)`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS sync_source_id INTEGER`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP`);

  // Sync queue for offline sync
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id SERIAL PRIMARY KEY,
      entity_type VARCHAR(50) NOT NULL,
      entity_id INTEGER NOT NULL,
      action VARCHAR(20) NOT NULL,
      data JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      synced_at TIMESTAMP,
      error TEXT
    )
  `);

  // Create order_items without foreign key to items (we store item_name directly)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
      item_id VARCHAR(50),
      item_name VARCHAR(255),
      quantity INTEGER NOT NULL,
      price DECIMAL(10, 2) NOT NULL,
      notes TEXT,
      printer_station VARCHAR(50) DEFAULT 'bar'
    )
  `);

  // Add columns if they don't exist (migration for existing DBs)
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS item_name VARCHAR(255)`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS printer_station VARCHAR(50) DEFAULT 'bar'`);

  // Drop foreign key constraint if it exists
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_item_id_fkey;
    EXCEPTION WHEN undefined_object THEN NULL;
    END $$;
  `);

  // Change item_id to VARCHAR if it's still INTEGER
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE order_items ALTER COLUMN item_id TYPE VARCHAR(50) USING item_id::VARCHAR;
    EXCEPTION WHEN others THEN NULL;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
      provider VARCHAR(50) NOT NULL,
      payment_id VARCHAR(255),
      payment_url TEXT,
      qr_code_url TEXT,
      amount DECIMAL(10, 2) NOT NULL,
      currency VARCHAR(3) DEFAULT 'CHF',
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Settings table for printer configuration etc.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // IP Whitelist table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ip_whitelist (
      id SERIAL PRIMARY KEY,
      ip_address VARCHAR(45) NOT NULL UNIQUE,
      device_name VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP,
      created_by VARCHAR(100),
      is_permanent BOOLEAN DEFAULT false
    )
  `);

  // Add expires_at column if not exists (migration)
  await pool.query(`ALTER TABLE ip_whitelist ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP`);
  await pool.query(`ALTER TABLE ip_whitelist ADD COLUMN IF NOT EXISTS is_permanent BOOLEAN DEFAULT false`);

  // ============================================
  // SPLIT PAYMENT & PER-ITEM PAYMENT SUPPORT
  // ============================================

  // Track partial payments for an order (split bills)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_payments (
      id SERIAL PRIMARY KEY,
      order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
      amount DECIMAL(10, 2) NOT NULL,
      payment_method VARCHAR(50) NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add paid status to order_items for per-item payment tracking
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS paid BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS payment_id INTEGER REFERENCES order_payments(id)`);

  // Add completed status to order_items for kitchen confirmation (separate from paid)
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP`);

  console.log('Database initialized');
}

// Get setting from database
async function getSetting(key: string): Promise<string | null> {
  const result = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
  return result.rows[0]?.value || null;
}

// Set setting in database
async function setSetting(key: string, value: string): Promise<void> {
  await pool.query(`
    INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
    ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
  `, [key, value]);
}

// WebSocket broadcast
function broadcast(data: any) {
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(data));
    }
  });
}

// ============================================
// REAL-TIME SYNC
// ============================================

const CLOUD_SYNC_ENABLED = process.env.CLOUD_SYNC_ENABLED === 'true';
const SYNC_CLOUD_URL = process.env.CLOUD_API_URL || '';
const SYNC_KEY = process.env.CLOUD_SYNC_KEY || '';
const SYNC_SOURCE = process.env.SYNC_SOURCE || 'local';

// Queue an order for sync to cloud
async function queueOrderSync(orderId: number, action: 'create' | 'update') {
  if (!CLOUD_SYNC_ENABLED || !SYNC_CLOUD_URL) return;

  try {
    const result = await pool.query(`
      SELECT o.*,
        json_agg(json_build_object(
          'item_id', oi.item_id, 'item_name', oi.item_name,
          'quantity', oi.quantity, 'price', oi.price,
          'notes', oi.notes, 'printer_station', oi.printer_station
        )) FILTER (WHERE oi.id IS NOT NULL) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.id = $1
      GROUP BY o.id
    `, [orderId]);

    if (result.rows.length === 0) return;

    await pool.query(`
      INSERT INTO sync_queue (entity_type, entity_id, action, data)
      VALUES ('order', $1, $2, $3)
    `, [orderId, action, JSON.stringify(result.rows[0])]);

    syncToCloud();
  } catch (error) {
    console.error('Queue sync error:', error);
  }
}

// Background sync to cloud
async function syncToCloud() {
  if (!CLOUD_SYNC_ENABLED || !SYNC_CLOUD_URL || !SYNC_KEY) return;

  try {
    const pending = await pool.query(`
      SELECT * FROM sync_queue WHERE synced_at IS NULL ORDER BY created_at LIMIT 50
    `);

    if (pending.rows.length === 0) return;

    const orders = pending.rows.filter(r => r.entity_type === 'order').map(r => r.data);
    if (orders.length === 0) return;

    const response = await fetch(`${SYNC_CLOUD_URL}/sync/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Sync-Key': SYNC_KEY },
      body: JSON.stringify({ orders, source: SYNC_SOURCE })
    });

    if (response.ok) {
      await pool.query(`UPDATE sync_queue SET synced_at = NOW() WHERE id = ANY($1)`, [pending.rows.map(r => r.id)]);
      console.log(`Synced ${orders.length} orders to cloud`);
    }
  } catch (error) {
    console.error('Sync to cloud error:', error);
  }
}

// Pull updates from cloud
async function syncFromCloud() {
  if (!CLOUD_SYNC_ENABLED || !SYNC_CLOUD_URL || !SYNC_KEY) return;

  try {
    const lastSyncResult = await pool.query("SELECT value FROM settings WHERE key = 'last_cloud_sync'");
    const lastSync = lastSyncResult.rows[0]?.value || '1970-01-01T00:00:00Z';

    const response = await fetch(`${SYNC_CLOUD_URL}/sync/orders?since=${encodeURIComponent(lastSync)}`, {
      headers: { 'X-Sync-Key': SYNC_KEY }
    });

    if (!response.ok) return;
    const data = await response.json() as { orders?: any[]; timestamp?: string };

    const client = await pool.connect();
    const ordersToPrint: { orderId: number; tableNumber: number; items: any[] }[] = [];

    try {
      await client.query('BEGIN');
      let imported = 0;

      for (const order of data.orders || []) {
        if (order.sync_source === SYNC_SOURCE) continue;

        const existing = await client.query(
          'SELECT id FROM orders WHERE sync_source = $1 AND sync_source_id = $2',
          [order.sync_source || 'cloud', order.id]
        );
        if (existing.rows.length > 0) continue;

        const orderResult = await client.query(`
          INSERT INTO orders (table_number, status, total, payment_method, created_at, sync_source, sync_source_id, synced_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING id, table_number, status, total, payment_method, created_at
        `, [order.table_number, order.status, order.total, order.payment_method, order.created_at, order.sync_source || 'cloud', order.id]);

        const insertedOrder = orderResult.rows[0];
        const insertedItems: any[] = [];

        for (const item of (order.items || [])) {
          const itemResult = await client.query(`
            INSERT INTO order_items (order_id, item_id, item_name, quantity, price, notes, printer_station)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
          `, [insertedOrder.id, item.item_id, item.item_name, item.quantity, item.price, item.notes, item.printer_station]);
          insertedItems.push(itemResult.rows[0]);
        }

        // Queue for printing and broadcasting if order is pending (open)
        if (order.status === 'pending') {
          // Broadcast to kitchen display
          broadcast({
            type: 'new_order',
            order: {
              id: insertedOrder.id,
              table_number: insertedOrder.table_number,
              status: insertedOrder.status,
              total: insertedOrder.total,
              payment_method: insertedOrder.payment_method,
              created_at: insertedOrder.created_at,
              items: insertedItems
            }
          });

          // Queue for printing after transaction commits
          ordersToPrint.push({
            orderId: insertedOrder.id,
            tableNumber: insertedOrder.table_number,
            items: insertedItems
          });
        }

        imported++;
      }

      await client.query(`
        INSERT INTO settings (key, value, updated_at) VALUES ('last_cloud_sync', $1, NOW())
        ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
      `, [data.timestamp]);

      await client.query('COMMIT');

      // Print receipts after successful commit
      for (const orderToPrint of ordersToPrint) {
        try {
          await printReceipt(orderToPrint.orderId, orderToPrint.tableNumber, orderToPrint.items);
          console.log(`Printed synced order #${orderToPrint.orderId} from cloud`);
        } catch (printError) {
          console.error(`Failed to print synced order #${orderToPrint.orderId}:`, printError);
        }
      }

      if (imported > 0) console.log(`Imported ${imported} orders from cloud`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Sync from cloud error:', error);
  }
}

// Start periodic sync (every 30 seconds)
if (CLOUD_SYNC_ENABLED) {
  setInterval(() => { syncToCloud(); syncFromCloud(); }, 30000);
}

// Auto-cancel orders older than 2 hours
const ORDER_AUTO_CANCEL_HOURS = parseInt(process.env.ORDER_AUTO_CANCEL_HOURS || '2');
const ORDER_AUTO_CANCEL_MS = ORDER_AUTO_CANCEL_HOURS * 60 * 60 * 1000;

async function autoCancelOldOrders() {
  try {
    const cutoffTime = new Date(Date.now() - ORDER_AUTO_CANCEL_MS).toISOString();

    // Find and cancel old pending orders
    const result = await pool.query(`
      UPDATE orders
      SET status = 'cancelled'
      WHERE status = 'pending'
        AND created_at < $1
      RETURNING id, table_number
    `, [cutoffTime]);

    if (result.rows.length > 0) {
      console.log(`Auto-cancelled ${result.rows.length} orders older than ${ORDER_AUTO_CANCEL_HOURS}h:`,
        result.rows.map(r => `#${r.id}`).join(', '));

      // Broadcast cancellations to kitchen display
      for (const order of result.rows) {
        broadcast({ type: 'order_completed', order_id: order.id });
        // Queue for cloud sync
        queueOrderSync(order.id, 'update');
      }
    }
  } catch (error) {
    console.error('Auto-cancel error:', error);
  }
}

// Run auto-cancel check every 5 minutes
setInterval(autoCancelOldOrders, 5 * 60 * 1000);
// Also run once at startup (after 30 seconds to let DB initialize)
setTimeout(autoCancelOldOrders, 30000);

// Inventory API integration
const INVENTORY_API_URL = process.env.INVENTORY_API_URL || 'http://inventory-backend:3000';
const ORDER_API_KEY = process.env.ORDER_API_KEY || 'order-system-secret';

// Routes: Items (ONLY from Inventory system) - protected by IP whitelist
app.get('/api/items', checkIpWhitelist, async (req, res) => {
  try {
    // Fetch all items from inventory system
    const response = await fetch(`${INVENTORY_API_URL}/api/items/sellable`);
    if (!response.ok) {
      console.error('Inventory API returned:', response.status);
      return res.json([]); // Return empty array if inventory unavailable
    }

    const inventoryItems = await response.json() as any[];
    // Map inventory items to order system format
    const items = inventoryItems.map((item) => ({
      id: item.id, // Use actual inventory ID (no prefix needed)
      name: item.name,
      price: parseFloat(item.price),
      category: item.category,
      printer_station: item.printer_station || 'bar',
      stock: item.stock,
      source: 'inventory'
    }));

    // Sort by category then name
    items.sort((a, b) => {
      if (a.category !== b.category) {
        return (a.category || '').localeCompare(b.category || '');
      }
      return a.name.localeCompare(b.name);
    });

    res.json(items);
  } catch (error) {
    console.error('Inventory API error:', error);
    res.json([]); // Return empty array on error
  }
});

// Public endpoint to get TWINT QR code URL (for payment modal)
app.get('/api/twint-qr', checkIpWhitelist, async (req, res) => {
  try {
    const qrUrl = await getSetting('twint_qr_url');
    res.json({ url: qrUrl || null });
  } catch (error) {
    res.json({ url: null });
  }
});

// Admin routes for items - require authentication (creates in inventory system)
app.post('/api/items', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, price, category, printer_station } = req.body;

    // Create item in inventory system
    const response = await fetch(`${INVENTORY_API_URL}/api/items/from-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Order-API-Key': ORDER_API_KEY,
      },
      body: JSON.stringify({
        name,
        sale_price: price,
        sale_category: category,
        printer_station: printer_station || 'bar'
      })
    });

    if (response.ok) {
      const inventoryItem = await response.json() as any;
      return res.json({
        id: inventoryItem.id,
        name: inventoryItem.name,
        price: inventoryItem.sale_price,
        category: inventoryItem.sale_category,
        printer_station: inventoryItem.printer_station,
        source: 'inventory'
      });
    } else {
      const error = await response.json() as any;
      console.error('Inventory API error:', error);
      return res.status(response.status).json({ error: error.error || 'Failed to create item in inventory' });
    }
  } catch (error) {
    console.error('Inventory API error:', error);
    res.status(500).json({ error: 'Verbindung zum Inventar-System fehlgeschlagen' });
  }
});

// Update item in inventory system
app.put('/api/items/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { name, price, category, printer_station, sellable } = req.body;

    const response = await fetch(`${INVENTORY_API_URL}/api/items/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Order-API-Key': ORDER_API_KEY
      },
      body: JSON.stringify({
        name,
        sale_price: price,
        sale_category: category,
        printer_station: printer_station || 'bar',
        sellable: sellable !== false
      })
    });

    if (response.ok) {
      const item = await response.json() as any;
      res.json(item);
    } else {
      res.status(response.status).json({ error: 'Failed to update item in inventory' });
    }
  } catch (error) {
    console.error('Inventory API error:', error);
    res.status(500).json({ error: 'Verbindung zum Inventar-System fehlgeschlagen' });
  }
});

// Delete item from inventory system
app.delete('/api/items/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const response = await fetch(`${INVENTORY_API_URL}/api/items/${id}`, {
      method: 'DELETE',
      headers: {
        'X-Order-API-Key': ORDER_API_KEY
      }
    });

    if (response.ok) {
      res.json({ success: true });
    } else {
      res.status(response.status).json({ error: 'Failed to delete from inventory' });
    }
  } catch (error) {
    console.error('Inventory API error:', error);
    res.status(500).json({ error: 'Verbindung zum Inventar-System fehlgeschlagen' });
  }
});

// Routes: Orders (item_name and printer_station stored directly in order_items)
// Protected by IP whitelist
app.get('/api/orders', checkIpWhitelist, async (req, res) => {
  try {
    // Include 'completed' status for table orders (kitchen confirmed but not yet fully paid)
    const result = await pool.query(`
      SELECT o.*,
        json_agg(
          json_build_object(
            'id', oi.id,
            'item_name', oi.item_name,
            'quantity', oi.quantity,
            'price', oi.price,
            'notes', oi.notes,
            'printer_station', oi.printer_station,
            'paid', COALESCE(oi.paid, false),
            'paid_at', oi.paid_at,
            'completed', COALESCE(oi.completed, false),
            'completed_at', oi.completed_at
          )
        ) FILTER (WHERE oi.id IS NOT NULL) as items,
        COALESCE((SELECT SUM(op.amount) FROM order_payments op WHERE op.order_id = o.id), 0) as paid_amount
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.status IN ('pending', 'paid', 'completed')
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/orders', checkIpWhitelist, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { table_number, items } = req.body;

    // Calculate total
    const total = items.reduce((sum: number, item: any) =>
      sum + (item.price * item.quantity), 0
    );

    // Create order
    const orderResult = await client.query(
      'INSERT INTO orders (table_number, total) VALUES ($1, $2) RETURNING *',
      [table_number, total]
    );
    const order = orderResult.rows[0];

    // Add order items (store item_name and printer_station directly)
    // Support both item.name and item.item_name from frontend
    for (const item of items) {
      await client.query(
        'INSERT INTO order_items (order_id, item_id, item_name, quantity, price, notes, printer_station) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [order.id, item.id, item.item_name || item.name, item.quantity, item.price, item.notes || null, item.printer_station || 'bar']
      );
    }

    await client.query('COMMIT');

    // Reduce inventory stock (all items come from inventory now)
    try {
      const inventoryItems = items.map((item: any) => ({ id: item.id, quantity: item.quantity }));

      if (inventoryItems.length > 0) {
        await fetch(`${INVENTORY_API_URL}/api/items/sell`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Order-API-Key': ORDER_API_KEY
          },
          body: JSON.stringify({
            items: inventoryItems,
            order_id: order.id,
            order_source: 'kasse'
          })
        });
      }
    } catch (inventoryError) {
      console.error('Failed to update inventory:', inventoryError);
      // Don't fail the order, just log the error
    }

    // Print receipt
    try {
      await printReceipt(order.id, table_number, items);
    } catch (printError) {
      console.error('Print error:', printError);
    }

    // Broadcast to kitchen display
    broadcast({ type: 'new_order', order: { ...order, items } });

    // Queue for cloud sync
    queueOrderSync(order.id, 'create');

    res.json(order);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

// Get open orders for a specific table
app.get('/api/orders/open/:tableNumber', checkIpWhitelist, async (req, res) => {
  try {
    const { tableNumber } = req.params;
    const result = await pool.query(`
      SELECT o.*,
        json_agg(
          json_build_object(
            'id', oi.id,
            'item_name', oi.item_name,
            'quantity', oi.quantity,
            'price', oi.price,
            'notes', oi.notes,
            'printer_station', oi.printer_station,
            'paid', COALESCE(oi.paid, false),
            'paid_at', oi.paid_at
          )
        ) FILTER (WHERE oi.id IS NOT NULL) as items,
        COALESCE((SELECT SUM(op.amount) FROM order_payments op WHERE op.order_id = o.id), 0) as paid_amount
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.status IN ('pending', 'paid') AND o.table_number = $1
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `, [tableNumber]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Add items to an existing order
app.post('/api/orders/:id/items', checkIpWhitelist, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const { items } = req.body;

    // Check if order exists and is still pending
    const orderCheck = await client.query(
      'SELECT * FROM orders WHERE id = $1 AND status = $2',
      [id, 'pending']
    );

    if (orderCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found or already closed' });
    }

    const order = orderCheck.rows[0];

    // Calculate additional total
    const additionalTotal = items.reduce((sum: number, item: any) =>
      sum + (item.price * item.quantity), 0
    );

    // Add order items (store item_name and printer_station directly)
    // Support both item.name and item.item_name from frontend
    for (const item of items) {
      await client.query(
        'INSERT INTO order_items (order_id, item_id, item_name, quantity, price, notes, printer_station) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [id, item.id, item.item_name || item.name, item.quantity, item.price, item.notes || null, item.printer_station || 'bar']
      );
    }

    // Update order total
    const newTotal = parseFloat(order.total) + additionalTotal;
    await client.query(
      'UPDATE orders SET total = $1 WHERE id = $2',
      [newTotal, id]
    );

    await client.query('COMMIT');

    // Reduce inventory stock (all items come from inventory now)
    try {
      const inventoryItems = items.map((item: any) => ({ id: item.id, quantity: item.quantity }));

      if (inventoryItems.length > 0) {
        await fetch(`${INVENTORY_API_URL}/api/items/sell`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Order-API-Key': ORDER_API_KEY
          },
          body: JSON.stringify({
            items: inventoryItems,
            order_id: id,
            order_source: 'kasse'
          })
        });
      }
    } catch (inventoryError) {
      console.error('Failed to update inventory:', inventoryError);
    }

    // Print receipt for additional items
    try {
      await printReceipt(parseInt(id), order.table_number, items);
    } catch (printError) {
      console.error('Print error:', printError);
    }

    // Broadcast update
    broadcast({ type: 'order_updated', order_id: id });

    // Queue for cloud sync
    queueOrderSync(parseInt(id), 'update');

    res.json({ success: true, total: newTotal });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Add items error:', error);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

app.patch('/api/orders/:id/complete', checkIpWhitelist, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(
      'UPDATE orders SET status = $1 WHERE id = $2',
      ['completed', id]
    );
    broadcast({ type: 'order_completed', order_id: id });

    // Queue for cloud sync
    queueOrderSync(parseInt(id), 'update');

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Cancel/Stornieren individual order item
// Note: Items can only be cancelled if:
// 1. They are not already paid
// 2. They are not already completed by kitchen
app.delete('/api/orders/:orderId/items/:itemId', checkIpWhitelist, async (req, res) => {
  try {
    const { orderId, itemId } = req.params;

    // Check if item exists
    const itemResult = await pool.query(
      'SELECT * FROM order_items WHERE id = $1 AND order_id = $2',
      [itemId, orderId]
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Artikel nicht gefunden' });
    }

    const item = itemResult.rows[0];

    // Check if item is completed by kitchen - cannot cancel
    if (item.completed) {
      return res.status(400).json({
        error: 'Küche hat diesen Artikel bereits bestätigt - kann nicht mehr storniert werden.'
      });
    }

    // Check if item is paid - cannot cancel
    if (item.paid) {
      return res.status(400).json({ error: 'Bereits bezahlte Artikel können nicht storniert werden' });
    }

    // Delete the item
    await pool.query('DELETE FROM order_items WHERE id = $1', [itemId]);

    // Update order total
    const totalResult = await pool.query(
      'SELECT COALESCE(SUM(price * quantity), 0) as new_total FROM order_items WHERE order_id = $1',
      [orderId]
    );
    const newTotal = totalResult.rows[0].new_total;

    await pool.query('UPDATE orders SET total = $1 WHERE id = $2', [newTotal, orderId]);

    // Check if order has no more items - if so, mark as cancelled
    const remainingItems = await pool.query(
      'SELECT COUNT(*) as count FROM order_items WHERE order_id = $1',
      [orderId]
    );

    if (parseInt(remainingItems.rows[0].count) === 0) {
      await pool.query('UPDATE orders SET status = $1 WHERE id = $2', ['cancelled', orderId]);
      broadcast({ type: 'order_completed', order_id: orderId }); // Remove from display
    } else {
      broadcast({ type: 'order_updated', order_id: orderId, total: newTotal });
    }

    // Queue for cloud sync
    queueOrderSync(parseInt(orderId), 'update');

    res.json({ success: true, message: 'Artikel storniert', new_total: newTotal });
  } catch (error) {
    console.error('Error cancelling item:', error);
    res.status(500).json({ error: 'Fehler beim Stornieren' });
  }
});

// Mark individual order item(s) as completed by kitchen
app.patch('/api/orders/:orderId/items/complete', checkIpWhitelist, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { item_ids } = req.body; // Array of item IDs to mark as completed

    if (!item_ids || !Array.isArray(item_ids) || item_ids.length === 0) {
      return res.status(400).json({ error: 'Keine Artikel angegeben' });
    }

    // Mark items as completed
    await pool.query(
      `UPDATE order_items
       SET completed = true, completed_at = NOW()
       WHERE order_id = $1 AND id = ANY($2)`,
      [orderId, item_ids]
    );

    // Check if all items in order are now completed - if so, mark order as completed
    const uncompletedResult = await pool.query(
      `SELECT COUNT(*) as count FROM order_items
       WHERE order_id = $1 AND (completed = false OR completed IS NULL)`,
      [orderId]
    );

    if (parseInt(uncompletedResult.rows[0].count) === 0) {
      await pool.query('UPDATE orders SET status = $1 WHERE id = $2', ['completed', orderId]);
    }

    broadcast({ type: 'items_completed', order_id: orderId, item_ids });

    res.json({ success: true, message: 'Artikel als erledigt markiert' });
  } catch (error) {
    console.error('Error completing items:', error);
    res.status(500).json({ error: 'Fehler beim Markieren als erledigt' });
  }
});

// Update order status with payment method
app.put('/api/orders/:id/status', checkIpWhitelist, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, payment_method } = req.body;

    await pool.query(
      'UPDATE orders SET status = $1, payment_method = $2 WHERE id = $3',
      [status || 'paid', payment_method || null, id]
    );

    broadcast({ type: 'order_updated', order_id: id, status, payment_method });

    // Queue for cloud sync
    queueOrderSync(parseInt(id), 'update');

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Order history (for admin view)
app.get('/api/orders/history', async (req, res) => {
  try {
    const { date, status, limit = 100 } = req.query;

    let query = `
      SELECT o.*,
        json_agg(
          json_build_object(
            'id', oi.id,
            'item_name', COALESCE(oi.item_name, 'Unbekannt'),
            'quantity', oi.quantity,
            'price', oi.price,
            'notes', oi.notes
          )
        ) FILTER (WHERE oi.id IS NOT NULL) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
    `;
    const params: any[] = [];

    const conditions: string[] = [];

    if (date) {
      params.push(date);
      conditions.push(`DATE(o.created_at) = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`o.status = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' GROUP BY o.id ORDER BY o.created_at DESC';

    params.push(limit);
    query += ` LIMIT $${params.length}`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ============================================
// SPLIT PAYMENT & PER-ITEM PAYMENT ENDPOINTS
// ============================================

// Get order details with payment status per item
app.get('/api/orders/:id/details', checkIpWhitelist, async (req, res) => {
  try {
    const { id } = req.params;

    // Get order with items and their paid status
    const orderResult = await pool.query(`
      SELECT o.*,
        json_agg(
          json_build_object(
            'id', oi.id,
            'item_name', oi.item_name,
            'quantity', oi.quantity,
            'price', oi.price,
            'notes', oi.notes,
            'printer_station', oi.printer_station,
            'paid', COALESCE(oi.paid, false),
            'paid_at', oi.paid_at,
            'payment_id', oi.payment_id
          )
        ) FILTER (WHERE oi.id IS NOT NULL) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.id = $1
      GROUP BY o.id
    `, [id]);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    }

    const order = orderResult.rows[0];

    // Get all partial payments for this order
    const paymentsResult = await pool.query(`
      SELECT * FROM order_payments WHERE order_id = $1 ORDER BY created_at DESC
    `, [id]);

    // Calculate totals
    const items = order.items || [];
    const totalAmount = items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
    const paidAmount = items.filter((item: any) => item.paid).reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
    const unpaidAmount = totalAmount - paidAmount;

    res.json({
      ...order,
      payments: paymentsResult.rows,
      total_amount: totalAmount,
      paid_amount: paidAmount,
      unpaid_amount: unpaidAmount,
      fully_paid: unpaidAmount <= 0
    });
  } catch (error) {
    console.error('Order details error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get unpaid items for an order
app.get('/api/orders/:id/unpaid-items', checkIpWhitelist, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT id, item_name, quantity, price, notes, printer_station
      FROM order_items
      WHERE order_id = $1 AND (paid = false OR paid IS NULL)
      ORDER BY id
    `, [id]);

    const items = result.rows;
    const totalUnpaid = items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);

    res.json({
      items,
      total_unpaid: totalUnpaid
    });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Pay specific items (mark items as paid)
app.post('/api/orders/:id/pay-items', checkIpWhitelist, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const { item_ids, payment_method, description } = req.body;

    if (!item_ids || !Array.isArray(item_ids) || item_ids.length === 0) {
      return res.status(400).json({ error: 'item_ids muss ein Array mit mindestens einem Artikel sein' });
    }

    // Verify items belong to this order and are not already paid
    const itemsCheck = await client.query(`
      SELECT id, item_name, quantity, price, paid
      FROM order_items
      WHERE order_id = $1 AND id = ANY($2)
    `, [id, item_ids]);

    if (itemsCheck.rows.length !== item_ids.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Einige Artikel gehören nicht zu dieser Bestellung' });
    }

    const alreadyPaid = itemsCheck.rows.filter((item: any) => item.paid);
    if (alreadyPaid.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Einige Artikel wurden bereits bezahlt',
        already_paid: alreadyPaid.map((item: any) => item.item_name)
      });
    }

    // Calculate payment amount
    const paymentAmount = itemsCheck.rows.reduce((sum: number, item: any) =>
      sum + (item.price * item.quantity), 0);

    // Create payment record
    const paymentResult = await client.query(`
      INSERT INTO order_payments (order_id, amount, payment_method, description)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [id, paymentAmount, payment_method || 'cash', description || null]);

    const payment = paymentResult.rows[0];

    // Mark items as paid
    await client.query(`
      UPDATE order_items
      SET paid = true, paid_at = NOW(), payment_id = $1
      WHERE id = ANY($2)
    `, [payment.id, item_ids]);

    // Check if all items are now paid
    const unpaidCheck = await client.query(`
      SELECT COUNT(*) as unpaid_count FROM order_items
      WHERE order_id = $1 AND (paid = false OR paid IS NULL)
    `, [id]);

    const allPaid = parseInt(unpaidCheck.rows[0].unpaid_count) === 0;

    // If all items paid, update order status
    if (allPaid) {
      await client.query(`
        UPDATE orders SET status = 'paid', payment_method = $2 WHERE id = $1
      `, [id, payment_method || 'split']);
    }

    await client.query('COMMIT');

    // Broadcast update
    broadcast({
      type: 'order_updated',
      order_id: id,
      payment: payment,
      all_paid: allPaid
    });

    // Queue for cloud sync
    queueOrderSync(parseInt(id), 'update');

    res.json({
      success: true,
      payment: payment,
      paid_items: itemsCheck.rows.map((item: any) => item.item_name),
      all_paid: allPaid
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Pay items error:', error);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

// Split payment - pay a specific amount (not tied to specific items)
app.post('/api/orders/:id/split-payment', checkIpWhitelist, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const { amount, payment_method, description } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Betrag muss grösser als 0 sein' });
    }

    // Get order and calculate remaining amount
    const orderResult = await client.query(`
      SELECT o.id, o.total, o.status,
        COALESCE(SUM(op.amount), 0) as already_paid
      FROM orders o
      LEFT JOIN order_payments op ON o.id = op.order_id
      WHERE o.id = $1
      GROUP BY o.id
    `, [id]);

    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    }

    const order = orderResult.rows[0];
    const remaining = parseFloat(order.total) - parseFloat(order.already_paid);

    if (amount > remaining + 0.01) { // Small tolerance for rounding
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Betrag übersteigt den offenen Betrag',
        remaining: remaining.toFixed(2)
      });
    }

    // Create payment record
    const paymentResult = await client.query(`
      INSERT INTO order_payments (order_id, amount, payment_method, description)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [id, amount, payment_method || 'cash', description || null]);

    const payment = paymentResult.rows[0];

    // Check if order is fully paid
    const newRemaining = remaining - amount;
    const allPaid = newRemaining <= 0.01;

    if (allPaid) {
      await client.query(`
        UPDATE orders SET status = 'paid', payment_method = 'split' WHERE id = $1
      `, [id]);
    }

    await client.query('COMMIT');

    // Broadcast update
    broadcast({
      type: 'order_updated',
      order_id: id,
      payment: payment,
      all_paid: allPaid
    });

    // Queue for cloud sync
    queueOrderSync(parseInt(id), 'update');

    res.json({
      success: true,
      payment: payment,
      remaining: Math.max(0, newRemaining).toFixed(2),
      all_paid: allPaid
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Split payment error:', error);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

// Get all payments for an order (split payments)
app.get('/api/orders/:id/payments', checkIpWhitelist, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT op.*,
        json_agg(
          json_build_object(
            'id', oi.id,
            'item_name', oi.item_name,
            'quantity', oi.quantity,
            'price', oi.price
          )
        ) FILTER (WHERE oi.id IS NOT NULL) as paid_items
      FROM order_payments op
      LEFT JOIN order_items oi ON oi.payment_id = op.id
      WHERE op.order_id = $1
      GROUP BY op.id
      ORDER BY op.created_at DESC
    `, [id]);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Daily statistics
app.get('/api/stats/daily', async (req, res) => {
  try {
    // Business day runs from 12:00 to 12:00 next day
    const now = new Date();
    const currentHour = now.getHours();

    // If before 12:00, the business day started yesterday at 12:00
    // If after 12:00, the business day started today at 12:00
    const startDate = new Date(now);
    if (currentHour < 12) {
      startDate.setDate(startDate.getDate() - 1);
    }
    startDate.setHours(12, 0, 0, 0);

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);

    // Format for display (the date when the business day started)
    const displayDate = startDate.toISOString().split('T')[0];

    const result = await pool.query(`
      SELECT
        COUNT(*) as total_orders,
        COALESCE(SUM(total), 0) as total_revenue,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_orders,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders
      FROM orders
      WHERE created_at >= $1 AND created_at < $2
    `, [startDate.toISOString(), endDate.toISOString()]);

    // Best selling items for this business day
    const itemsResult = await pool.query(`
      SELECT
        COALESCE(oi.item_name, 'Sonderposten') as name,
        SUM(oi.quantity) as total_sold,
        SUM(oi.quantity * oi.price) as total_revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.created_at >= $1 AND o.created_at < $2
      GROUP BY oi.item_name
      ORDER BY total_sold DESC
      LIMIT 10
    `, [startDate.toISOString(), endDate.toISOString()]);

    res.json({
      date: displayDate,
      summary: result.rows[0],
      top_items: itemsResult.rows
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Send daily report via email
app.post('/api/stats/send-report', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const userEmail = req.user?.email;
    if (!userEmail) {
      return res.status(400).json({ error: 'Keine E-Mail-Adresse im Token gefunden' });
    }

    // Get current business day stats (12:00-12:00)
    const now = new Date();
    const currentHour = now.getHours();
    const startDate = new Date(now);
    if (currentHour < 12) {
      startDate.setDate(startDate.getDate() - 1);
    }
    startDate.setHours(12, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);
    const displayDate = startDate.toISOString().split('T')[0];

    // Get summary
    const summaryResult = await pool.query(`
      SELECT
        COUNT(*) as total_orders,
        COALESCE(SUM(total), 0) as total_revenue,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_orders,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders
      FROM orders
      WHERE created_at >= $1 AND created_at < $2
    `, [startDate.toISOString(), endDate.toISOString()]);

    // Get payment breakdown
    const paymentResult = await pool.query(`
      SELECT
        COALESCE(payment_method, 'unbekannt') as payment_method,
        COUNT(*) as count,
        COALESCE(SUM(total), 0) as total
      FROM orders
      WHERE created_at >= $1 AND created_at < $2 AND status = 'paid'
      GROUP BY payment_method
    `, [startDate.toISOString(), endDate.toISOString()]);

    // Get top items
    const itemsResult = await pool.query(`
      SELECT
        COALESCE(oi.item_name, 'Sonderposten') as name,
        SUM(oi.quantity) as total_sold,
        SUM(oi.quantity * oi.price) as total_revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.created_at >= $1 AND o.created_at < $2
      GROUP BY oi.item_name
      ORDER BY total_sold DESC
      LIMIT 10
    `, [startDate.toISOString(), endDate.toISOString()]);

    const summary = summaryResult.rows[0];
    const topItems = itemsResult.rows;
    const payments = paymentResult.rows;

    // Format email content
    const paymentLines = payments.map((p: any) =>
      `  ${p.payment_method === 'cash' ? 'Bar' : p.payment_method === 'sumup' ? 'SumUp' : p.payment_method}: ${p.count}x = CHF ${parseFloat(p.total).toFixed(2)}`
    ).join('\n');

    const itemLines = topItems.map((item: any, i: number) =>
      `  ${i + 1}. ${item.name} - ${item.total_sold}x = CHF ${parseFloat(item.total_revenue).toFixed(2)}`
    ).join('\n');

    const emailBody = `
TAGESBERICHT KASSE
==================
Datum: ${displayDate} (12:00 - 12:00)

ZUSAMMENFASSUNG
---------------
Bestellungen: ${summary.total_orders}
Umsatz: CHF ${parseFloat(summary.total_revenue).toFixed(2)}
Bezahlt: ${summary.paid_orders}
Offen: ${summary.pending_orders}

${payments.length > 0 ? `ZAHLUNGSARTEN\n-------------\n${paymentLines}\n` : ''}
${topItems.length > 0 ? `MEISTVERKAUFTE ARTIKEL\n----------------------\n${itemLines}` : ''}

--
Feuerwehrverein Raura - Kassensystem
    `.trim();

    // Send via main API email endpoint
    const emailApiUrl = process.env.EMAIL_API_URL || 'https://www.fwv-raura.ch/api/email/send';

    const emailResponse = await fetch(emailApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: userEmail,
        subject: `Tagesbericht Kasse - ${displayDate}`,
        body: emailBody
      })
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error('Email API error:', errorText);
      return res.status(500).json({ error: 'E-Mail konnte nicht gesendet werden' });
    }

    console.log(`Daily report sent to ${userEmail}`);
    res.json({ success: true, sentTo: userEmail });
  } catch (error) {
    console.error('Send report error:', error);
    res.status(500).json({ error: 'Fehler beim Senden des Berichts' });
  }
});

// Settings API endpoints
app.get('/api/settings', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await pool.query('SELECT key, value FROM settings');
    const settings: { [key: string]: string } = {};
    result.rows.forEach(row => {
      settings[row.key] = row.value;
    });
    res.json(settings);
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Einstellungen' });
  }
});

app.put('/api/settings', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const settings = req.body;

    for (const [key, value] of Object.entries(settings)) {
      await setSetting(key, String(value));
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Save settings error:', error);
    res.status(500).json({ error: 'Fehler beim Speichern der Einstellungen' });
  }
});

// Test printer connection
app.post('/api/settings/test-printer', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { station, ip, port } = req.body;

    if (!ip) {
      return res.status(400).json({ error: 'IP-Adresse erforderlich' });
    }

    const printerConfig = { ip, port: parseInt(port) || 9100 };

    // Try to print a test receipt
    await printToNetworkPrinter(printerConfig, station || 'test', 0, 0, [
      { quantity: 1, item_name: 'DRUCKER TEST', notes: 'Verbindung erfolgreich!' }
    ]);

    res.json({ success: true, message: `Testdruck an ${ip} gesendet` });
  } catch (error: any) {
    console.error('Test printer error:', error);
    res.status(500).json({ error: `Drucker nicht erreichbar: ${error.message}` });
  }
});

// ============================================
// IP WHITELIST MANAGEMENT
// ============================================

// Helper to get client IP (handles reverse proxy headers)
function getClientIp(req: any): string {
  // Cloudflare sets this header
  const cfConnectingIp = req.headers['cf-connecting-ip'];
  if (cfConnectingIp) {
    return cfConnectingIp.trim();
  }

  // Traefik and other proxies set these headers
  const xRealIp = req.headers['x-real-ip'];
  if (xRealIp) {
    return xRealIp.trim();
  }

  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // Take the first IP (original client)
    return forwarded.split(',')[0].trim();
  }

  // Express's req.ip when trust proxy is enabled
  if (req.ip && !req.ip.startsWith('172.') && !req.ip.startsWith('10.') && !req.ip.startsWith('192.168.')) {
    return req.ip.replace(/^::ffff:/, '');
  }

  // Fallback to direct connection IP
  const remoteAddr = req.socket?.remoteAddress || req.ip || 'unknown';
  // Remove IPv6 prefix if present (::ffff:192.168.1.1 -> 192.168.1.1)
  return remoteAddr.replace(/^::ffff:/, '');
}

// IP Whitelist middleware - allows requests if:
// 1. Whitelist is disabled (empty or setting disabled)
// 2. IP is whitelisted and not expired
// 3. Request has valid auth token (admins bypass whitelist)
async function checkIpWhitelist(req: any, res: any, next: any) {
  try {
    // Check if whitelist is enabled
    const enabled = await getSetting('whitelist_enabled');
    if (enabled !== 'true') {
      return next(); // Whitelist disabled, allow all
    }

    // Check if whitelist is empty (allow all if no entries)
    const countResult = await pool.query('SELECT COUNT(*) FROM ip_whitelist');
    if (parseInt(countResult.rows[0].count) === 0) {
      return next(); // No whitelist entries, allow all
    }

    // Check if request has valid auth token (admin bypass)
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      // If auth token present, let the request through (auth middleware will validate)
      return next();
    }

    // Check if IP is whitelisted
    const ip = getClientIp(req);
    const result = await pool.query(`
      SELECT * FROM ip_whitelist
      WHERE ip_address = $1
        AND (is_permanent = true OR expires_at IS NULL OR expires_at > NOW())
    `, [ip]);

    if (result.rows.length > 0) {
      return next(); // IP is whitelisted
    }

    // Not whitelisted
    res.status(403).json({
      error: 'Zugriff verweigert',
      message: 'Diese IP-Adresse ist nicht freigeschaltet. Bitte registrieren Sie sich unter register.fwv-raura.ch',
      ip: ip
    });
  } catch (error) {
    console.error('Whitelist check error:', error);
    next(); // On error, allow request (fail open for usability)
  }
}

// Enable/disable whitelist protection (protected)
app.get('/api/whitelist/enabled', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const enabled = await getSetting('whitelist_enabled');
    res.json({ enabled: enabled === 'true' });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/whitelist/enabled', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { enabled } = req.body;
    await setSetting('whitelist_enabled', enabled ? 'true' : 'false');
    res.json({ success: true, enabled });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Get caller's public IP
app.get('/api/whitelist/my-ip', (req, res) => {
  const ip = getClientIp(req);
  res.json({ ip });
});

// Debug endpoint to check headers (temporary)
app.get('/api/whitelist/debug-headers', (req, res) => {
  res.json({
    ip: getClientIp(req),
    'cf-connecting-ip': req.headers['cf-connecting-ip'],
    'x-forwarded-for': req.headers['x-forwarded-for'],
    'x-real-ip': req.headers['x-real-ip'],
    'x-forwarded-proto': req.headers['x-forwarded-proto'],
    'req.ip': req.ip,
    'req.ips': req.ips,
    'socket.remoteAddress': req.socket?.remoteAddress,
  });
});

// Check if current IP is whitelisted (and not expired)
app.get('/api/whitelist/check', async (req, res) => {
  try {
    const ip = getClientIp(req);
    const result = await pool.query(`
      SELECT * FROM ip_whitelist
      WHERE ip_address = $1
        AND (is_permanent = true OR expires_at IS NULL OR expires_at > NOW())
    `, [ip]);
    const isWhitelisted = result.rows.length > 0;
    const entry = result.rows[0];
    res.json({
      ip,
      whitelisted: isWhitelisted,
      device_name: entry?.device_name || null,
      expires_at: entry?.expires_at || null,
      is_permanent: entry?.is_permanent || false
    });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Register IP via OAuth (Authentik) - 24h validity
app.post('/api/whitelist/register-oauth', async (req, res) => {
  try {
    const { code, redirect_uri, device_name } = req.body;
    const ip = getClientIp(req);

    if (!code || !redirect_uri) {
      return res.status(400).json({ error: 'Code und Redirect URI erforderlich' });
    }

    // Exchange code for tokens with Authentik
    const AUTHENTIK_URL = process.env.AUTHENTIK_URL || 'https://auth.fwv-raura.ch';
    const CLIENT_ID = 'order-register';
    const CLIENT_SECRET = process.env.AUTHENTIK_REGISTER_SECRET || '';

    const tokenResponse = await fetch(`${AUTHENTIK_URL}/application/o/token/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirect_uri,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      return res.status(401).json({ error: 'Authentifizierung fehlgeschlagen' });
    }

    const tokens = await tokenResponse.json() as { access_token: string };

    // Get user info
    const userInfoResponse = await fetch(`${AUTHENTIK_URL}/application/o/userinfo/`, {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
      },
    });

    if (!userInfoResponse.ok) {
      return res.status(401).json({ error: 'Benutzerinformationen konnten nicht abgerufen werden' });
    }

    const userInfo = await userInfoResponse.json() as { email?: string; preferred_username?: string; name?: string };
    const userEmail = userInfo.email || userInfo.preferred_username || 'unknown';
    const userName = userInfo.name || userInfo.preferred_username || userEmail;

    // Add or update IP with 24h expiry
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
    const deviceLabel = device_name || `${userName}'s Gerät`;

    await pool.query(`
      INSERT INTO ip_whitelist (ip_address, device_name, created_by, expires_at, is_permanent)
      VALUES ($1, $2, $3, $4, false)
      ON CONFLICT (ip_address) DO UPDATE SET
        device_name = $2,
        created_by = $3,
        created_at = NOW(),
        expires_at = $4,
        is_permanent = false
    `, [ip, deviceLabel, userEmail, expiresAt]);

    console.log(`IP ${ip} whitelisted for user ${userEmail}`);

    res.json({
      success: true,
      ip,
      expires_at: expiresAt,
      user_email: userEmail,
      user_name: userName,
      message: 'IP für 24 Stunden freigeschaltet'
    });
  } catch (error) {
    console.error('OAuth whitelist register error:', error);
    res.status(500).json({ error: 'Registrierung fehlgeschlagen' });
  }
});

// List all whitelisted IPs (protected)
app.get('/api/whitelist', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await pool.query('SELECT * FROM ip_whitelist ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Add IP manually (protected)
app.post('/api/whitelist', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { ip_address, device_name } = req.body;

    if (!ip_address) {
      return res.status(400).json({ error: 'IP-Adresse erforderlich' });
    }

    await pool.query(`
      INSERT INTO ip_whitelist (ip_address, device_name, created_by)
      VALUES ($1, $2, $3)
      ON CONFLICT (ip_address) DO UPDATE SET device_name = $2, created_at = NOW()
    `, [ip_address, device_name || 'Manuell hinzugefügt', req.user?.email || 'admin']);

    res.json({ success: true, message: 'IP hinzugefügt' });
  } catch (error) {
    console.error('Whitelist add error:', error);
    res.status(500).json({ error: 'Fehler beim Hinzufügen' });
  }
});

// Delete IP from whitelist (protected)
app.delete('/api/whitelist/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM ip_whitelist WHERE id = $1', [id]);
    res.json({ success: true, message: 'IP entfernt' });
  } catch (error) {
    res.status(500).json({ error: 'Fehler beim Entfernen' });
  }
});

// Get printer configuration (from database first, fallback to env vars)
async function getPrinterConfig(): Promise<{ [key: string]: { ip: string; port: number } | null }> {
  const barIp = await getSetting('printer_bar_ip') || process.env.PRINTER_BAR_IP;
  const barPort = await getSetting('printer_bar_port') || process.env.PRINTER_BAR_PORT || '9100';
  const kitchenIp = await getSetting('printer_kitchen_ip') || process.env.PRINTER_KITCHEN_IP;
  const kitchenPort = await getSetting('printer_kitchen_port') || process.env.PRINTER_KITCHEN_PORT || '9100';

  return {
    bar: barIp ? { ip: barIp, port: parseInt(barPort) } : null,
    kitchen: kitchenIp ? { ip: kitchenIp, port: parseInt(kitchenPort) } : null
  };
}

// Import escpos for network printing
import escpos from 'escpos';
import Network from 'escpos-network';

// Print to a specific network printer
async function printToNetworkPrinter(
  printerConfig: { ip: string; port: number },
  station: string,
  orderId: number,
  tableNumber: number,
  items: any[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const device = new Network(printerConfig.ip, printerConfig.port);
    const printer = new escpos.Printer(device);

    device.open((err: any) => {
      if (err) {
        console.error(`Printer ${station} (${printerConfig.ip}) connection error:`, err);
        reject(err);
        return;
      }

      try {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
        const dateStr = now.toLocaleDateString('de-CH');

        printer
          .font('a')
          .align('ct')
          .style('b')
          .size(2, 2)
          .text(`TISCH ${tableNumber}`)
          .size(1, 1)
          .text('')
          .align('lt')
          .style('normal')
          .text(`Bestellung: #${orderId}`)
          .text(`Zeit: ${dateStr} ${timeStr}`)
          .text(`Station: ${station.toUpperCase()}`)
          .text('--------------------------------')
          .style('b');

        // Print each item
        items.forEach((item: any) => {
          printer.text(`${item.quantity}x ${item.item_name}`);
          if (item.notes) {
            printer.style('normal').text(`   -> ${item.notes}`).style('b');
          }
        });

        printer
          .text('--------------------------------')
          .text('')
          .align('ct')
          .size(2, 2)
          .text(`TISCH ${tableNumber}`)
          .size(1, 1)
          .text('')
          .cut()
          .close(() => {
            console.log(`Printed to ${station} printer (${printerConfig.ip})`);
            resolve();
          });
      } catch (printError) {
        console.error('Print formatting error:', printError);
        device.close(() => {});
        reject(printError);
      }
    });
  });
}

// Printer function (ESC/POS)
async function printReceipt(orderId: number, tableNumber: number, items: any[]) {
  try {
    // Get printer configuration from database
    const printerConfigs = await getPrinterConfig();

    // Group items by printer station
    const stations = items.reduce((acc: any, item: any) => {
      const station = item.printer_station || 'bar';
      if (!acc[station]) acc[station] = [];
      acc[station].push(item);
      return acc;
    }, {});

    // For each station, print a receipt
    for (const [station, stationItems] of Object.entries(stations)) {
      const printerConfig = printerConfigs[station];

      if (printerConfig) {
        // Print to network printer
        try {
          await printToNetworkPrinter(printerConfig, station, orderId, tableNumber, stationItems as any[]);
        } catch (printErr) {
          console.error(`Failed to print to ${station}:`, printErr);
          // Continue with other stations even if one fails
        }
      } else {
        // Fallback: Log to console if no printer configured
        console.log(`\n=== PRINT TO ${station.toUpperCase()} (No printer configured) ===`);
        console.log(`Table: ${tableNumber}`);
        console.log(`Order: #${orderId}`);
        console.log(`Time: ${new Date().toLocaleTimeString()}`);
        console.log('---');

        (stationItems as any[]).forEach((item: any) => {
          console.log(`${item.quantity}x ${item.item_name}`);
          if (item.notes) console.log(`   Note: ${item.notes}`);
        });

        console.log('===========================\n');
      }
    }

  } catch (error) {
    console.error('Print error:', error);
    throw error;
  }
}

// Payment Service
const paymentService = new PaymentService();

// Routes: Terminal Status & Pairing
app.get('/api/terminal/status', async (req, res) => {
  try {
    const status = await paymentService.sumup.getTerminalStatus();
    res.json(status);
  } catch (error) {
    console.error('Terminal status error:', error);
    res.status(500).json({ 
      error: 'Terminal status unavailable',
      reader_id: process.env.SUMUP_READER_ID
    });
  }
});

app.post('/api/terminal/pair', async (req, res) => {
  try {
    const { pairing_code } = req.body;
    
    if (!pairing_code || pairing_code.length !== 4) {
      return res.status(400).json({ error: 'Invalid pairing code (4 digits required)' });
    }
    
    const result = await paymentService.sumup.pairTerminal(pairing_code);
    
    res.json({
      success: true,
      reader_id: result.reader_id,
      name: result.name,
      message: `Terminal paired successfully! Add SUMUP_READER_ID=${result.reader_id} to your .env file`
    });
  } catch (error) {
    console.error('Terminal pairing error:', error);
    res.status(500).json({ error: 'Terminal pairing failed' });
  }
});

// Routes: Payments
app.post('/api/payments/create', async (req, res) => {
  try {
    const { orderId, provider } = req.body;
    
    // Get order details
    const orderResult = await pool.query(
      'SELECT * FROM orders WHERE id = $1',
      [orderId]
    );
    
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const order = orderResult.rows[0];
    
    // Create payment request
    const paymentRequest = {
      amount: parseFloat(order.total),
      currency: 'CHF',
      orderId: orderId.toString(),
      tableNumber: order.table_number,
      description: `Tisch ${order.table_number} - Bestellung #${orderId}`,
    };
    
    let paymentResult;
    let paymentUrl, qrCodeUrl, paymentId;
    
    // Handle different payment providers
    if (provider === 'sumup-terminal') {
      // Check terminal status first
      try {
        const terminalStatus = await paymentService.sumup.getTerminalStatus();
        
        if (terminalStatus.status !== 'online') {
          return res.status(503).json({ 
            error: 'Terminal offline',
            message: `Das SumUp 3G Terminal ist ${terminalStatus.status}. Bitte prüfen Sie die Verbindung.`
          });
        }
      } catch (error) {
        return res.status(503).json({ 
          error: 'Terminal not available',
          message: 'Das SumUp 3G Terminal ist nicht erreichbar.'
        });
      }
      
      // Send to terminal
      paymentResult = await paymentService.sumup.createTerminalCheckout(paymentRequest);
      paymentId = paymentResult.id;
      paymentUrl = null; // Terminal payment has no URL
      
    } else if (provider === 'sumup') {
      // Online SumUp checkout
      paymentResult = await paymentService.createPayment(paymentRequest, 'sumup');
      paymentId = paymentResult.id;
      paymentUrl = `https://pay.sumup.com/checkout/${paymentResult.id}`;
      
    } else if (provider === 'raisenow' || provider === 'twint') {
      // RaiseNow/TWINT
      paymentResult = await paymentService.createPayment(paymentRequest, provider);
      paymentUrl = paymentResult.paylink_url;
      qrCodeUrl = paymentResult.qr_code_url;
      paymentId = paymentResult.reference;
      
    } else {
      return res.status(400).json({ error: 'Unknown payment provider' });
    }
    
    // Store payment in database
    const insertResult = await pool.query(
      `INSERT INTO payments (order_id, provider, payment_id, payment_url, qr_code_url, amount, currency, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [orderId, provider, paymentId, paymentUrl, qrCodeUrl, order.total, 'CHF', 'pending']
    );
    
    res.json(insertResult.rows[0]);
  } catch (error) {
    console.error('Payment creation error:', error);
    res.status(500).json({ error: 'Failed to create payment' });
  }
});

app.get('/api/payments/order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC',
      [orderId]
    );
    
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/payments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM payments WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Webhook endpoint for RaiseNow
app.post('/api/webhooks/raisenow', async (req, res) => {
  try {
    const signature = req.headers['x-raisenow-signature'] as string;
    const payload = JSON.stringify(req.body);
    
    // Verify signature
    const raisenow = (paymentService as any).raisenow;
    if (!raisenow.verifyWebhookSignature(payload, signature)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    // Parse event
    const event = raisenow.parseWebhookEvent(req.body);
    
    // Update payment status
    await pool.query(
      'UPDATE payments SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE payment_id = $2',
      [event.status, event.reference]
    );
    
    // If payment successful, mark order as completed
    if (event.status === 'completed' || event.status === 'success') {
      const paymentResult = await pool.query(
        'SELECT order_id FROM payments WHERE payment_id = $1',
        [event.reference]
      );
      
      if (paymentResult.rows.length > 0) {
        await pool.query(
          'UPDATE orders SET status = $1 WHERE id = $2',
          ['paid', paymentResult.rows[0].order_id]
        );
      }
    }
    
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Webhook endpoint for SumUp
app.post('/api/webhooks/sumup', async (req, res) => {
  try {
    const { id, status, checkout_reference } = req.body;
    
    // Update payment status
    await pool.query(
      'UPDATE payments SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE payment_id = $2',
      [status, id]
    );
    
    // If payment successful, mark order as paid
    if (status === 'PAID') {
      await pool.query(
        'UPDATE orders SET status = $1 WHERE id = $2',
        ['paid', parseInt(checkout_reference)]
      );
    }
    
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ============================================
// SYNC API (for Local <-> Cloud synchronization)
// ============================================

const CLOUD_SYNC_KEY = process.env.CLOUD_SYNC_KEY || '';
const CLOUD_API_URL = process.env.CLOUD_API_URL || '';

// Middleware to verify sync key
function verifySyncKey(req: any, res: any, next: any) {
  const syncKey = req.headers['x-sync-key'];
  if (!CLOUD_SYNC_KEY || syncKey !== CLOUD_SYNC_KEY) {
    return res.status(401).json({ error: 'Invalid sync key' });
  }
  next();
}

// Get all orders since a timestamp (for local to pull from cloud)
app.get('/api/sync/orders', verifySyncKey, async (req, res) => {
  try {
    const since = req.query.since ? new Date(req.query.since as string) : new Date(0);
    const result = await pool.query(`
      SELECT o.*,
        json_agg(
          json_build_object(
            'id', oi.id,
            'item_id', oi.item_id,
            'item_name', oi.item_name,
            'quantity', oi.quantity,
            'price', oi.price,
            'notes', oi.notes,
            'printer_station', oi.printer_station
          )
        ) FILTER (WHERE oi.id IS NOT NULL) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.created_at >= $1
      GROUP BY o.id
      ORDER BY o.created_at ASC
    `, [since]);

    res.json({
      orders: result.rows,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Sync orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Upload orders from local to cloud
app.post('/api/sync/orders', verifySyncKey, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { orders, source } = req.body;
    let imported = 0;

    for (const order of orders) {
      // Check if order already exists (by source and original ID)
      const existing = await client.query(
        'SELECT id FROM orders WHERE sync_source = $1 AND sync_source_id = $2',
        [source, order.id]
      );

      if (existing.rows.length > 0) continue; // Skip existing

      // Insert order
      const orderResult = await client.query(`
        INSERT INTO orders (table_number, status, total, payment_method, created_at, sync_source, sync_source_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [order.table_number, order.status, order.total, order.payment_method, order.created_at, source, order.id]);

      const newOrderId = orderResult.rows[0].id;

      // Insert order items
      for (const item of (order.items || [])) {
        await client.query(`
          INSERT INTO order_items (order_id, item_id, item_name, quantity, price, notes, printer_station)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [newOrderId, item.item_id, item.item_name, item.quantity, item.price, item.notes, item.printer_station]);
      }

      imported++;
    }

    await client.query('COMMIT');
    res.json({ success: true, imported });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Sync upload error:', error);
    res.status(500).json({ error: 'Failed to upload orders' });
  } finally {
    client.release();
  }
});

// Get daily stats (for sync)
app.get('/api/sync/stats', verifySyncKey, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];

    const result = await pool.query(`
      SELECT
        COUNT(*) as order_count,
        COALESCE(SUM(total), 0) as total_revenue,
        COUNT(CASE WHEN payment_method = 'bar' THEN 1 END) as cash_count,
        COALESCE(SUM(CASE WHEN payment_method = 'bar' THEN total END), 0) as cash_total,
        COUNT(CASE WHEN payment_method = 'card' THEN 1 END) as card_count,
        COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total END), 0) as card_total
      FROM orders
      WHERE DATE(created_at) = $1 AND status IN ('paid', 'completed')
    `, [date]);

    res.json({
      date,
      stats: result.rows[0]
    });
  } catch (error) {
    console.error('Sync stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Full bidirectional sync
app.post('/api/sync/full', verifySyncKey, async (req, res) => {
  try {
    const { lastSync, localOrders, source } = req.body;
    const since = lastSync ? new Date(lastSync) : new Date(0);

    // 1. Get orders from cloud that are newer than lastSync
    const cloudOrders = await pool.query(`
      SELECT o.*,
        json_agg(
          json_build_object(
            'id', oi.id,
            'item_id', oi.item_id,
            'item_name', oi.item_name,
            'quantity', oi.quantity,
            'price', oi.price,
            'notes', oi.notes,
            'printer_station', oi.printer_station
          )
        ) FILTER (WHERE oi.id IS NOT NULL) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.created_at >= $1 AND (o.sync_source IS NULL OR o.sync_source != $2)
      GROUP BY o.id
      ORDER BY o.created_at ASC
    `, [since, source]);

    // 2. Import local orders to cloud
    const client = await pool.connect();
    let imported = 0;

    try {
      await client.query('BEGIN');

      for (const order of (localOrders || [])) {
        const existing = await client.query(
          'SELECT id FROM orders WHERE sync_source = $1 AND sync_source_id = $2',
          [source, order.id]
        );

        if (existing.rows.length > 0) continue;

        const orderResult = await client.query(`
          INSERT INTO orders (table_number, status, total, payment_method, created_at, sync_source, sync_source_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `, [order.table_number, order.status, order.total, order.payment_method, order.created_at, source, order.id]);

        const newOrderId = orderResult.rows[0].id;

        for (const item of (order.items || [])) {
          await client.query(`
            INSERT INTO order_items (order_id, item_id, item_name, quantity, price, notes, printer_station)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [newOrderId, item.item_id, item.item_name, item.quantity, item.price, item.notes, item.printer_station]);
        }

        imported++;
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    res.json({
      success: true,
      cloudOrders: cloudOrders.rows,
      imported,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Full sync error:', error);
    res.status(500).json({ error: 'Sync failed' });
  }
});

// Sync items/products from inventory
app.get('/api/sync/items', verifySyncKey, async (req, res) => {
  try {
    // Fetch from inventory system
    const response = await fetch(`${INVENTORY_API_URL}/api/items/sellable`);
    if (!response.ok) {
      return res.status(502).json({ error: 'Inventory API unavailable' });
    }

    const items = await response.json();
    res.json({
      items,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Sync items error:', error);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server
const PORT = process.env.PORT || 3000;

initDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  });
