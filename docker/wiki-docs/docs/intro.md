---
sidebar_position: 1
slug: /
---

# Willkommen beim FWV Raura Wiki

Diese Dokumentation erklärt alle Funktionen der Feuerwehrverein Raura Website.

## Schnellstart

### Für Mitglieder
- [Erste Schritte](/benutzer/erste-schritte) - Registrierung und Login
- [Profil verwalten](/benutzer/profil) - Persönliche Daten aktualisieren

### Für Vorstand
- [Mitgliederverwaltung](/vorstand/mitglieder) - Mitglieder hinzufügen, bearbeiten, löschen
- [Event-Management](/vorstand/events) - Anlässe erstellen und verwalten
- [Anmeldungen](/vorstand/anmeldungen) - Helfer-Anmeldungen bearbeiten

### Für Administratoren
- [Rollen & Berechtigungen](/admin/rollen) - Zugriffsrechte verwalten
- [Audit-Log](/admin/audit-log) - Aktivitäten überwachen

### Für Anlässe
- [Kassensystem](/kassensystem/uebersicht) - Bestellungen aufnehmen und abrechnen
- [Kitchen Display](/kassensystem/kitchen-display) - Bestellungen in Küche/Bar anzeigen
- [Inventar](/inventar/uebersicht) - Lagerverwaltung und Artikelstamm

## System-Architektur

Die Website besteht aus mehreren Komponenten:

| Service | Beschreibung | URL |
|---------|--------------|-----|
| Frontend | Hauptwebsite | fwv-raura.ch |
| API Members | Mitgliederverwaltung | api.fwv-raura.ch |
| API Events | Event-Management | events.fwv-raura.ch |
| API Dispatch | E-Mail & Briefe | (intern) |
| Kassensystem | Bestellungen bei Anlässen | order.fwv-raura.ch |
| Kitchen Display | Bestellanzeige Küche/Bar | kitchen.fwv-raura.ch |
| Inventar | Lagerverwaltung | inventar.fwv-raura.ch |
| Wiki | Diese Dokumentation | wiki.fwv-raura.ch |

## Versionierung

Die aktuelle Version kann über den Health-Endpoint abgefragt werden:

```bash
curl https://api.fwv-raura.ch/health
# {"status":"ok","service":"api-members","version":"1.0.0"}
```
