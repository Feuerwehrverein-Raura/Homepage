---
sidebar_position: 1
---

# Vorstand-Portal Übersicht

Das Vorstand-Portal ist das zentrale Verwaltungstool für den Feuerwehrverein Raura. Hier werden Mitglieder, Events, E-Mails und weitere Vereinsangelegenheiten verwaltet.

## Zugang

**URL:** [fwv-raura.ch/vorstand.html](https://fwv-raura.ch/vorstand.html)

**Voraussetzungen:**
- Mitglied mit Vorstand-Funktion (Präsident, Aktuar, Kassier, Materialwart, Beisitzer) oder Admin-Rechte
- Gültiger Authentik-Account

## Hauptbereiche

Das Portal ist in folgende Tabs unterteilt:

| Tab | Beschreibung | Berechtigung |
|-----|--------------|--------------|
| **Mitglieder** | Mitgliederverwaltung, Export, Statistiken | Vorstand |
| **Events** | Anlässe erstellen, Schichten verwalten | Vorstand |
| **Audit** | Aktivitätsprotokoll einsehen | Vorstand |
| **Nachricht** | Rundschreiben per E-Mail/Post versenden | Vorstand |
| **E-Mail** | Mailcow-Postfächer und Aliase verwalten | Admin |
| **Anträge** | Mitgliedschaftsanträge bearbeiten | Vorstand |
| **Post** | Briefversand via Pingen | Vorstand |
| **IP-Whitelist** | Kassensystem-Zugriff einschränken | Admin |

## Berechtigungsstufen

### Vorstand
- Mitglieder anzeigen und bearbeiten
- Events erstellen und verwalten
- Rundschreiben versenden
- Anträge bearbeiten
- Audit-Log einsehen

### Admin
- Alle Vorstand-Rechte
- Mitglieder löschen
- E-Mail-Konten verwalten
- IP-Whitelist konfigurieren
- System-Einstellungen ändern

## Schnellstart

### Erstes Login
1. Öffne [fwv-raura.ch/vorstand.html](https://fwv-raura.ch/vorstand.html)
2. Melde dich mit deinen Authentik-Zugangsdaten an
3. Nach erfolgreicher Anmeldung siehst du die Tab-Navigation

### Häufige Aufgaben

| Aufgabe | Navigation |
|---------|------------|
| Neues Mitglied anlegen | Mitglieder → "+ Neues Mitglied" |
| Event erstellen | Events → "+ Neues Event" |
| Rundschreiben versenden | Nachricht → Empfänger wählen → Nachricht verfassen → Senden |
| Helfer zu Schicht zuweisen | Events → Event bearbeiten → Schichten → Person hinzufügen |
| Arbeitsplan exportieren | Events → Event öffnen → "Arbeitsplan anzeigen" → PDF herunterladen |

## Statistiken Dashboard

Im Mitglieder-Tab werden folgende Statistiken angezeigt:

- **Gesamt:** Anzahl aller Mitglieder
- **Aktiv:** Aktivmitglieder (zahlen vollen Beitrag)
- **Passiv:** Passivmitglieder (zahlen reduzierten Beitrag)
- **Ehren:** Ehrenmitglieder (beitragsfrei)

## Technische Details

### Session-Verwaltung
- Token wird im `sessionStorage` gespeichert
- Automatische Abmeldung nach 24 Stunden
- Bei Inaktivität: Token-Refresh bei nächster Aktion

### API-Verbindungen
Das Portal kommuniziert mit folgenden Backend-Services:
- `api.fwv-raura.ch/members` - Mitgliederverwaltung
- `api.fwv-raura.ch/events` - Event-Management
- `api.fwv-raura.ch/dispatch` - E-Mail/Post-Versand

## Fehlerbehebung

### "Nicht autorisiert" Meldung
- Prüfe, ob du als Vorstand-Mitglied eingetragen bist
- Lösche Browser-Cache und melde dich neu an
- Kontaktiere den Admin bei anhaltenden Problemen

### Seite lädt nicht
- Prüfe die Internetverbindung
- Versuche einen anderen Browser
- Prüfe den Server-Status auf [status.fwv-raura.ch](https://status.fwv-raura.ch)
