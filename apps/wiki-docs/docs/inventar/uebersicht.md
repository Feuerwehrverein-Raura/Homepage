---
sidebar_position: 1
---

# Inventar-System Übersicht

Das Inventar-System ermöglicht die professionelle Verwaltung aller Vereinsgüter, von Getränken über Materialien bis zu verkäuflichen Artikeln für das Kassensystem.

## Zugang

**URL:** [inventar.fwv-raura.ch](https://inventar.fwv-raura.ch) (Cloud) oder lokale Adresse

**Authentifizierung:** Authentik OAuth oder lokales Passwort (Raspberry Pi)

## System-Architektur

### Cloud-System
- Zugriff von überall
- Automatische Synchronisation mit lokalem System
- Backup aller Daten

### Lokales System (Raspberry Pi)
- Schneller Zugriff bei Anlässen
- Offline-fähig
- Direkter Scanner-Zugang

## Hauptfunktionen

### Artikelverwaltung
- **Artikel anlegen:** Name, Kategorie, Lagerort, Barcode
- **Artikel bearbeiten:** Alle Daten änderbar
- **Artikel löschen:** Mit Bestätigung
- **Bilder:** Produktbilder hochladen
- **Barcode:** Automatisch generiert oder manuell eingeben

### Bestandsverwaltung
- **Eingang (Stock In):** Ware einbuchen
- **Ausgang (Stock Out):** Ware ausbuchen
- **Korrektur:** Bestand auf exakten Wert setzen
- **Historie:** Alle Bewegungen nachvollziehbar

### Verkaufsartikel
- **Markierung:** Artikel als verkäuflich kennzeichnen
- **Preise:** Verkaufspreis festlegen
- **Kategorien:** Für Kasse gruppieren
- **Drucker-Station:** Bar oder Küche zuweisen

### Scanner-Integration
- **Kamera-Scanner:** Barcode per Handy-Kamera
- **USB-Scanner:** Externer Barcode-Scanner
- **QR-Codes:** Werden ebenfalls unterstützt
- **Schnellbuchung:** Ein-/Ausbuchen per Scan

## Artikel-Stammdaten

### Grunddaten

| Feld | Beschreibung | Pflicht |
|------|--------------|---------|
| **Name** | Artikelbezeichnung | Ja |
| **Barcode** | Eindeutiger Code | Ja (auto) |
| **Kategorie** | Artikelgruppe | Ja |
| **Lagerort** | Physischer Standort | Nein |
| **Beschreibung** | Zusätzliche Infos | Nein |

### Bestandsdaten

| Feld | Beschreibung |
|------|--------------|
| **Bestand** | Aktuelle Menge |
| **Mindestbestand** | Warnung bei Unterschreitung |
| **Einheit** | z.B. Stück, Liter, kg |
| **Einkaufspreis** | Für Kalkulation |

### Verkaufsdaten

| Feld | Beschreibung |
|------|--------------|
| **Verkäuflich** | Im Kassensystem anzeigen |
| **Verkaufspreis** | Preis in CHF |
| **Verkaufskategorie** | Kategorie in der Kasse |
| **Drucker-Station** | "bar" oder "kitchen" |

## Kategorien verwalten

### Kategorien anlegen
1. Klicke auf "Kategorien"
2. Klicke auf "+ Neue Kategorie"
3. Gib den Namen ein
4. Optional: Farbe wählen
5. Speichern

### Standard-Kategorien
- Getränke
- Speisen
- Festmaterial
- Dekoration
- Technik
- Sonstiges

## Lagerorte verwalten

### Lagerorte anlegen
1. Klicke auf "Lagerorte"
2. Klicke auf "+ Neuer Lagerort"
3. Gib den Namen ein
4. Optional: Beschreibung
5. Speichern

### Typische Lagerorte
- Magazin
- Festzelt
- Küche
- Bar
- Keller

## Bestandsbewegungen

### Eingang buchen (Stock In)

Verwende bei:
- Warenlieferung
- Rückgabe
- Inventur (mehr gefunden)

1. Öffne den Artikel
2. Klicke "Eingang"
3. Gib Menge ein
4. Optional: Grund angeben
5. Buchen

### Ausgang buchen (Stock Out)

Verwende bei:
- Verbrauch
- Verkauf (manuell)
- Schwund
- Inventur (weniger gefunden)

1. Öffne den Artikel
2. Klicke "Ausgang"
3. Gib Menge ein
4. Optional: Grund angeben
5. Buchen

### Bestand korrigieren

Für direkte Bestandsanpassung:

1. Öffne den Artikel
2. Klicke "Korrektur"
3. Gib den aktuellen Bestand ein
4. Grund angeben (Pflicht)
5. Speichern

## Barcode-System

### Barcode-Format
- Format: `FWV000001`, `FWV000002`, etc.
- Automatisch fortlaufend generiert
- Eindeutig pro Artikel

### Barcode drucken
1. Öffne den Artikel
2. Klicke "Barcode"
3. Wähle Format (Etikett/A4)
4. Drucken

### Externes Barcode
Falls der Artikel bereits einen Barcode hat:
1. Beim Anlegen: EAN-Code eingeben
2. Oder: Bestehenden Code scannen

## Integration mit Kassensystem

### Automatische Synchronisation
- Verkäufliche Artikel erscheinen automatisch im Kassensystem
- Änderungen werden sofort übernommen
- Preise und Kategorien aus Inventar

### Bei Verkauf
- Bestand wird automatisch reduziert
- Transaktion wird protokolliert
- Mindestbestand-Warnung bei Unterschreitung

## Berichte

### Bestandsliste
- Alle Artikel mit aktuellem Bestand
- Filterbar nach Kategorie/Lagerort
- Exportierbar als CSV

### Mindestbestand-Warnung
- Zeigt alle Artikel unter Mindestbestand
- Sortiert nach Dringlichkeit
- Nachbestellliste generieren

### Inventarwert
- Gesamtwert des Lagers
- Aufgeschlüsselt nach Kategorie
- Basierend auf Einkaufspreis

### Transaktionshistorie
- Alle Bewegungen chronologisch
- Filterbar nach Zeitraum
- Wer hat was wann gebucht

## Schnellstart

### Artikel anlegen
1. Klicke "+ Neuer Artikel"
2. Name eingeben
3. Kategorie wählen
4. Barcode scannen oder generieren lassen
5. Bestand eingeben
6. Speichern

### Verkaufsartikel aktivieren
1. Artikel öffnen
2. "Verkäuflich" aktivieren
3. Verkaufspreis eingeben
4. Drucker-Station wählen (bar/kitchen)
5. Speichern

### Inventur durchführen
1. Öffne Scanner-Modus
2. Scanne jeden Artikel
3. Prüfe/korrigiere Bestand
4. Buche Korrekturen

## Offline-Betrieb

Das lokale System (Raspberry Pi) funktioniert ohne Internet:
- Alle Artikel verfügbar
- Buchungen werden lokal gespeichert
- Bei Internetverbindung: Automatischer Sync

## Fehlerbehebung

### Artikel erscheint nicht in Kasse
- Prüfe: "Verkäuflich" aktiviert?
- Prüfe: Preis eingegeben?
- Cache leeren in der Kasse

### Barcode wird nicht erkannt
- Prüfe Kameraerlaubnis im Browser
- Barcode sauber und unbeschädigt?
- Gutes Licht vorhanden?

### Bestand stimmt nicht
- Transaktionshistorie prüfen
- Manuelle Korrektur durchführen
- Bei Kassensystem-Problemen: Support kontaktieren
