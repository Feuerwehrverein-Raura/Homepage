# 📅 Event-Management System

Dieses Verzeichnis enthält alle Veranstaltungen des Feuerwehrvereins als Markdown-Dateien. Jede Datei wird automatisch in die Website integriert und erstellt Kalendereinträge, E-Mail-Anmeldungen, ICS-Downloads und Schichtplanungen.

---

## 🎯 **Übersicht**

### **Automatische Features**
- ✅ **Website-Integration:** Events erscheinen automatisch im Kalender und auf der Events-Seite
- ✅ **ICS-Generierung:** Alle Events werden in `calendar.ics` exportiert
- ✅ **E-Mail-Anmeldungen:** Vorausgefüllte E-Mails mit Schichtauswahl
- ✅ **Schichtplanung:** Automatische Generierung von Arbeitsplan-PDFs
- ✅ **Status-Tracking:** Automatische Erkennung von vergangenen/laufenden Events
- ✅ **Responsive Design:** Alle Events werden mobilfreundlich dargestellt

---

## 📝 **Neue Veranstaltung erstellen**

### **1. Datei erstellen**
```bash
# Dateiname-Format: [typ]-[name]-[jahr].md
events/chilbi-2025.md
events/grillplausch-sommer-2025.md
events/vereinsausflug-herbst-2025.md
```

### **2. Grundstruktur verwenden**
```markdown
---
# === PFLICHTFELDER ===
id: eindeutige-id-ohne-leerzeichen
title: Titel der Veranstaltung
startDate: 2025-12-31T20:00:00
endDate: 2025-12-31T23:59:59
location: Ort der Veranstaltung
organizer: Name des Organisators
email: organisator@feuerwehrverein-raura.ch

# === OPTIONALE FELDER ===
subtitle: Kurze Beschreibung
category: Hauptveranstaltung  # oder: Gesellschaftsanlass, Ausflug, Vereinsintern
cost: Kostenlos  # oder: CHF 25.- pro Person
status: confirmed  # oder: planned, cancelled
tags: [Tag1, Tag2, Tag3]
image: images/event-bild.jpg

# === ANMELDUNG ===
registrationRequired: true
registrationDeadline: 2025-12-20T23:59:59
maxParticipants: 50
---

# Event-Titel

Hier kommt die ausführliche Beschreibung der Veranstaltung...
```

---

## 🎪 **Event-Typen und Anmeldungen**

### **Typ 1: Helfer-Events (mit Schichten)**
*Beispiel: Chilbi, Arbeitseinsätze*

```yaml
---
registrationRequired: true
shifts:
  - id: aufbau-1
    name: Aufbau Tag 1
    date: 2025-10-05
    time: 17:00-20:00
    needed: 5
    description: Grundaufbau und Vorbereitung
  - id: betrieb-samstag
    name: Betrieb Samstag
    date: 2025-10-14
    time: 14:00-18:00
    needed: 3
    description: Bar, Küche oder Kasse
---
```

**Ergebnis:**
- ✅ Schichtauswahl mit Checkboxen
- ✅ E-Mail mit gewählten Schichten
- ✅ Details: Datum, Zeit, Anzahl benötigter Helfer
- ✅ Badge: "👷 Helfer gesucht"
- ✅ **Schichtplan-Manager:** Interaktive Verwaltung der Schichtbesetzung
- ✅ **PDF-Export:** Automatische Generierung von Arbeitsplänen im Vereinsformat

### **Typ 2: Teilnehmer-Events**
*Beispiel: Grillplausch, Vereinsausflug*

```yaml
---
registrationRequired: true
participantRegistration: true
cost: CHF 35.- pro Person
maxParticipants: 40
---
```

**Ergebnis:**
- ✅ Anmeldung für Teilnehmer
- ✅ Auswahl der Personenzahl
- ✅ E-Mail mit Kosten und Details
- ✅ Badge: "📧 Anmeldung möglich"

### **Typ 3: Info-Events (ohne Anmeldung)**
*Beispiel: Vorstandssitzungen*

```yaml
---
registrationRequired: false
---
```

**Ergebnis:**
- ✅ Nur Informationsanzeige
- ✅ ICS-Download verfügbar
- ✅ Keine Anmeldefunktion

---

## 🔄 **Schichtplanung für Helfer-Events**

### **Schichtplan-Dateien erstellen**
Für Events mit Schichten können Sie zusätzliche Schichtplan-Dateien erstellen:

