# 🔥 Feuerwehrverein Raura Kaiseraugst - Homepage

Eine moderne, responsive Website für den Feuerwehrverein Raura Kaiseraugst mit integriertem Kalender- und Veranstaltungssystem.

## 🌐 Live Website
**https://feuerwehrverein-raura.github.io/Homepage/**

## 📅 Kalender-Abonnement
```
webcal://feuerwehrverein-raura.github.io/Homepage/calendar.ics
```

---

## 🚀 Features

### 📱 **Moderne Website**
- **Responsive Design** für alle Geräte (Desktop, Tablet, Mobile)
- **Professionelles Design** mit Vereinslogo und Fire-Theme
- **Schnelle Ladezeiten** durch optimierte Struktur
- **SEO-optimiert** für bessere Auffindbarkeit

### 📅 **Intelligenter Kalender**
- **Interaktive Kalenderansicht** mit Monats- und Listenansicht
- **Event-Details** mit vollständigen Informationen
- **ICS-Downloads** für einzelne Events oder kompletten Kalender
- **Abonnierbarer Feed** für Apple Kalender, Google Calendar, Outlook

### 📧 **Smart Event-Anmeldungen**
- **E-Mail-Anmeldungen** mit vorausgefüllten Formularen
- **Schichtauswahl** für Helfer-Events (z.B. Chilbi)
- **Teilnehmer-Anmeldungen** für gesellige Events
- **Automatische E-Mail-Generierung** mit allen relevanten Details

### 🎪 **Event-Management**
- **Markdown-basierte Events** - einfach zu erstellen und bearbeiten
- **Kategorien und Tags** für bessere Organisation
- **Status-Tracking** (geplant, läuft, vergangen)
- **Anmeldeschluss-Management** mit automatischen Benachrichtigungen

### 🤖 **Automation**
- **GitHub Actions** für automatische ICS-Generierung
- **Versionskontrolle** für alle Änderungen
- **Automatische Deployment** auf GitHub Pages

---

## 📁 Projektstruktur

```
Homepage/
├── 🏠 index.html                    # Hauptseite
├── 📅 calendar.html                 # Interaktive Kalenderseite
├── 🎫 events.html                   # Veranstaltungsübersicht mit Anmeldung
├── 📄 calendar.ics                  # Automatisch generierter ICS-Feed
├── 📂 events/                       # Event-Markdown-Dateien
│   ├── 📝 README.md                 # Event-Dokumentation
│   ├── 🎪 chilbi-2024.md           # Beispiel: Chilbi mit Helfer-Schichten
│   └── 🍖 grillplausch-2024.md     # Beispiel: Teilnehmer-Event
├── 🖼️ images/                       # Bilder und Assets
│   └── 🔥 logo.png                  # Vereinslogo
├── ⚙️ scripts/
│   └── 📊 generate-ics.js           # ICS-Generator-Script
├── 🔄 .github/workflows/
│   └── ⚡ generate-calendar.yml     # GitHub Actions Workflow
└── 📋 README.md                     # Diese Dokumentation
```

---

## 🛠️ Lokale Entwicklung

### **Voraussetzungen**
- Git installiert
- Python 3 oder Node.js für lokalen Server
- Texteditor (VS Code empfohlen)

### **Repository klonen**
```bash
git clone https://github.com/Feuerwehrverein-Raura/Homepage.git
cd Homepage
```

### **Lokalen Server starten**
```bash
# Option 1: Python
python -m http.server 8000

# Option 2: Node.js
npx http-server

# Option 3: Live Server (VS Code Extension)
# Rechtsklick auf index.html → "Open with Live Server"
```

### **Website öffnen**
```
http://localhost:8000
```

---

## ➕ Neue Veranstaltung erstellen

### **1. Markdown-Datei erstellen**
Erstelle eine neue `.md` Datei im `events/` Ordner:

```bash
# Beispiel-Dateiname
events/silvester-party-2024.md
```

### **2. Frontmatter-Template verwenden**
```markdown
---
id: silvester-party-2024
title: Silvester-Party 2024
subtitle: Gemeinsam ins neue Jahr
startDate: 2024-12-31T20:00:00
endDate: 2025-01-01T02:00:00
location: Vereinslokal
category: Gesellschaftsanlass
organizer: Max Mustermann
email: max@feuerwehrverein-raura.ch
registrationRequired: true
registrationDeadline: 2024-12-20T23:59:59
cost: CHF 25.- pro Person
tags: [Party, Silvester, Geselligkeit]
participantRegistration: true
---

# Silvester-Party 2024

Beschreibung der Veranstaltung...
```

### **3. Datei committen**
```bash
git add events/silvester-party-2024.md
git commit -m "Neue Veranstaltung: Silvester-Party 2024"
git push
```

**→ Die Website wird automatisch aktualisiert!**

---

## 📧 Anmeldungen konfigurieren

### **Teilnehmer-Anmeldungen** (Grillplausch, Ausflüge)
```yaml
registrationRequired: true
participantRegistration: true
```

