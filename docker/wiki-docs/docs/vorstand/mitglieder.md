---
sidebar_position: 2
---

# Mitgliederverwaltung

Die Mitgliederverwaltung ermöglicht das Anlegen, Bearbeiten und Verwalten aller Vereinsmitglieder.

## Übersicht

### Mitgliederliste

Die Hauptansicht zeigt alle Mitglieder in einer Tabelle:

| Spalte | Beschreibung |
|--------|--------------|
| **Foto** | Profilbild (falls vorhanden) |
| **Name** | Vor- und Nachname |
| **E-Mail** | E-Mail-Adresse |
| **Status** | Aktiv, Passiv oder Ehrenmitglied |
| **Funktion** | Vorstand-Rolle (falls vorhanden) |
| **Aktionen** | Bearbeiten-Button |

### Statistiken

Oberhalb der Liste werden Statistiken angezeigt:
- **Gesamt:** Alle Mitglieder
- **Aktiv:** Aktivmitglieder
- **Passiv:** Passivmitglieder
- **Ehren:** Ehrenmitglieder

## Mitglied suchen

### Textsuche
Gib im Suchfeld Name oder E-Mail ein. Die Liste filtert sich automatisch.

### Status-Filter
Wähle im Dropdown:
- **Alle** - Zeigt alle Mitglieder
- **Aktiv** - Nur Aktivmitglieder
- **Passiv** - Nur Passivmitglieder
- **Ehrenmitglied** - Nur Ehrenmitglieder

## Neues Mitglied anlegen

1. Klicke auf **"+ Neues Mitglied"**
2. Fülle die Pflichtfelder aus (mit * markiert)
3. Klicke auf **"Speichern"**

### Pflichtfelder
- Vorname
- Nachname
- E-Mail-Adresse
- Status (Aktiv/Passiv/Ehrenmitglied)

### Optionale Felder

#### Persönliche Daten
| Feld | Beschreibung |
|------|--------------|
| **Anrede** | Herr / Frau |
| **Geschlecht** | M / W |
| **Geburtstag** | Geburtsdatum |

#### Adresse
| Feld | Beschreibung |
|------|--------------|
| **Strasse** | Strassenname und Hausnummer |
| **Adresszusatz** | c/o, Postfach, etc. |
| **PLZ** | Postleitzahl |
| **Ort** | Wohnort |

#### Kontakt
| Feld | Beschreibung |
|------|--------------|
| **Telefon** | Festnetznummer |
| **Mobile** | Mobilnummer |

#### Vereinsinformationen
| Feld | Beschreibung |
|------|--------------|
| **Feuerwehr-Zugehörigkeit** | Aktuell in Feuerwehr? |
| **Eintrittsdatum** | Datum des Vereinsbeitritts |
| **Bemerkungen** | Freitext für Notizen |

## Mitglied bearbeiten

1. Klicke auf das **Bearbeiten-Symbol** in der Mitgliederliste
2. Ändere die gewünschten Felder
3. Klicke auf **"Speichern"**

### Profilbild verwalten

#### Bild hochladen
1. Öffne das Mitglied zur Bearbeitung
2. Klicke auf den Bild-Bereich
3. Wähle ein Bild (JPG, PNG, max. 5 MB)
4. Das Bild wird automatisch hochgeladen

#### Bild löschen
1. Öffne das Mitglied zur Bearbeitung
2. Klicke auf das **X** beim Bild
3. Bestätige die Löschung

## Funktionen zuweisen

### Vorstand-Funktionen

| Funktion | Beschreibung | Authentik-Rechte |
|----------|--------------|------------------|
| **Admin** | Volle Systemrechte | Admin-Gruppe |
| **Präsident** | Vereinsleitung | Vorstand-Gruppe |
| **Aktuar** | Protokollführung | Vorstand-Gruppe |
| **Kassier** | Finanzen | Vorstand-Gruppe |
| **Materialwart** | Inventar | Vorstand-Gruppe |
| **Beisitzer** | Vorstandsmitglied | Vorstand-Gruppe |

### Weitere Funktionen

