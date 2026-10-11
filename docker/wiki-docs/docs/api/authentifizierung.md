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

## Mitglieder-Token (QR-Code, Anmeldebon, Passwort-Reset)

Neben dem Login über Authentik (OIDC, RS256) stellt api-members selbst ein
Token für Mitglieder aus — bei `POST /auth/member/qr-login`,
`POST /auth/member/code-login` (Anmeldebon) und `POST /auth/member/reset`.
(`POST /auth/member/login`, das App-Passwort, ist seit 11.10.2026
abgeschaltet: keine App nutzte es, und es war ohne Begrenzung der Versuche
offen.) Es ist HS256-signiert, hat
keinen Issuer und gilt 8 Stunden (Anmeldebon: 7 Tage):

```json
{
  "sub": "<mitglied-uuid>",
  "member_id": "<mitglied-uuid>",
  "email": "erika@example.ch",
  "name": "Erika Muster",
  "benutzername": "erika.muster",
  "type": "member",
  "groups": ["Mitglieder", "Lager"],
  "iat": 1791700000,
  "exp": 1791728800
}
```

**Gleichwertig mit Authentik:** `groups` enthält die Namen der
Authentik-Gruppen des Mitglieds — dieselben, die im `groups`-Claim eines
Authentik-Tokens stehen. Ein Mitglied hat damit nach dem QR-Login dieselben
Rechte wie nach dem Login über Authentik (Lager-Reiter, Ausleihe,
Vorstand-Rechte im Events-Backend).

- Die Gruppen werden beim Ausstellen über die Authentik-Admin-API gelesen
  (`GET /api/v3/core/users/<authentik_user_id>/`, Feld `groups_obj`;
  `AUTHENTIK_URL` und `AUTHENTIK_API_TOKEN` wie für den Gruppen-Abgleich)
  und 60 Sekunden zwischengespeichert. Ändert der Gruppen-Abgleich die
  Gruppen eines Mitglieds, wird der Zwischenspeicher sofort geleert.
- Ohne Authentik-Konto (`members.authentik_user_id` leer) oder wenn
  Authentik nicht antwortet, enthält das Token wie früher `groups: []`
  (mit Eintrag im Log).
- Die Gruppen im Token gelten bis zu seinem Ablauf. Die App holt beim
  Erneuern (QR-Code) ein neues Token mit den aktuellen Gruppen.
  `GET /auth/member/pruefen` liefert immer die aktuellen.
- Events-Backend: prüft das Token selbst (gemeinsames `JWT_SECRET`); der
  Vergleich der Gruppen ist unabhängig von Gross-/Kleinschreibung
  (`Vorstand` = `vorstand`).
- Inventar: kennt das `JWT_SECRET` nicht und fragt api-members
  (`GET /auth/member/pruefen`, siehe unten). Danach gilt dieselbe Regel wie
  für Authentik-Tokens der Mitglieder-App: Lager nur mit Gruppe Lager,
  Vorstand oder admin; ausleihen darf jedes Mitglied.

## Mitglieder-Token prüfen (für andere Backends)

```http
GET https://api.fwv-raura.ch/auth/member/pruefen
Authorization: Bearer <mitglieder-token>
```

Prüft genau das mitgeschickte Token — Auskunft über andere Personen gibt
es nicht. Für Backends, die das `JWT_SECRET` nicht kennen (kein
gemeinsames Geheimnis). Intern: `http://api-members:3000/auth/member/pruefen`.

**200 — gültig:**

```json
{
  "valid": true,
  "member_id": "<mitglied-uuid>",
  "email": "erika@example.ch",
  "name": "Erika Muster",
  "benutzername": "erika.muster",
  "groups": ["Mitglieder", "Lager"],
  "exp": 1791728800
}
```

`groups` sind die **aktuellen** Authentik-Gruppen (60 s zwischengespeichert);
ist Authentik nicht erreichbar oder hat das Mitglied kein Konto, die aus dem
Token. `email` kann `null` sein (Mitglieder ohne E-Mail-Adresse).

**401 — `{"valid": false}`:** falsche Signatur, abgelaufen, kein
Mitglieder-Token (Authentik-, Vorstand- und Organisator-Tokens werden hier
nicht geprüft) oder das Mitglied existiert nicht mehr.

Das Inventar merkt sich die Antwort 60 Sekunden (Schlüssel: SHA-256 des
Tokens, höchstens bis zum Ablauf). Ist api-members nicht erreichbar,
antwortet das Inventar mit 503 statt das Token abzulehnen.
