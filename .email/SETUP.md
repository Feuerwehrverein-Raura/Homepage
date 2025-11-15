# E-Mail-System Setup-Anleitung

## Schritt 1: GitHub Secrets konfigurieren

So hinterlegen Sie Ihre Mailcow SMTP-Daten sicher als Secrets:

### 1.1 Zu GitHub Secrets navigieren

1. Öffnen Sie Ihr Repository auf GitHub
2. Gehen Sie zu: **Settings** (oben rechts)
3. Klicken Sie in der linken Sidebar auf: **Secrets and variables → Actions**
4. Klicken Sie auf: **New repository secret**

### 1.2 Secrets hinzufügen

Erstellen Sie folgende Secrets (einer nach dem anderen):

#### Secret 1: SMTP_HOST
- **Name:** `SMTP_HOST`
- **Value:** Ihr Mailcow Server (z.B. `mail.fwv-raura.ch`)
- Klicken Sie auf **Add secret**

#### Secret 2: SMTP_PORT
- **Name:** `SMTP_PORT`
- **Value:** `587` (für STARTTLS) oder `465` (für SSL)
- Klicken Sie auf **Add secret**

#### Secret 3: SMTP_USER
- **Name:** `SMTP_USER`
- **Value:** Ihr SMTP-Benutzername (z.B. `events@fwv-raura.ch`)
- Klicken Sie auf **Add secret**

#### Secret 4: SMTP_PASS
- **Name:** `SMTP_PASS`
- **Value:** Ihr SMTP-Passwort
- Klicken Sie auf **Add secret**

#### Secret 5: FROM_EMAIL
- **Name:** `FROM_EMAIL`
- **Value:** Absender-E-Mail (z.B. `events@fwv-raura.ch`)
- Klicken Sie auf **Add secret**

### 1.3 Secrets überprüfen

Nach dem Hinzufügen sollten Sie 5 Secrets sehen:
- ✅ SMTP_HOST
- ✅ SMTP_PORT
- ✅ SMTP_USER
- ✅ SMTP_PASS
- ✅ FROM_EMAIL

**Wichtig:** Die Werte der Secrets werden verschlüsselt gespeichert und sind nur für GitHub Actions sichtbar!

## Schritt 2: E-Mail-Postfach in Mailcow erstellen

### 2.1 In Mailcow einloggen
```
https://mail.ihre-domain.de
```

### 2.2 Postfach erstellen

1. Gehen Sie zu: **E-Mail → Postfächer**
2. Klicken Sie auf: **Postfach hinzufügen**
3. Füllen Sie aus:
   - **Benutzername:** `events`
   - **Domain:** `fwv-raura.ch`
   - **Passwort:** Ein sicheres Passwort generieren
   - **Quota:** z.B. 1 GB
4. Klicken Sie auf: **Hinzufügen**

### 2.3 SMTP Zugriff testen

Testen Sie, ob SMTP funktioniert:

```bash
# Mit telnet (Linux/Mac)
telnet mail.fwv-raura.ch 587

# Mit openssl (für TLS)
openssl s_client -connect mail.fwv-raura.ch:587 -starttls smtp
```

Erwartete Antwort:
```
220 mail.fwv-raura.ch ESMTP
```

## Schritt 3: Empfänger-Liste konfigurieren

### 3.1 Datei bearbeiten

Bearbeiten Sie `.email/recipients.json`:

```json
{
  "comment": "Liste der E-Mail-Empfänger für Event-Einladungen",
  "recipients": [
    {
      "name": "René Käslin",
      "email": "praesident@fwv-raura.ch",
      "active": true,
      "groups": ["all", "vorstand"]
    },
    {
      "name": "Stefan Müller",
      "email": "stefan+fwv-raura@juroct.ch",
      "active": true,
      "groups": ["all", "vorstand"]
    },
    {
      "name": "Testempfänger",
      "email": "test@example.com",
      "active": false,
      "groups": ["test"]
    }
  ],
  "groups": {
    "all": "Alle Vereinsmitglieder",
    "vorstand": "Vorstandsmitglieder",
    "helfer": "Helfer und Freiwillige",
    "test": "Test-Empfänger"
  }
}
```

### 3.2 Wichtig: NICHT committen!

