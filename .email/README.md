# Event E-Mail System

Automatisches E-Mail-Versand-System für Event-Einladungen über Mailcow Verteilerliste.

## 🚀 Schnellstart

### 1. Mailcow Verteilerliste erstellen

In Mailcow:
1. **E-Mail → Konfiguration → Alias**
2. Neuen Alias erstellen: `events@fwv-raura.ch`
3. Alle Mitglieder-E-Mails als Ziel-Adressen eintragen
4. Aktivieren

### 2. GitHub Secrets konfigurieren

Gehen Sie zu: `Settings → Secrets and variables → Actions → New repository secret`

Benötigte Secrets:

| Secret Name | Wert | Beispiel |
|-------------|------|----------|
| `SMTP_HOST` | Mailcow Server | `mail.fwv-raura.ch` |
| `SMTP_PORT` | SMTP Port | `587` |
| `SMTP_USER` | SMTP Benutzer | `events@fwv-raura.ch` |
| `SMTP_PASS` | SMTP Passwort | `IhrPasswort123` |
| `FROM_EMAIL` | Absender | `events@fwv-raura.ch` |
| `EMAIL_RECIPIENTS_TO` | Verteilerliste | `events@fwv-raura.ch` |

### 3. Fertig!

E-Mails werden automatisch versendet wenn:
- Ein neues Event in `events/*.md` erstellt wird
- Die Datei in den `main` Branch gepusht wird

## 📧 Manuell triggern

1. **Actions → Send Event Email Invitations**
2. **Run workflow**
3. Event-Datei angeben: `events/weihnachtshock2025.md`
4. **Run workflow**

## 📝 Empfänger verwalten

**In Mailcow:** E-Mail → Konfiguration → Alias → `events@fwv-raura.ch` bearbeiten

Empfänger hinzufügen/entfernen direkt in Mailcow - keine GitHub-Änderung nötig!

## 📚 Dokumentation

Ausführliche Anleitung: [MAILCOW-SETUP.md](MAILCOW-SETUP.md)

## 🐛 Troubleshooting

### E-Mails werden nicht versendet
- Secrets korrekt konfiguriert?
- Mailcow Alias aktiv?
- GitHub Actions Logs prüfen

### E-Mails kommen nicht an
- Mailcow Logs prüfen (UI → Logs → Postfix)
- Spam-Ordner überprüfen
- Alias-Ziel-Adressen korrekt?

---

Erstellt für den Feuerwehrverein Raura Kaiseraugst 🔥
