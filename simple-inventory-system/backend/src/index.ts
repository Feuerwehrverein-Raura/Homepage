import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import pg from 'pg';
import bwipjs from 'bwip-js';
import { authenticateToken, optionalAuth, AuthenticatedRequest, localLogin, getAuthMode } from './auth.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

// Database setup
const pool = new pg.Pool({
  host: process.env.DB_HOST || 'postgres',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'inventorydb',
  user: process.env.DB_USER || 'inventoryuser',
  password: process.env.DB_PASSWORD || 'inventorypass',
});

// Initialize database
async function initDB() {
  // Categories
  await pool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Locations (Lagerorte)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS locations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Items (Artikel)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      category_id INTEGER REFERENCES categories(id),
      location_id INTEGER REFERENCES locations(id),

      -- Barcodes
      ean_code VARCHAR(20),
      custom_barcode VARCHAR(50) UNIQUE,

      -- Bestand
      quantity INTEGER DEFAULT 0,
      min_quantity INTEGER DEFAULT 0,
      unit VARCHAR(50) DEFAULT 'Stück',

      -- Zusatzinfos
      purchase_price DECIMAL(10, 2),
      supplier VARCHAR(255),
      notes TEXT,
      image_url TEXT,

      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Transactions (Ein-/Ausgänge)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
      type VARCHAR(20) NOT NULL, -- 'in', 'out', 'correction', 'inventory'
      quantity INTEGER NOT NULL,
      previous_quantity INTEGER,
      new_quantity INTEGER,
      reason TEXT,
      user_email VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Custom barcode counter
  await pool.query(`
    CREATE TABLE IF NOT EXISTS barcode_counter (
      id INTEGER PRIMARY KEY DEFAULT 1,
      last_number INTEGER DEFAULT 0,
      CHECK (id = 1)
    )
  `);

  await pool.query(`
    INSERT INTO barcode_counter (id, last_number) VALUES (1, 0)
    ON CONFLICT (id) DO NOTHING
  `);

  // Indices
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_items_ean ON items(ean_code)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_items_custom ON items(custom_barcode)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_items_category ON items(category_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_items_location ON items(location_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_transactions_item ON transactions(item_id)`);

  console.log('Database initialized');
}

// WebSocket broadcast
function broadcast(data: any) {
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(data));
    }
  });
}

// Auth routes
app.get('/api/auth/mode', (req, res) => {
  res.json(getAuthMode());
});

app.post('/api/auth/login', localLogin);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mode: getAuthMode().local ? 'local' : 'online' });
});

// ========================================
// CATEGORIES
// ========================================

app.get('/api/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/categories', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, description } = req.body;
    const result = await pool.query(
      'INSERT INTO categories (name, description) VALUES ($1, $2) RETURNING *',
      [name, description]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ========================================
// LOCATIONS
// ========================================

app.get('/api/locations', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM locations ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/locations', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, description } = req.body;
    const result = await pool.query(
      'INSERT INTO locations (name, description) VALUES ($1, $2) RETURNING *',
      [name, description]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ========================================
// ITEMS
// ========================================

app.get('/api/items', async (req, res) => {
  try {
    const { category_id, location_id, low_stock, search } = req.query;

    let query = `
      SELECT i.*, c.name as category_name, l.name as location_name
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.id
      LEFT JOIN locations l ON i.location_id = l.id
      WHERE i.active = true
    `;
    const params: any[] = [];

    if (category_id) {
      params.push(category_id);
      query += ` AND i.category_id = $${params.length}`;
    }

    if (location_id) {
      params.push(location_id);
      query += ` AND i.location_id = $${params.length}`;
    }

    if (low_stock === 'true') {
      query += ` AND i.quantity <= i.min_quantity`;
    }

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (i.name ILIKE $${params.length} OR i.ean_code ILIKE $${params.length} OR i.custom_barcode ILIKE $${params.length})`;
    }

    query += ' ORDER BY i.name';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Get item by barcode (EAN or custom)
app.get('/api/items/barcode/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const result = await pool.query(`
      SELECT i.*, c.name as category_name, l.name as location_name
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.id
      LEFT JOIN locations l ON i.location_id = l.id
      WHERE (i.ean_code = $1 OR i.custom_barcode = $1) AND i.active = true
    `, [code]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT i.*, c.name as category_name, l.name as location_name
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.id
      LEFT JOIN locations l ON i.location_id = l.id
      WHERE i.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/items', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      name, description, category_id, location_id,
      ean_code, quantity, min_quantity, unit,
      purchase_price, supplier, notes, image_url
    } = req.body;

    // Generate custom barcode if not provided and no EAN
    let custom_barcode = req.body.custom_barcode;
    if (!custom_barcode && !ean_code) {
      const counterResult = await pool.query(
        'UPDATE barcode_counter SET last_number = last_number + 1 RETURNING last_number'
      );
      const number = counterResult.rows[0].last_number;
      custom_barcode = `FWV${String(number).padStart(6, '0')}`;
    }

    const result = await pool.query(`
      INSERT INTO items (
        name, description, category_id, location_id,
        ean_code, custom_barcode, quantity, min_quantity, unit,
        purchase_price, supplier, notes, image_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      name, description, category_id, location_id,
      ean_code, custom_barcode, quantity || 0, min_quantity || 0, unit || 'Stück',
      purchase_price, supplier, notes, image_url
    ]);

    // Log initial stock
    if (quantity && quantity > 0) {
      await pool.query(`
        INSERT INTO transactions (item_id, type, quantity, previous_quantity, new_quantity, reason, user_email)
        VALUES ($1, 'in', $2, 0, $2, 'Erstbestand', $3)
      `, [result.rows[0].id, quantity, req.user?.email]);
    }

    broadcast({ type: 'item_created', item: result.rows[0] });
    res.json(result.rows[0]);
  } catch (error: any) {
    if (error.code === '23505') {
      res.status(400).json({ error: 'Barcode already exists' });
    } else {
      res.status(500).json({ error: 'Database error' });
    }
  }
});

