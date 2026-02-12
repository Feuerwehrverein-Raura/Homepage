---
sidebar_position: 1
---

# Vorstand-Portal Übersicht

Das Vorstand-Portal ist das zentrale Verwaltungstool für den Feuerwehrverein Raura. Hier werden Mitglieder, Events, E-Mails, Finanzen und weitere Vereinsangelegenheiten verwaltet.

## Zugang

**URL:** [fwv-raura.ch/vorstand.html](https://fwv-raura.ch/vorstand.html)

**Login-Methode:** IMAP-Login mit Vereins-Mailbox-Credentials (z.B. `praesident@fwv-raura.ch`). Der JWT-Token (HS256) ist 8 Stunden gültig.

**Voraussetzungen:**
- Vorstand-Funktion (Präsident, Aktuar, Kassier, Materialwart, Beisitzer) oder Admin-Rechte
- Gültige Vereins-E-Mail-Zugangsdaten

**Mobile Alternative:** Die [Vorstand App](/apps/vorstand-app) bietet die wichtigsten Funktionen als Android-App.

## Hauptbereiche

Das Portal ist in folgende Tabs unterteilt:

| Tab | Beschreibung | Berechtigung |
|-----|--------------|--------------|
| **Mitglieder** | Mitgliederverwaltung, Fotos, Export, Statistiken | Vorstand |
| **Events** | Anlässe erstellen, Schichten/Bereiche verwalten, Anmeldungen | Vorstand |
| **Anmeldungen** | Helfer-Anmeldungen genehmigen/ablehnen, Alternativ-Vorschläge | Vorstand |
| **Audit** | Aktivitätsprotokoll aller Systemänderungen | Vorstand |
| **Nachricht** | Rundschreiben per E-Mail und Brief (Pingen) versenden | Vorstand |
| **E-Mail** | Mailcow-Postfächer und Aliases verwalten | Admin |
| **Anträge** | Mitgliedschaftsanträge bearbeiten (genehmigen/ablehnen) | Vorstand |
| **Post** | Briefversand via Pingen, Massen-PDF, Staging-Modus | Vorstand |
| **Buchhaltung** | Kontenplan, Buchungen, Rechnungen, Berichte | Vorstand |
| **PDF-Vorlagen** | PDF-Vorlagen verwalten (verlinkt zum [PDF-Designer](https://pdf.fwv-raura.ch)) | Admin |
| **IP-Whitelist** | Kassensystem-Zugriff einschränken | Admin |
| **Einstellungen** | Organisations-Einstellungen konfigurieren | Admin |

## Berechtigungsstufen

### Vorstand
- Mitglieder anzeigen, erstellen und bearbeiten
- Mitglieder-Fotos verwalten
- Events erstellen und verwalten (Schichten, Bereiche)
- Anmeldungen genehmigen/ablehnen, Alternativen vorschlagen
- Rundschreiben per E-Mail und Brief versenden
- Mitgliedschaftsanträge bearbeiten
- Arbeitspläne und Teilnehmerlisten als PDF exportieren
- Audit-Log einsehen
- Buchhaltung führen (Buchungen, Rechnungen)
- Erinnerungen an Helfer senden

### Admin
- Alle Vorstand-Rechte
- Mitglieder löschen
- E-Mail-Konten verwalten (Mailcow)
- IP-Whitelist konfigurieren
- Organisations-Einstellungen ändern
- PDF-Vorlagen verwalten
- Authentik-Synchronisierung auslösen
- Nextcloud- und Gruppenberechtigungen verwalten

## Schnellstart

### Erstes Login
1. Öffne [fwv-raura.ch/vorstand.html](https://fwv-raura.ch/vorstand.html)
2. Gib deine Vereins-E-Mail und Passwort ein
3. Nach erfolgreicher Anmeldung siehst du die Tab-Navigation

### Häufige Aufgaben

| Aufgabe | Navigation |
|---------|------------|
| Neues Mitglied anlegen | Mitglieder > "+ Neues Mitglied" |
| Mitglied-Foto hochladen | Mitglieder > Mitglied öffnen > Foto hochladen |
| Event erstellen | Events > "+ Neues Event" |
| Schicht mit Bereich anlegen | Events > Event bearbeiten > Schichten > Neue Schicht |
| Helfer zu Schicht zuweisen | Events > Event > Schichten > Person hinzufügen |
| Arbeitsplan exportieren | Events > Event > "Arbeitsplan anzeigen" > PDF |
| Teilnehmerliste exportieren | Events > Event > "Teilnehmerliste" > PDF |
| Rundschreiben versenden | Nachricht > Empfänger wählen > Verfassen > Senden |
| QR-Rechnung erstellen | Buchhaltung > Rechnungen > Neue Rechnung |
| Telefonliste drucken | Mitglieder > Export > Telefonliste PDF |
| Event-Gruppe erstellen | Events > Gruppen > Neue Gruppe |
| Erinnerung an Helfer senden | Events > Event > Erinnerungen > Vorschau > Senden |

## Statistiken Dashboard

Im Mitglieder-Tab werden folgende Statistiken angezeigt:

- **Gesamt:** Anzahl aller Mitglieder
- **Aktiv:** Aktivmitglieder (zahlen vollen Beitrag)
- **Passiv:** Passivmitglieder (zahlen reduzierten Beitrag)
- **Ehren:** Ehrenmitglieder (beitragsfrei)

## Technische Details

### Session-Verwaltung
- Login via IMAP-Authentifizierung gegen `mail.test.juroct.net`
- JWT-Token (HS256) mit 8 Stunden Gültigkeit
- Cookie auf `.fwv-raura.ch` für Cross-Subdomain-Zugriff (Vorstand-Portal, PDF-Designer)
- Token wird im Browser-Cookie und `sessionStorage` gespeichert

### API-Verbindungen
Das Portal kommuniziert mit folgenden Backend-Services (alle unter `api.fwv-raura.ch`):

| Service | Pfade | Funktion |
|---------|-------|----------|
| Members API | `/members`, `/auth`, `/roles`, `/vorstand`, `/funktionen`, `/member-registrations` | Mitglieder, Auth, Rollen |
| Events API | `/events`, `/shifts`, `/registrations`, `/arbeitsplan`, `/event-groups`, `/reminders` | Events, Schichten, Anmeldungen |
| Dispatch API | `/email`, `/pingen`, `/templates`, `/mailcow`, `/pdf-templates`, `/dispatch-log`, `/newsletter`, `/contact`, `/organisation-settings`, `/invoices/generate*` | E-Mail, Post, Vorlagen |
| Accounting API | `/accounts`, `/transactions`, `/invoices`, `/reports` | Buchhaltung |

### Frontend-Architektur
- Statische HTML/JS-Datei (`vorstand.html`, ~7000 Zeilen)
- ~90 JavaScript-Funktionen
- ~60 API-Endpoint-Aufrufe
- API-Konfiguration in `scripts/config.js`

## Fehlerbehebung

### "Nicht autorisiert" Meldung
- Prüfe, ob du eine erlaubte Vorstand-Mailbox verwendest
- Dein Token ist nach 8 Stunden abgelaufen — melde dich neu an
- Lösche Browser-Cache und Cookies für `fwv-raura.ch`
- Kontaktiere den Admin bei anhaltenden Problemen

### Seite lädt nicht
- Prüfe die Internetverbindung
- Versuche einen anderen Browser
- Prüfe den Server-Status

### Änderungen werden nicht gespeichert
- Prüfe ob dein Token noch gültig ist (8h Ablauf)
- Prüfe die Browser-Konsole auf Fehlermeldungen (F12)
- Stelle sicher, dass du die nötige Berechtigung hast (Vorstand vs. Admin)
