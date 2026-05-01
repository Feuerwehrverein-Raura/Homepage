---
sidebar_position: 6
---

# Accounting API

Base URL: `https://api.fwv-raura.ch`

Buchhaltung mit Kontenplan, Buchungen, Rechnungen und Finanzberichten.

:::info Authentifizierung erforderlich
Alle Endpoints erfordern einen gültigen Bearer Token (Vorstand).
:::

## Kontenplan

### Alle Konten abrufen
```http
GET /accounts
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": 1,
    "number": "1000",
    "name": "Kasse",
    "type": "asset",
    "balance": 1250.00
  },
  {
    "id": 2,
    "number": "3000",
    "name": "Mitgliederbeiträge",
    "type": "revenue",
    "balance": 5000.00
  }
]
```

### Konto erstellen
```http
POST /accounts
Authorization: Bearer <token>
Content-Type: application/json

{
  "number": "1020",
  "name": "Bankkonto",
  "type": "asset"
}
```

## Buchungen

### Buchungen abrufen
```http
GET /transactions
Authorization: Bearer <token>
```

**Query Parameter:**
- `account_id` - Filter nach Konto
- `from` - Startdatum (YYYY-MM-DD)
- `to` - Enddatum (YYYY-MM-DD)

**Response:**
```json
[
  {
    "id": 1,
    "date": "2026-01-15",
    "description": "Mitgliederbeitrag Max Muster",
    "debit_account_id": 1,
    "credit_account_id": 2,
    "amount": 50.00,
    "created_at": "2026-01-15T10:30:00Z"
  }
]
```

### Buchung erstellen
```http
POST /transactions
Authorization: Bearer <token>
Content-Type: application/json

{
  "date": "2026-01-15",
  "description": "Mitgliederbeitrag Max Muster",
  "debit_account_id": 1,
  "credit_account_id": 2,
  "amount": 50.00
}
```

## Rechnungen

### Alle Rechnungen
```http
GET /invoices
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": 1,
    "member_id": "<uuid>",
    "member_name": "Max Muster",
    "amount": 50.00,
    "description": "Jahresbeitrag 2026",
    "status": "open",
    "created_at": "2026-01-01T00:00:00Z",
    "paid_at": null
  }
]
```

### Rechnungs-Details
```http
GET /invoices/:id
Authorization: Bearer <token>
```

### Rechnung erstellen
```http
POST /invoices
Authorization: Bearer <token>
Content-Type: application/json

{
  "member_id": "<uuid>",
  "amount": 50.00,
  "description": "Jahresbeitrag 2026"
}
```

### Rechnung als bezahlt markieren
```http
PATCH /invoices/:id/pay
Authorization: Bearer <token>
```

Setzt den Status auf `paid` und das `paid_at` Datum.

## Berichte

### Bilanz-Bericht
```http
GET /reports/balance
Authorization: Bearer <token>
```

**Query Parameter:**
- `date` - Stichtag (YYYY-MM-DD, Standard: heute)

Gibt die Bilanz mit allen Konten und deren Saldo zurück.

### Cashflow-Bericht
```http
GET /reports/cashflow
Authorization: Bearer <token>
```

**Query Parameter:**
- `from` - Startdatum (YYYY-MM-DD)
- `to` - Enddatum (YYYY-MM-DD)

Gibt eine Übersicht der Ein- und Ausgaben im gewählten Zeitraum zurück.

## Health Check

```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "service": "api-accounting"
}
```

## Hinweise

- Die Accounting API kommuniziert intern mit der Members API (`http://api-members:3000`) für Mitglieder-Informationen auf Rechnungen.
- QR-Rechnungen (Swiss QR-Bill) und Massen-Rechnungen werden über die [Dispatch API](/api/dispatch#rechnungen) generiert, da diese die PDF-Generierung übernimmt.
- Traefik-Pfade: `/invoices`, `/payments`, `/reports`, `/accounts`
