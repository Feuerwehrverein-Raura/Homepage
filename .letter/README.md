# Brief-Versand via Pingen

Automatischer Versand von Event-Einladungen per Post via Pingen API für Mitglieder, die lieber Briefe erhalten.

## 📮 Was ist Pingen?

[Pingen](https://www.pingen.com) ist ein Schweizer Service, der PDFs/HTML in physische Briefe umwandelt und per Schweizer Post versendet.

**Vorteile:**
- ✅ Automatischer Briefversand
- ✅ A-Post oder B-Post
- ✅ Professioneller Druck
- ✅ Tracking und Zustellbestätigung
- ✅ Günstiger als selbst drucken und versenden

**Kosten (ca.):**
- CHF 1.30 - 1.50 pro Brief (1 Seite, A-Post)
- CHF 0.90 - 1.10 pro Brief (1 Seite, B-Post)

## 🚀 Setup

### 1. Pingen Account erstellen

1. Gehen Sie zu: https://www.pingen.com
2. Registrieren Sie sich für einen Account
3. Gehen Sie zu: **API** → **API Keys**
4. Erstellen Sie einen neuen API Key
5. Kopieren Sie den Key

### 2. GitHub Secrets konfigurieren

Gehen Sie zu: `Settings → Secrets and variables → Actions → New repository secret`

| Secret Name | Wert | Beschreibung |
|-------------|------|--------------|
| `PINGEN_API_KEY` | `pk_live_...` | Ihr Pingen API Key |
| `PINGEN_STAGING` | `false` | `true` für Testmodus, `false` für Produktion |
| `LETTER_RECIPIENTS` | JSON (siehe unten) | Liste der Brief-Empfänger |

### 3. Empfänger-Liste konfigurieren

**Schritt 1:** Bearbeiten Sie `.letter/recipients-template.json`:

```json
{
  "recipients": [
    {
      "name": "Max Mustermann",
      "address": {
        "street": "Musterstrasse 123",
        "zip": "4303",
        "city": "Kaiseraugst",
        "country": "CH"
      },
      "active": true
    },
    {
      "name": "Erika Musterfrau",
      "address": {
        "street": "Hauptstrasse 45",
        "zip": "4303",
        "city": "Kaiseraugst",
        "country": "CH"
      },
      "active": true
    }
  ]
}
```

**Schritt 2:** Komprimieren Sie den JSON (alles in einer Zeile):

```bash
# Mit jq
cat .letter/recipients-template.json | jq -c

# Oder online: https://jsonformatter.org/json-minify
```

**Schritt 3:** Erstellen Sie GitHub Secret `LETTER_RECIPIENTS` mit dem komprimierten JSON.

### 4. Testen

**Im Testmodus (kostenlos):**

1. Setzen Sie `PINGEN_STAGING=true`
2. Actions → Send Event Letter Invitations → Run workflow
3. Geben Sie ein: `events/weihnachtshock2025.md`
4. Prüfen Sie die Logs
5. Briefe werden NICHT wirklich versendet (nur Simulation)

**Im Produktionsmodus:**

1. Setzen Sie `PINGEN_STAGING=false`
2. Actions → Send Event Letter Invitations → Run workflow
3. Geben Sie ein: `events/weihnachtshock2025.md`
4. **ACHTUNG:** Briefe werden wirklich versendet und kosten Geld!

## 📧 E-Mail + Brief kombinieren

Sie können E-Mails UND Briefe kombinieren:

**Workflow 1:** Senden Sie E-Mails an Mitglieder mit E-Mail-Adressen (Mailcow Verteilerliste)
**Workflow 2:** Senden Sie Briefe an Mitglieder ohne E-Mail oder die Post bevorzugen

So erreichen Sie alle Mitglieder!

## 💰 Kosten-Schätzung

**Beispiel: 50 Mitglieder**
- 40 Mitglieder erhalten E-Mail (kostenlos)
- 10 Mitglieder erhalten Brief (10 × CHF 1.30 = CHF 13.00)

**Pro Event:** CHF 13.00
**Pro Jahr (6 Events):** CHF 78.00

Viel günstiger als selbst drucken, kuvertieren und frankieren!

## 🔧 Erweiterte Konfiguration

### A-Post vs. B-Post

Im Script `send-event-letter.js`:

```javascript
// A-Post (nächster Tag, teurer)
body += `priority\r\n`;

// B-Post (2-3 Tage, günstiger)
body += `economy\r\n`;
```

### Farbe vs. Schwarz-Weiss

Pingen unterstützt auch Farbdruck (teurer):

```javascript
// Schwarz-Weiss (Standard)
body += `Content-Disposition: form-data; name="color"\r\n\r\n`;
body += `false\r\n`;

// Farbe
body += `Content-Disposition: form-data; name="color"\r\n\r\n`;
body += `true\r\n`;
```

### Mehrere Seiten

Wenn Ihre Event-Beschreibung länger ist, fügt Pingen automatisch Seiten hinzu.

## 📊 Tracking

In der Pingen Web-App können Sie:
- ✅ Status aller Briefe sehen
- ✅ Zustellbestätigungen erhalten
- ✅ Kosten tracken
- ✅ Historie einsehen

## 🐛 Troubleshooting

### "Pingen API Error: 401"
- API Key falsch
- API Key abgelaufen
- Prüfen Sie `PINGEN_API_KEY` Secret

### "Pingen API Error: 402 Payment Required"
- Pingen-Guthaben aufgebraucht
- Laden Sie Guthaben auf: https://www.pingen.com/billing

### "Invalid address"
- Adresse ist nicht korrekt formatiert
- Schweizer Adressen brauchen gültige PLZ
- Prüfen Sie `LETTER_RECIPIENTS` JSON

### Briefe kommen nicht an
- Prüfen Sie Status in Pingen Web-App
- Adresse korrekt?
- Empfänger umgezogen?

## 🔐 Sicherheit

- ✅ API Key als GitHub Secret (verschlüsselt)
- ✅ Empfänger-Adressen als Secret
- ✅ Nicht im Code/Git
- ✅ Staging-Modus für Tests

## 💡 Tipps

1. **Testen Sie zuerst im Staging-Modus!**
2. Senden Sie zuerst einen Test-Brief an sich selbst
3. Nutzen Sie B-Post für nicht-dringende Events (spart Geld)
4. Kombinieren Sie E-Mail + Brief für maximale Reichweite
5. Halten Sie Adress-Daten aktuell

## 📞 Support

**Pingen Support:**
- E-Mail: support@pingen.com
- Telefon: +41 44 552 05 66
- Dokumentation: https://api.pingen.com/documentation

**Bei Fragen zum Script:**
- GitHub Issues: https://github.com/Feuerwehrverein-Raura/Homepage/issues
- E-Mail: webmaster@fwv-raura.ch

---

🔥 Viel Erfolg mit dem Brief-Versand!
