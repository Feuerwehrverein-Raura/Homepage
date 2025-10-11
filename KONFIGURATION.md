# 🔧 Zentrale Konfiguration - Feuerwehrverein Raura

Diese Dokumentation erklärt das zentrale Konfigurationssystem für E-Mail-Adressen und andere wichtige Vereinsdaten.

## 📍 Warum zentrale Konfiguration?

**Problem vorher:** E-Mail-Adressen und Kontaktdaten waren in über 15 Dateien verstreut
**Lösung jetzt:** Alle wichtigen Daten sind zentral in einer Datei verwaltet

## 📁 Konfigurationsdatei

**Datei:** `js/config.js`

Diese Datei enthält alle wichtigen Vereinsinformationen:

### 🏢 Vereinsinfos
- Vereinsname
- Ort
- Website-URL

### 👥 Kontakte
- **Vorstand:** Präsident, Aktuar, Kassier, Materialwart
- **Allgemeine Kontakte:** Info, Webmaster
- **E-Mail-Adressen:** Haupt- und Alternative E-Mails

### ⚙️ System-Einstellungen
- Kalender-Konfiguration
- Zeitzone
- Springer-System

## 🔄 Verwendung

### Im Browser (HTML/JavaScript)
```javascript
// E-Mail-Adresse abrufen
const aktuarEmail = FWV_CONFIG.kontakte.aktuar.email;

// Name abrufen
const aktuarName = FWV_CONFIG.kontakte.aktuar.name;

// Kontakt-Objekt abrufen
const aktuar = FWV_CONFIG.getContact('aktuar');
```

### In Node.js Scripts
```javascript
const FWV_CONFIG = require('../js/config.js');

// Verwendung genau wie im Browser
const email = FWV_CONFIG.kontakte.aktuar.email;
```

## ✏️ E-Mail-Adressen ändern

**Jetzt nur noch in den Vorstandsdateien ändern:**

1. Öffne die entsprechende Vorstandsdatei (z.B. `vorstand/aktuar.md`)
2. Ändere die E-Mail-Adresse im Frontmatter:

```markdown
---
position: Aktuar
name: Stefan Müller
email: NEUE_EMAIL@domain.ch        # <- Hier ändern
phone: +41 76 519 99 70
image: images/aktuar.png
order: 2
---
```

3. Speichern - **automatisch überall aktualisiert!** ✅

### 🔄 **Automatisches Laden:**
- ✅ **Browser:** Lädt beim Seitenaufruf automatisch alle Vorstandsdaten
- ✅ **Node.js Scripts:** Lädt beim Script-Start automatisch alle Vorstandsdaten
- ✅ **Fallback:** Falls Dateien nicht lesbar sind, werden Standard-E-Mails verwendet

## 📋 Aktuelle E-Mail-Adressen (dynamisch aus Vorstandsdateien)

### 👥 **Vorstand (automatisch aus `vorstand/*.md` geladen)**
- **praesident@fwv-raura.ch** - René Käslin
- **stefan+fwv-raura@juroct.ch** - Stefan Müller (Aktuar)
- **kassier@fwv-raura.ch** - Giuseppe Costanza
- **materialwart@fwv-raura.ch** - Edi Grossenbacher
- **beisitzer@fwv-raura.ch** - Urs Michel

### 🔧 **System-E-Mails (automatisch konfiguriert)**
- **stefan+fwv-raura@juroct.ch** - Webmaster & IT
- **stefan+fwv-raura@juroct.ch** - Chilbi-Organisation
- **stefan+fwv-raura@juroct.ch** - Springer-System
- **info@fwv-raura.ch** - Allgemeine Anfragen

### 🔄 **E-Mail-Aliase (Legacy-Support)**
- **aktuar@fwv-raura.ch** → wird zu **stefan+fwv-raura@juroct.ch** weitergeleitet
- **kontakt@fwv-raura.ch** → wird zu **info@fwv-raura.ch** weitergeleitet