```bash
# Namenskonvention für Schichtpläne
events/[event-id]-assignments.md

# Beispiel
events/chilbi-2025-assignments.md
```

### **Schichtplan-Format**
```markdown
# Schichtplan Chilbi 2025

**Event:** chilbi-2025
**Generiert:** 2025-01-12
**Status:** In Planung

---

## Aufbau
### aufbau (16.10.2025, 17:00-20:00) - 5 Personen benötigt
- René Käslin
- Stefan Müller
- Giuseppe Costanza
- **[OFFEN - 2 Plätze]**

---

## Samstag, 18.10.2025

### samstag-bar-12-14 (12:00-14:00) - 2 Personen benötigt
- **[OFFEN - 2 Plätze]**

### samstag-kueche-12-14 (12:00-14:00) - 2 Personen benötigt
- Edi Grossenbacher
- **[OFFEN - 1 Platz]**

---

## Statistik
- **Aufbau:** 3/5 zugeteilt (2 offen)
- **Samstag Schichten:** 1/36 zugeteilt (35 offen)
- **GESAMT:** 4/82 Plätze zugeteilt (**78 Plätze noch offen**)
```

### **Schichtplan-Manager verwenden**

#### **1. Interaktive Bearbeitung**
- **Tool:** `schichtplan-manager.html` öffnen
- **Event laden:** Chilbi 2025 auswählen
- **Personen zuweisen:** Namen in Schichtfelder eingeben
- **Status verfolgen:** Live-Statistiken verfolgen

#### **2. Markdown Import/Export**
```javascript
// Schichtplan aus Markdown laden
document.getElementById('assignments-file').files[0] // .md Datei

// Bearbeiteten Schichtplan exportieren
button.click() // "Markdown herunterladen"
```

#### **3. PDF-Arbeitsplan generieren**
- **Format:** Identisch zum "Arbeitsplan Chilbi 2024"
- **Struktur:** Aufbau → Tabelle (Küche/Bar/Kasse) → Abbau
- **Export:** Klick auf "PDF Arbeitsplan"

### **Schichtplan-Features**

#### **Automatische Funktionen**
- ✅ **Platz-Tracking:** Zählt automatisch offene/besetzte Plätze
- ✅ **Kategorie-Gruppierung:** Aufbau, Samstag, Sonntag, Abbau
- ✅ **Statistik-Generierung:** Prozentuale Abdeckung pro Bereich
- ✅ **PDF-Export:** Original Arbeitsplan-Format

#### **Manuelle Bearbeitung**
```bash
# Direkt in der Markdown-Datei editieren
### aufbau (16.10.2025, 17:00-20:00) - 5 Personen benötigt
- René Käslin          # ← Person hinzufügen
- Stefan Müller        # ← Person hinzufügen
- **[OFFEN - 3 Plätze]** # ← Automatisch anpassen
```

#### **PDF-Arbeitsplan Struktur**
Das generierte PDF folgt dem bewährten Format:

```
Feuerwehrverein Raura, Kaiseraugst
Arbeitsplan Chilbi 2025

Aufbau 16.10.2025 ab 17.00 für Chilbi
- René Käslin
- Stefan Müller
[...]

Samstag,18.10.2025    Küche           Bar             Service/Kasse
12:00-14:00          - Edi Grosse.   - Ramon K.      - Giuseppe C.
                     -               -               -
[...]

Springer: Stefan Müller
```

---

## 📋 **Vollständiges Frontmatter-Schema**

