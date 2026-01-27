---
sidebar_position: 2
---

# Kitchen Display

Das Kitchen Display zeigt Bestellungen für Küche und Bar in Echtzeit an.

## Zugang

URL: [kitchen.fwv-raura.ch](https://kitchen.fwv-raura.ch)

## Funktionen

### Live-Anzeige
- Alle offenen Bestellungen werden angezeigt
- WebSocket-Verbindung für Echtzeit-Updates
- Neue Bestellungen erscheinen automatisch
- Erledigte Bestellungen verschwinden

### Filter
- **Alle** - Zeigt alle Bestellungen
- **Bar** - Nur Getränke-Bestellungen
- **Küche** - Nur Essens-Bestellungen

### Bestellkarten
Jede Bestellung zeigt:
- Tischnummer (gross)
- Bestellnummer
- Zeit seit Bestellung
- Artikel mit Menge
- Notizen (gelb hinterlegt)
- Station (Bar/Küche)

### Dringlichkeit
- Normal: Grauer Rahmen
- Dringend (>10 Min): Roter Rahmen

### Erledigt-Button
Mit dem grünen "Erledigt"-Button wird die Bestellung als abgeschlossen markiert.

## Benachrichtigungen

### Browser-Benachrichtigungen
- Müssen einmalig aktiviert werden
- Button "Benachrichtigungen aktivieren" in der Kopfzeile
- Zeigt Popup bei neuer Bestellung

### Akustische Benachrichtigung
- Doppelter Piepton bei neuer Bestellung
- Erfordert keine Berechtigung
- Funktioniert automatisch nach erster Interaktion

## PWA-Installation

Das Kitchen Display kann als App installiert werden:

### Android/Chrome
1. Kitchen Display öffnen
2. Browser-Menü (drei Punkte)
3. "Zum Startbildschirm hinzufügen"
4. App-Symbol erscheint

### iOS/Safari
1. Kitchen Display öffnen
2. Teilen-Button (Quadrat mit Pfeil)
3. "Zum Home-Bildschirm"
4. App-Symbol erscheint

### Vorteile als PWA
- Vollbild ohne Browser-Leiste
- Schnellerer Start
- Landscape-Modus optimiert
- Offline-Cache für Assets
