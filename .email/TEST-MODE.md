# Test-Modus für E-Mail und Brief-Versand

Mit dem Test-Modus können Sie Event-Einladungen zunächst an eine einzelne Person senden, bevor Sie sie an alle Mitglieder verschicken.

## 🧪 E-Mail Test-Versand

### Workflow starten

1. Gehen Sie zu: [GitHub Actions → Send Event Email](https://github.com/Feuerwehrverein-Raura/Homepage/actions/workflows/send-event-email.yml)
2. Klicken Sie auf **"Run workflow"**
3. Wählen Sie die Parameter:

| Parameter | Wert | Beschreibung |
|-----------|------|--------------|
| **Event-Datei** | `events/weihnachtshock2025.md` | Pfad zur Event-Datei |
| **Versand-Modus** | `Test (einzelne Person)` | Test-Modus aktivieren |
| **Test-E-Mail-Adresse** | `ihre.email@example.com` | Empfänger-E-Mail |

4. Klicken Sie auf **"Run workflow"** (grüner Button)

### Was passiert im Test-Modus?

- ✅ E-Mail wird nur an die angegebene Test-Adresse gesendet
- ✅ Wenn die E-Mail in `mitglieder_data.json` gefunden wird, wird der richtige Name verwendet
- ✅ Sonst wird der Teil vor dem @ als Name genutzt
- ✅ Keine anderen Mitglieder erhalten E-Mails

### Beispiel

```bash
# Test-Modus aktiviert
🧪 TEST MODUS aktiviert!
📧 Test-E-Mail wird gesendet an: max.mustermann@example.com
✅ Test-Mitglied gefunden: Max Mustermann
📧 Versende E-Mails...
✅ E-Mail gesendet an Max Mustermann (max.mustermann@example.com)
```

## 📮 Brief Test-Versand

### Workflow starten

1. Gehen Sie zu: [GitHub Actions → Send Event Letter](https://github.com/Feuerwehrverein-Raura/Homepage/actions/workflows/send-event-letter.yml)
2. Klicken Sie auf **"Run workflow"**
3. Wählen Sie die Parameter:

| Parameter | Wert | Beschreibung |
|-----------|------|--------------|
| **Event-Datei** | `events/weihnachtshock2025.md` | Pfad zur Event-Datei |
| **Versand-Modus** | `Test (einzelne Person)` | Test-Modus aktivieren |
| **E-Mail des Test-Mitglieds** | `max.mustermann@example.com` | E-Mail zur Identifikation |

4. Klicken Sie auf **"Run workflow"** (grüner Button)

### Was passiert im Test-Modus?

- ✅ Brief wird nur an das Mitglied mit der angegebenen E-Mail gesendet
- ✅ Das System sucht die E-Mail in `mitglieder_data.json`
- ✅ Die Adresse wird aus den Mitgliederdaten geladen (Strasse, PLZ, Ort)
- ✅ **Wichtig:** Pingen STAGING-Modus wird verwendet (kein echter Versand!)
- ✅ Keine Kosten entstehen im Test-Modus

### Beispiel

```bash
# Test-Modus aktiviert
🧪 TEST MODUS aktiviert!
✅ Test-Mitglied gefunden: Max Mustermann
📮 Test-Brief wird gesendet an: Hauptstrasse 123, 4303 Kaiseraugst
📮 Verwendet Pingen STAGING (Briefe werden NICHT wirklich versendet)
✅ Brief versendet an Max Mustermann (Kaiseraugst)
```

## 🚀 Produktiv-Versand

Wenn der Test erfolgreich war, können Sie den Versand an alle Mitglieder starten:

### E-Mail Produktiv-Versand

1. Workflow öffnen: [Send Event Email](https://github.com/Feuerwehrverein-Raura/Homepage/actions/workflows/send-event-email.yml)
2. **Versand-Modus** = `Alle Mitglieder`
3. **Test-E-Mail-Adresse** = leer lassen
4. Run workflow

**Achtung:** E-Mails werden an ALLE Mitglieder mit `zustellung-email: true` gesendet!

### Brief Produktiv-Versand

1. Workflow öffnen: [Send Event Letter](https://github.com/Feuerwehrverein-Raura/Homepage/actions/workflows/send-event-letter.yml)
2. **Versand-Modus** = `Alle Mitglieder`
3. **E-Mail des Test-Mitglieds** = leer lassen
4. Run workflow

**Achtung:**
- ⚠️ Briefe werden WIRKLICH via Pingen versendet!
- ⚠️ Echte KOSTEN entstehen (ca. CHF 1.00 - 2.00 pro Brief)
- ⚠️ Briefe gehen an ALLE Mitglieder mit `zustellung-post: true`

## 📊 Empfänger-Übersicht

### E-Mail-Empfänger

Mitglieder erhalten E-Mails wenn:
- ✅ `Status` = "Aktivmitglied" ODER "Ehrenmitglied"
- ✅ `E-Mail` ist vorhanden und nicht leer
- ✅ `zustellung-email` = `true`

### Brief-Empfänger

Mitglieder erhalten Briefe wenn:
- ✅ `Status` = "Aktivmitglied" ODER "Ehrenmitglied"
- ✅ `zustellung-post` = `true`
- ✅ `Strasse`, `PLZ`, `Ort` sind vorhanden

## 🔍 Wer erhält was?

Sie können die Empfänger vorab prüfen:

### E-Mail-Empfänger anzeigen

```bash
node -e "
const fs = require('fs');
const members = JSON.parse(fs.readFileSync('mitglieder_data.json', 'utf-8'));
const recipients = members.filter(m =>
  (m.Status === 'Aktivmitglied' || m.Status === 'Ehrenmitglied') &&
  m['E-Mail'] &&
  m['zustellung-email'] === true
);
console.log('E-Mail-Empfänger:', recipients.length);
recipients.forEach(m => console.log('  -', m.Mitglied, m['E-Mail']));
"
```

### Brief-Empfänger anzeigen

```bash
node -e "
const fs = require('fs');
const members = JSON.parse(fs.readFileSync('mitglieder_data.json', 'utf-8'));
const recipients = members.filter(m =>
  (m.Status === 'Aktivmitglied' || m.Status === 'Ehrenmitglied') &&
  m['zustellung-post'] === true &&
  m.Strasse && m.PLZ && m.Ort
);
console.log('Brief-Empfänger:', recipients.length);
recipients.forEach(m => console.log('  -', m.Mitglied, m.Strasse, m.PLZ, m.Ort));
"
```

## ⚙️ Technische Details

### Environment Variables (Test-Modus)

**E-Mail:**
```bash
TEST_EMAIL=max.mustermann@example.com
```

**Brief:**
```bash
TEST_EMAIL=max.mustermann@example.com  # E-Mail zur Identifikation
PINGEN_STAGING=true                     # Staging-Modus (kein echter Versand)
```

### Environment Variables (Produktiv)

**E-Mail:**
```bash
# TEST_EMAIL nicht gesetzt
```

**Brief:**
```bash
# TEST_EMAIL nicht gesetzt
PINGEN_STAGING=false  # Produktiv-Modus (echter Versand!)
```

## 🐛 Troubleshooting

### "Test-Mitglied nicht gefunden"

**Problem:** E-Mail existiert nicht in `mitglieder_data.json`

**Lösung:**
- Prüfen Sie die korrekte Schreibweise
- Suchen Sie in der Datei nach dem Feld `"E-Mail"`
- Achten Sie auf Groß-/Kleinschreibung (wird ignoriert, aber Tippfehler nicht!)

### "Test-Mitglied hat keine vollständige Adresse"

**Problem:** Brief-Test funktioniert nicht, weil Adresse fehlt

**Lösung:**
- Prüfen Sie die Felder: `Strasse`, `PLZ`, `Ort`
- Alle drei Felder müssen vorhanden sein
- Aktualisieren Sie die Mitgliederdaten

### Pingen Staging vs. Production

**Staging (Test-Modus):**
- ✅ Keine echten Briefe
- ✅ Keine Kosten
- ✅ API-Tests möglich
- ⚠️ Briefe werden nur simuliert

**Production (Produktiv):**
- ⚠️ ECHTE Briefe
- ⚠️ ECHTE Kosten
- ⚠️ Briefe werden wirklich versendet
- ⚠️ NICHT rückgängig zu machen!

## 📝 Best Practices

### Vor jedem Versand

1. ✅ **Test zuerst!** Immer erst im Test-Modus testen
2. ✅ **Event prüfen:** Ist die Event-Datei korrekt?
3. ✅ **Empfänger prüfen:** Sind die richtigen Leute markiert?
4. ✅ **Template prüfen:** Sieht die E-Mail/Brief gut aus?
5. ✅ **Kosten kalkulieren:** Bei Briefen Kosten vorher überschlagen

### Event-Datei Checkliste

- ✅ `title` korrekt
- ✅ `startDate` und `endDate` im richtigen Format
- ✅ `location` angegeben
- ✅ `organizer` und `email` korrekt
- ✅ Beschreibung vollständig und korrekt
- ✅ Rechtschreibung geprüft

### Nach dem Versand

1. ✅ Workflow-Logs prüfen
2. ✅ Anzahl erfolgreicher Versendungen kontrollieren
3. ✅ Bei Fehlern: Fehlermeldungen lesen und beheben
4. ✅ Bei Briefen: Pingen-Dashboard prüfen

## 💰 Kostenübersicht (Briefe)

**Geschätzte Kosten pro Brief via Pingen:**
- A-Post (priority): ca. CHF 1.50 - 2.00
- B-Post (economy): ca. CHF 1.00 - 1.50

**Beispiel-Rechnung:**
- 18 Brief-Empfänger
- A-Post à CHF 1.50
- **Total: ca. CHF 27.00**

**Tipp:** Nutzen Sie E-Mail wo möglich, um Kosten zu sparen!

---

🔥 **Entwickelt für den Feuerwehrverein Raura Kaiseraugst**