Die Datei `.email/recipients.json` ist bereits in `.gitignore` eingetragen und sollte **NICHT** ins Git-Repository committed werden (enthält persönliche Daten).

**Lokal verwalten:**
- Speichern Sie die Datei lokal
- Oder speichern Sie sie verschlüsselt (z.B. mit git-crypt)
- Oder nutzen Sie GitHub Secrets für die Empfänger-Liste (komplexer)

## Schritt 4: System testen

### 4.1 Manueller Test via GitHub Actions

1. Gehen Sie zu: **Actions → Send Event Email Invitations**
2. Klicken Sie auf: **Run workflow**
3. Geben Sie ein: `events/weihnachtshock2025.md`
4. Klicken Sie auf: **Run workflow**
5. Warten Sie auf das Ergebnis (grüner Haken = Erfolg)

### 4.2 Logs überprüfen

Klicken Sie auf den Workflow-Run und überprüfen Sie die Logs:

**Erfolgreiche Ausgabe:**
```
🚀 Event E-Mail Versand gestartet...
📄 Lade Event-Datei: events/weihnachtshock2025.md
✅ Event geladen: Weihnachtshock 2025
📋 Lade E-Mail-Empfänger...
✅ 5 aktive Empfänger gefunden
🎨 Erstelle E-Mail-Template...
✅ Template erstellt
📧 Versende E-Mails...
✅ E-Mail gesendet an Max Mustermann (max@example.com)
✅ E-Mail gesendet an Erika Musterfrau (erika@example.com)
...
✅ Alle E-Mails erfolgreich versendet!
```

**Bei Fehlern:**
```
❌ SMTP connection failed: connect ECONNREFUSED
```
→ SMTP_HOST oder SMTP_PORT falsch

```
❌ Authentication failed
```
→ SMTP_USER oder SMTP_PASS falsch

### 4.3 Lokaler Test (optional)

Für lokales Testen:

```bash
# Secrets als Umgebungsvariablen setzen
export SMTP_HOST=mail.fwv-raura.ch
export SMTP_PORT=587
export SMTP_USER=events@fwv-raura.ch
export SMTP_PASS='ihr-passwort'
export FROM_EMAIL=events@fwv-raura.ch

# Dependencies installieren
npm install

# Test-E-Mail senden
npm run send-event-email events/weihnachtshock2025.md
```

## Schritt 5: Automatischen Versand aktivieren

Sobald alles funktioniert, wird das System automatisch E-Mails versenden wenn:

1. Sie ein neues Event in `events/` erstellen (z.B. `events/neues-event-2025.md`)
2. Die Datei in den `main` Branch pushen
3. Der GitHub Actions Workflow wird automatisch getriggert
4. E-Mails werden an alle aktiven Empfänger versendet

## Sicherheits-Checkliste

- ✅ Alle SMTP-Daten als GitHub Secrets hinterlegt
- ✅ `.email/recipients.json` in `.gitignore` eingetragen
- ✅ Sichere Passwörter für SMTP-Benutzer verwenden
- ✅ TLS/STARTTLS aktiviert (Port 587 oder 465)
- ✅ Nur notwendige Berechtigungen für GitHub Actions

## Troubleshooting

### "SMTP connection failed"
- Firewall prüfen (Port 587/465 offen?)
- SMTP_HOST korrekt? (ohne https://, nur Hostname)
- GitHub Actions können externen SMTP erreichen?

### "Authentication failed"
- SMTP_USER und SMTP_PASS korrekt in Secrets?
- Postfach in Mailcow existiert?
- SMTP-Auth in Mailcow aktiviert?

### "No recipients found"
- `.email/recipients.json` existiert?
- Mindestens ein Empfänger mit `"active": true`?
- JSON-Syntax korrekt?

### E-Mails kommen nicht an
- Spam-Ordner prüfen
- Mailcow Logs prüfen (UI → Logs → Postfix)
- SPF/DKIM/DMARC korrekt konfiguriert?

## Support

Bei Problemen:
1. GitHub Actions Logs prüfen
2. Mailcow Logs prüfen
3. Issue auf GitHub erstellen
4. E-Mail an: webmaster@fwv-raura.ch

---

🔥 Viel Erfolg mit dem E-Mail-System!
