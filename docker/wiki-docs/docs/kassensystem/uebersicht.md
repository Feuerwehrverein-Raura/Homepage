---
sidebar_position: 1
---

# Kassensystem

Das Kassensystem ermöglicht die Verwaltung von Bestellungen bei Vereinsanlässen.

## Zugang

| Anwendung | URL | Beschreibung |
|-----------|-----|--------------|
| Kasse | [order.fwv-raura.ch](https://order.fwv-raura.ch) | Hauptanwendung für Bestellungen |
| Kitchen Display | [kitchen.fwv-raura.ch](https://kitchen.fwv-raura.ch) | Anzeige für Küche/Bar |
| IP-Registrierung | [register.fwv-raura.ch](https://register.fwv-raura.ch) | Gerät für Zugriff freischalten |

## Funktionen

### Bestellverwaltung
- Tischbasierte Bestellungen
- Artikel aus dem Inventar-System
- Nachbestellungen zu offenen Bestellungen
- Stornierung und Abschluss

### Zahlungsarten
- Bar (Barzahlung)
- Karte (manuell via SumUp-Terminal)
- TWINT (in Vorbereitung)

### Drucker-Integration
- Automatischer Bondruck bei Bestellung
- Verschiedene Drucker-Stationen (Bar, Küche)
- Epson TM-m30III kompatibel (ESC/POS)

### Statistiken
- Tagesumsatz
- Meistverkaufte Artikel
- Zahlungsarten-Übersicht
- E-Mail-Bericht an eingeloggte Benutzer

## Workflow

1. **Tisch auswählen** - Tischnummer eingeben
2. **Artikel hinzufügen** - Aus dem Katalog wählen
3. **Bestellung aufgeben** - Automatisch an Drucker gesendet
4. **Nachbestellen** - Weitere Artikel hinzufügen
5. **Abschliessen** - Zahlung wählen und Tisch freigeben

## Integration mit Inventar

Das Kassensystem bezieht alle Artikel direkt aus dem Inventar-System:
- Nur verkäufliche Artikel werden angezeigt
- Lagerbestand wird automatisch reduziert
- Preise und Kategorien aus dem Inventar

## Kitchen Display

Das Kitchen Display zeigt alle offenen Bestellungen in Echtzeit:
- WebSocket-Verbindung für Live-Updates
- Filter nach Station (Bar/Küche)
- Akustische Benachrichtigung bei neuen Bestellungen
- PWA-fähig (installierbar)

## IP-Whitelist

Zum Schutz des Systems können nur freigeschaltete IP-Adressen zugreifen:
- Selbstregistrierung mit PIN (24h gültig)
- Permanente Einträge durch Admin
- Verwaltung im Vorstand-Portal
