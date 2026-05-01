---
sidebar_position: 2
---

# Authentifizierung

## Vorstand Login

```http
POST https://api.fwv-raura.ch/auth/vorstand/login
Content-Type: application/json

{
  "email": "aktuar@fwv-raura.ch",
  "password": "dein-mailcow-passwort"
}
```

### Erfolgreiche Antwort
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "email": "aktuar@fwv-raura.ch",
    "role": "aktuar",
    "name": "Stefan Müller"
  }
}
```

## Token verwenden

```http
GET https://api.fwv-raura.ch/members
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Token-Ablauf

Tokens sind 8 Stunden gültig. Nach Ablauf muss ein neuer Login durchgeführt werden.

## Rollen

| Rolle | Gruppe | Berechtigungen |
|-------|--------|----------------|
| admin | vorstand, admin | Volle Rechte |
| praesident | vorstand | Lesen, Erstellen, Bearbeiten |
| aktuar | vorstand | Lesen, Erstellen, Bearbeiten |
| kassier | vorstand | Lesen, Erstellen, Bearbeiten |
| materialwart | vorstand | Lesen, Erstellen, Bearbeiten |
| beisitzer | vorstand | Lesen, Erstellen, Bearbeiten |
