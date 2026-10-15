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

### 3. TWINT-QR an der Kasse: pro Anlass (seit Oktober 2026)

Die Kasse zeigt bei TWINT ein QR-Bild. Welches, entscheidet der Anlass:

1. **QR des Anlasses** - Vorstand oder Organisator laden ihn beim Anlass
   hoch (vorstand.html "Anlass bearbeiten" → "TWINT-QR fuer die Kasse",
   oder Mitglieder-App → Anlass bearbeiten). Gespeichert in api-events
   (`PUT/DELETE /events/:id/twint-qr`, Tabelle `event_twint_qr`).
2. Altbestand: ein in den Kassen-Einstellungen hochgeladenes Bild
   (`settings.twint_qr_url`) - gilt nur, solange es gesetzt ist; die
   Oberflaeche bietet den Upload nicht mehr an, nur noch "Entfernen".
3. **Vereins-Standard** `frontend/public/twint-qr.png`.

Welcher Anlass? In den Einstellungen "💳 TWINT und Anlass":
*automatisch* (Standard) oder ein bestimmter Anlass. Automatisch fragt das
Backend api-events (`GET /events/kasse/aktuell`, Header
`X-Order-API-Key`): der Anlass, der gerade laeuft - Beginn - 2 h bis
Ende + 2 h (ohne Ende: Ende des Starttages), Ortszeit Zuerich, nicht
abgesagt/Entwurf/Vorschlag, nicht "Datum offen"; bei mehreren der zuletzt
begonnene.

Backend (`backend/src/anlass.ts`):

| Route | Zweck |
|---|---|
| `GET /api/twint-qr` | `{ url, anlass: {id, titel} \| null, quelle: 'anlass'\|'einstellung'\|'standard', modus }` |
| `GET /api/twint-qr/bild/:eventId` | reicht das Bild von api-events durch (offen wie `/api/uploads/`) |
| `GET /api/anlass` | aktueller Anlass fuer Kopfzeile/Einstellungen |
| `GET /api/anlass/liste` | laufende und kommende Anlaesse (Auswahl) |
| `PUT /api/anlass/auswahl` | `{ event_id }` - `null` = automatisch (`settings.kasse_anlass_id`) |
| `GET /api/orders/history?anlass=<id>\|ohne` | History nach Anlass |
| `GET /api/orders/history/anlaesse` | Anlaesse mit Bestellungen und Umsatz |

Jede neue Bestellung bekommt `event_id` und `event_titel` (Spalten in
`orders`) - spaeter Umsatz pro Anlass. api-events darf die Kasse nie
aufhalten: Ergebnis 60 s gemerkt, Zeitlimit 2,5 s, bei Fehlern der letzte
bekannte Stand bzw. der Vereins-Standard; Bestellungen warten nie (sie
nehmen den gemerkten Stand, aufgefrischt jede Minute im Hintergrund).

Umgebung: `EVENTS_API_URL` (Standard `http://fwv-api-events:3000`, vor
Ort `https://api.fwv-raura.ch`) und `ORDER_API_KEY` (derselbe geteilte
Schluessel, den api-events als `ORDER_API_KEY` kennt).

### 4. TWINT ueber das RaiseNow Digital Terminal (seit Oktober 2026)

Statt des festen QR-Codes kann die Kasse das «Digital Terminal» des
Vereins zeigen (RaiseNow-Touchpoint «TWINT Zahlungen»,
`https://terminal.raisenow.io/swndq`). Das Terminal zeigt nach
«Einkassieren» einen TWINT-QR **mit Betrag** und meldet die Zahlung
sofort. Einen Betrag per URL nimmt es nicht an (getestet: `?amount=`,
`?amount.default=`, `?rnw-amount=` bleiben 0.00; PayLinks gibt es fuer
diesen Touchpoint nicht) - die Kassierin tippt den Betrag dort nochmals
ein.

**Einschalten - pro Geraet:** Einstellungen → «📲 RaiseNow-Terminal für
TWINT» → «Auf diesem Gerät» ankreuzen. Gespeichert im Browser
(`localStorage` `kasse.raisenow_terminal`), Standard **aus**. Andere
Geraete bleiben, wie sie sind - so laesst sich das Terminal auf einem
Geraet ausprobieren, waehrend die Tablets an der Kasse weiter mit dem
festen QR arbeiten. Ist es aus, ist der TWINT-Ablauf unveraendert.

**Terminal-Link - fuer alle Geraete:** im selben Abschnitt,
`settings.raisenow_terminal_url` (Standard
`https://terminal.raisenow.io/swndq`), gespeichert mit «Einstellungen
speichern». Erlaubt ist nur `https://terminal.raisenow.io/<kennung>`
(Backend prueft, `backend/src/raisenow-terminal.ts`).

**Ablauf an der Kasse (Terminal an):**

1. Bestellung senden → TWINT waehlen.
2. Die Kasse zeigt gross «CHF 12.50 im Terminal eintippen», darunter bzw.
   daneben das eingebettete Terminal.
3. Im Terminal den Betrag eintippen → «Einkassieren».
4. Kunde scannt den QR mit TWINT und bestaetigt.
5. Erst wenn das Terminal «Zahlung erfolgreich» zeigt: «Zahlung im
   Terminal bestätigt». Die Bestellung ist bezahlt (`payment_method`
   `twint`).

Ausweichwege:
- «Terminal in neuem Fenster öffnen» - falls die eingebettete Seite auf
  einem Geraet nicht laeuft (z.B. Drittanbieter-Cookies gesperrt). Auf
  Handy-Breite ist der Knopf schwarz und gross.
- Umschalter «Fester QR-Code» - der bisherige Ablauf mit dem QR des
  Anlasses bzw. dem Vereins-Standard (Abschnitt 3).

Geteilte Zahlung (Tische → Bezahlen, Zahlungsart TWINT): gleich, mit dem
Teilbetrag (Alles / Betrag / Artikel); der Knopf heisst
«✓ Zahlung im Terminal bestätigt (CHF …)».

**Was gespeichert wird:** Die Kasse bekommt vom Terminal keine
Rueckmeldung - die Kassierin bestaetigt. Mit `provider:
'raisenow_terminal'` vermerkt das Backend die Zahlung zusaetzlich in
`payments` (`provider = 'raisenow_terminal'`, `status =
'manuell_bestaetigt'`, Betrag):

| Route | Feld |
|---|---|
| `PUT /api/orders/:id/status` | `{ status: 'paid', payment_method: 'twint', provider: 'raisenow_terminal' }` |
| `POST /api/orders/:id/split-payment` | `{ amount, payment_method: 'twint', description, provider: 'raisenow_terminal' }` (Beschreibung mit «(RaiseNow-Terminal)») |
| `GET /api/raisenow-terminal` | `{ url }` - Terminal-Link fuer die Kasse |

`provider` ist nur mit `payment_method: 'twint'` erlaubt, andere Werte
geben 400. Ohne `provider` verhalten sich die Routen wie bisher.

Einbetten: Das Terminal sendet weder `X-Frame-Options` noch CSP
`frame-ancestors`; iframe mit `allow="clipboard-read; clipboard-write;
payment"` und `referrerpolicy="strict-origin"`. Im headless Chrome
(Desktop- und 400-px-Breite) laedt es eingebettet ohne Fehler.

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