```yaml
---
# === IDENTIFIKATION ===
id: string                    # PFLICHT: Eindeutige ID (keine Leerzeichen)
title: string                 # PFLICHT: Event-Titel
subtitle: string              # OPTIONAL: Kurzbeschreibung

# === ZEITANGABEN ===
startDate: 2025-MM-DDTHH:MM:SS   # PFLICHT: Startzeit (ISO 8601)
endDate: 2025-MM-DDTHH:MM:SS     # PFLICHT: Endzeit (ISO 8601)

# === LOCATION & KONTAKT ===
location: string              # PFLICHT: Ort der Veranstaltung
organizer: string             # PFLICHT: Name des Organisators
email: string                 # PFLICHT: Kontakt-E-Mail

# === KATEGORISIERUNG ===
category: string              # Hauptveranstaltung | Gesellschaftsanlass | Ausflug | Vereinsintern
tags: [string, string]       # Liste von Tags für Suche/Filter
status: string                # confirmed | planned | cancelled | past

# === KOSTEN & LIMITS ===
cost: string                  # "Kostenlos" | "CHF 25.- pro Person"
maxParticipants: number       # Maximale Teilnehmerzahl

# === ANMELDUNG ALLGEMEIN ===
registrationRequired: boolean         # Ist eine Anmeldung erforderlich?
registrationDeadline: 2025-MM-DD...  # Anmeldeschluss
participantRegistration: boolean      # Normale Teilnehmer-Anmeldung?

# === HELFER-SCHICHTEN ===
shifts:                       # Array von Schichten
  - id: string               # Eindeutige Schicht-ID
    name: string             # Name der Schicht
    date: 2025-MM-DD        # Datum der Schicht
    time: string            # Zeitbereich (z.B. "14:00-18:00")
    needed: number          # Anzahl benötigte Helfer
    description: string     # Beschreibung der Tätigkeit

# === SCHICHTPLANUNG ===
assignmentsFile: string      # OPTIONAL: Pfad zur Schichtplan-Datei (z.B. "events/chilbi-2025-assignments.md")

# === MEDIEN ===
image: string                # Pfad zu Event-Bild (optional)
---
```

---

## 🔄 **Status-System**

| Status | Beschreibung | Automatische Erkennung |
|--------|-------------|----------------------|
| `planned` | Geplant, noch nicht bestätigt | - |
| `confirmed` | Bestätigt und findet statt | Standard-Wert |
| `cancelled` | Abgesagt | - |
| `past` | Vergangen | ✅ Automatisch wenn `endDate` < heute |

---

## 📧 **E-Mail-Anmeldung Details**

### **Helfer-Anmeldung generiert:**
```
Betreff: Helfer-Anmeldung: [Event-Titel]

Hallo [Organisator],

hiermit melde ich mich als Helfer für folgende Schichten an:

VERANSTALTUNG: [Event-Titel]
DATUM: [Datum]
ORT: [Location]

GEWÄHLTE SCHICHTEN:
• [Schicht-Name] ([Datum], [Zeit]) - [Beschreibung]
• [...]

MEINE KONTAKTDATEN:
Name: [Eingabe]
E-Mail: [Eingabe]
Telefon: [Optional]

BEMERKUNGEN:
[Optional]
```

### **Teilnehmer-Anmeldung generiert:**
```
Betreff: Anmeldung: [Event-Titel]

Hallo [Organisator],

hiermit melde ich mich für die Veranstaltung an:

VERANSTALTUNG: [Event-Titel]
DATUM: [Datum]
ZEIT: [Start] - [Ende]
ORT: [Location]
KOSTEN: [Cost]

ANMELDUNG:
Name: [Eingabe]
E-Mail: [Eingabe]
Telefon: [Optional]
Anzahl Personen: [Auswahl]
```

---

## 🎨 **Markdown-Formatierung**

Im Haupttext der Events kannst du Markdown verwenden:

```markdown
# Große Überschrift
## Mittlere Überschrift
### Kleine Überschrift

**Fetttext**
*Kursivtext*

- Listenpunkt 1
- Listenpunkt 2

[Link-Text](https://example.com)
```

---

## 📁 **Beispiel-Events**