### **Helfer-Anmeldungen** (Chilbi, Arbeitseinsätze)
```yaml
registrationRequired: true
shifts:
  - id: aufbau
    name: Aufbau
    date: 2024-12-30
    time: 14:00-18:00
    needed: 5
    description: Dekoration und Vorbereitung
```

**→ Mehr Details in [`events/README.md`](./events/README.md)**

---

## 🔧 Anpassungen

### **Vereinsdaten aktualisieren**
In allen HTML-Dateien anpassen:
- ✏️ **Kontakt-E-Mail:** `kontakt@fwv-raura.ch`
- 📍 **Adresse:** Vollständige Postadresse hinzufügen
- 📞 **Telefon:** Vereins-Telefonnummer ergänzen

### **Logo austauschen**
- 📁 Neues Logo in `images/logo.png` ablegen
- 🖼️ Empfohlene Größe: 400x400px, transparenter Hintergrund

### **Farben anpassen**
In den HTML-Dateien die `fire`-Farbpalette ändern:
```javascript
fire: {
    500: '#ef4444',  // Hauptfarbe
    600: '#dc2626',  // Dunklere Variante
    700: '#b91c1c',  // Navigation
}
```

---

## 🤝 Mitarbeit

### **Berechtigungen**
- 👥 **Vorstands-Mitglieder:** Admin-Rechte
- 📝 **Content-Manager:** Event-Erstellung und -Bearbeitung
- 👀 **Mitglieder:** Issue-Erstellung für Feedback

### **Beiträge**
1. 🍴 Fork das Repository
2. 🌿 Erstelle einen Feature-Branch
3. ✅ Mache deine Änderungen
4. 🔄 Erstelle einen Pull Request

### **Issues melden**
- 🐛 **Bugs:** Beschreibe das Problem detailliert
- 💡 **Feature-Requests:** Erkläre den gewünschten Nutzen
- ❓ **Fragen:** Nutze die Discussions

---

## 📊 GitHub Actions

### **Automatische Prozesse**
- 🔄 **ICS-Generierung:** Täglich um 6:00 Uhr
- 📅 **Kalender-Update:** Bei Event-Änderungen
- 🚀 **Website-Deployment:** Bei Push auf `main`

### **Monitoring**
- ✅ **Actions-Tab:** Überwachung der Workflows
- 📊 **Pages-Status:** Deployment-Status prüfen
- 🔍 **Logs:** Detaillierte Fehleranalyse

---

## 📱 Browser-Kompatibilität

| Browser | Desktop | Mobile | Status |
|---------|---------|--------|--------|
| Chrome  | ✅ 90+  | ✅ 90+ | Voll unterstützt |
| Firefox | ✅ 88+  | ✅ 88+ | Voll unterstützt |
| Safari  | ✅ 14+  | ✅ 14+ | Voll unterstützt |
| Edge    | ✅ 90+  | ✅ 90+ | Voll unterstützt |

---

## 🆘 Support

### **Technische Probleme**
- 📧 **E-Mail:** webmaster@feuerwehrverein-raura.ch
- 🐛 **GitHub Issues:** [Issue erstellen](https://github.com/Feuerwehrverein-Raura/Homepage/issues/new)

### **Inhaltliche Fragen**
- 👤 **René Käslin** (Präsident): rene.kaeslin@feuerwehrverein-raura.ch
- 📝 **Stefan Müller** (Aktuar): stefan.mueller@feuerwehrverein-raura.ch

### **Häufige Probleme**
- ❌ **Website nicht erreichbar:** Warte 5-10 Minuten nach Änderungen
- 📧 **E-Mail-Client öffnet nicht:** Browser-Einstellungen prüfen
- 📅 **Kalender lädt nicht:** Cache leeren und neu laden

---

## 📄 Lizenz

Dieses Projekt steht unter der MIT-Lizenz. Details in der [LICENSE](./LICENSE) Datei.

---

## 🏆 Credits

**Entwickelt mit ❤️ für den Feuerwehrverein Raura Kaiseraugst**

- 🎨 **Design:** Tailwind CSS
- ⚡ **Hosting:** GitHub Pages
- 🤖 **Automation:** GitHub Actions
- 📱 **Icons:** Unicode Emojis

---

## 🔗 Wichtige Links

| Link | URL | Beschreibung |
|------|-----|--------------|
| 🌐 **Website** | https://feuerwehrverein-raura.github.io/Homepage/ | Live-Website |
| 📅 **Kalender** | webcal://feuerwehrverein-raura.github.io/Homepage/calendar.ics | Abonnierbar |
| 📊 **Repository** | https://github.com/Feuerwehrverein-Raura/Homepage | Quellcode |
| 🔄 **Actions** | https://github.com/Feuerwehrverein-Raura/Homepage/actions | Workflows |
| 📈 **Insights** | https://github.com/Feuerwehrverein-Raura/Homepage/pulse | Statistiken |

---

**🔥 Tradition • Kameradschaft • Gemeinschaft 🔥**

---

*Letzte Aktualisierung: $(date +'%B %Y')*
