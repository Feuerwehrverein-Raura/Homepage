# 📅 Event-Management System

Dieses Verzeichnis enthält alle Veranstaltungen des Feuerwehrvereins als Markdown-Dateien. Jede Datei wird automatisch in die Website integriert und erstellt Kalendereinträge, E-Mail-Anmeldungen und ICS-Downloads.

---

## 🎯 **Übersicht**

### **Automatische Features**
- ✅ **Website-Integration:** Events erscheinen automatisch im Kalender und auf der Events-Seite
- ✅ **ICS-Generierung:** Alle Events werden in `calendar.ics` exportiert
- ✅ **E-Mail-Anmeldungen:** Vorausgefüllte E-Mails mit Schichtauswahl
- ✅ **Status-Tracking:** Automatische Erkennung von vergangenen/laufenden Events
- ✅ **Responsive Design:** Alle Events werden mobilfreundlich dargestellt

---

## 📝 **Neue Veranstaltung erstellen**

### **1. Datei erstellen**
```bash
# Dateiname-Format: [typ]-[name]-[jahr].md
events/chilbi-2024.md
events/grillplausch-sommer-2024.md
events/vereinsausflug-herbst-2024.md
```

### **2. Grundstruktur verwenden**
```markdown
---
# === PFLICHTFELDER ===
id: eindeutige-id-ohne-leerzeichen
title: Titel der Veranstaltung
startDate: 2024-12-31T20:00:00
endDate: 2024-12-31T23:59:59
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
registrationDeadline: 2024-12-20T23:59:59
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
    date: 2024-10-05
    time: 17:00-20:00
    needed: 5
    description: Grundaufbau und Vorbereitung
  - id: betrieb-samstag
    name: Betrieb Samstag
    date: 2024-10-14
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

## 📋 **Vollständiges Frontmatter-Schema**

```yaml
---
# === IDENTIFIKATION ===
id: string                    # PFLICHT: Eindeutige ID (keine Leerzeichen)
title: string                 # PFLICHT: Event-Titel
subtitle: string              # OPTIONAL: Kurzbeschreibung

# === ZEITANGABEN ===
startDate: 2024-MM-DDTHH:MM:SS   # PFLICHT: Startzeit (ISO 8601)
endDate: 2024-MM-DDTHH:MM:SS     # PFLICHT: Endzeit (ISO 8601)

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
registrationDeadline: 2024-MM-DD...  # Anmeldeschluss
participantRegistration: boolean      # Normale Teilnehmer-Anmeldung?

# === HELFER-SCHICHTEN ===
shifts:                       # Array von Schichten
  - id: string               # Eindeutige Schicht-ID
    name: string             # Name der Schicht
    date: 2024-MM-DD        # Datum der Schicht
    time: string            # Zeitbereich (z.B. "14:00-18:00")
    needed: number          # Anzahl benötigte Helfer
    description: string     # Beschreibung der Tätigkeit

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

### **Chilbi mit Helfer-Schichten**
```markdown
---
id: chilbi-2024
title: Chilbi 2024
subtitle: Traditionelle Dorfchilbi
startDate: 2024-10-14T14:00:00
endDate: 2024-10-15T22:00:00
location: Roter Schopf, Kaiseraugst
category: Hauptveranstaltung
organizer: René Käslin
email: rene.kaeslin@feuerwehrverein-raura.ch
registrationRequired: true
registrationDeadline: 2024-10-04T23:59:59
cost: Kostenlos
tags: [Chilbi, Familie, Helfer]
shifts:
  - id: aufbau-1
    name: Aufbau Tag 1
    date: 2024-10-05
    time: 17:00 Uhr
    needed: 5
    description: Grundaufbau und Vorbereitung
  - id: betrieb-samstag-1
    name: Betrieb Samstag Früh
    date: 2024-10-14
    time: 14:00-18:00
    needed: 3
    description: Bar, Küche oder Kasse
---

# Chilbi 2024

Unsere traditionelle Chilbi...
```

### **Grillplausch mit Teilnehmer-Anmeldung**
```markdown
---
id: grillplausch-sommer-2024
title: Grillplausch 2024
subtitle: Geselliger Sommerevent
startDate: 2024-06-17T16:00:00
endDate: 2024-06-17T22:00:00
location: Kurzenbettli 23, Augst
category: Gesellschaftsanlass
organizer: Edi Grossenbacher
email: kontakt@feuerwehrverein-raura.ch
registrationRequired: true
registrationDeadline: 2024-06-12T23:59:59
participantRegistration: true
maxParticipants: 50
cost: Kostenlos
tags: [Grillen, Geselligkeit, Sommer]
---

# Grillplausch 2024

Geselliger Abend mit Grillen...
```

