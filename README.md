# Feuerwehrverein Raura Kaiseraugst Website

Eine moderne, responsive Website für den Feuerwehrverein Raura Kaiseraugst mit integriertem Kalender- und Veranstaltungssystem.

## 🚀 Features

- **Responsive Design** - funktioniert auf allen Geräten
- **Vereinskalender** mit Monats- und Listenansicht
- **Veranstaltungsseite** mit Filter- und Suchfunktionen
- **ICS-Kalender-Downloads** für einzelne Events oder alle Termine
- **Abonnierbarer Kalender-Feed** (webcal://)
- **Markdown-basierte Eventverwaltung** über GitHub
- **Automatische ICS-Generierung** via GitHub Actions

## 📁 Projektstruktur

```
feuerwehrverein-raura/
├── index.html                    # Hauptseite
├── calendar.html                 # Kalenderseite
├── events.html                   # Veranstaltungsseite
├── calendar.ics                  # Automatisch generierter ICS-Feed
├── events/                       # Event-Markdown-Dateien
│   ├── chilbi-2024.md
│   └── grillplausch-sommer-2024.md
├── images/                       # Bilder für Events
├── scripts/
│   └── generate-ics.js           # ICS-Generator-Script
├── .github/workflows/
│   └── generate-calendar.yml     # GitHub Action für ICS
└── README.md
```

## 🎯 Event-Verwaltung

### Neue Veranstaltung hinzufügen

1. Erstelle eine neue Markdown-Datei im `events/` Ordner
2. Verwende folgende Struktur:

```markdown
---
id: eindeutige-id
title: Event Titel
subtitle: Kurzbeschreibung
startDate: 2024-10-14T14:00:00
endDate: 2024-10-14T22:00:00
location: Ort der Veranstaltung
category: Hauptveranstaltung
organizer: Name des Organisators
email: kontakt@email.ch
registrationRequired: true
registrationDeadline: 2024-10-04T23:59:59
cost: Kostenlos
status: confirmed
tags: [Tag1, Tag2, Tag3]
image: images/event-bild.jpg
---

# Event Titel

Hier kommt die ausführliche Beschreibung...

## Programm

- Punkt 1
- Punkt 2

## Anmeldung

Weitere Details...
```

3. Committe und pushe die Datei - die Website wird automatisch aktualisiert

## 📅 Kalender-Integration

### Kalender abonnieren

**Webcal-URL für Kalender-Apps:**
```
webcal://username.github.io/feuerwehrverein-raura/calendar.ics
```

**Direkte ICS-URL:**
```
https://username.github.io/feuerwehrverein-raura/calendar.ics
```

### Unterstützte Kalender-Apps
- Apple Kalender (macOS/iOS)
- Google Calendar
- Outlook
- Thunderbird
- Alle anderen iCal-kompatiblen Apps

## 🔧 Setup & Deployment

### GitHub Pages einrichten

1. **Repository erstellen:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/username/feuerwehrverein-raura.git
   git push -u origin main
   ```

2. **GitHub Pages aktivieren:**
   - Gehe zu Repository → Settings → Pages
   - Source: "Deploy from a branch"
   - Branch: "main" → "/ (root)"
   - Save

3. **Website ist verfügbar unter:**
   ```
   https://username.github.io/feuerwehrverein-raura/
   ```

### Lokale Entwicklung

1. **Repository klonen:**
   ```bash
   git clone https://github.com/username/feuerwehrverein-raura.git
   cd feuerwehrverein-raura
   ```

2. **Lokalen Server starten:**
   ```bash
   # Python 3
   python -m http.server 8000
   
   # Python 2
   python -m SimpleHTTPServer 8000
   
   # Node.js (mit http-server)
   npx http-server
   ```

3. **Website öffnen:** http://localhost:8000

## 🛠️ Anpassungen

### Farben ändern
Die Website verwendet ein Feuerwehr-Farbschema. Anpassungen in allen HTML-Dateien:

```javascript
fire: {
    500: '#ef4444',  // Hauptfarbe
    600: '#dc2626',  // Dunklere Variante
    700: '#b91c1c',  // Noch dunkler
    // ...
}
```

### Kontaktdaten aktualisieren
In allen HTML-Dateien die Platzhalter ersetzen:
- `kontakt@fwv-raura.ch` → echte E-Mail
- Adressen und Telefonnummern hinzufügen

### Logos und Bilder
- Vereinslogo in der Navigation anpassen
- Event-Bilder im `images/` Ordner ablegen
- Galerie-Platzhalter durch echte Fotos ersetzen

## 🔄 Automatisierung

### GitHub Actions
Die Website generiert automatisch einen ICS-Kalender:

- **Trigger:** Bei Änderungen im `events/` Ordner
- **Schedule:** Täglich um 6:00 Uhr
- **Output:** `calendar.ics` wird aktualisiert

### Event-Status
Events werden automatisch als "vergangen" markiert basierend auf dem Enddatum.

## 📱 Browser-Kompatibilität

- ✅ Chrome/Edge (moderne Versionen)
- ✅ Firefox (moderne Versionen)
- ✅ Safari (macOS/iOS)
- ✅ Mobile Browser (responsive)

## 🤝 Beiträge

1. Fork das Repository
2. Erstelle einen Feature-Branch (`git checkout -b feature/neue-funktion`)
3. Committe deine Änderungen (`git commit -am 'Neue Funktion hinzugefügt'`)
4. Push den Branch (`git push origin feature/neue-funktion`)
5. Erstelle einen Pull Request

## 📄 Lizenz

Dieses Projekt steht unter der MIT-Lizenz. Siehe `LICENSE` Datei für Details.

## 🆘 Support

Bei Fragen oder Problemen:
- Issue im GitHub Repository erstellen
- E-Mail an: kontakt@feuerwehrverein-raura.ch

---

**Entwickelt mit ❤️ für den Feuerwehrverein Raura Kaiseraugst**
