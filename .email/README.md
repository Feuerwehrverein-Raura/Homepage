# Event E-Mail System

Automatischer E-Mail-Versand für Event-Einladungen.

## 🚀 Schnellstart

### 1. GitHub Secrets konfigurieren

Benötigte Secrets:

| Secret Name | Wert | Beispiel |
|-------------|------|----------|
| `SMTP_HOST` | Mailcow Server | `mail.test.juroct.net` |
| `SMTP_PORT` | SMTP Port | `587` |
| `SMTP_USER` | SMTP Benutzer | `alle@fwv-raura.ch` |
| `SMTP_PASS` | SMTP Passwort | `IhrPasswort123` |
| `FROM_EMAIL` | Absender | `alle@fwv-raura.ch` |
| `EMAIL_RECIPIENTS_TO` | Mailcow Verteilerliste (optional) | `alle@fwv-raura.ch` |
| `MITGLIEDER_ACCESS_TOKEN` | Zugriff auf mitglieder_data.json (optional) | Token |

### 2. Empfänger-Verwaltung

**Option A: Mailcow Verteilerliste (empfohlen)**

1. Erstellen Sie in Mailcow einen Alias: `alle@fwv-raura.ch`
2. Fügen Sie alle Mitglieder hinzu
3. Setzen Sie Secret `EMAIL_RECIPIENTS_TO=alle@fwv-raura.ch`

**Option B: Automatisch aus mitglieder_data.json**

E-Mails werden automatisch an alle Mitglieder gesendet, die:
- ✅ Status = "Aktivmitglied" oder "Ehrenmitglied"
- ✅ E-Mail vorhanden
- ✅ zustellung-email = true

**Beispiel in mitglieder_data.json:**
```json
{
  "Mitglied": "Max Mustermann",
  "Status": "Aktivmitglied",
  "zustellung-email": true,
  "zustellung-post": false,
  "E-Mail": "max@example.com"
}
```

### 3. Fertig!

E-Mails werden automatisch versendet wenn:
- Ein neues Event in `events/*.md` erstellt wird
- Die Datei in den `main` Branch gepusht wird

## 📧 Manuell triggern

1. **Actions → Send Event Email Invitations**
2. **Run workflow**
3. Event-Datei angeben: `events/weihnachtshock2025.md`

## 📚 Dokumentation

Ausführliche Anleitung: [MAILCOW-SETUP.md](MAILCOW-SETUP.md)

## 🐛 Troubleshooting

### E-Mails werden nicht versendet
- Secrets korrekt konfiguriert?
- Mailcow Alias aktiv? (wenn Option A)
- mitglieder_data.json vorhanden? (wenn Option B)

### E-Mails kommen nicht an
- Mailcow Logs prüfen
- Spam-Ordner überprüfen

---

🔥 Erstellt für den Feuerwehrverein Raura Kaiseraugst
