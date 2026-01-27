---
sidebar_position: 1
---

# Inventar-System

Das Inventar-System ermöglicht die Verwaltung aller Vereinsgüter.

## Zugang

URL: [inventar.fwv-raura.ch](https://inventar.fwv-raura.ch)

## Funktionen

### Artikelverwaltung
- Artikel hinzufügen/bearbeiten/löschen
- Kategorien und Lagerorte
- Bilder hochladen
- Barcode-Unterstützung

### Lagerbestand
- Einbuchen (Stock In)
- Ausbuchen (Stock Out)
- Bestandshistorie
- Mindestbestand-Warnung

### Verkaufsartikel
- Artikel als verkäuflich markieren
- Verkaufspreis festlegen
- Verkaufskategorie (für Kasse)
- Drucker-Station (Bar/Küche)

### Scanner
- Barcode-Scanner per Kamera
- QR-Code Unterstützung
- Schnelles Ein-/Ausbuchen

## Artikeldaten

| Feld | Beschreibung |
|------|--------------|
| Name | Artikelbezeichnung |
| Barcode | Eindeutiger Code (auto-generiert) |
| Kategorie | Gruppierung (z.B. Getränke, Material) |
| Lagerort | Wo der Artikel gelagert ist |
| Bestand | Aktuelle Menge |
| Mindestbestand | Warnung bei Unterschreitung |
| Einheit | z.B. Stück, Liter, kg |
| Bild | Produktbild (optional) |

## Verkaufsartikel

Artikel die im Kassensystem erscheinen sollen:

| Feld | Beschreibung |
|------|--------------|
| Verkäuflich | Ja/Nein |
| Verkaufspreis | Preis in CHF |
| Verkaufskategorie | Kategorie in der Kasse |
| Drucker-Station | bar oder kitchen |

## Kategorien

Verwaltung von Artikel-Kategorien:
- Hinzufügen/Bearbeiten/Löschen
- Sortierung
- Farbe (optional)

## Lagerorte

Verwaltung von Lagerorten:
- Mehrere Lager möglich
- Artikel einem Lagerort zuweisen
- Übersicht nach Lagerort filtern

## Integration

### Kassensystem
- Verkäufliche Artikel erscheinen automatisch
- Bei Verkauf wird Bestand reduziert
- Preise aus Inventar übernommen

### API-Endpunkte
```
GET  /api/items              # Alle Artikel
GET  /api/items/sellable     # Nur verkäufliche
POST /api/items              # Neuer Artikel
PUT  /api/items/:id          # Artikel bearbeiten
DELETE /api/items/:id        # Artikel löschen
POST /api/items/:id/stock    # Bestand ändern
```
