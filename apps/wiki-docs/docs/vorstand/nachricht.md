---
sidebar_position: 4
---

# Nachricht / Rundschreiben

Der Nachricht-Tab ermöglicht den Versand von Rundschreiben an Mitglieder per E-Mail und/oder Briefpost.

## Übersicht

Mit dieser Funktion kannst du:
- E-Mails an alle oder ausgewählte Mitglieder senden
- Briefe via Pingen versenden lassen
- Automatisch den richtigen Versandweg wählen (basierend auf Mitgliederpräferenzen)
- Entwürfe speichern und später weiterbearbeiten
- Nachrichten zeitgesteuert versenden

## Versandarten

### Automatisch (empfohlen)
Das System wählt basierend auf den Mitgliederpräferenzen:
- **E-Mail-Zustellung aktiv:** Nachricht per E-Mail
- **Post-Zustellung aktiv:** Nachricht per Briefpost
- **Beides aktiv:** Nachricht per E-Mail (priorisiert)

### Nur E-Mail
Alle Empfänger erhalten die Nachricht per E-Mail.
- Nur Mitglieder mit hinterlegter E-Mail-Adresse werden berücksichtigt

### Nur Briefpost
Alle Empfänger erhalten die Nachricht per Briefpost via Pingen.
- Nur Mitglieder mit vollständiger Adresse werden berücksichtigt
- Verursacht Portokosten

## Empfänger auswählen

### Alle Mitglieder
Versendet an alle Mitglieder mit passenden Präferenzen.

### Gefilterte Mitglieder
Filtere nach:
- **Status:** Aktiv, Passiv, Ehrenmitglied
- **E-Mail-Zustellung:** Nur Mitglieder die E-Mail wollen
- **Post-Zustellung:** Nur Mitglieder die Post wollen

### Ausgewählte Mitglieder
1. Klicke auf **"Empfänger auswählen"**
2. Wähle einzelne Mitglieder aus der Liste
3. Bestätige die Auswahl

Die Anzahl ausgewählter Empfänger wird angezeigt.

## Nachricht verfassen

### Vorlage verwenden

1. Wähle eine Vorlage aus dem Dropdown
2. Der Text wird automatisch eingefügt
3. Passe den Text bei Bedarf an

#### Verfügbare Vorlagen
- **Einladung GV** - Generalversammlung
- **Einladung Anlass** - Allgemeine Event-Einladung
- **Zahlungserinnerung** - Mitgliederbeitrag
- **Allgemeine Info** - Neutrale Vorlage

### Betreff (nur E-Mail)
Gib einen aussagekräftigen Betreff ein. Dieser erscheint:
- In der E-Mail-Betreffzeile
- Als Titel im Brief (optional)

### Nachrichtentext

#### Rich-Text-Editor
Der Editor unterstützt:
- **Fett** und *Kursiv*
- Überschriften
- Listen (nummeriert und Aufzählungen)
- Links
- Tabellen

#### HTML-Modus
Klicke auf "HTML" um den Quellcode direkt zu bearbeiten.

#### Klartext-Modus
Für Briefpost wird automatisch ein Klartext generiert.
Du kannst zwischen HTML und Klartext wechseln.

### Platzhalter

Platzhalter werden beim Versand durch die echten Daten ersetzt:

| Platzhalter | Wird ersetzt durch |
|-------------|-------------------|
| `{{anrede}}` | "Herr" oder "Frau" |
| `{{vorname}}` | Vorname des Mitglieds |
| `{{nachname}}` | Nachname des Mitglieds |
| `{{email}}` | E-Mail-Adresse |
| `{{strasse}}` | Strasse |
| `{{plz}}` | Postleitzahl |
| `{{ort}}` | Wohnort |
| `{{status}}` | Mitgliedsstatus |

#### Platzhalter einfügen
1. Klicke auf **"Platzhalter einfügen"**
2. Wähle den gewünschten Platzhalter
3. Er wird an der Cursor-Position eingefügt

### Beispiel mit Platzhaltern

```
Liebe/r {{vorname}} {{nachname}},

wir laden dich herzlich zur Generalversammlung ein.

Mit freundlichen Grüssen
Der Vorstand
```

## Vorschau

Bevor du versendest, prüfe die Vorschau:

1. Klicke auf **"Vorschau"**
2. Sieh dir die Nachricht mit echten Beispieldaten an
3. Prüfe das Layout und den Inhalt
4. Schliesse die Vorschau

## Entwürfe

### Entwurf speichern
1. Verfasse deine Nachricht
2. Klicke auf **"Als Entwurf speichern"**
3. Gib einen Namen für den Entwurf ein
4. Bestätige

### Entwurf laden
1. Klicke auf **"Entwürfe"**
2. Wähle einen gespeicherten Entwurf
3. Der Text wird geladen

### Entwurf löschen
1. Klicke auf **"Entwürfe"**
2. Klicke auf das **X** neben dem Entwurf
3. Bestätige die Löschung

## Zeitgesteuerter Versand

### Versand planen
1. Verfasse die Nachricht
2. Klicke auf **"Zeitgesteuert senden"**
3. Wähle Datum und Uhrzeit
4. Bestätige

### Geplante Nachrichten anzeigen
1. Klicke auf **"Geplante Nachrichten"**
2. Sieh alle ausstehenden Versendungen

### Geplanten Versand abbrechen
1. Öffne die geplanten Nachrichten
2. Klicke auf **"Abbrechen"** bei der gewünschten Nachricht
3. Bestätige

## Nachricht senden

### Sofort senden
1. Prüfe alle Einstellungen
2. Klicke auf **"Jetzt senden"**
3. Bestätige im Dialog
4. Der Versand beginnt

### Versandstatus
Nach dem Senden siehst du:
- **E-Mails gesendet:** Anzahl erfolgreicher E-Mails
- **Briefe erstellt:** Anzahl erstellter Pingen-Aufträge
- **Fehler:** Falls Probleme auftraten

## Pingen-Integration (Briefpost)

### Wie funktioniert Pingen?
Pingen ist ein Schweizer Dienst für den Briefversand:
1. Dein Brief wird als PDF erstellt
2. Pingen druckt und kuvertiert den Brief
3. Der Brief wird per A-Post versendet

### Kosten
- Pro Brief ca. CHF 1.50-2.50 (je nach Seitenzahl)
- Wird vom Pingen-Guthaben abgezogen

### Pingen-Guthaben prüfen
1. Gehe zum Tab **"Post"**
2. Sieh den aktuellen Kontostand

### Brief-Tracking
1. Gehe zum Tab **"Post"**
2. Klicke auf **"Briefe anzeigen"**
3. Sieh den Status jedes Briefs:
   - **Erstellt:** Auftrag eingegangen
   - **In Druck:** Wird gedruckt
   - **Versendet:** Unterwegs
   - **Zugestellt:** Angekommen

## Dispatch-Log

Alle Versendungen werden protokolliert:

1. Der Admin kann das Dispatch-Log einsehen
2. Es zeigt:
   - Zeitpunkt
   - Absender
   - Empfänger
   - Versandart
   - Status

## Best Practices

### E-Mail-Betreff
- Kurz und prägnant (max. 60 Zeichen)
- Wichtigste Info am Anfang
- Keine Sonderzeichen

**Gut:** "Einladung GV am 15. März 2026"
**Schlecht:** "!!! WICHTIG !!! Du bist eingeladen zur GV des FWV Raura am 15.03.26"

### Nachrichtentext
- Persönliche Anrede mit Platzhalter
- Klare Struktur mit Absätzen
- Wichtige Infos hervorheben
- Kontakt für Rückfragen angeben

### Versandzeit
- Werktags zwischen 8-18 Uhr
- Nicht an Feiertagen
- Nicht am Wochenende (ausser dringend)

## Fehlerbehebung

### E-Mail kommt nicht an
- Prüfe den Spam-Ordner des Empfängers
- Prüfe die E-Mail-Adresse auf Tippfehler
- Prüfe das Dispatch-Log auf Fehler

### Pingen-Versand fehlgeschlagen
- Prüfe das Pingen-Guthaben
- Prüfe die Adressdaten des Empfängers
- Prüfe, ob alle Pflichtfelder ausgefüllt sind

### Platzhalter werden nicht ersetzt
- Prüfe die Schreibweise (mit doppelten geschweiften Klammern)
- Prüfe, ob das Mitglied die entsprechenden Daten hat