### **Vereinsausflug mit Kosten**
```markdown
---
id: vereinsausflug-2024
title: Vereinsausflug 2024
subtitle: Weinverkostung im Wallis
startDate: 2024-09-21T09:00:00
endDate: 2024-09-21T18:00:00
location: Wallis (genauer Ort folgt)
category: Ausflug
organizer: Vereinsvorstand
email: vorstand@feuerwehrverein-raura.ch
registrationRequired: true
registrationDeadline: 2024-09-01T23:59:59
participantRegistration: true
cost: CHF 85.- pro Person
maxParticipants: 35
tags: [Ausflug, Wein, Kultur]
---

# Vereinsausflug 2024

Gemeinsamer Ausflug ins Wallis...
```

---

## ⚙️ **Technische Details**

### **Automatische Verarbeitung**
1. **GitHub Actions** scannt alle `.md` Dateien im `events/` Ordner
2. **Frontmatter** wird geparst und validiert
3. **ICS-Datei** wird generiert (`calendar.ics`)
4. **Website** wird automatisch aktualisiert

### **Dateiname-Konventionen**
- ✅ `chilbi-2024.md`
- ✅ `grillplausch-sommer-2024.md` 
- ✅ `vereinsausflug-herbst-2024.md`
- ❌ `Chilbi 2024.md` (Leerzeichen)
- ❌ `chilbi_2024.txt` (falsche Endung)

### **Datum-Format**
```yaml
# ✅ Korrekt (ISO 8601)
startDate: 2024-10-14T14:00:00

# ❌ Falsch
startDate: 14.10.2024 14:00
startDate: October 14, 2024 2pm
```

---

## 🚨 **Häufige Fehler**

### **Fehler 1: Ungültiges Frontmatter**
```yaml
# ❌ Falsch
id: mein event 2024  # Leerzeichen nicht erlaubt
email: ungültige-email  # Keine gültige E-Mail

# ✅ Richtig
id: mein-event-2024
email: test@feuerwehrverein-raura.ch
```

### **Fehler 2: Datum-Probleme**
```yaml
# ❌ Falsch
startDate: 2024-02-30T10:00:00  # 30. Februar existiert nicht
endDate: 2024-01-01T10:00:00     # Endzeit vor Startzeit

# ✅ Richtig
startDate: 2024-02-28T10:00:00
endDate: 2024-02-28T18:00:00
```

### **Fehler 3: Schichten ohne erforderliche Felder**
```yaml
# ❌ Falsch
shifts:
  - name: Aufbau  # ID fehlt

# ✅ Richtig
shifts:
  - id: aufbau-1
    name: Aufbau
    date: 2024-10-05
    time: 17:00
    needed: 5
    description: Grundaufbau
```

---

## 🔧 **Troubleshooting**

### **Event erscheint nicht auf Website**
1. ✅ Frontmatter-Syntax prüfen (YAML-Format)
2. ✅ Pflichtfelder vollständig ausgefüllt?
3. ✅ Dateiname korrekt (`.md` Endung)?
4. ✅ GitHub Actions erfolgreich? (Actions-Tab prüfen)

### **E-Mail-Anmeldung funktioniert nicht**
1. ✅ `registrationRequired: true` gesetzt?
2. ✅ E-Mail-Adresse gültig?
3. ✅ Browser erlaubt `mailto:`-Links?

### **ICS-Download fehlt**
1. ✅ GitHub Actions laufen korrekt?
2. ✅ `calendar.ics` wurde generiert?
3. ✅ 5-10 Minuten warten nach Event-Änderung

---

## 📞 **Support**

**Bei Problemen mit Events:**
- 📧 **Content-Fragen:** rene.kaeslin@feuerwehrverein-raura.ch
- 🔧 **Technische Probleme:** webmaster@feuerwehrverein-raura.ch
- 🐛 **Bug-Reports:** [GitHub Issue erstellen](https://github.com/Feuerwehrverein-Raura/Homepage/issues)

---

**💡 Tipp:** Schaue dir die bestehenden Event-Dateien als Vorlage an!
