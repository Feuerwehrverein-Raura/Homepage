---
sidebar_position: 2
---

# Kitchen Display App

Native Android-App für die Anzeige von Bestellungen in Küche und Bar bei Vereinsanlässen.

## Download & Installation

1. Gehe zu [GitHub Releases](https://github.com/Feuerwehrverein-Raura/Homepage/releases)
2. Lade die neueste `kitchen-display-vX.X.X.apk` herunter (Tags: `kds-v*`)
3. Öffne die APK-Datei auf deinem Android-Gerät
4. Erlaube bei Bedarf die Installation aus unbekannten Quellen

**Systemvoraussetzungen:**
- Android 8.0 (API 26) oder neuer
- WLAN-Verbindung zum Kassensystem

:::tip Web-Version verfügbar
Neben der nativen Android-App gibt es auch eine Web-Version (PWA) des Kitchen Displays, die im Browser läuft. Diese ist unter `kitchen.fwv-raura.ch` erreichbar und kann auf jedem Gerät mit Browser verwendet werden.
:::

---

## Ersteinrichtung

### Server-Verbindung konfigurieren

1. Öffne die App
2. Gehe zu **Einstellungen** (Zahnrad-Symbol)
3. Gib die Server-URL ein:
   - **Lokal (Raspberry Pi):** `http://192.168.1.100:3000`
   - **Cloud:** `https://order.fwv-raura.ch`
4. Gib das Anzeige-Passwort ein (wird vom Administrator bereitgestellt)
5. Tippe auf **Speichern**

### Station auswählen

Je nach Einsatzort:

| Station | Anzeige |
|---------|---------|
| **Küche** | Nur Speisen (Essen, Pommes, etc.) |
| **Bar** | Nur Getränke (Bier, Wein, Softdrinks) |
| **Alle** | Alle Bestellungen |

---

## Bedienung

### Bestellungen anzeigen

Nach dem Verbinden siehst du die offenen Bestellungen:

```
┌─────────────────────────────────────┐
│ Tisch 5                    12:34:56 │
├─────────────────────────────────────┤
│ 2x Bratwurst                        │
│ 1x Pommes                           │
│ 1x Schnitzel                        │
└─────────────────────────────────────┘
```

Jede Bestellung zeigt:
- **Tischnummer** (oder "Take-Away")
- **Bestellzeit**
- **Bestellte Artikel** mit Menge

### Bestellung als erledigt markieren

1. Tippe auf eine Bestellung
2. Die Bestellung wird grün markiert
3. Nach kurzer Zeit verschwindet sie aus der Liste

> Erledigte Bestellungen werden sofort via WebSocket an die Kasse übermittelt.

### Audio-Signal

Bei jeder neuen Bestellung ertönt ein akustisches Signal. Dies kann in den Einstellungen angepasst werden.

---

## Echtzeit-Synchronisation

Die App verbindet sich via WebSocket (OkHttp) mit dem Kassensystem:

- **Neue Bestellungen** erscheinen sofort
- **Stornierungen** werden automatisch entfernt
- **Erledigte Bestellungen** werden synchronisiert

Bei Verbindungsabbruch:
1. Die App zeigt eine Warnung an
2. Automatische Wiederverbindung wird versucht
3. Bei dauerhaftem Problem: Prüfe die WLAN-Verbindung

---

## Einstellungen

Erreichbar über das Zahnrad-Symbol:

| Einstellung | Beschreibung |
|-------------|--------------|
| **Server-URL** | Adresse des Kassensystems |
| **Passwort** | Anzeige-Passwort |
| **Station** | Küche, Bar oder Alle |
| **Ton** | Audio-Signal ein/aus |
| **Dark Mode** | Dunkles Design (Standard: aktiviert) |

### Dark Mode

Das dunkle Design ist standardmässig aktiviert und für den Einsatz in der Küche optimiert:
- Reduzierte Helligkeit
- Bessere Lesbarkeit
- Weniger Blendung

---

## Auto-Update

Die App prüft beim Start automatisch auf Updates via GitHub Releases:

1. Bei verfügbarem Release mit Tag `kds-v*` erscheint ein Dialog
2. Tippe auf **Herunterladen**
3. Installiere die neue Version

---

## Problemlösung

### Keine Verbindung zum Server
- Prüfe ob das Tablet im gleichen WLAN wie das Kassensystem ist
- Prüfe ob die Server-URL korrekt ist
- Stelle sicher, dass das Kassensystem läuft

### Bestellungen erscheinen nicht
- Prüfe die Station-Einstellung (Küche zeigt keine Getränke)
- Prüfe die WebSocket-Verbindung (grüner Punkt = verbunden)
- Starte die App neu

### Kein Ton bei neuer Bestellung
- Prüfe ob der Ton in den Einstellungen aktiviert ist
- Prüfe die Lautstärke des Tablets
- Prüfe ob "Nicht stören" deaktiviert ist

### App friert ein
- Starte die App neu
- Bei dauerhaftem Problem: App-Daten löschen und neu einrichten

---

## Empfohlene Hardware

Für den Einsatz in der Küche empfehlen wir:

| Eigenschaft | Empfehlung |
|-------------|------------|
| **Display** | Mind. 10 Zoll |
| **Auflösung** | Mind. 1280x800 |
| **Schutz** | Spritzwasserschutz (IP54) |
| **Halterung** | Wandmontage oder Ständer |
| **Stromversorgung** | Netzteil (nicht Akku) |

---

## Technische Details

| Eigenschaft | Wert |
|-------------|------|
| Min. Android | 8.0 (API 26) |
| Sprache | Kotlin |
| Architektur | Single-Activity |
| WebSocket | OkHttp |
| Design | Material Design, Dark Theme (Standard) |
| Auto-Update | UpdateChecker (GitHub Releases, Tag-Filter `kds-v*`) |
| CI/CD | GitHub Actions (`build-android-kds.yml`) |
| Quellcode | `simple-order-system/kitchen-display-android/` |
