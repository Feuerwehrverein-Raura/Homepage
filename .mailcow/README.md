# Mailcow Verteilerlisten-Synchronisation

Automatische Synchronisation der Mailcow E-Mail-Verteilerliste basierend auf `mitglieder_data.json`.

## 🎯 Was macht das?

Das System aktualisiert automatisch die Mailcow Verteilerliste (Alias), sodass sie immer mit den Mitgliederdaten synchron ist.

**Single Source of Truth:** `mitglieder_data.json`
**Ziel:** Mailcow Alias (z.B. `alle@fwv-raura.ch`)

## 🚀 Setup

### 1. Mailcow API Key erstellen

1. **Loggen Sie sich in Mailcow ein**
2. **Gehen Sie zu:** Konfiguration → API
3. **Erstellen Sie einen API Key:**
   - Name: `GitHub Actions - Distribution List Sync`
   - Berechtigungen: **Nur "Alias" - Lesen & Schreiben**
   - Keine anderen Berechtigungen nötig!
4. **Kopieren Sie den API Key**

### 2. GitHub Secrets konfigurieren

Gehen Sie zu: `Settings → Secrets and variables → Actions`

Erstellen Sie folgende Secrets:

| Secret Name | Wert | Beispiel |
|-------------|------|----------|
| `MAILCOW_API_URL` | Mailcow URL | `https://mail.fwv-raura.ch` |
| `MAILCOW_API_KEY` | API Key aus Schritt 1 | `XXXXXX-XXXXXX-XXXXXX` |
| `MAILCOW_ALIAS_ADDRESS` | Alias-Adresse | `alle@fwv-raura.ch` |

### 3. Alias in Mailcow erstellen (einmalig)

Falls noch nicht vorhanden:

1. **Mailcow:** E-Mail → Konfiguration → Alias
2. **Erstellen Sie:** `alle@fwv-raura.ch`
3. **Ziel-Adressen:** Beliebig (wird automatisch überschrieben)
4. **Aktivieren:** ✅

### 4. Fertig!

Die Verteilerliste wird automatisch synchronisiert wenn:
- `mitglieder_data.json` geändert wird
- Die Änderung in den `main` Branch gepusht wird

## 📧 Wie funktioniert es?

**Beispiel mitglieder_data.json:**
```json
[
  {
    "Mitglied": "Max Mustermann",
    "Status": "Aktivmitglied",
    "zustellung-email": true,
    "zustellung-post": false,
    "E-Mail": "max@example.com"
  },
  {
    "Mitglied": "Erika Musterfrau",
    "Status": "Aktivmitglied",
    "zustellung-email": true,
    "zustellung-post": true,
    "E-Mail": "erika@example.com"
  },
  {
    "Mitglied": "Hans Müller",
    "Status": "Aktivmitglied",
    "zustellung-email": false,
    "zustellung-post": true,
    "E-Mail": ""
  }
]
```

**Mailcow Alias `alle@fwv-raura.ch` enthält dann:**
- ✅ `max@example.com`
- ✅ `erika@example.com`
- ❌ Hans Müller (hat keine E-Mail-Zustellung)

## 🔄 Manuell triggern

1. **Actions → Sync Mailcow Distribution List**
2. **Run workflow**
3. **Prüfen Sie die Logs**

## 📊 Was wird synchronisiert?

**Aufgenommen werden:**
- ✅ Status = "Aktivmitglied" oder "Ehrenmitglied"
- ✅ E-Mail vorhanden
- ✅ zustellung-email = true

**Entfernt werden:**
- ❌ Status ≠ "Aktivmitglied" und ≠ "Ehrenmitglied" (z.B. ausgetreten)
- ❌ zustellung-email = false
- ❌ Keine E-Mail-Adresse

## 📝 Workflow

```
mitglieder_data.json ändern
    ↓
Git commit & push
    ↓
GitHub Actions triggert
    ↓
Script liest mitglieder_data.json
    ↓
Script vergleicht mit aktuellem Mailcow Alias
    ↓
Änderungen (➕➖) werden angezeigt
    ↓
Mailcow Alias wird aktualisiert
    ↓
✅ Verteilerliste synchron!
```

## 🔐 Sicherheit

**Minimale Berechtigungen:**
- API Key hat NUR Zugriff auf Aliase
- Kein Zugriff auf Postfächer, Passwörter, etc.
- Key kann jederzeit widerrufen werden

**Secrets:**
- API Key verschlüsselt in GitHub
- Nicht im Code sichtbar
- Nur für GitHub Actions zugänglich

## 🐛 Troubleshooting

### "MAILCOW_API_KEY environment variable is required"
- Secret `MAILCOW_API_KEY` nicht gesetzt
- Oder Secret-Name falsch geschrieben

### "Mailcow API Error: 401"
- API Key ungültig oder abgelaufen
- Erstellen Sie einen neuen Key in Mailcow

### "Mailcow API Error: 403"
- API Key hat keine Berechtigung für Aliase
- Prüfen Sie die Berechtigungen des Keys

### "Alias ... nicht gefunden in Mailcow!"
- Alias existiert nicht in Mailcow
- Erstellen Sie den Alias manuell
- Oder `MAILCOW_ALIAS_ADDRESS` Secret ist falsch

### "Keine E-Mail-Empfänger gefunden"
- Kein Mitglied mit E-Mail-Zustellung
- Prüfen Sie `mitglieder_data.json`

## 💡 Vorteile

✅ **Automatisch:** Keine manuelle Pflege in Mailcow nötig
✅ **Konsistent:** Immer synchron mit mitglieder_data.json
✅ **Transparent:** Logs zeigen genau was geändert wird
✅ **Sicher:** Minimale API-Berechtigungen
✅ **Einfach:** Mitgliederdaten nur einmal pflegen

## 📞 Support

**Mailcow API Doku:** https://mailcow.github.io/mailcow-dockerized-docs/
**Bei Problemen:** webmaster@fwv-raura.ch

---

🔥 Automatisierung für den Feuerwehrverein Raura Kaiseraugst
