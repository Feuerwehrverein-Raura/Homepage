---
sidebar_position: 3
---

# IP-Whitelist

Die IP-Whitelist schützt das Kassensystem vor unbefugtem Zugriff.

## Konzept

- Nur freigeschaltete IP-Adressen können auf das Kassensystem zugreifen
- Geräte können sich selbst mit einem PIN registrieren
- Selbstregistrierungen sind 24 Stunden gültig
- Admin-Einträge sind permanent

## Selbstregistrierung

### Voraussetzungen
- Aktueller PIN (vom Vorstand)
- Zugang zur URL: [register.fwv-raura.ch](https://register.fwv-raura.ch)

### Ablauf
1. Register-App öffnen
2. Eigene IP-Adresse wird angezeigt
3. Gerätename eingeben (optional)
4. PIN eingeben
5. "Registrieren" klicken
6. Gerät ist für 24h freigeschaltet

### Hinweise
- Nach 24h muss erneut registriert werden
- Bei IP-Wechsel (z.B. neues WLAN) erneut registrieren
- PIN nicht weitergeben

## Verwaltung im Vorstand-Portal

### Zugang
1. [fwv-raura.ch/vorstand.html](https://fwv-raura.ch/vorstand.html) öffnen
2. Tab "IP-Whitelist" auswählen

### Whitelist aktivieren/deaktivieren
- Schalter oben rechts
- Bei deaktivierter Whitelist haben alle Zugriff

### PIN anzeigen/ändern
- Button "PIN anzeigen" zeigt aktuellen PIN
- Neuen PIN eingeben und speichern

### IP manuell hinzufügen
- IP-Adresse eingeben
- Gerätename (optional)
- Diese Einträge sind permanent

### IP entfernen
- Mülleimer-Symbol neben dem Eintrag
- Gerät verliert sofort den Zugriff

## Technische Details

### Gespeicherte Daten
| Feld | Beschreibung |
|------|--------------|
| ip_address | Die IP-Adresse |
| device_name | Optionaler Gerätename |
| created_at | Erstellungszeitpunkt |
| expires_at | Ablaufzeitpunkt (null = permanent) |
| is_permanent | Permanent oder temporär |
| created_by | "self-register" oder Admin-Email |

### API-Endpunkte

```
GET  /api/whitelist/my-ip       # Eigene IP abrufen
GET  /api/whitelist/check       # Prüfen ob freigeschaltet
POST /api/whitelist/register    # Mit PIN registrieren
GET  /api/whitelist             # Liste aller IPs (Auth)
POST /api/whitelist             # IP hinzufügen (Auth)
DELETE /api/whitelist/:id       # IP entfernen (Auth)
```

### Fehlerbehandlung
Bei nicht freigeschalteter IP wird angezeigt:
- HTTP 403 Forbidden
- Hinweis auf register.fwv-raura.ch
- Eigene IP-Adresse
