# OTP Authentication System

Passwortloses Login-System für den Mitgliederbereich mit One-Time Passwords (OTP) via E-Mail.

## 🎯 Übersicht

Das OTP-System ermöglicht Mitgliedern den sicheren Zugriff auf geschützte Bereiche ohne Passwörter:

- **Mitglieder** können ihre eigenen Kontaktdaten bearbeiten
- **Vorstand** kann alle Mitgliederdaten bearbeiten
- Alle Änderungen werden als Pull Request erstellt und müssen genehmigt werden

## 🔐 Sicherheit

- **OTP per E-Mail**: 6-stelliger Code, 10 Minuten gültig
- **JWT Tokens**: 1 Stunde Gültigkeit, signiert mit Secret
- **Rollenbasiert**: Automatische Erkennung von Vorstandsmitgliedern
- **Pull Request Workflow**: Alle Datenänderungen müssen genehmigt werden
- **Versuchsbegrenzung**: Maximal 3 Fehlversuche pro OTP

## 🚀 Setup

### 1. GitHub Secrets erstellen

Gehen Sie zu: `Settings → Secrets and variables → Actions`

Erstellen Sie folgendes **neues** Secret:

| Secret Name | Beschreibung | Beispiel |
|-------------|--------------|----------|
| `JWT_SECRET` | Geheimer Schlüssel für JWT-Signierung | `generierter-random-string-hier` |

**Vorhandene Secrets** (für E-Mail):
- `SMTP_HOST` - Mailcow Server
- `SMTP_PORT` - SMTP Port (587 oder 465)
- `SMTP_USER` - SMTP Benutzername
- `SMTP_PASS` - SMTP Passwort
- `FROM_EMAIL` - Absender-Adresse

### 2. JWT Secret generieren

Führen Sie folgenden Befehl aus (Linux/Mac):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Oder online: https://www.random.org/strings/

Kopieren Sie den generierten String in das `JWT_SECRET` Secret.

### 3. OTP-Data Branch erstellen

Der Branch wird automatisch beim ersten OTP-Request erstellt. Alternativ manuell:

```bash
git checkout --orphan otp-data
git rm -rf .
mkdir .otp
git add .otp/.gitkeep
git commit -m "Initialize OTP data branch"
git push -u origin otp-data
```

**Wichtig**: Der `otp-data` Branch sollte **nicht** in den `main` Branch gemerged werden!

## 📖 Benutzer-Anleitung

### Login-Prozess

1. **Öffnen Sie**: [mitglieder-login.html](../mitglieder-login.html)
2. **Geben Sie** Ihre E-Mail-Adresse ein
3. **Klicken Sie** auf "Code anfordern"
4. **GitHub Actions** öffnet sich in neuem Tab
5. **Klicken Sie** auf "Run workflow"
6. **Geben Sie** Ihre E-Mail ein und klicken Sie auf den grünen "Run workflow" Button
7. **Warten Sie** auf die E-Mail (1-2 Minuten)
8. **Geben Sie** den 6-stelligen Code ein
9. **Wiederholen Sie** Schritt 4-6 für die OTP-Verifikation
10. **Kopieren Sie** den JWT Token aus den Workflow-Logs
11. **Fertig!** Sie sind jetzt angemeldet

### Profil bearbeiten

1. **Öffnen Sie**: [mitglieder-profil.html](../mitglieder-profil.html)
2. **Ändern Sie** die gewünschten Felder
3. **Klicken Sie** auf "Änderungen speichern"
4. **GitHub Actions** öffnet sich
5. **Folgen Sie** den Anweisungen zum Workflow-Trigger
6. **Ein Pull Request** wird erstellt
7. **Warten Sie** auf Genehmigung durch den Vorstand

## 👮 Vorstand-Anleitung

Als Vorstandsmitglied haben Sie zusätzliche Berechtigungen:

### Admin-Bereich öffnen

1. **Melden Sie sich** normal an (siehe Login-Prozess)
2. **Öffnen Sie**: [mitglieder-admin.html](../mitglieder-admin.html)
3. **Sie sehen** zusätzliche Funktionen

