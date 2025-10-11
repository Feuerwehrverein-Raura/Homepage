# 📂 Scripts Directory

Alle JavaScript-Module und Konfigurationsdateien für die Feuerwehrverein Raura Homepage.

## 📁 Verzeichnisstruktur

```
scripts/
├── config.js           # 🔧 Zentrale Konfiguration
├── generate-ics.js     # 📅 ICS-Kalender Generator  
├── pdf-generator.js    # 📄 PDF-Generator (Puppeteer)
└── Readme.md          # 📖 Diese Dokumentation
```

---

## 📋 Script-Übersicht

### **🔧 config.js**
**Zweck:** Zentrale Konfiguration für alle E-Mail-Adressen und Vereinsdaten

**Verwendung:**
```javascript
// Browser
FWV_CONFIG.getEmail('aktuar');        // -> "aktuar@fwv-raura.ch"
FWV_CONFIG.getName('praesident');     // -> "René Käslin"

// Node.js
const FWV_CONFIG = require('./config.js');
const email = FWV_CONFIG.kontakte.aktuar.email;
```

**Features:**
- ✅ Zentrale E-Mail-Verwaltung
- ✅ Vorstandskontakte mit Telefonnummern
- ✅ Hilfsfunktionen für einfachen Zugriff
- ✅ Browser & Node.js kompatibel
- ✅ E-Mail-Alias-System

**Eingebunden in:**
- `index.html`, `events.html`, `calendar.html`
- Alle anderen Scripts in diesem Ordner

---

### **📅 generate-ics.js**
**Zweck:** Generiert ICS-Kalenderdateien aus Markdown-Event-Dateien

**Ausführung:**
```bash
node scripts/generate-ics.js
```

**Features:**
- ✅ Parst Markdown-Dateien mit Frontmatter
- ✅ Validiert Datumsformate und Pflichtfelder
- ✅ Generiert RFC-konforme ICS-Dateien
- ✅ Unterstützt mehrere Events und Kategorien
- ✅ Umfangreiches Logging mit Emojis
- ✅ Verwendet zentrale Konfiguration

**Automatisierung:**
- 🤖 **GitHub Action:** Läuft automatisch bei Änderungen in `events/`
- ⏰ **Zeitplan:** Täglich um 6:00 Uhr UTC
- 📄 **Output:** Aktualisiert `calendar.ics`

---

### **📄 pdf-generator.js**
**Zweck:** Professionelle PDF-Generierung für Events und Arbeitspläne

**Verwendung:**
```javascript
const PDFGenerator = require('./pdf-generator');
const generator = new PDFGenerator();
await generator.initialize();
await generator.generateShiftPlanPDF(event, assignments, markdownContent);
```

**Features:**
- ✅ Professionelle PDF-Layouts mit CSS
- ✅ Event-Details und Schichtplanung
- ✅ Statistiken und Übersichts-Dashboards
- ✅ Druckoptimierte Formatierung
- ✅ Header/Footer-Templates
- ✅ Verwendet zentrale Kontaktdaten

**Abhängigkeiten:** Puppeteer (Headless Chrome)

---

## 🔧 Gemeinsame Funktionalitäten

### **Event-Parsing**
Standardisiertes Parsen für alle Scripts:

```javascript
parseMarkdownEvent(content, filename) {
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!frontmatterMatch) return null;
    
    const [, frontmatterStr, markdownContent] = frontmatterMatch;
    const frontmatter = this.parseFrontmatter(frontmatterStr);
    
    return {
        ...frontmatter,
        description: markdownContent.trim(),
        startDate: new Date(frontmatter.startDate),
        endDate: new Date(frontmatter.endDate)
    };
}
```

### **Datums-Handling**
Standardisierte Formatierung und Validierung:

```javascript
formatDateForICS(date) {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

isValidDate(date) {
    return date instanceof Date && !isNaN(date.getTime());
}
```

### **Error Handling**
Konsistentes Logging mit Emoji-Präfixen:

```javascript
console.log('✅ Erfolgreich verarbeitet');
console.warn('⚠️  Warnung gefunden');
console.error('❌ Fehler aufgetreten');
```

---

## 🚀 Automatisierung

### **GitHub Actions**
```yaml
# .github/workflows/generate-calendar.yml
name: Generate Calendar ICS
on:
  push:
    paths: ['events/**']
  schedule:
    - cron: '0 6 * * *'

jobs:
  generate-calendar:
    runs-on: ubuntu-latest
    steps:
      - name: Generate ICS file
        run: node scripts/generate-ics.js
```

---

## 🔗 Abhängigkeiten

### **Externe Bibliotheken**
- **Puppeteer** (pdf-generator.js) - Headless Chrome für PDF-Generierung
- **Node.js** - Laufzeitumgebung

### **Interne Abhängigkeiten**
- Event Markdown-Dateien (`events/*.md`)
- Assignment-Dateien (`events/*-assignments.md`)
- Zentrale Konfiguration (`config.js`)

---

## 💻 Entwicklung

### **Neue Scripts hinzufügen**
1. Script-Datei in `scripts/` erstellen
2. Naming Convention: `verb-noun.js`
3. Error Handling und Logging einbauen
4. In diesem README dokumentieren
5. Bei Bedarf zu `package.json` hinzufügen

### **Best Practices**
- ✅ Aussagekräftige Funktionsnamen verwenden
- ✅ Umfangreiches Error Handling
- ✅ Progress-Logging mit Emoji-Präfixen
- ✅ Alle Eingaben validieren
- ✅ CLI und Modul-Verwendung unterstützen
- ✅ Zentrale Konfiguration verwenden (`FWV_CONFIG`)

---

## 🎯 Optimierungen (Oktober 2025)

### **Was wurde bereinigt:**
- ❌ **Gelöscht:** `js/` Ordner (in `scripts/` integriert)
- ❌ **Gelöscht:** `simple-pdf-generator.js` (nicht verwendet)
- ❌ **Gelöscht:** `generate-shift-plans.js` (nicht verwendet)
- ❌ **Gelöscht:** `test-pdf.js` (nur für Tests)
- ❌ **Gelöscht:** Veraltete `Readme.md` mit falschen Informationen

### **Was wurde optimiert:**
- ✅ **Vereinfacht:** Nur noch ein `scripts/` Ordner
- ✅ **Zentralisiert:** Alle Konfiguration in `config.js`
- ✅ **Aktualisiert:** Alle Pfad-Referenzen korrigiert
- ✅ **Dokumentiert:** Realistische, aktuelle Dokumentation

---

## 📞 Support

**Technische Probleme:**
- 📧 Kontakt: **aktuar@fwv-raura.ch**
- 🐛 GitHub Issues: [Repository Issues](https://github.com/Feuerwehrverein-Raura/Homepage/issues)

**Dokumentation:**
- 📖 Haupt-README: [../README.md](../README.md)
- 🔧 Konfiguration: [../KONFIGURATION.md](../KONFIGURATION.md)

---

**Letzte Aktualisierung:** Oktober 2025  
**Wartung:** Feuerwehrverein Raura IT Team (Stefan Müller)
