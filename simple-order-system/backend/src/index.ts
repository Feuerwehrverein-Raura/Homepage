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
const wss = new WebSocketServer({ server });

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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
      item_id INTEGER REFERENCES items(id),
      quantity INTEGER NOT NULL,
      price DECIMAL(10, 2) NOT NULL,
      notes TEXT
    )
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

// Inventory API integration
const INVENTORY_API_URL = process.env.INVENTORY_API_URL || 'http://inventory-backend:3000';
const ORDER_API_KEY = process.env.ORDER_API_KEY || 'order-system-secret';

// Routes: Items (from Inventory or local)
app.get('/api/items', async (req, res) => {
  try {
    let allItems: any[] = [];

    // Fetch local items first
    const localResult = await pool.query(
      'SELECT * FROM items WHERE active = true ORDER BY category, name'
    );
    const localItems = localResult.rows.map((item: any) => ({
      ...item,
      source: 'local',
      price: parseFloat(item.price)
    }));
    allItems = [...localItems];

    // Also fetch from inventory system if enabled
    if (process.env.USE_INVENTORY_API === 'true') {
      try {
        const response = await fetch(`${INVENTORY_API_URL}/api/items/sellable`);
        if (response.ok) {
          const inventoryItems = await response.json() as any[];
          // Map inventory items to order system format with prefixed ID to avoid conflicts
          const mappedInventoryItems = inventoryItems.map((item) => ({
            id: `inv_${item.id}`,
            name: item.name,
            price: parseFloat(item.price),
            category: item.category,
            printer_station: item.printer_station,
            stock: item.stock,
            source: 'inventory',
            inventory_id: item.id
          }));
          allItems = [...allItems, ...mappedInventoryItems];
        }
      } catch (inventoryError) {
        console.error('Inventory API error:', inventoryError);
      }
    }

    // Sort by category then name
    allItems.sort((a, b) => {
      if (a.category !== b.category) {
        return (a.category || '').localeCompare(b.category || '');
      }
      return a.name.localeCompare(b.name);
    });

    res.json(allItems);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Admin routes for items - require authentication
app.post('/api/items', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, price, category, printer_station } = req.body;

    // If inventory API is enabled, create item there as sellable
    if (process.env.USE_INVENTORY_API === 'true') {
      try {
        // Use API key authentication for server-to-server communication
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
          // Return in order system format
          return res.json({
            id: `inv_${inventoryItem.id}`,
            name: inventoryItem.name,
            price: inventoryItem.sale_price,
            category: inventoryItem.sale_category,
            printer_station: inventoryItem.printer_station,
            source: 'inventory',
            inventory_id: inventoryItem.id
          });
        } else {
          const error = await response.json() as any;
          console.error('Inventory API error:', error);
          return res.status(response.status).json({ error: error.error || 'Failed to create item in inventory' });
        }
      } catch (inventoryError) {
        console.error('Inventory API error:', inventoryError);
        return res.status(500).json({ error: 'Failed to connect to inventory system' });
      }
    }

    // Fallback: create locally
    const result = await pool.query(
      'INSERT INTO items (name, price, category, printer_station) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, price, category, printer_station]
    );
    res.json({ ...result.rows[0], source: 'local' });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/items/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { name, price, category, printer_station, active } = req.body;
    const result = await pool.query(
      'UPDATE items SET name = $1, price = $2, category = $3, printer_station = $4, active = $5 WHERE id = $6 RETURNING *',
      [name, price, category, printer_station, active, id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/items/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    // Check if this is an inventory item (prefixed with inv_)
    if (id.startsWith('inv_')) {
      const inventoryId = id.replace('inv_', '');
      const response = await fetch(`${INVENTORY_API_URL}/api/items/${inventoryId}`, {
        method: 'DELETE',
        headers: {
          'X-Order-API-Key': ORDER_API_KEY
        }
      });

      if (response.ok) {
        return res.json({ success: true });
      } else {
        return res.status(response.status).json({ error: 'Failed to delete from inventory' });
      }
    }

    // Local item
    await pool.query('UPDATE items SET active = false WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Routes: Orders
app.get('/api/orders', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT o.*, 
        json_agg(
          json_build_object(
            'id', oi.id,
            'item_name', i.name,
            'quantity', oi.quantity,
            'price', oi.price,
            'notes', oi.notes,
            'printer_station', i.printer_station
          )
        ) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN items i ON oi.item_id = i.id
      WHERE o.status = 'pending'
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/orders', async (req, res) => {
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

    // Add order items
    for (const item of items) {
      await client.query(
        'INSERT INTO order_items (order_id, item_id, quantity, price, notes) VALUES ($1, $2, $3, $4, $5)',
        [order.id, item.id, item.quantity, item.price, item.notes || null]
      );
    }

    await client.query('COMMIT');

    // Reduce inventory stock if using inventory API
    if (process.env.USE_INVENTORY_API === 'true') {
      try {
        const inventoryItems = items
          .filter((item: any) => item.source === 'inventory')
          .map((item: any) => ({ id: item.id, quantity: item.quantity }));

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
    }

    // Print receipt
    try {
      await printReceipt(order.id, table_number, items);
    } catch (printError) {
      console.error('Print error:', printError);
    }

    // Broadcast to kitchen display
    broadcast({ type: 'new_order', order: { ...order, items } });

    res.json(order);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

// Get open orders for a specific table
app.get('/api/orders/open/:tableNumber', async (req, res) => {
  try {
    const { tableNumber } = req.params;
    const result = await pool.query(`
      SELECT o.*,
        json_agg(
          json_build_object(
            'id', oi.id,
            'item_name', i.name,
            'quantity', oi.quantity,
            'price', oi.price,
            'notes', oi.notes,
            'printer_station', i.printer_station
          )
        ) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN items i ON oi.item_id = i.id
      WHERE o.status = 'pending' AND o.table_number = $1
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `, [tableNumber]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Add items to an existing order
app.post('/api/orders/:id/items', async (req, res) => {
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

    // Add order items
    for (const item of items) {
      await client.query(
        'INSERT INTO order_items (order_id, item_id, quantity, price, notes) VALUES ($1, $2, $3, $4, $5)',
        [id, item.id, item.quantity, item.price, item.notes || null]
      );
    }

    // Update order total
    const newTotal = parseFloat(order.total) + additionalTotal;
    await client.query(
      'UPDATE orders SET total = $1 WHERE id = $2',
      [newTotal, id]
    );

    await client.query('COMMIT');

    // Reduce inventory stock if using inventory API
    if (process.env.USE_INVENTORY_API === 'true') {
      try {
        const inventoryItems = items
          .filter((item: any) => item.source === 'inventory')
          .map((item: any) => ({ id: item.id, quantity: item.quantity }));

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
    }

    // Print receipt for additional items
    try {
      await printReceipt(parseInt(id), order.table_number, items);
    } catch (printError) {
      console.error('Print error:', printError);
    }

    // Broadcast update
    broadcast({ type: 'order_updated', order_id: id });

    res.json({ success: true, total: newTotal });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Add items error:', error);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

app.patch('/api/orders/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(
      'UPDATE orders SET status = $1 WHERE id = $2',
      ['completed', id]
    );
    broadcast({ type: 'order_completed', order_id: id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Update order status with payment method
app.put('/api/orders/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, payment_method } = req.body;

    await pool.query(
      'UPDATE orders SET status = $1, payment_method = $2 WHERE id = $3',
      [status || 'paid', payment_method || null, id]
    );

    broadcast({ type: 'order_updated', order_id: id, status, payment_method });
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
            'item_name', COALESCE(i.name, 'Unbekannt'),
            'quantity', oi.quantity,
            'price', oi.price,
            'notes', oi.notes
          )
        ) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN items i ON oi.item_id = i.id
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
        COALESCE(i.name, 'Sonderposten') as name,
        SUM(oi.quantity) as total_sold,
        SUM(oi.quantity * oi.price) as total_revenue
      FROM order_items oi
      LEFT JOIN items i ON oi.item_id = i.id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.created_at >= $1 AND o.created_at < $2
      GROUP BY i.name
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
        COALESCE(i.name, 'Sonderposten') as name,
        SUM(oi.quantity) as total_sold,
        SUM(oi.quantity * oi.price) as total_revenue
      FROM order_items oi
      LEFT JOIN items i ON oi.item_id = i.id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.created_at >= $1 AND o.created_at < $2
      GROUP BY i.name
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