### **Chilbi mit kompletter Schichtplanung**
```markdown
---
id: chilbi-2025
title: Chilbi 2025
subtitle: Traditionelle Dorfchilbi
startDate: 2025-10-18T12:00:00
endDate: 2025-10-19T22:00:00
location: Roter Schopf, Kaiseraugst
category: Hauptveranstaltung
organizer: Stefan Müller
email: aktuar@fwv-raura.ch
registrationRequired: true
registrationDeadline: 2025-10-04T23:59:59
cost: Kostenlos
tags: [Chilbi, Familie, Helfer]
assignmentsFile: events/chilbi-2025-assignments.md
shifts:
  # Aufbau
  - id: aufbau
    name: Aufbau
    date: 2025-10-16
    time: 17:00-20:00
    needed: 5
    description: Grundaufbau und Vorbereitung des Roten Schopfs
  
  # Samstag Schichten (Beispiel - vollständige Liste in echter Datei)
  - id: samstag-bar-12-14
    name: Bar Samstag 12:00-14:00
    date: 2025-10-18
    time: 12:00-14:00
    needed: 2
    description: Bar - Getränke ausgeben und zubereiten
  
  - id: samstag-kueche-12-14
    name: Küche Samstag 12:00-14:00
    date: 2025-10-18
    time: 12:00-14:00
    needed: 2
    description: Küche - Essen zubereiten und ausgeben
  
  # ... weitere 30+ Schichten
  
  # Abbau
  - id: abbau
    name: Abbau
    date: 2025-10-20
    time: 18:00-21:00
    needed: 5
    description: Abbau und Aufräumarbeiten nach der Chilbi
---

# Chilbi 2025

Unsere traditionelle Chilbi mit detaillierter Schichtplanung...

## Helfer gesucht

Für einen reibungslosen Ablauf benötigen wir insgesamt 82 Helfer für verschiedene Schichten:
- Aufbau (5 Personen)
- Samstag Betrieb (36 Personen in 18 Schichten)
- Sonntag Betrieb (36 Personen in 18 Schichten)  
- Abbau (5 Personen)

### Schichtzeiten
**Bereiche:** Bar, Küche, Kasse
**Zeiten:** 12:00-14:00, 14:00-16:00, 16:00-18:00, 18:00-20:00, 20:00-22:00, 22:00-Open End

**Schichtplan verwalten:** [Schichtplan-Manager öffnen](../schichtplan-manager.html)
```

### **Grillplausch mit Teilnehmer-Anmeldung**
```markdown
---
id: grillplausch-sommer-2025
title: Grillplausch 2025
subtitle: Geselliger Sommerevent
startDate: 2025-06-17T16:00:00
endDate: 2025-06-17T22:00:00
location: Kurzenbettli 23, Augst
category: Gesellschaftsanlass
organizer: Edi Grossenbacher
email: materialwart@fwv-raura.ch
registrationRequired: true
registrationDeadline: 2025-06-12T23:59:59
participantRegistration: true
maxParticipants: 50
cost: Kostenlos
tags: [Grillen, Geselligkeit, Sommer]
---

# Grillplausch 2025

Geselliger Abend mit Grillen...
```

### **Vereinsausflug mit Kosten**
```markdown
---
id: vereinsausflug-2025
title: Vereinsausflug 2025
subtitle: Weinverkostung im Wallis
startDate: 2025-09-21T09:00:00
endDate: 2025-09-21T18:00:00
location: Wallis (genauer Ort folgt)
category: Ausflug
organizer: Vereinsvorstand
email: praesident@fwv-raura.ch
registrationRequired: true
registrationDeadline: 2025-09-01T23:59:59
participantRegistration: true
cost: CHF 85.- pro Person
maxParticipants: 35
tags: [Ausflug, Wein, Kultur]
---

# Vereinsausflug 2025

Gemeinsamer Ausflug ins Wallis...
```

---

## ⚙️ **Technische Details**

### **Automatische Verarbeitung**
1. **GitHub Actions** scannt alle `.md` Dateien im `events/` Ordner
2. **Frontmatter** wird geparst und validiert
3. **Schichtplan-Dateien** werden automatisch verlinkt (`*-assignments.md`)
4. **ICS-Datei** wird generiert (`calendar.ics`)
5. **Website** wird automatisch aktualisiert

### **Schichtplan-Integration**
```javascript
// Automatische Erkennung von Schichtplan-Dateien
const assignmentsFile = `${eventId}-assignments.md`;
if (fileExists(assignmentsFile)) {
    event.hasAssignments = true;
    event.assignmentsUrl = assignmentsFile;
}
```

### **Dateiname-Konventionen**
#### **Event-Dateien**
- ✅ `chilbi-2025.md`
- ✅ `grillplausch-sommer-2025.md` 
- ✅ `vereinsausflug-herbst-2025.md`

#### **Schichtplan-Dateien**  
- ✅ `chilbi-2025-assignments.md`
- ✅ `arbeitseinsatz-2025-assignments.md`
- ❌ `chilbi_2025_schichten.md` (falsche Konvention)

### **PDF-Export System**
```javascript
// PDF-Generierung im Original-Format
class PDFExporter {
    generateWorkSchedule(eventData, assignments) {
        // Header mit Vereinslogo
        // Aufbau-Sektion mit Personenliste
        // Tabellen-Format für Schichtbetrieb
        // Springer-Hinweise
        // Abbau-Sektion
    }
}
```

