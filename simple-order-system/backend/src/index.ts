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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
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

// Routes: Items (Inventory)
app.get('/api/items', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM items WHERE active = true ORDER BY category, name'
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Admin routes for items - require authentication
app.post('/api/items', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, price, category, printer_station } = req.body;
    const result = await pool.query(
      'INSERT INTO items (name, price, category, printer_station) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, price, category, printer_station]
    );
    res.json(result.rows[0]);
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

// Printer function (ESC/POS)
async function printReceipt(orderId: number, tableNumber: number, items: any[]) {
  try {
    // Group items by printer station
    const stations = items.reduce((acc: any, item: any) => {
      const station = item.printer_station || 'bar';
      if (!acc[station]) acc[station] = [];
      acc[station].push(item);
      return acc;
    }, {});

    // For each station, print a receipt
    // Note: This is a simplified version. You'll need to configure actual printers
    for (const [station, stationItems] of Object.entries(stations)) {
      console.log(`\n=== PRINT TO ${station.toUpperCase()} ===`);
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
    
    // TODO: Integrate actual ESC/POS printer
    // Example with escpos library:
    // const device = new escpos.USB();
    // const printer = new escpos.Printer(device);
    // device.open(() => {
    //   printer.text(`Table: ${tableNumber}`)...
    // });
    
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
