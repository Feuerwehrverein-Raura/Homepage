# 📄 PDF-Generator für Feuerwehrverein Raura

Dieses Verzeichnis enthält die generierten druckbaren HTML-Dateien für die Schichtpläne und Event-Übersichten des Feuerwehrvereins Raura.

## 🎯 Übersicht

Die PDF-Funktionalität generiert druckoptimierte HTML-Dateien, die einfach in jeden Browser geladen und als PDF gedruckt werden können.

### Generierte Dateien

- **Event-Arbeitspläne**: `{event-id}-arbeitsplan.html`
  - Detaillierte Schichtpläne für spezifische Events
  - Übersichtliche Tabellen nach Kategorien (Aufbau, Samstag, Sonntag, Abbau)
  - Status-Anzeigen für kritische Schichten
  - Kontaktinformationen

- **Gesamt-Übersicht**: `fwv-raura-events-overview.html`
  - Übersicht über alle Events
  - Zusammenfassung der Schicht-Statistiken
  - Kritische Bereiche auf einen Blick

## 🖨️ PDF erstellen

### Schritt-für-Schritt Anleitung:

1. **HTML-Datei öffnen**
   - Doppelklick auf die gewünschte `.html` Datei
   - Datei öffnet sich im Standard-Browser

2. **Drucken starten**
   - **Windows/Linux**: `Ctrl + P`
   - **Mac**: `Cmd + P`

3. **PDF-Optionen wählen**
   - **Ziel**: "Als PDF speichern" oder "Microsoft Print to PDF"
   - **Layout**: Hochformat (empfohlen)
   - **Papierformat**: A4
   - **Ränder**: Standard oder schmal

4. **PDF speichern**
   - Dateiname eingeben
   - Speicherort wählen
   - "Speichern" klicken

## 🔧 Generierung

### Automatische Generierung

```bash
# Alle Schichtpläne und PDFs generieren
npm run generate-shifts

# Oder direkt:
node scripts/generate-shift-plans.js
```

### Test-Generierung

```bash
# Test-PDFs mit Beispieldaten generieren
node scripts/test-pdf.js
```

## 📋 Features

### ✅ Implementiert

- **Druckoptimierte Layouts**: Speziell für A4-Druck optimiert
- **Responsive Design**: Automatische Anpassung an verschiedene Bildschirmgrößen
- **Farb-kodierte Status**: Grün (besetzt), Orange (teilweise), Rot (kritisch)
- **Professionelle Gestaltung**: FWV Raura Branding und Logo
- **Kategorisierte Schichten**: Aufbau, Tagesbetrieb, Abbau
- **Statistik-Dashboard**: Visueller Fortschrittsbalken und Kennzahlen
- **Kontaktinformationen**: Springer-System und Koordination
- **Print-Anweisungen**: Eingebaute Hilfe für PDF-Erstellung

### 🚀 Erweiterte Funktionen

- **Kritische Schichten Hervorhebung**: Automatische Warnung bei unbesetzten Schichten
- **Zeitslot-Gruppierung**: Übersichtliche Darstellung nach Uhrzeiten
- **Bereich-Sortierung**: Bar, Küche, Kasse logisch angeordnet
- **Fortschrittsanzeige**: Prozentuale Besetzung auf einen Blick

## 🎨 Design-Features

### Farbschema
- **Hauptfarbe**: FWV Raura Rot (#d32f2f)
- **Erfolg**: Grün (#4caf50) für vollständig besetzte Schichten
- **Warnung**: Orange (#ff9800) für teilweise besetzte Schichten
- **Kritisch**: Rot (#f44336) für unbesetzte Schichten

### Layout
- **Header**: Logo, Titel und Event-Informationen
- **Dashboard**: Statistiken und Fortschrittsbalken
- **Schicht-Tabellen**: Kategorisiert und farbkodiert
- **Footer**: Kontaktinformationen und Springer-System

## 🔄 Aktualisierung

Die HTML-Dateien werden automatisch bei jeder Ausführung des Generators aktualisiert und enthalten:

- **Zeitstempel**: Wann die Datei generiert wurde
- **Aktuelle Daten**: Neueste Schicht-Anmeldungen
- **Dynamische Statistiken**: Live-Berechnung der Besetzung

## 📱 Browser-Kompatibilität

Die generierten HTML-Dateien funktionieren in allen modernen Browsern:

- ✅ Google Chrome (empfohlen für beste PDF-Qualität)
- ✅ Mozilla Firefox
- ✅ Microsoft Edge
- ✅ Safari
- ✅ Opera

## 🛠️ Technische Details

### Verwendete Technologien
- **HTML5**: Semantische Struktur
- **CSS3**: Moderne Styling-Features
- **Print CSS**: Spezielle Regeln für Druckausgabe
- **Responsive Design**: Flexibles Grid-System

### Datei-Struktur
```
pdfs/
├── README.md                           # Diese Datei
├── {event-id}-arbeitsplan.html         # Event-spezifische Arbeitspläne
├── test-event-arbeitsplan.html         # Test-Arbeitsplan
└── fwv-raura-events-overview.html      # Gesamt-Übersicht
```

## 📞 Support

Bei Fragen oder Problemen mit der PDF-Generierung:

**Technischer Support**: Stefan Müller  
📧 aktuar@fwv-raura.ch

**Schichtkoordination**: Siehe jeweilige Event-Details  

---

*Automatisch generiert durch den FWV Raura PDF-Generator*  
*Letzte Aktualisierung: ${new Date().toLocaleDateString('de-DE')}*