### **Datum-Format**
```yaml
# ✅ Korrekt (ISO 8601)
startDate: 2025-10-14T14:00:00

# ❌ Falsch
startDate: 14.10.2025 14:00
startDate: October 14, 2025 2pm
```

---

## 🚨 **Häufige Fehler**

### **Fehler 1: Ungültiges Frontmatter**
```yaml
# ❌ Falsch
id: mein event 2025  # Leerzeichen nicht erlaubt
email: ungültige-email  # Keine gültige E-Mail

# ✅ Richtig
id: mein-event-2025
email: test@feuerwehrverein-raura.ch
```

### **Fehler 2: Schichtplan-Probleme**
```yaml
# ❌ Falsch
shifts:
  - name: Aufbau  # ID fehlt
  - id: samstag-bar  # time/needed fehlt

# ✅ Richtig
shifts:
  - id: aufbau-1
    name: Aufbau
    date: 2025-10-05
    time: 17:00-20:00
    needed: 5
    description: Grundaufbau
```

### **Fehler 3: Schichtplan-Datei Verknüpfung**
```yaml
# ❌ Falsch
assignmentsFile: schichtplan.md  # Datei existiert nicht

# ✅ Richtig
assignmentsFile: events/chilbi-2025-assignments.md  # Korrekte Pfad
```

### **Fehler 4: PDF-Export Probleme**
```markdown
# ❌ Problematisch
### samstag-bar-12-14 (12:00-14:00) - 2 Personen benötigt
- Person mit sehr sehr sehr langem Namen der die PDF-Tabelle sprengt

# ✅ Besser
### samstag-bar-12-14 (12:00-14:00) - 2 Personen benötigt
- Max Mustermann
- P. Beispiel  # Kürzer für PDF-Format
```

---

## 🔧 **Troubleshooting**

### **Event erscheint nicht auf Website**
1. ✅ Frontmatter-Syntax prüfen (YAML-Format)
2. ✅ Pflichtfelder vollständig ausgefüllt?
3. ✅ Dateiname korrekt (`.md` Endung)?
4. ✅ GitHub Actions erfolgreich? (Actions-Tab prüfen)

### **Schichtplan-Manager funktioniert nicht**
1. ✅ Event-ID im Schichtplan korrekt?
2. ✅ Schichtplan-Datei im richtigen Format?
3. ✅ Alle Schicht-IDs eindeutig?
4. ✅ Browser-Konsole auf Fehler prüfen (F12)

### **PDF-Export fehlt/fehlerhaft**
1. ✅ Schichtplan-Assignments vollständig geladen?
2. ✅ Namen nicht zu lang für Tabellen-Format?
3. ✅ Browser unterstützt jsPDF?
4. ✅ Pop-up-Blocker deaktiviert?

### **E-Mail-Anmeldung funktioniert nicht**
1. ✅ `registrationRequired: true` gesetzt?
2. ✅ E-Mail-Adresse gültig?
3. ✅ Browser erlaubt `mailto:`-Links?
4. ✅ Schicht-IDs eindeutig bei Helfer-Events?

### **Schichtplan-Synchronisation**
```bash
# Problem: Schichtplan und Event sind nicht synchron
# Lösung: Schicht-IDs in beiden Dateien identisch halten

# chilbi-2025.md
shifts:
  - id: aufbau-samstag  # ← Diese ID

# chilbi-2025-assignments.md  
### aufbau-samstag (...)  # ← Muss identisch sein
```

---

## 📞 **Support**

**Bei Problemen mit Events:**
- 📧 **Content-Fragen:** stefan.mueller@fwv-raura.ch (Aktuar)
- 🔧 **Technische Probleme:** webmaster@feuerwehrverein-raura.ch
- 👷 **Schichtplan-System:** rene.kaeslin@fwv-raura.ch (Präsident)
- 🐛 **Bug-Reports:** [GitHub Issue erstellen](https://github.com/Feuerwehrverein-Raura/Homepage/issues)

**Spezielle Tools:**
- 📊 **Schichtplan-Manager:** `schichtplan-manager.html` 
- 📄 **PDF-Export:** Arbeitsplan im Vereinsformat
- 📋 **Markdown-Vorlagen:** Siehe Beispiel-Events in diesem Ordner

---

**💡 Tipp:** Schauen Sie sich die `chilbi-2025.md` und `chilbi-2025-assignments.md` als vollständige Beispiele an!
