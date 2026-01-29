---
sidebar_position: 3
---

# Kitchen Display System (KDS)

Das Kitchen Display zeigt alle offenen Bestellungen in Echtzeit für Küche und Bar an.

## Zugang

**URL:** [kitchen.fwv-raura.ch](https://kitchen.fwv-raura.ch) (Cloud) oder lokale Adresse

Das Kitchen Display ist eine Progressive Web App (PWA) und kann auf Tablets installiert werden.

## Benutzeroberfläche

### Header-Bereich

| Element | Beschreibung |
|---------|--------------|
| **Titel** | "Kitchen Display" |
| **Filter-Buttons** | Alle / Bar / Küche |
| **Ton-Button** | Sound aktivieren (wichtig!) |
| **Zähler** | Anzahl offener Bestellungen |

### Bestellungs-Karten

Jede Bestellung wird als Karte angezeigt:

| Element | Beschreibung |
|---------|--------------|
| **Tischnummer** | Gross und prominent (blau) |
| **Bestellnummer** | Klein, oben rechts |
| **Zeit** | "vor X Min" - Wartezeit |
| **Artikel** | Liste mit Menge und Name |
| **Notizen** | Sonderwünsche (gelb) oder Allergien (rot) |
| **Erledigt-Button** | Bestellung abschliessen |

### Farbcodes

| Farbe | Bedeutung |
|-------|-----------|
| **Blau** | Normale Bestellung |
| **Gelb** | Take-Away (Tisch 0) |
| **Rot umrandet** | Dringend (> 10 Minuten) |
| **Gelber Hintergrund** | Notiz vorhanden |
| **Roter Hintergrund** | Allergie-Hinweis |

## Ton aktivieren

:::warning Wichtig!
Der Ton muss nach jedem Seitenaufruf manuell aktiviert werden (Browser-Sicherheit).
:::

### Ton einschalten

1. Öffne das Kitchen Display
2. Klicke auf den roten **"TON AKTIVIEREN"** Button
3. Ein Testton wird abgespielt
4. Der Button ändert sich zu grün "Ton aktiv"

### Benachrichtigungston

Bei neuer Bestellung:
- **Akustischer Alarm** (3 aufsteigende Töne)
- **Visueller Blitz** (Bildschirm blinkt kurz gelb)
- **Browser-Notification** (falls aktiviert)

## Station filtern

### Alle Bestellungen
- Zeigt alle offenen Bestellungen
- Standard-Ansicht

### Bar
- Zeigt nur Bestellungen mit Bar-Artikeln
- Ideal für Bar-Personal

### Küche
- Zeigt nur Bestellungen mit Küchen-Artikeln
- Ideal für Küchen-Personal

:::tip
Bei gemischten Bestellungen erscheint die Bestellung in beiden Ansichten, aber nur mit den relevanten Artikeln.
:::

## Bestellung bearbeiten

### Als erledigt markieren

Wenn alle Artikel einer Bestellung fertig sind:

1. Klicke auf den grünen **"✓ Erledigt"** Button
2. Die Bestellung verschwindet vom Display
3. Alle verbundenen Displays werden aktualisiert

:::info
"Erledigt" bedeutet nur, dass die Zubereitung fertig ist. Die Bestellung bleibt offen bis zur Bezahlung an der Kasse.
:::

### Priorität erkennen

- **Rote Umrandung:** Bestellung wartet > 10 Minuten
- **Sortierung:** Älteste Bestellungen oben/links
- **Zeitanzeige:** "vor X Min" zeigt Wartezeit

## Installation als App (PWA)

### Auf Tablet installieren

#### Chrome (Android)
1. Öffne das Kitchen Display im Browser
2. Tippe auf das Menü (drei Punkte)
3. Wähle "Zum Startbildschirm hinzufügen"
4. Bestätige

#### Safari (iOS/iPadOS)
1. Öffne das Kitchen Display in Safari
2. Tippe auf das Teilen-Symbol
3. Wähle "Zum Home-Bildschirm"
4. Bestätige

### Vorteile der App-Installation
- Vollbild-Modus
- Kein Browser-UI
- Schnellerer Start
- Professionelleres Erscheinungsbild

## Einrichtung für Anlass

### Empfohlene Hardware

| Gerät | Empfehlung |
|-------|------------|
| **Display** | Tablet (10"+) oder Monitor |
| **Halterung** | Wandhalterung oder Ständer |
| **Stromversorgung** | Dauerhaft angeschlossen |
| **Netzwerk** | WLAN oder LAN (stabiler) |

### Setup-Schritte

1. **Gerät positionieren**
   - Gut sichtbar für Personal
   - Vor Feuchtigkeit/Hitze geschützt

2. **App installieren** (siehe oben)

3. **Display-Einstellungen**
   - Bildschirm-Timeout deaktivieren
   - Helligkeit anpassen
   - Lautstärke hoch einstellen

4. **Ton aktivieren**
   - Bei jedem Start nötig!
   - Test mit echter Bestellung

5. **Filter einstellen**
   - Bar-Display: "Bar" Filter
   - Küchen-Display: "Küche" Filter

## Synchronisation

### WebSocket-Verbindung

Das Kitchen Display verbindet sich per WebSocket zum Server:
- Sofortige Updates bei neuen Bestellungen
- Automatische Wiederverbindung bei Unterbruch
- Reconnect alle 3 Sekunden bei Verbindungsverlust

### Verbindungsstatus

- **Grüner Punkt:** Verbunden
- **Roter Punkt:** Getrennt (versucht Reconnect)
- **Gelber Punkt:** Verbindung wird aufgebaut

## Cloud-Synchronisation

Wenn Bestellungen in der Cloud aufgegeben werden:
- Werden automatisch ans lokale System übertragen
- Erscheinen auf allen Kitchen Displays
- Werden auf lokalen Druckern gedruckt

## Fehlerbehebung

### Keine neuen Bestellungen

1. **Prüfe WebSocket-Verbindung** (Status-Anzeige)
2. **Seite neu laden** (F5)
3. **Browser-Cache leeren** (Ctrl+Shift+R)
4. **WLAN/Netzwerk prüfen**

### Kein Ton

1. **Ton aktivieren** (roter Button)
2. **Gerätelautstärke prüfen**
3. **Stummschaltung aufheben**
4. **Browser neu starten**

### Bestellung fehlt

1. **Filter prüfen** (Alle/Bar/Küche)
2. **Seite neu laden**
3. **Andere Displays prüfen**

### Display zeigt nichts

1. **Internetverbindung prüfen**
2. **URL korrekt?**
3. **Server erreichbar?**
4. **Browser aktuell?**

## Best Practices

### Für den Betrieb

- **Ton immer aktiv** - Sonst werden Bestellungen überhört
- **Regelmässig prüfen** - Auch wenn kein Ton kommt
- **Erledigt-Button nutzen** - Hält Übersicht sauber
- **Allergien beachten** - Rot markierte Notizen ernst nehmen

### Für die Einrichtung

- **Mehrere Displays** - Je eins für Bar und Küche
- **Backup-Gerät** - Falls ein Display ausfällt
- **Gute Beleuchtung** - Display muss lesbar sein
- **Stabiles Netzwerk** - LAN bevorzugen wenn möglich