### Mitgliederdaten bearbeiten

1. **Geben Sie** die E-Mail des Mitglieds ein
2. **Erstellen Sie** JSON mit den Änderungen:
   ```json
   {
     "Telefon": "+41 61 123 45 67",
     "Strasse": "Neue Strasse 123",
     "zustellung-email": true
   }
   ```
3. **Klicken Sie** auf "Änderungen speichern"
4. **Folgen Sie** den Workflow-Anweisungen
5. **Ein Pull Request** wird erstellt

### Erlaubte Felder

**Vorstand kann bearbeiten**:
- Persönlich: `Vorname`, `Name`, `Mitglied`
- Kontakt: `Telefon`, `Mobile`, `E-Mail`
- Adresse: `Strasse`, `PLZ`, `Ort`, `Adresszusatz`
- Zustellung: `zustellung-email`, `zustellung-post`
- Vereinsdaten: `Funktion`, `Eintritt`, `Status`

**Normale Mitglieder können bearbeiten**:
- Kontakt: `Telefon`, `Mobile`, `E-Mail`
- Adresse: `Strasse`, `PLZ`, `Ort`, `Adresszusatz`
- Zustellung: `zustellung-email`, `zustellung-post`

**Verboten für alle** (Sicherheit):
- `IBAN`

### Pull Requests prüfen

