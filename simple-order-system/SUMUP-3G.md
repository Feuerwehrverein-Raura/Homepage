# 📱 SumUp 3G Terminal Integration

## Übersicht

Das **SumUp 3G** ist ein mobiles Kartenterminal mit WLAN/3G/4G Verbindung. Es kann über die **Cloud API** direkt vom Order System angesteuert werden.

## Vorteile Cloud API

✅ **Remote Payment** - Terminal muss nicht am selben Ort sein  
✅ **Multi-Device** - Mehrere Tablets können dasselbe Terminal nutzen  
✅ **Web-basiert** - Keine App-Installation nötig  
✅ **Echtzeit** - Sofortige Bestätigung über Webhooks  

## Setup

### 1. SumUp 3G vorbereiten

#### Terminal mit WLAN verbinden
```
1. Terminal einschalten
2. Seitliches Menü öffnen
3. "Einstellungen" → "WLAN"
4. Netzwerk auswählen und verbinden
```

#### Terminal für Cloud API vorbereiten
```
1. Seitliches Menü öffnen
2. "API" auswählen
3. Falls eingeloggt: "Disconnect" drücken
4. Terminal zeigt jetzt Pairing-Code (4-stellig)
```

### 2. Terminal mit Account pairen

#### API-Zugriff einrichten

**Wichtig:** Cloud API benötigt ein **Affiliate Key**!

1. Gehe zu https://me.sumup.com/developers
2. Erstelle eine neue Application:
   - Name: "FWV Raura Order System"
   - Type: "Terminal Payment"
   - Platform: "Web"
3. Kopiere das **Affiliate Key** (z.B. `7ca84f17-...`)

#### Terminal pairen

```bash
# Via API pairen
curl -X POST https://api.sumup.com/v0.1/readers/pair \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "pairing_code": "1234"
  }'

# Response:
{
  "reader_id": "TMXXXXXXXXX",
  "name": "SumUp 3G",
  "status": "online"
}
```

**Reader ID speichern!** Diese brauchst du für Zahlungen.

### 3. Environment Variables

```bash
# .env
SUMUP_API_KEY=sk_live_xxxxxxxxxxxxx
SUMUP_MERCHANT_CODE=MXXXXXXXXX
SUMUP_AFFILIATE_KEY=7ca84f17-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SUMUP_READER_ID=TMXXXXXXXXX
SUMUP_BASE_URL=https://api.sumup.com/v0.1
```

## Payment Flow mit SumUp 3G

### Ablauf

```
1. Bestellung erstellen
2. "SumUp" als Zahlungsmethode wählen
3. System sendet Zahlung an Terminal
4. Terminal zeigt Betrag an
5. Kunde hält Karte ans Terminal
6. Terminal verarbeitet Zahlung
7. Webhook bestätigt Zahlung
8. Order Status → "paid"
```

### Implementierung

Die Payment-Integration ist bereits vorbereitet! Hier die Erweiterung für dein 3G Terminal:

```typescript
// backend/src/payments.ts - Erweitert

/**
 * Send payment to SumUp 3G Terminal (Cloud API)
 */
async createTerminalCheckout(payment: PaymentRequest): Promise<any> {
  try {
    const response = await fetch(`${this.baseUrl}/checkouts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        checkout_reference: payment.orderId,
        amount: payment.amount,
        currency: payment.currency,
        merchant_code: this.merchantCode,
        description: payment.description,
        
        // Cloud API specific für 3G Terminal
        reader_id: process.env.SUMUP_READER_ID,
        affiliate_key: process.env.SUMUP_AFFILIATE_KEY,
      }),
    });

    if (!response.ok) {
      throw new Error(`SumUp API error: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Terminal zeigt jetzt Zahlung an!
    console.log(`Zahlung an Terminal ${process.env.SUMUP_READER_ID} gesendet`);
    
    return data;
  } catch (error) {
    console.error('SumUp Terminal checkout error:', error);
    throw error;
  }
}
```

## Terminal-Status prüfen

```bash
# Ist Terminal online?
curl -X GET https://api.sumup.com/v0.1/readers/TMXXXXXXXXX \
  -H "Authorization: Bearer YOUR_API_KEY"

# Response:
{
  "reader_id": "TMXXXXXXXXX",
  "status": "online",      # online | offline | busy
  "battery_level": 85,
  "last_seen": "2026-01-23T10:30:00Z"
}
```

## Frontend-Integration

### Option 1: Direkt an Terminal senden

```typescript
// Frontend sendet direkt an Terminal
const createTerminalPayment = async (orderId: number, amount: number) => {
  const res = await fetch('/api/payments/terminal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId,
      amount,
      provider: 'sumup-terminal'
    })
  });
  
  const payment = await res.json();
  
  alert(
    `Zahlung an Terminal gesendet!\n\n` +
    `Betrag: CHF ${amount.toFixed(2)}\n\n` +
    `Bitte Karte ans Terminal halten.`
  );
  
  // Status polling
  pollPaymentStatus(payment.id);
};

const pollPaymentStatus = async (paymentId: string) => {
  const interval = setInterval(async () => {
    const res = await fetch(`/api/payments/status/${paymentId}`);
    const data = await res.json();
    
    if (data.status === 'completed') {
      clearInterval(interval);
      alert('✅ Zahlung erfolgreich!');
      window.location.reload();
    } else if (data.status === 'failed') {
      clearInterval(interval);
      alert('❌ Zahlung fehlgeschlagen');
    }
  }, 2000); // Check alle 2 Sekunden
};
```

### Option 2: QR-Code für Terminal

```typescript
// Generiere QR-Code mit Payment-Info
const generateTerminalQR = (checkoutId: string) => {
  const qrData = `sumup://checkout/${checkoutId}`;
  
  // QR-Code generieren (z.B. mit qrcode library)
  return qrData;
};

// Kunde scannt QR mit SumUp App → öffnet Zahlung
```

## Backend Routes

```typescript
// backend/src/index.ts - Neue Routes

// Terminal-Zahlung initiieren
app.post('/api/payments/terminal', async (req, res) => {
  try {
    const { orderId, amount } = req.body;
    
    // Prüfe Terminal-Status
    const terminalStatus = await checkTerminalStatus();
    
    if (terminalStatus !== 'online') {
      return res.status(503).json({ 
        error: 'Terminal offline',
        message: 'Das SumUp 3G Terminal ist nicht verfügbar.'
      });
    }
    
    // Sende Zahlung an Terminal
    const checkout = await paymentService.sumup.createTerminalCheckout({
      orderId: orderId.toString(),
      amount,
      currency: 'CHF',
      tableNumber: req.body.tableNumber,
      description: `Tisch ${req.body.tableNumber} - Bestellung #${orderId}`
    });
    
    // Speichere in DB
    const payment = await pool.query(
      `INSERT INTO payments (order_id, provider, payment_id, amount, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [orderId, 'sumup-terminal', checkout.id, amount, 'pending']
    );
    
    res.json(payment.rows[0]);
  } catch (error) {
    console.error('Terminal payment error:', error);
    res.status(500).json({ error: 'Terminal-Zahlung fehlgeschlagen' });
  }
});

// Terminal-Status abrufen
app.get('/api/terminal/status', async (req, res) => {
  try {
    const status = await checkTerminalStatus();
    res.json({ 
      status,
      reader_id: process.env.SUMUP_READER_ID 
    });
  } catch (error) {
    res.status(500).json({ error: 'Status nicht verfügbar' });
  }
});

async function checkTerminalStatus(): Promise<string> {
  const response = await fetch(
    `https://api.sumup.com/v0.1/readers/${process.env.SUMUP_READER_ID}`,
    {
      headers: {
        'Authorization': `Bearer ${process.env.SUMUP_API_KEY}`
      }
    }
  );
  
  const data = await response.json();
  return data.status; // 'online' | 'offline' | 'busy'
}
```

## Troubleshooting

### Terminal zeigt "Disconnected"

```bash
# Lösung 1: Neu verbinden
1. Terminal: Seitliches Menü → API → Connect
2. Pairing-Code notieren
3. Terminal neu pairen (siehe Setup)

# Lösung 2: WLAN prüfen
1. Terminal: Einstellungen → WLAN
2. Netzwerk neu verbinden

# Lösung 3: Terminal neu starten
1. Terminal ausschalten
2. 10 Sekunden warten
3. Wieder einschalten
```

### "Reader not found" Error

```bash
# Reader ID prüfen
curl -X GET https://api.sumup.com/v0.1/readers \
  -H "Authorization: Bearer YOUR_API_KEY"

# Gibt alle gepairten Terminals aus
# Richtige Reader ID in .env eintragen
```

### Zahlung hängt bei "pending"

```bash
# Terminal-Status prüfen
curl -X GET https://api.sumup.com/v0.1/readers/TMXXXXXXXXX \
  -H "Authorization: Bearer YOUR_API_KEY"

# Falls "busy": Terminal ist beschäftigt
# Falls "offline": Terminal ist nicht verbunden

# Zahlung abbrechen:
curl -X DELETE https://api.sumup.com/v0.1/checkouts/CHECKOUT_ID \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Terminal-Akku leer

```
→ Lade das Terminal regelmäßig auf!
→ Cloud API funktioniert nur bei geladenem Terminal
→ Mindestens 20% Akkustand empfohlen
```

## Best Practices

### 1. Terminal-Monitoring

```typescript
// Prüfe Terminal-Status alle 30 Sekunden
setInterval(async () => {
  const status = await fetch('/api/terminal/status');
  const data = await status.json();
  
  if (data.status !== 'online') {
    console.warn('⚠️ SumUp Terminal offline!');
    // Zeige Warnung im UI
  }
}, 30000);
```

### 2. Fallback-Optionen

```typescript
// Wenn Terminal offline, zeige alternative Methoden
if (terminalStatus === 'offline') {
  showAlternatives(['twint', 'bar']);
}
```

### 3. Timeout-Handling

```typescript
// Nach 2 Minuten automatisch abbrechen
const paymentTimeout = setTimeout(() => {
  cancelPayment(checkoutId);
  alert('Zahlung abgebrochen - Timeout');
}, 120000);
```

## Hardware-Tipps

### SumUp 3G Pflege

✅ **Regelmäßig aufladen** (USB-C)  
✅ **WLAN stabil halten** (5 GHz bevorzugt)  
✅ **Firmware aktuell halten**  
✅ **Vor Event testen**  

### Empfohlenes Setup

```
[Bestelltablet] --WiFi--> [Backend] --Cloud API--> [SumUp 3G]
                                                      ↓
                                                [Kunde zahlt]
                                                      ↓
                                        [Webhook] --> [Backend]
                                                      ↓
                                              [Order → paid]
```

## Kosten mit SumUp 3G

- **Pro Transaktion**: 1.95% + CHF 0.25
- **Keine monatlichen Gebühren**
- **Keine Mindestgebühren**
- **Keine Vertragskosten**

**Beispiel Chilbi:**
- 100 Bestellungen à CHF 20 = CHF 2000
- Gebühren: (2000 × 0.0195) + (100 × 0.25) = CHF 39 + CHF 25 = **CHF 64**

## Live-Demonstration

1. Terminal einschalten und mit WLAN verbinden
2. Terminal pairen (siehe Setup)
3. Order System starten
4. Testbestellung erstellen
5. "SumUp Terminal" wählen
6. Betrag erscheint auf Terminal
7. Testkarte halten (4242...)
8. ✅ Zahlung erfolgreich!

---

**Bereit für den Einsatz beim nächsten Vereinsfest!** 🔥💳
