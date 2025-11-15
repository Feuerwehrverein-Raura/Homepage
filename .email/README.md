# Event E-Mail System

Automatisches E-Mail-Versand-System für Event-Einladungen des Feuerwehrvereins Raura Kaiseraugst.

## 📋 Übersicht

Dieses System versendet automatisch schöne HTML-E-Mail-Einladungen wenn neue Events erstellt werden.

### Features

- ✅ **Automatischer Versand** - Triggert bei neuen Event-Dateien
- ✅ **Schöne HTML-Emails** - Professionelles Design mit Logo und Event-Details
- ✅ **Mailcow Integration** - Nutzt Ihren Mailcow SMTP-Server
- ✅ **Empfänger-Verwaltung** - Einfache JSON-basierte Empfängerliste
- ✅ **Manuelles Triggern** - Kann auch manuell ausgelöst werden

## 🚀 Setup

### 1. GitHub Secrets konfigurieren

Gehen Sie zu: `Settings → Secrets and variables → Actions → New repository secret`

Erstellen Sie folgende Secrets:

| Secret Name | Beschreibung | Beispiel |
|-------------|--------------|----------|
| `SMTP_HOST` | Mailcow Server Hostname | `mail.fwv-raura.ch` |
| `SMTP_PORT` | SMTP Port (meist 587) | `587` |
| `SMTP_USER` | SMTP Benutzername | `events@fwv-raura.ch` |
| `SMTP_PASS` | SMTP Passwort | `ihr-passwort` |
| `FROM_EMAIL` | Absender E-Mail | `events@fwv-raura.ch` |

### 2. Empfänger konfigurieren

Bearbeiten Sie `.email/recipients.json`:

```json
{
  "recipients": [
    {
      "name": "Max Mustermann",
      "email": "max@example.com",
      "active": true,
      "groups": ["all"]
    },
    {
      "name": "Erika Musterfrau",
      "email": "erika@example.com",
      "active": true,
      "groups": ["all", "vorstand"]
    }
  ],
  "groups": {
    "all": "Alle Vereinsmitglieder",
    "vorstand": "Vorstandsmitglieder",
    "helfer": "Helfer und Freiwillige"
  }
}
```

**Wichtig:** Fügen Sie `.email/recipients.json` zu `.gitignore` hinzu, um E-Mail-Adressen zu schützen!

### 3. E-Mail-Template anpassen (optional)

Das Template finden Sie in `.email/template.html`. Sie können:
- Farben anpassen
- Logo ändern
- Texte anpassen
- Design erweitern

## 📧 Verwendung

### Automatisch

E-Mails werden automatisch versendet wenn:
1. Eine neue Event-Datei in `events/` erstellt wird
2. Die Datei in den `main` Branch gepusht wird
3. Die Datei nicht `README.md` oder `*-assignments.md` ist

### Manuell

Über GitHub Actions UI:

1. Gehen Sie zu: `Actions → Send Event Email Invitations`
2. Klicken Sie auf `Run workflow`
3. Geben Sie den Event-Datei-Pfad ein (z.B. `events/weihnachtshock2025.md`)
4. Klicken Sie auf `Run workflow`

### Lokal testen

```bash
# Dependencies installieren
npm install

# E-Mail versenden (Mailcow Credentials als Umgebungsvariablen)
export SMTP_HOST=mail.fwv-raura.ch
export SMTP_PORT=587
export SMTP_USER=events@fwv-raura.ch
export SMTP_PASS=ihr-passwort
export FROM_EMAIL=events@fwv-raura.ch

# Script ausführen
npm run send-event-email events/weihnachtshock2025.md
```

## 🔧 Mailcow Konfiguration

### SMTP-Benutzer in Mailcow erstellen

1. Melden Sie sich in Mailcow an
2. Gehen Sie zu: `E-Mail → Postfächer`
3. Erstellen Sie ein neues Postfach: `events@fwv-raura.ch`
4. Oder verwenden Sie ein bestehendes Postfach
5. Notieren Sie sich Benutzername und Passwort

