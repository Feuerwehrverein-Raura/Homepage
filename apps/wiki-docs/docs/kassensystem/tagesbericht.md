---
sidebar_position: 4
---

# Tagesbericht

Der Tagesbericht zeigt Statistiken für den aktuellen Geschäftstag.

## Geschäftstag

Der Geschäftstag läuft von **12:00 Uhr bis 12:00 Uhr** des Folgetages.

Beispiel:
- Bestellungen von 12:00 am 15.01. bis 11:59 am 16.01. gehören zum 15.01.

## Übersicht

Die Statistik zeigt:
- **Bestellungen**: Anzahl aller Bestellungen
- **Umsatz**: Gesamtsumme in CHF
- **Bezahlt**: Anzahl abgeschlossener Bestellungen
- **Offen**: Anzahl noch offener Bestellungen

## Meistverkaufte Artikel

Die Top 10 Artikel werden angezeigt mit:
- Artikelname
- Verkaufte Menge
- Umsatz für diesen Artikel

## E-Mail-Bericht

Der Tagesbericht kann per E-Mail versendet werden:
1. Im Kassensystem einloggen
2. Statistik-Bereich öffnen
3. "Bericht senden" klicken
4. Bericht wird an die Login-E-Mail gesendet

### Inhalt des E-Mail-Berichts
- Datum und Zeitraum
- Zusammenfassung (Bestellungen, Umsatz)
- Aufschlüsselung nach Zahlungsart
- Meistverkaufte Artikel

## API

### Tagesstatistik abrufen
```
GET /api/stats/daily
```

Antwort:
```json
{
  "date": "2024-01-15",
  "summary": {
    "total_orders": 45,
    "total_revenue": "1234.50",
    "completed_orders": 40,
    "paid_orders": 38,
    "pending_orders": 5
  },
  "top_items": [
    {"name": "Bier", "total_sold": 120, "total_revenue": "480.00"},
    {"name": "Bratwurst", "total_sold": 45, "total_revenue": "337.50"}
  ]
}
```

### Bericht senden
```
POST /api/stats/send-report
Authorization: Bearer <token>
```

Sendet den Bericht an die E-Mail-Adresse im Token.