1. **Gehen Sie** zu: [GitHub Pull Requests](https://github.com/Feuerwehrverein-Raura/Homepage/pulls)
2. **Öffnen Sie** einen PR mit Label `mitglieder-update`
3. **Prüfen Sie** die Änderungen im "Files changed" Tab
4. **Klicken Sie** auf "Merge pull request" wenn korrekt
5. **Die Änderungen** sind nun live

## 🔧 Technische Details

### Architektur

```
┌─────────────────┐
│  Frontend HTML  │
│  (Browser)      │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│   GitHub Actions        │
│   Workflows             │
├─────────────────────────┤
│  1. OTP Request         │
│  2. OTP Verify          │
│  3. Member Data Update  │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│   Storage               │
├─────────────────────────┤
│  - otp-data branch      │ ← OTP temporär
│  - mitglieder_data.json │ ← Mitgliederdaten
└─────────────────────────┘
```

### Workflows

#### 1. OTP Request (`otp-request.yml`)

**Trigger**: Manuell via `workflow_dispatch`

**Input**:
- `email` - E-Mail-Adresse des Mitglieds

**Prozess**:
1. Lädt `mitglieder_data.json`
2. Prüft ob E-Mail existiert und Mitglied aktiv ist
3. Generiert 6-stelligen OTP
4. Sendet OTP per E-Mail via Mailcow
5. Speichert OTP in `otp-data` Branch (10 Min Gültigkeit)

**Output**: E-Mail mit OTP-Code

#### 2. OTP Verify (`otp-verify.yml`)

**Trigger**: Manuell via `workflow_dispatch`

**Input**:
- `email` - E-Mail-Adresse
- `otp` - 6-stelliger Code

**Prozess**:
1. Lädt OTP aus `otp-data` Branch
2. Prüft Gültigkeit (Zeit, Versuche)
3. Vergleicht Code
4. Löscht OTP bei Erfolg
5. Generiert JWT Token (1 Stunde)

**Output**: JWT Token mit Rolle und Mitgliederdaten

#### 3. Member Data Update (`member-data-update.yml`)

**Trigger**: Manuell via `workflow_dispatch`

**Input**:
- `jwt_token` - JWT Token vom Verify-Workflow
- `updates` - JSON mit Feldänderungen
- `target_email` - Ziel-E-Mail (optional, nur für Vorstand)

**Prozess**:
1. Verifiziert JWT Token
2. Prüft Berechtigungen (eigene Daten vs. Vorstand)
3. Filtert erlaubte Felder
4. Aktualisiert `mitglieder_data.json`
5. Erstellt neuen Branch
6. Erstellt Pull Request mit Änderungen

**Output**: Pull Request zur Review

### JWT Token Format

```json
{
  "email": "mitglied@example.com",
  "role": "member",  // oder "vorstand"
  "member": {
    "name": "Max Mustermann",
    "vorname": "Max",
    "nachname": "Mustermann",
    "email": "mitglied@example.com"
  },
  "iat": 1234567890,  // Issued At
  "exp": 1234571490   // Expiration (iat + 3600)
}
```

### OTP Storage Format

Gespeichert in `.otp/<email-hash>.json` auf `otp-data` Branch:

```json
{
  "email": "mitglied@example.com",
  "otp": "123456",
  "expires": "2025-01-15T12:30:00.000Z",
  "attempts": 0,
  "role": "member",
  "member": {
    "name": "Max Mustermann",
    "vorname": "Max",
    "nachname": "Mustermann",
    "email": "mitglied@example.com"
  }
}
```

## 🐛 Troubleshooting

### "E-Mail-Adresse nicht gefunden"

**Problem**: E-Mail existiert nicht in `mitglieder_data.json`

**Lösung**:
- Prüfen Sie die korrekte Schreibweise
- Prüfen Sie ob das Mitglied in der Datei vorhanden ist
- Prüfen Sie das Feld `E-Mail` (mit Bindestrich!)

### "Ihr Mitgliedsstatus erlaubt keinen Zugriff"

**Problem**: Status ist nicht "Aktivmitglied" oder "Ehrenmitglied"

**Lösung**:
- Prüfen Sie das `Status` Feld in `mitglieder_data.json`
- Ändern Sie den Status falls nötig (als Vorstand)

### "OTP ist abgelaufen"

**Problem**: Mehr als 10 Minuten seit Anforderung vergangen

**Lösung**:
- Fordern Sie einen neuen Code an
- Der alte Code wird automatisch gelöscht

### "Zu viele Fehlversuche"

**Problem**: 3x falscher Code eingegeben

**Lösung**:
- Fordern Sie einen neuen Code an
- Der alte Code wird automatisch gelöscht

### "Token expired"

**Problem**: JWT Token ist älter als 1 Stunde

**Lösung**:
- Melden Sie sich erneut an
- Fordern Sie einen neuen OTP an

### "Keine Berechtigung"

**Problem**: Normales Mitglied versucht andere Daten zu bearbeiten

**Lösung**:
- Nur eigene Daten bearbeiten
- Oder Vorstand kontaktieren

### Workflow schlägt fehl

**Mögliche Ursachen**:

1. **SMTP-Fehler**:
   - Prüfen Sie SMTP Secrets
   - Testen Sie Mailcow-Verbindung

2. **Git-Fehler**:
   - Branch-Konflikte
   - Fehlende Berechtigungen

3. **JSON-Syntax-Fehler**:
   - Prüfen Sie das Updates-JSON auf Tippfehler
   - Nutzen Sie einen JSON-Validator

**Logs prüfen**:
1. Gehen Sie zu: [GitHub Actions](https://github.com/Feuerwehrverein-Raura/Homepage/actions)
2. Klicken Sie auf den fehlgeschlagenen Workflow
3. Klicken Sie auf den Job mit dem roten ❌
4. Lesen Sie die Fehlermeldung

## 📝 Wartung

### OTP-Data Branch aufräumen

Der `otp-data` Branch kann im Laufe der Zeit viele OTP-Dateien sammeln. Alte Dateien werden automatisch gelöscht bei:
- Erfolgreicher Verifikation
- Ablauf
- Zu vielen Fehlversuchen

**Manuelles Cleanup** (optional):

```bash
git checkout otp-data
git pull origin otp-data
rm -rf .otp/*
git add .otp/
git commit -m "Clean up old OTP files"
git push origin otp-data
```

### JWT Secret rotieren

**Empfohlen**: Alle 6-12 Monate

1. Generieren Sie neuen Secret
2. Aktualisieren Sie GitHub Secret `JWT_SECRET`
3. Alte Tokens werden ungültig
4. Alle Nutzer müssen sich neu anmelden

## 🔒 Sicherheitshinweise

### Best Practices

✅ **DO**:
- JWT_SECRET geheim halten
- Pull Requests immer prüfen
- Regelmäßig Logs kontrollieren
- SMTP Credentials rotieren

❌ **DON'T**:
- JWT_SECRET im Code commiten
- PRs blind mergen
- Fehlgeschlagene Logins ignorieren
- otp-data Branch in main mergen

### Rate Limiting

**Aktuell**: Keine automatische Begrenzung

**Empfehlung**: GitHub Actions hat eingebaute Limits:
- Maximal ~3000 Workflow-Minuten/Monat (Free)
- Workflows können manuell deaktiviert werden

**Bei Missbrauch**:
1. Workflow temporär deaktivieren
2. Verdächtige IP-Adressen in GitHub Actions Logs prüfen
3. Ggf. Workflow auf protected branches beschränken

## 📊 Monitoring

### Wichtige Metriken

**GitHub Actions → Insights**:
- Workflow-Erfolgsrate
- Durchschnittliche Laufzeit
- Anzahl gescheiterter Versuche

**Pull Requests**:
- Anzahl offener Mitglieder-Update PRs
- Durchschnittliche Review-Zeit

### Alerts einrichten

**GitHub Actions kann E-Mails senden bei**:
- Workflow-Fehlern
- Fehlgeschlagenen Runs

**Settings → Notifications → Actions**

## 🚀 Erweiterungen

### Mögliche Verbesserungen

1. **Auto-Merge für sichere Felder**:
   - Telefon, Mobile, Adresse könnten automatisch gemerged werden
   - Kritische Felder (Status, Funktion) erfordern Review

2. **Web-basierte API**:
   - Cloudflare Workers oder Vercel Functions
   - Direkte API-Calls statt GitHub Actions UI

3. **2FA für Vorstand**:
   - Zusätzliche Sicherheit für Admin-Funktionen
   - TOTP (Google Authenticator, etc.)

4. **Audit Log**:
   - Alle Änderungen in separater Datei tracken
   - Wer hat wann was geändert

5. **Self-Service PR Approval**:
   - Mitglieder können ihre eigenen PRs nach Review approven
   - Vorstand erhält nur Notification

## 💡 FAQ

### Warum GitHub Workflows statt Backend-Server?

**Vorteile**:
- ✅ Keine Server-Kosten
- ✅ Keine Wartung
- ✅ GitHub-Sicherheit
- ✅ Kostenlos für öffentliche Repos

**Nachteile**:
- ❌ 10-30 Sekunden Latenz
- ❌ Nicht wie normale API nutzbar
- ❌ Manuelle Workflow-Trigger

### Kann ich eine "echte" API haben?

Ja! Optionen:
1. **Cloudflare Workers** (bereits vorbereitet in cloudflare-worker/)
2. **Vercel Functions** (Serverless)
3. **Eigener Server** (backend/server.js)

Aber: Erfordert zusätzliche Infrastruktur und Kosten.

### Sind meine Daten sicher?

Ja:
- OTPs sind 10 Min gültig
- JWT Tokens 1 Std gültig
- Alle Änderungen via PR-Review
- GitHub-Sicherheit

Aber: OTP-Data Branch ist öffentlich sichtbar → OTPs sind gehasht via E-Mail-Hash

**Verbesserung**: Private Repos nutzen oder OTP in GitHub Secrets speichern

### Wie viele Workflows kann ich ausführen?

**GitHub Free**:
- 2000 Minuten/Monat für private Repos
- Unbegrenzt für öffentliche Repos

**Geschätzter Verbrauch**:
- OTP Request: ~30 Sekunden
- OTP Verify: ~20 Sekunden
- Data Update: ~30 Sekunden

→ Ca. 1500 Login-Vorgänge/Monat möglich

## 📞 Support

**Bei Problemen**:
1. Prüfen Sie diese Dokumentation
2. Schauen Sie in GitHub Actions Logs
3. Öffnen Sie ein Issue: [GitHub Issues](https://github.com/Feuerwehrverein-Raura/Homepage/issues)
4. Kontakt: webmaster@fwv-raura.ch

---

🔥 **Entwickelt für den Feuerwehrverein Raura Kaiseraugst**