### SMTP-Einstellungen

Standard Mailcow SMTP-Einstellungen:
- **Host:** `mail.ihre-domain.de`
- **Port:** `587` (STARTTLS) oder `465` (SSL)
- **Authentifizierung:** Erforderlich
- **Verschlüsselung:** STARTTLS oder SSL/TLS

## 🎨 Template-Variablen

Das E-Mail-Template unterstützt folgende Variablen:

```handlebars
{{title}}                    - Event-Titel
{{subtitle}}                 - Event-Untertitel
{{startDate}}               - Startdatum (formatiert)
{{endDate}}                 - Enddatum (formatiert)
{{startTime}}               - Startzeit
{{endTime}}                 - Endzeit
{{location}}                - Ort
{{organizer}}               - Organisator
{{organizerEmail}}          - Organisator E-Mail
{{cost}}                    - Kosten
{{description}}             - Beschreibung (HTML)
{{registrationRequired}}    - Anmeldung erforderlich (Boolean)
{{registrationDeadline}}    - Anmeldefrist
{{maxParticipants}}         - Max. Teilnehmer
{{eventUrl}}                - Link zur Event-Seite
{{registrationUrl}}         - Link zum Anmeldeformular
```

## 🛡️ Sicherheit

- ✅ **Secrets verwenden:** SMTP-Credentials niemals im Code speichern
- ✅ **recipients.json schützen:** Zu .gitignore hinzufügen
- ✅ **TLS verwenden:** Immer verschlüsselte Verbindung nutzen
- ✅ **Berechtigungen prüfen:** GitHub Actions benötigt keine write-Rechte

## 🐛 Troubleshooting

### E-Mails werden nicht versendet

1. **Secrets prüfen:**
   ```bash
   # Im GitHub Actions Log nach Fehlern suchen
   # "SMTP connection failed" → SMTP_HOST/PORT falsch
   # "Authentication failed" → SMTP_USER/PASS falsch
   ```

2. **Mailcow Logs prüfen:**
   ```bash
   # In Mailcow UI: Logs → Postfix
   # Suchen Sie nach Verbindungsversuchen
   ```

3. **Firewall/Port prüfen:**
   - Port 587 oder 465 muss offen sein
   - GitHub Actions IPs müssen erlaubt sein

### Template wird nicht korrekt gerendert

1. **Handlebars-Syntax prüfen:** Stellen Sie sicher, dass alle `{{}}` geschlossen sind
2. **Event-Daten prüfen:** Frontmatter in Event-Datei muss korrekt sein

### Workflow wird nicht getriggert

1. **Branch prüfen:** Workflow läuft nur auf `main` Branch
2. **Pfad prüfen:** Nur Änderungen in `events/*.md` triggern den Workflow
3. **Neue Dateien:** Workflow erkennt nur neue Dateien (git diff --diff-filter=A)

## 📝 Beispiel E-Mail

Die E-Mail enthält:
- Feuerwehrverein Raura Header mit Logo
- Event-Titel und Untertitel
- Übersichtliche Event-Details (Datum, Zeit, Ort, etc.)
- Vollständige Beschreibung
- Badges für Anmeldepflicht und Teilnehmerlimit
- Call-to-Action Button (Anmelden/Details)
- Footer mit Kontaktinformationen

## 🔄 Updates

### Template aktualisieren

```bash
# Template bearbeiten
vi .email/template.html

# Committen und pushen
git add .email/template.html
git commit -m "Update email template"
git push
```

### Empfänger hinzufügen

```bash
# recipients.json bearbeiten
vi .email/recipients.json

# Lokal testen (NICHT committen!)
npm run send-event-email events/test-event.md
```

## 📞 Support

Bei Fragen oder Problemen:
- GitHub Issues: https://github.com/Feuerwehrverein-Raura/Homepage/issues
- E-Mail: webmaster@fwv-raura.ch

---

Erstellt für den Feuerwehrverein Raura Kaiseraugst 🔥