app.put('/api/items/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const {
      name, description, category_id, location_id,
      ean_code, custom_barcode, min_quantity, unit,
      purchase_price, supplier, notes, image_url
    } = req.body;

    const result = await pool.query(`
      UPDATE items SET
        name = COALESCE($2, name),
        description = COALESCE($3, description),
        category_id = $4,
        location_id = $5,
        ean_code = $6,
        custom_barcode = COALESCE($7, custom_barcode),
        min_quantity = COALESCE($8, min_quantity),
        unit = COALESCE($9, unit),
        purchase_price = $10,
        supplier = $11,
        notes = $12,
        image_url = $13,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [
      id, name, description, category_id, location_id,
      ean_code, custom_barcode, min_quantity, unit,
      purchase_price, supplier, notes, image_url
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    broadcast({ type: 'item_updated', item: result.rows[0] });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/items/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE items SET active = false WHERE id = $1', [id]);
    broadcast({ type: 'item_deleted', id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ========================================
// STOCK MOVEMENTS (Ein-/Ausgang)
// ========================================

app.post('/api/items/:id/stock', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { type, quantity, reason } = req.body;

    if (!['in', 'out', 'correction', 'inventory'].includes(type)) {
      return res.status(400).json({ error: 'Invalid transaction type' });
    }

    // Get current quantity
    const itemResult = await pool.query('SELECT quantity FROM items WHERE id = $1', [id]);
    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const previousQuantity = itemResult.rows[0].quantity;
    let newQuantity: number;

    if (type === 'in') {
      newQuantity = previousQuantity + quantity;
    } else if (type === 'out') {
      newQuantity = previousQuantity - quantity;
      if (newQuantity < 0) {
        return res.status(400).json({ error: 'Insufficient stock' });
      }
    } else {
      // correction or inventory
      newQuantity = quantity;
    }

    // Update item
    await pool.query('UPDATE items SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newQuantity, id]);

    // Log transaction
    const transResult = await pool.query(`
      INSERT INTO transactions (item_id, type, quantity, previous_quantity, new_quantity, reason, user_email)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [id, type, quantity, previousQuantity, newQuantity, reason, req.user?.email]);

    broadcast({ type: 'stock_updated', item_id: id, new_quantity: newQuantity });

    res.json({
      transaction: transResult.rows[0],
      new_quantity: newQuantity
    });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Quick stock update by barcode
