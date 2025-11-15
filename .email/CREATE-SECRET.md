# EMAIL_RECIPIENTS Secret erstellen

## Schritt-für-Schritt Anleitung

### Schritt 1: Empfänger-Liste vorbereiten

Bearbeiten Sie die Datei `recipients-secret-template.json` und passen Sie die Empfänger an:

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

**Wichtige Felder:**
- `name`: Name des Empfängers (wird in der E-Mail angezeigt)
- `email`: E-Mail-Adresse
- `active`: `true` = bekommt E-Mails, `false` = wird übersprungen
- `groups`: Array von Gruppen (aktuell nicht verwendet, für spätere Erweiterungen)

### Schritt 2: JSON komprimieren

**WICHTIG:** GitHub Secrets können keine Zeilenumbrüche enthalten. Sie müssen den JSON-String komprimieren:

#### Option A: Online Tool
1. Gehen Sie zu: https://jsonformatter.org/json-minify
2. Fügen Sie Ihren JSON-Code ein
3. Klicken Sie auf "Minify"
4. Kopieren Sie den komprimierten Output

#### Option B: Command Line (Linux/Mac)
```bash
# Mit jq
cat recipients-secret-template.json | jq -c
```

#### Option C: Node.js
```bash
node -e "console.log(JSON.stringify(require('./.email/recipients-secret-template.json')))"
```

**Ergebnis sollte so aussehen (alles in einer Zeile!):**
```json
{"recipients":[{"name":"Max Mustermann","email":"max@example.com","active":true,"groups":["all"]},{"name":"Erika Musterfrau","email":"erika@example.com","active":true,"groups":["all","vorstand"]}],"groups":{"all":"Alle Vereinsmitglieder","vorstand":"Vorstandsmitglieder","helfer":"Helfer und Freiwillige"}}
```

### Schritt 3: GitHub Secret erstellen

1. **Gehen Sie zu Ihrem Repository auf GitHub**
2. **Klicken Sie auf:** Settings → Secrets and variables → Actions
3. **Klicken Sie auf:** "New repository secret"
4. **Füllen Sie aus:**
   - **Name:** `EMAIL_RECIPIENTS`
   - **Value:** Den komprimierten JSON-String aus Schritt 2
5. **Klicken Sie auf:** "Add secret"

### Schritt 4: Testen

Testen Sie, ob das Secret funktioniert:

1. Gehen Sie zu: **Actions** → **Send Event Email Invitations**
2. Klicken Sie auf: **Run workflow**
3. Geben Sie ein: `events/weihnachtshock2025.md`
4. Klicken Sie auf: **Run workflow**
5. Überprüfen Sie die Logs:
   - ✅ Sollte zeigen: `"📋 Lade Empfänger aus GitHub Secret..."`
   - ✅ Sollte zeigen: `"✅ X aktive Empfänger gefunden"`

### Schritt 5: Empfänger aktualisieren

Wenn Sie später Empfänger hinzufügen/entfernen möchten:

1. Bearbeiten Sie lokal die JSON-Datei
2. Komprimieren Sie den JSON wieder (Schritt 2)
3. Gehen Sie zu: Settings → Secrets and variables → Actions
4. Klicken Sie auf den Stift (✏️) neben `EMAIL_RECIPIENTS`
5. Fügen Sie den neuen komprimierten JSON ein
6. Klicken Sie auf: "Update secret"

## Beispiel-Werte

### Minimal (nur 2 Empfänger)
```json
{"recipients":[{"name":"Person 1","email":"person1@example.com","active":true,"groups":["all"]},{"name":"Person 2","email":"person2@example.com","active":true,"groups":["all"]}],"groups":{"all":"Alle"}}
```

### Mit Vorstand und deaktiviertem Mitglied
```json
{"recipients":[{"name":"Präsident","email":"praesident@fwv-raura.ch","active":true,"groups":["all","vorstand"]},{"name":"Aktuar","email":"aktuar@fwv-raura.ch","active":true,"groups":["all","vorstand"]},{"name":"Ausgetreten","email":"ex-member@example.com","active":false,"groups":["all"]}],"groups":{"all":"Alle Vereinsmitglieder","vorstand":"Vorstandsmitglieder"}}
```

## Fehlerbehandlung

### "Keine Empfänger-Liste gefunden"
- Secret `EMAIL_RECIPIENTS` ist nicht erstellt
- Oder Secret-Name ist falsch geschrieben

### "Unexpected token" oder JSON-Parse-Fehler
- JSON ist nicht richtig formatiert
- Prüfen Sie mit einem JSON-Validator: https://jsonlint.com/
- Stellen Sie sicher, dass alle Anführungszeichen korrekt sind

### "No recipients found" / "0 aktive Empfänger"
- Alle Empfänger haben `"active": false`
- Oder `recipients` Array ist leer

### E-Mails werden an falsche Adressen gesendet
- Secret `EMAIL_RECIPIENTS` ist veraltet
- Aktualisieren Sie das Secret (Schritt 5)

## Sicherheit

✅ **Vorteile von GitHub Secrets:**
- Verschlüsselt gespeichert
- Nicht im Code sichtbar
- Nicht in Git-History
- Nur für GitHub Actions zugänglich
- Einfach zu aktualisieren ohne Code-Änderung

⚠️ **Wichtig:**
- Teilen Sie das Secret nicht
- Dokumentieren Sie, wer Zugriff hat
- Überprüfen Sie regelmäßig, ob alle Adressen aktuell sind

## Alternative: Lokale Datei (nur für Tests)

Für lokale Tests können Sie auch `.email/recipients.json` verwenden:

```bash
# Kopieren Sie das Template
cp .email/recipients-secret-template.json .email/recipients.json

# Bearbeiten Sie die Datei
nano .email/recipients.json

# Lokaler Test (OHNE GitHub Secret)
export SMTP_HOST=mail.fwv-raura.ch
export SMTP_PORT=587
export SMTP_USER=events@fwv-raura.ch
export SMTP_PASS='passwort'
export FROM_EMAIL=events@fwv-raura.ch

npm run send-event-email events/weihnachtshock2025.md
```

**Wichtig:** `.email/recipients.json` ist in `.gitignore` und sollte NIEMALS committed werden!

---

Bei Fragen: webmaster@fwv-raura.ch
