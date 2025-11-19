# n8n Workflows

Diese Workflows werden auf `https://n8n.fwv-raura.ch` verwendet.

## Workflows

### kontaktformular.json
- **Webhook:** `POST /webhook/contact-form`
- **Funktion:** Verarbeitet Kontaktanfragen und Mitgliedschaftsanträge
- **E-Mails:**
  - Mitgliedschaft → Aktuar + Kassier (dynamisch aus Markdown-Dateien)
  - Andere Anfragen → vorstand@fwv-raura.ch
  - Bestätigung an Absender

### event-anmeldung.json
- **Webhook:** `POST /webhook/event-registration`
- **Funktion:** Verarbeitet Helfer- und Teilnehmer-Anmeldungen
- **E-Mails:**
  - Benachrichtigung an Event-Organisator
  - Bestätigung an Teilnehmer

## Import in n8n

1. Gehe zu n8n → **Workflows** → **Import from File**
2. Wähle die JSON-Datei aus
3. Konfiguriere die SMTP-Credentials bei den E-Mail-Nodes

## SMTP-Konfiguration

Alle E-Mail-Nodes benötigen SMTP-Credentials:
- **Host:** mail.test.juroct.net
- **Port:** 587
- **User:** website@fwv-raura.ch
- **SSL/TLS:** STARTTLS

## Backup

Die Workflows werden automatisch als JSON-Dateien in diesem Repository gespeichert.
Bei Änderungen in n8n sollten die Dateien hier aktualisiert werden.