app.post('/api/stock/scan', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { barcode, type, quantity, reason } = req.body;

    // Find item by barcode
    const itemResult = await pool.query(`
      SELECT id, quantity FROM items
      WHERE (ean_code = $1 OR custom_barcode = $1) AND active = true
    `, [barcode]);

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found', barcode });
    }

    const item = itemResult.rows[0];
    const previousQuantity = item.quantity;
    let newQuantity: number;

    if (type === 'in') {
      newQuantity = previousQuantity + (quantity || 1);
    } else if (type === 'out') {
      newQuantity = previousQuantity - (quantity || 1);
      if (newQuantity < 0) {
        return res.status(400).json({ error: 'Insufficient stock' });
      }
    } else {
      newQuantity = quantity;
    }

    await pool.query('UPDATE items SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newQuantity, item.id]);

    await pool.query(`
      INSERT INTO transactions (item_id, type, quantity, previous_quantity, new_quantity, reason, user_email)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [item.id, type, quantity || 1, previousQuantity, newQuantity, reason || 'Barcode scan', req.user?.email]);

    broadcast({ type: 'stock_updated', item_id: item.id, new_quantity: newQuantity });

    res.json({ item_id: item.id, previous: previousQuantity, new_quantity: newQuantity });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ========================================
// TRANSACTIONS HISTORY
// ========================================

app.get('/api/transactions', async (req, res) => {
  try {
    const { item_id, limit } = req.query;

    let query = `
      SELECT t.*, i.name as item_name, i.custom_barcode, i.ean_code
      FROM transactions t
      JOIN items i ON t.item_id = i.id
    `;
    const params: any[] = [];

    if (item_id) {
      params.push(item_id);
      query += ` WHERE t.item_id = $${params.length}`;
    }

    query += ' ORDER BY t.created_at DESC';

    if (limit) {
      params.push(limit);
      query += ` LIMIT $${params.length}`;
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ========================================
// BARCODE GENERATION
// ========================================

app.get('/api/barcode/generate/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const { type = 'code128', scale = 2, height = 10 } = req.query;

    const png = await bwipjs.toBuffer({
      bcid: type as string,
      text: code,
      scale: Number(scale),
      height: Number(height),
      includetext: true,
      textxalign: 'center',
    });

    res.setHeader('Content-Type', 'image/png');
    res.send(png);
  } catch (error) {
    res.status(500).json({ error: 'Barcode generation failed' });
  }
});

// Generate next custom barcode
app.get('/api/barcode/next', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT last_number FROM barcode_counter WHERE id = 1');
    const nextNumber = result.rows[0].last_number + 1;
    const nextCode = `FWV${String(nextNumber).padStart(6, '0')}`;
    res.json({ next_code: nextCode });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ========================================
// REPORTS
// ========================================

app.get('/api/reports/low-stock', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT i.*, c.name as category_name, l.name as location_name
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.id
      LEFT JOIN locations l ON i.location_id = l.id
      WHERE i.quantity <= i.min_quantity AND i.active = true
      ORDER BY (i.quantity - i.min_quantity) ASC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/reports/inventory-value', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        SUM(quantity * COALESCE(purchase_price, 0)) as total_value,
        COUNT(*) as total_items,
        SUM(quantity) as total_units
      FROM items
      WHERE active = true
    `);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ========================================
// SYNC API (für Raspberry Pi <-> Server Sync)
// ========================================

const SYNC_SECRET = process.env.SYNC_SECRET || 'inventory-sync-secret';

// Middleware for sync authentication
function authenticateSync(req: express.Request, res: express.Response, next: express.NextFunction) {
  const syncKey = req.headers['x-sync-key'];
  if (syncKey !== SYNC_SECRET) {
    return res.status(401).json({ error: 'Invalid sync key' });
  }
  next();
}

// Export all data for initial sync
app.get('/api/sync/export', authenticateSync, async (req, res) => {
  try {
    const categories = await pool.query('SELECT * FROM categories');
    const locations = await pool.query('SELECT * FROM locations');
    const items = await pool.query('SELECT * FROM items');
    const transactions = await pool.query('SELECT * FROM transactions ORDER BY created_at DESC LIMIT 1000');
    const counter = await pool.query('SELECT * FROM barcode_counter');

    res.json({
      timestamp: new Date().toISOString(),
      data: {
        categories: categories.rows,
        locations: locations.rows,
        items: items.rows,
        transactions: transactions.rows,
        barcode_counter: counter.rows[0]
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Export failed' });
  }
});

// Get changes since timestamp
app.get('/api/sync/changes', authenticateSync, async (req, res) => {
  try {
    const { since } = req.query;
    const sinceDate = since ? new Date(since as string) : new Date(0);

    const items = await pool.query(
      'SELECT * FROM items WHERE updated_at > $1',
      [sinceDate]
    );

    const transactions = await pool.query(
      'SELECT * FROM transactions WHERE created_at > $1 ORDER BY created_at',
      [sinceDate]
    );

    res.json({
      timestamp: new Date().toISOString(),
      since: sinceDate.toISOString(),
      changes: {
        items: items.rows,
        transactions: transactions.rows
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get changes' });
  }
});

// Push changes from Raspberry to Server
app.post('/api/sync/push', authenticateSync, async (req, res) => {
  try {
    const { items, transactions, categories, locations } = req.body;
    const results = { items: 0, transactions: 0, categories: 0, locations: 0 };

    // Sync categories
    if (categories && categories.length > 0) {
      for (const cat of categories) {
        await pool.query(`
          INSERT INTO categories (id, name, description, created_at)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (id) DO UPDATE SET name = $2, description = $3
        `, [cat.id, cat.name, cat.description, cat.created_at]);
        results.categories++;
      }
    }

    // Sync locations
    if (locations && locations.length > 0) {
      for (const loc of locations) {
        await pool.query(`
          INSERT INTO locations (id, name, description, created_at)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (id) DO UPDATE SET name = $2, description = $3
        `, [loc.id, loc.name, loc.description, loc.created_at]);
        results.locations++;
      }
    }

    // Sync items (upsert based on custom_barcode or id)
    if (items && items.length > 0) {
      for (const item of items) {
        await pool.query(`
          INSERT INTO items (
            id, name, description, category_id, location_id,
            ean_code, custom_barcode, quantity, min_quantity, unit,
            purchase_price, supplier, notes, image_url, active, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          ON CONFLICT (id) DO UPDATE SET
            name = $2, description = $3, category_id = $4, location_id = $5,
            ean_code = $6, quantity = $8, min_quantity = $9, unit = $10,
            purchase_price = $11, supplier = $12, notes = $13, image_url = $14,
            active = $15, updated_at = $17
        `, [
          item.id, item.name, item.description, item.category_id, item.location_id,
          item.ean_code, item.custom_barcode, item.quantity, item.min_quantity, item.unit,
          item.purchase_price, item.supplier, item.notes, item.image_url, item.active,
          item.created_at, item.updated_at
        ]);
        results.items++;
      }
    }

    // Sync transactions
    if (transactions && transactions.length > 0) {
      for (const trans of transactions) {
        await pool.query(`
          INSERT INTO transactions (id, item_id, type, quantity, previous_quantity, new_quantity, reason, user_email, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO NOTHING
        `, [trans.id, trans.item_id, trans.type, trans.quantity, trans.previous_quantity, trans.new_quantity, trans.reason, trans.user_email, trans.created_at]);
        results.transactions++;
      }
    }

    res.json({ success: true, synced: results });
  } catch (error: any) {
    console.error('Sync push error:', error);
    res.status(500).json({ error: 'Sync failed', details: error.message });
  }
});

// ========================================
// START SERVER
// ========================================

const PORT = Number(process.env.PORT) || 3000;

initDB().then(() => {
  server.listen(PORT, () => {
    console.log(`Inventory API running on port ${PORT}`);
    console.log(`Mode: ${getAuthMode().local ? 'LOCAL' : 'ONLINE'}`);
  });
});
