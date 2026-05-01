---
sidebar_position: 3
---

# Event-Management

Das Event-Management ermöglicht die Erstellung und Verwaltung aller Vereinsanlässe, von der Generalversammlung bis zum Dorffest.

## Event-Übersicht

### Event-Liste

Die Hauptansicht zeigt alle Events in einer Tabelle:

| Spalte | Beschreibung |
|--------|--------------|
| **Titel** | Name des Events |
| **Datum** | Start- und ggf. Enddatum |
| **Kategorie** | Art des Anlasses |
| **Status** | Geplant, Aktiv, Abgeschlossen, Abgesagt |
| **Schichten** | Anzahl Schichten / zugewiesene Personen |
| **Anmeldungen** | Anzahl Anmeldungen |
| **Aktionen** | Einladung, Bearbeiten |

### Filter und Suche
- **Alle:** Zeigt alle Events
- **Kommend:** Nur zukünftige Events
- **Vergangen:** Nur vergangene Events

## Event erstellen

1. Klicke auf **"+ Neues Event"**
2. Fülle die Felder aus
3. Klicke auf **"Speichern"**

### Grunddaten

| Feld | Beschreibung | Pflicht |
|------|--------------|---------|
| **Titel** | Name des Events | Ja |
| **Untertitel** | Zusätzliche Beschreibung | Nein |
| **Slug** | URL-freundlicher Name (auto-generiert) | Ja |
| **Kategorie** | Art des Events (siehe unten) | Ja |
| **Status** | Aktueller Status | Ja |
| **Startdatum** | Beginn des Events | Ja |
| **Enddatum** | Ende (bei mehrtägigen Events) | Nein |
| **Ort** | Veranstaltungsort | Nein |
| **Beschreibung** | Detaillierte Beschreibung (HTML) | Nein |

### Event-Kategorien

| Kategorie | Beschreibung | Anmeldung | Schichten |
|-----------|--------------|-----------|-----------|
| **Dorffest** | Grossanlass mit Helfereinsatz | Schicht-Anmeldung | Ja |
| **Aufbau** | Aufbauarbeiten | Teilnehmer-Anmeldung | Nein |
| **Abbau** | Abbauarbeiten | Teilnehmer-Anmeldung | Nein |
| **Ausflug** | Vereinsausflug ohne Anmeldung | Keine | Nein |
| **Ausflug mit Anmeldung** | Vereinsausflug mit Anmeldung | Teilnehmer-Anmeldung | Nein |
| **Sonstiges** | Anderer Anlass | Optional | Optional |

### Event-Status

| Status | Bedeutung | Sichtbar auf Website |
|--------|-----------|---------------------|
| **Geplant** | In Vorbereitung | Nein |
| **Aktiv** | Anmeldungen möglich | Ja |
| **Abgeschlossen** | Event ist vorbei | Ja (Archive) |
| **Abgesagt** | Event findet nicht statt | Nein |

### Anmeldungseinstellungen

Bei Events mit Anmeldung:

| Feld | Beschreibung |
|------|--------------|
| **Anmeldeschluss** | Letzter Anmeldetermin |
| **Max. Teilnehmer** | Teilnehmerlimit (optional) |
| **Kosten** | Teilnahmegebühr (optional) |
| **Organisator Name** | Kontaktperson |
| **Organisator E-Mail** | Kontakt-E-Mail |

### Organisator-Zugang

Wenn aktiviert, erhält der Organisator:
- Eigenen Login-Link für das Event
- Zugriff auf Anmeldungen und Schichten
- Kann Arbeitsplan bearbeiten

## Schichten verwalten

Schichten werden für Events der Kategorie "Dorffest" oder "Sonstiges" verwendet.

### Schicht-Typen (Bereiche)

| Bereich | Beschreibung |
|---------|--------------|
| **Allgemein** | Allgemeine Helferaufgaben |
| **Küche** | Essenszubereitung |
| **Bar** | Getränkeausgabe |
| **Service** | Bedienung |
| **Kasse** | Kassentätigkeit |
| **Springer** | Flexibler Einsatz überall |
| **Vorbereitung** | Vorbereitungsarbeiten |
| **Aufbau** | Aufbauarbeiten |
| **Abbau** | Abbauarbeiten |

### Schicht hinzufügen

1. Öffne das Event zur Bearbeitung
2. Scrolle zu **"Helfer-Schichten"**
3. Klicke auf **"+ Schicht hinzufügen"**
4. Fülle aus:
   - **Bereich:** Wähle den Schicht-Typ
   - **Name:** z.B. "Schicht 1", "Morgen", etc.
   - **Datum:** Datum der Schicht
   - **Start:** Startzeit
   - **Ende:** Endzeit
   - **Anzahl:** Benötigte Helfer
   - **Beschreibung:** Optional
5. Speichere das Event

### Springer-Schichten generieren

Für Events mit vielen Zeitslots:

1. Erstelle zuerst alle regulären Schichten (Bar, Küche, etc.)
2. Klicke auf **"Springer generieren"**
3. Das System erstellt automatisch Springer-Schichten für jeden Zeitslot

:::tip
Springer-Schichten haben dieselben Zeitslots wie die anderen Schichten, werden aber als eigene Spalte im Arbeitsplan angezeigt.
:::

### Schicht bearbeiten