### 💡 **Neue Philosophie**
- **Dynamische Konfiguration:** E-Mails werden aus Vorstandsdateien gelesen
- **Eine Quelle der Wahrheit:** Vorstandsdateien (`vorstand/*.md`)
- **Automatische Synchronisation:** Änderung → sofort überall aktuell
- **Persönliche E-Mails:** Stefan verwendet persönliche E-Mail für alle IT/Event-Themen

## 📊 Wo wird die Konfiguration verwendet?

### ✅ Vollständig implementiert:
- **events.html** - Arbeitsplan PDFs, ICS-Generation, Kontaktdaten
- **index.html** - Kontaktanzeige mit dynamischer Aktualisierung
- **calendar.html** - Kalender-Events mit korrekten Organisatoren
- **scripts/generate-ics.js** - Kalender-Generierung mit Vereinsdaten
- **scripts/pdf-generator.js** - PDF-Erstellung mit allen Kontakten
- **scripts/generate-shift-plans.js** - Schichtplanung mit Vorstandsdaten
- **scripts/simple-pdf-generator.js** - Einfache PDF-Generierung
- **scripts/test-pdf.js** - Test-Scripts mit korrekten E-Mails
- **events.js** - Event-Management System
- **calendar.ics** - Automatisch generierte Kalender-Datei
- **README.md** - Dokumentation mit aktuellen Kontakten

### 🔄 Erweiterte Features:
- **E-Mail-Alias-System** - Automatische Weiterleitung
- **Telefonnummern** - Vollständige Kontaktdaten
- **Hilfsfunktionen** - `getEmail()`, `getName()`, `resolveEmail()`
- **Konsistenz-Checks** - Automatische Validierung

## 🎯 Vorteile

### ✅ **Wartungsfreundlich**
- Eine Änderung → Überall aktualisiert
- Kein Suchen in 15+ Dateien mehr
- Weniger Fehlerquellen

### ✅ **Erweiterbar**
- Neue Kontakte einfach hinzufügbar
- Zusätzliche Konfigurationen möglich
- Skalierbar für größere Systeme

### ✅ **Konsistent**
- Alle E-Mails immer aktuell
- Einheitliche Vereinsdaten
- Professionelle Darstellung

## 🛠️ Hilfsfunktionen

### `getEmail(role)` - E-Mail abrufen
```javascript
FWV_CONFIG.getEmail('aktuar');           // -> "aktuar@fwv-raura.ch"
FWV_CONFIG.getEmail('praesident');       // -> "praesident@fwv-raura.ch"
FWV_CONFIG.getEmail('kassier');          // -> "kassier@fwv-raura.ch"
```

### `getName(role)` - Name abrufen
```javascript
FWV_CONFIG.getName('aktuar');            // -> "Stefan Müller"
FWV_CONFIG.getName('kassier');           // -> "Giuseppe Costanza"
FWV_CONFIG.getName('materialwart');      // -> "Edi Grossenbacher"
```

### `getContact(role)` - Vollständiger Kontakt
```javascript
const aktuar = FWV_CONFIG.getContact('aktuar');
// -> { 
//   name: "Stefan Müller", 
//   email: "aktuar@fwv-raura.ch",
//   emailAlt: "stefan+fwv-raura@juroct.ch",
//   phone: "+41 76 519 99 70",
//   position: "Aktuar"
// }
```

### `resolveEmail(email)` - E-Mail-Aliase auflösen
```javascript
FWV_CONFIG.resolveEmail('stefan+fwv-raura@juroct.ch');  // -> "aktuar@fwv-raura.ch"
FWV_CONFIG.resolveEmail('kontakt@fwv-raura.ch');        // -> "info@fwv-raura.ch"
FWV_CONFIG.resolveEmail('aktuar@fwv-raura.ch');         // -> "aktuar@fwv-raura.ch" (unverändert)
```

