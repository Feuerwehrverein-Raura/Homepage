# 💳 Payment Integration Guide

## Übersicht

Das Order System unterstützt **drei Zahlungsmethoden**:

1. **Bar-Zahlung** - Klassisch an der Kasse
2. **SumUp** - Kartenzahlung (Visa, Mastercard, etc.)
3. **TWINT** - Mobile Payment via RaiseNow

## 🏦 Zahlungsablauf

### 1. Bestellung erstellen
```
Kunde wählt Artikel → Warenkorb → "Bestellung senden"
```

### 2. Zahlungsmethode wählen
```
Dialog erscheint:
- OK: Online bezahlen (SumUp/TWINT)
- Abbrechen: Bar bezahlen
```

### 3a. Bar-Zahlung
```
- Bon wird gedruckt
- Kellner kassiert direkt am Tisch
- Bestellung abgeschlossen
```

### 3b. Online-Zahlung
```
Provider wählen:
  1 = SumUp (Karte)
  2 = TWINT

→ Zahlung wird initiiert
→ QR-Code/Link öffnet sich
→ Kunde bezahlt
→ Webhook bestätigt Zahlung
→ Bestellung als "bezahlt" markiert
```

## 🔧 Setup

### Voraussetzungen

- SumUp Account ([developer.sumup.com](https://developer.sumup.com))
- RaiseNow Hub Account ([raisenow.com](https://raisenow.com))

### 1. SumUp einrichten

#### a) Account erstellen
1. Bei [SumUp](https://me.sumup.com/developers) registrieren
2. Test-Account in Dashboard erstellen
3. API-Key generieren

#### b) API-Key erhalten
```bash
# In SumUp Dashboard:
Settings → API Keys → Create API Key

# Kopiere:
- API Key (sk_test_... für Test, sk_live_... für Production)
- Merchant Code
```

#### c) In .env eintragen
```bash
SUMUP_API_KEY=sk_test_xxxxxxxxxxxx
SUMUP_MERCHANT_CODE=MXXXXXXXXX
SUMUP_BASE_URL=https://api.sumup.com/v0.1
```

#### d) Webhook konfigurieren
```bash
# In SumUp Dashboard:
Webhooks → Add Webhook

URL: https://your-domain.com/api/webhooks/sumup
Events: checkout.completed, checkout.failed
```

### 2. RaiseNow/TWINT einrichten

#### a) Account erstellen
1. Bei [RaiseNow Hub](https://raisenow.com) registrieren
2. Verifizierungsdokumente hochladen (Statuten, etc.)
3. TWINT aktivieren (Settings → Payment Providers)

#### b) Touchpoint Solution erstellen
```bash
# In RaiseNow Hub:
Touchpoint Solutions → Create New → TWINT Donate/PayPlus

# Konfiguration:
- Name: "Vereinsfest Bestellungen"
- Payment Methods: TWINT
- Amount: Variable
```

#### c) API-Credentials erhalten
```bash
# In RaiseNow Hub:
Settings → API Access → Create Credentials

# Kopiere:
- API Key
- API Secret
- Touchpoint ID
- Webhook Secret
```

#### d) In .env eintragen
```bash
RAISENOW_API_KEY=your-api-key
RAISENOW_API_SECRET=your-api-secret
RAISENOW_BASE_URL=https://api.raisenow.com/v1
RAISENOW_TOUCHPOINT_ID=your-touchpoint-id
RAISENOW_WEBHOOK_SECRET=your-webhook-secret
```

#### e) Webhook konfigurieren
```bash
# In RaiseNow Hub:
Settings → Webhooks → Add Webhook

URL: https://your-domain.com/api/webhooks/raisenow
Events: transaction.success, transaction.failed
```

## 📊 Zahlungsdatenbank

### Payments Tabelle

```sql
CREATE TABLE payments (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  provider VARCHAR(50),          -- 'sumup' | 'raisenow' | 'cash'
  payment_id VARCHAR(255),        -- External payment ID
  payment_url TEXT,               -- Payment link
  qr_code_url TEXT,               -- QR code URL (TWINT)
  amount DECIMAL(10, 2),
  currency VARCHAR(3) DEFAULT 'CHF',
  status VARCHAR(50),             -- 'pending' | 'completed' | 'failed'
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

## 🔌 API Endpoints

### Zahlung erstellen
```bash
POST /api/payments/create

Body:
{
  "orderId": 123,
  "provider": "sumup" | "twint" | "raisenow"
}

Response:
{
  "id": 1,
  "order_id": 123,
  "provider": "twint",
  "payment_url": "https://pay.raisenow.com/...",
  "qr_code_url": "https://qr.raisenow.com/...",
  "amount": 45.50,
  "currency": "CHF",
  "status": "pending"
}
```

### Zahlungen abrufen
```bash
GET /api/payments/order/:orderId

Response:
[
  {
    "id": 1,
    "order_id": 123,
    "provider": "twint",
    "status": "completed",
    ...
  }
]
```

### Webhooks

#### SumUp Webhook
```bash
POST /api/webhooks/sumup

Body:
{
  "id": "checkout-id",
  "status": "PAID",
  "checkout_reference": "123",
  "amount": 45.50
}
```

#### RaiseNow Webhook
```bash
POST /api/webhooks/raisenow

Headers:
X-RaiseNow-Signature: sha256-signature

Body:
{
  "event_type": "transaction.success",
  "transaction": {
    "reference": "order-123",
    "status": "completed",
    "amount": 4550  // In cents
  }
}
```

## 🧪 Testing

### SumUp Test-Karten

```
Card Number: 4242 4242 4242 4242
Expiry: 12/26
CVV: 123
3DS: Erfolgreich
```

### TWINT Test

```
# Test-Umgebung:
- Verwende TWINT Test-App
- QR-Codes funktionieren in Test-Umgebung
```

### Lokales Testen

```bash
# Webhooks lokal testen mit ngrok:
ngrok http 3000

# Webhook-URLs aktualisieren:
https://xxxx.ngrok.io/api/webhooks/sumup
https://xxxx.ngrok.io/api/webhooks/raisenow
```

## 💰 Kosten

### SumUp
- **Pro Transaktion**: 1.95% + CHF 0.25
- **Keine monatlichen Gebühren**
- **Keine Einrichtungsgebühren**

### RaiseNow/TWINT
- **Free Plan**: 2.5% pro Transaktion (ohne TWINT Recurring)
- **Growth Plan**: 1.9% pro Transaktion (inkl. TWINT Recurring)
- **Keine Setup-Gebühren**

### Bar
- **Kostenlos** 😊

## 🔒 Sicherheit

### Best Practices

1. ✅ **API-Keys niemals committen**
2. ✅ **Webhook-Signatures immer verifizieren**
3. ✅ **HTTPS in Produktion verwenden**
4. ✅ **Sensitive Logs vermeiden**
5. ✅ **Payment-Status server-seitig validieren**

### PCI DSS Compliance

- ✅ SumUp ist PCI DSS Level 1 zertifiziert
- ✅ Keine Kartendaten werden im System gespeichert
- ✅ Alle Kartendaten werden direkt bei SumUp verarbeitet
- ✅ TWINT ist ebenfalls PCI-compliant

## 📱 Mobile Integration

### QR-Codes für TWINT

```typescript
// QR-Code wird automatisch generiert
const payment = await paymentService.createPayment(
  paymentRequest,
  'twint'
);

// payment.qr_code_url enthält QR-Code
// Als Bild anzeigen oder zum Scannen öffnen
```

### SumUp Terminal Integration

```bash
# Für physisches SumUp Terminal:
# Verwende SumUp Cloud API mit Solo Reader

# Pairing:
POST https://api.sumup.com/v0.1/readers/pair
Body: { "pairing_code": "12345" }

# Payment initiieren:
POST https://api.sumup.com/v0.1/checkouts
Body: {
  "amount": 45.50,
  "currency": "CHF",
  "reader_id": "reader-id-from-pairing"
}
```

## 🎯 Best Practices für Vereinsfeste

### Empfohlenes Setup

**Für kleinere Feste (< 100 Gäste):**
- Bar-Zahlung als Standard
- TWINT als zusätzliche Option
- Ein SumUp-Terminal für Kartenzahlung

**Für größere Feste (> 100 Gäste):**
- Bar + TWINT + SumUp
- QR-Codes auf Tischen für TWINT
- Mehrere SumUp-Terminals
- Live Kitchen Display

### Workflow-Optimierung

1. **Bestellung aufnehmen** → Kellner mit Tablet
2. **Zahlung wählen** → Kunde entscheidet
3. **Bei TWINT** → QR-Code zeigen, Kunde scannt
4. **Bei Karte** → SumUp-Terminal verwenden
5. **Bei Bar** → Kellner kassiert
6. **Bon drucken** → An Küche/Bar

## 🆘 Troubleshooting

### SumUp-Fehler

**"Invalid API Key"**
```bash
# Prüfe:
- API Key in .env korrekt?
- Ist es ein Test-Key (sk_test_) oder Live-Key (sk_live_)?
- Richtige Base-URL?
```

**"Checkout expired"**
```bash
# Checkouts ablaufen nach 15 Minuten
# Neue Zahlung initiieren
```

### TWINT-Fehler

**"QR-Code nicht scannbar"**
```bash
# Prüfe:
- Touchpoint ID korrekt?
- TWINT in RaiseNow aktiviert?
- QR-Code-URL valide?
```

**"Webhook nicht empfangen"**
```bash
# Prüfe:
- Webhook-URL öffentlich erreichbar?
- HTTPS aktiviert?
- Webhook-Secret korrekt?
```

## 📚 Weitere Ressourcen

- [SumUp Developer Docs](https://developer.sumup.com)
- [RaiseNow Knowledge Base](https://support.raisenow.com)
- [TWINT Technical Docs](https://www.twint.ch/business)

## 👥 Support

- **Technische Fragen**: webmaster@fwv-raura.ch
- **SumUp Support**: integration@sumup.com
- **RaiseNow Support**: support@raisenow.com

---

**Made with ❤️ for Feuerwehrverein Raura Kaiseraugst**