1. Klicke auf eine bestehende Schicht
2. Ändere die gewünschten Felder
3. Speichere

### Schicht löschen

1. Klicke auf das **X** neben der Schicht
2. Die Schicht wird beim Speichern entfernt

:::warning
Beim Löschen einer Schicht werden alle Zuweisungen entfernt!
:::

## Personen zu Schichten zuweisen

### Person hinzufügen

1. Öffne das Event zur Bearbeitung
2. Klicke bei der gewünschten Schicht auf **"Person hinzufügen"**
3. Wähle ein Mitglied aus der Liste
4. Klicke auf **"Zuweisen"**

### Person entfernen

1. Öffne das Event
2. Klicke auf das **X** neben dem Namen
3. Die Zuweisung wird entfernt

### Aus Anmeldung zuweisen

Wenn jemand sich für das Event angemeldet hat:
1. Gehe zu den Anmeldungen
2. Klicke auf **"Zu Schicht zuweisen"**
3. Wähle die passende Schicht

## Arbeitsplan

Der Arbeitsplan zeigt alle Schichten und Zuweisungen übersichtlich.

### Arbeitsplan anzeigen

1. Klicke in der Event-Liste auf **"Arbeitsplan"**
2. Oder öffne das Event und klicke auf **"Arbeitsplan anzeigen"**

### Arbeitsplan-Ansicht

Der Plan zeigt:
- **Zeit:** Zeitslots (z.B. 12:00-14:00)
- **Bereiche als Spalten:** Bar, Küche, Service, Kasse, Springer
- **Zugewiesene Personen:** Namen in den Zellen
- **Leere Plätze:** Striche für noch nicht besetzte Positionen

### Arbeitsplan exportieren

#### Als PDF
1. Klicke auf **"PDF herunterladen"**
2. Das PDF wird generiert und heruntergeladen

#### Per E-Mail versenden
1. Klicke auf **"Arbeitsplan versenden"**
2. Alle zugewiesenen Helfer erhalten den Plan per E-Mail

#### Per Post versenden
1. Klicke auf **"Per Post versenden"**
2. Wähle die Empfänger (Mitglieder mit Post-Zustellung)
3. Der Plan wird via Pingen versendet

## Anmeldungen verwalten

### Anmeldungen einsehen

1. Öffne das Event
2. Die Anmeldungen werden unten angezeigt

### Anmeldung genehmigen

1. Klicke auf **"Genehmigen"** bei der Anmeldung
2. Die Person wird zur angemeldeten Schicht zugewiesen
3. Eine Bestätigungs-E-Mail wird versendet

### Anmeldung ablehnen

1. Klicke auf **"Ablehnen"**
2. Gib optional einen Grund an
3. Die Person erhält eine Absage-E-Mail

### Alternative Schicht vorschlagen

Wenn die gewünschte Schicht voll ist:
1. Klicke auf **"Alternative vorschlagen"**
2. Wähle eine alternative Schicht
3. Die Person erhält eine E-Mail mit dem Vorschlag
4. Sie kann per Link annehmen oder ablehnen

## Einladungen generieren

### E-Mail-Einladung erstellen

1. Klicke in der Event-Liste auf **"Einladung"**
2. Der Einladungstext wird automatisch generiert
3. Passe den Text bei Bedarf an
4. Wähle **"In Nachricht-Tab öffnen"**
5. Wähle die Empfänger und versende

### Einladungsvorlage

Die Vorlage enthält:
- Event-Titel und Datum
- Beschreibung
- Anmeldelink
- Kontaktinformationen

## Kalender-Integration

### ICS-Feed

Events werden automatisch als Kalender-Feed bereitgestellt:

```
https://api.fwv-raura.ch/calendar/ics
```

Dieser Link kann in Kalender-Apps abonniert werden:
- Google Calendar
- Apple Kalender
- Outlook
- Thunderbird

### Event-spezifischer Download

Jedes Event hat einen eigenen ICS-Download-Link für einzelne Termine.

## Event-Dashboard

Für Organisatoren gibt es ein separates Dashboard:

**URL:** `fwv-raura.ch/event-dashboard.html?event=[EVENT-ID]`

### Funktionen im Dashboard

- Anmeldungen verwalten
- Schichten bearbeiten
- Arbeitsplan anzeigen
- PDF-Exporte
- Erinnerungen versenden

## Erinnerungen versenden

### Automatische Erinnerungen

Das System versendet automatisch:
- **24h vor Schichtbeginn:** Erinnerung an zugewiesene Helfer
- **7 Tage vor Event:** Anmeldeerinnerung (falls konfiguriert)

### Manuelle Erinnerung

1. Öffne das Event
2. Klicke auf **"Erinnerung versenden"**
3. Wähle die Empfänger:
   - Alle Helfer
   - Nur bestimmte Schichten
4. Bestätige den Versand

## Fehlerbehebung

### Anmeldungen werden nicht angezeigt
- Prüfe, ob die Anmeldung aktiviert ist
- Prüfe den Event-Status (muss "Aktiv" sein)

### Schichten werden nicht angezeigt
- Prüfe die Event-Kategorie (muss "Dorffest" oder "Sonstiges" sein)
- Speichere das Event erneut

### Arbeitsplan ist leer
- Prüfe, ob Schichten existieren
- Prüfe, ob Personen zugewiesen sind