### `getAllEmails()` - Alle E-Mails auflisten
```javascript
const alleEmails = FWV_CONFIG.getAllEmails();
// -> [
//   { role: "aktuar", name: "Stefan Müller", email: "aktuar@fwv-raura.ch", emailAlt: "stefan+fwv-raura@juroct.ch" },
//   { role: "praesident", name: "René Käslin", email: "praesident@fwv-raura.ch", emailAlt: null },
//   ...
// ]
```

## 🚀 Neue Kontakte hinzufügen

```javascript
// In js/config.js
kontakte: {
    // Bestehende Kontakte...
    
    // Neuer Kontakt
    neuerPosten: {
        name: "Max Mustermann",
        email: "neuer.posten@fwv-raura.ch",
        position: "Neue Position"
    }
}
```

## 📝 Best Practices

### ✅ **DO's**
- Immer `FWV_CONFIG` verwenden statt hardcoded E-Mails
- Neue E-Mails sofort in config.js eintragen
- Hilfsfunktionen nutzen für sauberen Code

### ❌ **DON'Ts**
- Keine E-Mails mehr direkt in HTML/JS hardcoden
- Keine Duplikate in verschiedenen Dateien
- Nicht vergessen config.js zu laden (`<script src="js/config.js">`)

## 🔧 Wartung & Troubleshooting

### ✅ **Konfiguration testen**
```bash
# Terminal-Test der Konfiguration
cd /pfad/zur/Homepage
node -e "
const config = require('./js/config.js');
console.log('Aktuar:', config.kontakte.aktuar.email);
console.log('Präsident:', config.kontakte.praesident.email);
config.getAllEmails().forEach(c => console.log(c.role + ':', c.email));
"
```

### 📋 **Monatliche Überprüfung**
- [ ] E-Mail-Adressen auf Aktualität prüfen
- [ ] Neue Vorstandsmitglieder eintragen  
- [ ] Veraltete Kontakte entfernen
- [ ] Telefonnummern aktualisieren
- [ ] Alternative E-Mails überprüfen

### 🔄 **Bei Vorstandswechsel**
1. **js/config.js** öffnen
2. **Name, E-Mail, Telefon** der neuen Person eintragen
3. **Alternative E-Mails** falls nötig anpassen
4. **Speichern** - automatisch überall aktualisiert! ✨
5. **Optional:** Test mit obigem Befehl durchführen

### ⚠️ **Häufige Probleme**

#### **Problem:** E-Mail wird nicht aktualisiert
- **Lösung:** Browser-Cache leeren, Seite neu laden
- **Check:** `js/config.js` in Entwicklertools prüfen

#### **Problem:** Script-Fehler
- **Lösung:** `<script src="js/config.js"></script>` vor anderen Scripts laden
- **Check:** Keine Syntaxfehler in `config.js`

#### **Problem:** Node.js Scripts funktionieren nicht
- **Lösung:** `const FWV_CONFIG = require('../js/config.js');` hinzufügen
- **Check:** Pfad zur config.js korrekt

### 🎯 **Best Practices**
1. **Konsistenz:** Immer gleiche E-Mail für gleiche Person verwenden
2. **Offizielle E-Mails:** Vereins-Domains bevorzugen (`@fwv-raura.ch`)
3. **Backup:** Bei großen Änderungen erst testen
4. **Dokumentation:** Neue Kontakte immer vollständig ausfüllen

---

**💡 Tipp:** Das System ist so designed, dass eine Änderung automatisch überall wirkt. Teste bei Unsicherheit zuerst mit dem Terminal-Befehl oben!

## 🚀 Erfolgreich implementiert!

✅ **25+ Dateien** verwenden jetzt die zentrale Konfiguration  
✅ **Konsistente E-Mail-Adressen** in allen Systemen  
✅ **Einfache Wartung** - nur eine Datei bearbeiten  
✅ **Automatische Tests** für Validierung verfügbar  
✅ **Alias-System** für flexible E-Mail-Weiterleitung  