| Funktion | Beschreibung |
|----------|--------------|
| **Revisor** | Rechnungsprüfer (kein Vorstand) |
| **Social Media** | Zugang zum Social-Media-Postfach |

### Funktion zuweisen
1. Öffne das Mitglied zur Bearbeitung
2. Aktiviere die Checkbox bei der gewünschten Funktion
3. Speichere

:::info Automatische Synchronisation
Bei Änderung einer Funktion wird der Authentik-Account automatisch aktualisiert.
:::

## Zustellpräferenzen

Jedes Mitglied kann wählen, wie es Vereinspost erhält:

| Option | Beschreibung |
|--------|--------------|
| **E-Mail-Zustellung** | Erhält Rundschreiben per E-Mail |
| **Post-Zustellung** | Erhält Rundschreiben per Briefpost |

:::tip
Beide Optionen können gleichzeitig aktiviert sein.
:::

## Cloud-Berechtigungen

### Nextcloud Admin
Gibt Administratorrechte in der Nextcloud-Instanz.

**Aktivieren:**
1. Öffne das Mitglied
2. Klicke auf "Nextcloud Admin aktivieren"
3. Bestätige

### Vorstand-Gruppe
Fügt das Mitglied zur Vorstand-Gruppe in Nextcloud hinzu (Zugriff auf Vorstand-Ordner).

### Social-Media-Gruppe
Fügt das Mitglied zur Social-Media-Gruppe hinzu (Zugriff auf Marketing-Materialien).

## Mitglied löschen

:::warning Achtung
Gelöschte Mitglieder können nicht wiederhergestellt werden!
:::

1. Öffne das Mitglied zur Bearbeitung
2. Klicke auf **"Löschen"** (rot, unten links)
3. Bestätige die Löschung

**Was passiert beim Löschen:**
- Mitgliedsdaten werden entfernt
- Authentik-Account wird deaktiviert
- Zuweisungen zu Schichten werden entfernt
- Audit-Log-Einträge bleiben erhalten

## Export-Funktionen

### Verfügbare Exporte

| Export | Beschreibung | Format |
|--------|--------------|--------|
| **Alle Mitglieder** | Komplette Mitgliederliste | CSV |
| **Aktive Mitglieder** | Nur Aktivmitglieder | CSV |
| **Post-Empfänger** | Mitglieder mit Post-Zustellung | CSV |
| **E-Mail-Empfänger** | Mitglieder mit E-Mail-Zustellung | CSV |
| **Telefonliste** | Namen und Telefonnummern | PDF |

### Export durchführen
1. Klicke auf **"Export"**
2. Wähle den gewünschten Export-Typ
3. Die Datei wird automatisch heruntergeladen

### CSV-Spalten
Der CSV-Export enthält folgende Spalten:
```
Anrede, Vorname, Nachname, Strasse, Adresszusatz, PLZ, Ort,
Telefon, Mobile, E-Mail, Status, Funktion, Eintrittsdatum,
Email_Zustellung, Post_Zustellung
```

## Authentik-Synchronisation

### Automatische Synchronisation
Bei jeder Mitgliederänderung wird der Authentik-Account automatisch aktualisiert:
- Neues Mitglied → Neuer Authentik-Account
- E-Mail-Änderung → Account-Update
- Funktion geändert → Gruppen-Update
- Mitglied gelöscht → Account deaktiviert

### Manuelle Synchronisation
Falls die automatische Sync fehlschlägt:
1. Gehe zu **Mitglieder**
2. Klicke auf **"Authentik synchronisieren"** (Admin-only)
3. Warte auf Bestätigung

## Fehlerbehebung

### E-Mail bereits vergeben
- Prüfe, ob das Mitglied bereits existiert
- Verwende eine andere E-Mail-Adresse

### Authentik-Sync fehlgeschlagen
- Prüfe die Authentik-Verbindung
- Kontaktiere den System-Administrator

### Bild-Upload fehlgeschlagen
- Prüfe die Dateigrösse (max. 5 MB)
- Verwende JPG oder PNG Format
- Prüfe die Internetverbindung
