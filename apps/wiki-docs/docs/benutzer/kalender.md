---
sidebar_position: 5
---

# Kalender nutzen

Der Vereinskalender zeigt alle Anlässe übersichtlich an. Du kannst ihn auch in deinen persönlichen Kalender importieren.

## Kalender ansehen

### Kalender öffnen

1. Gehe zu [fwv-raura.ch](https://fwv-raura.ch)
2. Klicke auf **"Kalender"** im Menü
3. Du siehst den aktuellen Monat

### Ansichten wechseln

| Ansicht | Beschreibung |
|---------|--------------|
| **Monat** | Übersicht des ganzen Monats |
| **Woche** | Detaillierte Wochenansicht |
| **Liste** | Chronologische Liste aller Events |

Klicke auf die entsprechenden Buttons, um die Ansicht zu wechseln.

### Navigation

- **← / →** : Vorheriger / Nächster Monat (oder Woche)
- **Heute** : Zurück zum aktuellen Datum
- **Jahr** : Monat/Jahr-Auswahl

## Events im Kalender

### Farben

Events werden farblich nach Kategorie markiert:

| Farbe | Kategorie |
|-------|-----------|
| 🔴 Rot | Dorffest, Grossanlass |
| 🔵 Blau | Vereinsanlass |
| 🟢 Grün | Ausflug |
| 🟡 Gelb | Aufbau/Abbau |
| ⚫ Grau | Sonstiges |

### Event-Details

Klicke auf ein Event im Kalender:
- Du siehst eine Kurzinfo
- Klicke nochmal für die vollständigen Details
- Von dort kannst du dich anmelden

## Kalender abonnieren

Du kannst den Vereinskalender in deinen persönlichen Kalender importieren. So siehst du alle Events direkt in deiner Kalender-App.

### Kalender-Link (ICS)

```
https://api.fwv-raura.ch/calendar/ics
```

Dieser Link aktualisiert sich automatisch - neue Events erscheinen in deinem Kalender.

### In Google Calendar

1. Öffne [Google Calendar](https://calendar.google.com)
2. Klicke links auf **"+"** neben "Andere Kalender"
3. Wähle **"Per URL"**
4. Füge die URL ein: `https://api.fwv-raura.ch/calendar/ics`
5. Klicke auf **"Kalender hinzufügen"**

Der Kalender erscheint nun in deiner Liste und synchronisiert automatisch.

### In Apple Kalender (iPhone/iPad/Mac)

#### Auf iPhone/iPad
1. Öffne **Einstellungen**
2. Gehe zu **Kalender** → **Accounts**
3. Tippe auf **Account hinzufügen** → **Andere**
4. Wähle **Kalenderabo hinzufügen**
5. Gib die URL ein: `https://api.fwv-raura.ch/calendar/ics`
6. Tippe auf **Weiter** und **Sichern**

#### Auf Mac
1. Öffne die **Kalender**-App
2. Menü **Ablage** → **Neues Kalenderabonnement...**
3. Gib die URL ein: `https://api.fwv-raura.ch/calendar/ics`
4. Klicke auf **Abonnieren**
5. Wähle Einstellungen (Name, Farbe, Auto-Aktualisierung)
6. Klicke auf **OK**

### In Outlook

#### Outlook Desktop
1. Öffne Outlook
2. Gehe zu **Datei** → **Kontoeinstellungen** → **Kontoeinstellungen**
3. Tab **Internetkalender** → **Neu**
4. Füge die URL ein: `https://api.fwv-raura.ch/calendar/ics`
5. Klicke auf **Hinzufügen**

#### Outlook Web (Office 365)
1. Öffne [outlook.office.com](https://outlook.office.com)
2. Gehe zu **Kalender**
3. Klicke auf **Kalender hinzufügen** → **Aus dem Internet abonnieren**
4. Füge die URL ein
5. Gib einen Namen ein (z.B. "FWV Raura")
6. Klicke auf **Importieren**

### In Thunderbird

1. Öffne Thunderbird
2. Gehe zu **Kalender**
3. Rechtsklick → **Neuer Kalender**
4. Wähle **Im Netzwerk**
5. Wähle **iCalendar (ICS)**
6. Gib die URL ein: `https://api.fwv-raura.ch/calendar/ics`
7. Klicke auf **Weiter** und vergib einen Namen
8. Klicke auf **Fertig**

## Einzelnes Event exportieren

Du kannst auch einzelne Events herunterladen:

1. Öffne das Event
2. Klicke auf **"Zum Kalender hinzufügen"** oder das Kalender-Symbol
3. Eine .ics-Datei wird heruntergeladen
4. Öffne die Datei - dein Kalender importiert das Event

## PDF-Kalender

### Monatskalender drucken

1. Öffne den Kalender
2. Wähle den gewünschten Monat
3. Klicke auf **"Drucken"** oder **"PDF"**
4. Ein druckfreundlicher Kalender wird generiert

### Jahresübersicht

Falls verfügbar:
1. Klicke auf **"Jahresübersicht"**
2. Du siehst alle Events des Jahres
3. Exportiere als PDF für den Aushang

## Automatische Aktualisierung

### Wie oft synchronisiert mein Kalender?

| App | Standard-Intervall |
|-----|-------------------|
| Google Calendar | alle 24 Stunden |
| Apple Kalender | alle 15 Minuten (einstellbar) |
| Outlook | alle 3 Stunden |
| Thunderbird | alle 30 Minuten (einstellbar) |

### Manuell aktualisieren

Die meisten Kalender-Apps haben eine "Aktualisieren"-Funktion. Nutze diese, wenn ein neues Event nicht erscheint.

## Benachrichtigungen

### Kalender-Erinnerungen

Dein Kalender kann dich automatisch erinnern:
- Beim Import/Abo werden Standard-Erinnerungen gesetzt
- Du kannst diese in deiner Kalender-App anpassen

### E-Mail-Erinnerungen

Zusätzlich erhältst du E-Mail-Erinnerungen vom Verein:
- Für Events, bei denen du angemeldet bist
- 24 Stunden vor deiner Schicht

## Häufige Fragen

### Der Kalender zeigt nichts an
- Prüfe die Internet-Verbindung
- Warte auf die nächste Synchronisation
- Prüfe ob der Kalender aktiviert ist (Checkbox in der App)

### Events fehlen
- Neue Events können bis zu 24h dauern, bis sie erscheinen
- Manuell aktualisieren beschleunigt dies

### Doppelte Events
- Du hast möglicherweise den Kalender mehrfach abonniert
- Lösche doppelte Abonnements

### Falsche Zeitzone
- Prüfe die Zeitzone in deiner Kalender-App
- Events werden in Schweizer Zeit (CET/CEST) gespeichert
