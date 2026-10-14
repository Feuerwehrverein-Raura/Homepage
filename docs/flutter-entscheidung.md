# Entscheidung: Apps in Flutter zusammenführen

Stand: 11.10.2026 — entschieden

## Ausgangslage

Heute gibt es fünf getrennt gebaute Oberflächen:

| Oberfläche | Technik |
|---|---|
| Öffentliche Website + Vorstandsbereich (`vorstand.html`) | HTML, Tailwind |
| Mitglieder-App Android | Kotlin |
| Mitglieder-App iOS | Swift |
| Vorstand-App Android | Kotlin |
| Vorstand Desktop | Tauri, React |

Jede Funktion muss fünfmal gebaut werden, und die Apps liefen dem Web
hinterher. Beispiel Arbeitsplan (Oktober 2026): Die Website hatte ihn, keine
der vier Apps.

## Entscheidung

- **Öffentliche Website bleibt HTML.** Sie muss schnell laden und von
  Suchmaschinen gefunden werden; Flutter Web zeichnet die Seite selbst, lädt
  beim ersten Aufruf mehrere MB und ist für Suchmaschinen schlecht lesbar.
- **Alle Apps werden Flutter**, aufgeteilt in zwei Apps mit gemeinsamem Kern:
  - **Mitglieder-App** für Mitglieder und Organisatoren (Android, iOS).
  - **Vorstand-App** bleibt eine eigene App (Android, Desktop — macOS,
    Windows, Linux — und später Web für den Vorstandsbereich).
  - **`fwv_core`**: gemeinsame Modelle, API-Zugriff, Anmeldung und
    Vertrags-Tests. Was beide Apps brauchen, wird nur einmal gebaut.

Aus fünf getrennten Codebasen werden zwei: die Website und das
Flutter-Repo (`flutter/`).

```
flutter/
  fwv_core/     gemeinsam: Modelle, API, Anmeldung, Vertrags-Tests
  fwv_anlass/   gemeinsam: Anlass-Verwaltung (Organisator + Vorstand)
  fwv_lager/    gemeinsam: Lager mit Oberfläche (beide Apps)
  mitglieder/   Mitglieder + Organisatoren (com.fwv.members)
  vorstand/     Vorstand (später, ch.fwvraura.vorstand)
```

Was nur der Vorstand braucht, kommt direkt in `vorstand/` und nicht in
gemeinsame Pakete: Mitgliederverwaltung, Budget, Mitgliederbeiträge,
Versand (E-Mail, Brief über Pingen) und die übrigen Vorstands-Funktionen.
Zeigt eine Mitglieder-Funktion dieselben Daten (z.B. der eigene Beitrag),
teilen sich beide höchstens die Modelle in `fwv_core`, nicht die
Oberfläche. Vor dem Bau: Bestandsaufnahme von `vorstand-android`,
`vorstand-desktop` und `vorstand.html`.

## Vorgehen

Schrittweise, die bestehenden Apps laufen weiter, bis der Ersatz fertig ist.

1. **Mitglieder-App inklusive Organisator** in Flutter (ersetzt
   `members-android` und `members-ios`). Wird noch wenig genutzt, Android und
   iOS heute doppelt.
2. **Vorstand-App** in Flutter (ersetzt `vorstand-android` und
   `vorstand-desktop`), auf demselben Kern.
3. Danach entscheiden, ob `vorstand.html` durch die Web-Version ersetzt wird.

## Aenderung 14.10.2026: Vorstand in die Mitglieder-App

Ersetzt den Teil «eigene Vorstand-App» oben. Es gibt **eine** App fuer
Mitglieder, Organisatoren und Vorstand:

- Vorstandsmitglieder sehen den Reiter **«Vorstand»** statt «Organisator»
  (alle Anlaesse plus Mitglieder, Antraege, Beitraege, Versand, Audit …).
- Angemeldet wird mit dem **persoenlichen Konto** (Authentik, Gruppe
  Vorstand). Der Login ueber das Funktionspostfach (IMAP) entfaellt nach
  der Uebergangszeit; die Funktion (Aktuar, Kassier …) liest das Backend aus
  der Mitgliederdatenbank (Phase 0, umgesetzt 14.10.2026).
- Dieselbe App laeuft auf Android, iPhone, im Browser («Mein Bereich» =
  mein.html) und als **Desktop-Programm: Linux (Pflicht, zuerst), Windows,
  macOS**. Sie ersetzt vorstand-android, vorstand-desktop und spaeter
  vorstand.html.
- Was nur der Vorstand braucht, kommt in ein eigenes Paket
  `flutter/fwv_vorstand` (nicht in die Mitglieder-App selbst), damit die
  Grenzen sichtbar bleiben.
- Damit nichts verloren geht: Checkliste aller Funktionen aller Varianten
  in `docs/vorstand-funktionen.md` (Phasen 1–3).

## Inventar, Einkauf, Kasse (entschieden 11.10.2026)

Bisher eigene PWAs (`simple-inventory-system`, `simple-order-system`).

- **Lager** (Barcode-Scan, Ein-/Ausbuchen, Lagerorte, Nachbestellen,
  Rezepte) kommt in **beide Apps**, als Reiter für alle mit
  Lager-Berechtigung (Authentik-Gruppe). Gebaut einmal als Funktionspaket
  mit Oberfläche, `flutter/fwv_lager`, das beide Apps einbinden.
- **Einkauf** (Einkaufsliste pro Anlass, Belege fotografieren,
  Zurückbuchen ins Lager) kommt in den **Organisator-Bereich** der
  Mitglieder-App; die Einkaufs-PWA fällt danach weg.
- **Kasse, Bar, Küchenanzeige** bleiben vorerst eigenständig: feste Geräte
  am Fest, teils offline über den Raspberry Pi, Bondrucker und SumUp.
- Voraussetzung: das Inventar-Backend akzeptierte nur Anmeldungen seiner
  eigenen Authentik-Anwendung (`inventory-system`). Erledigt (11.10.2026):
  es nimmt zusätzlich die der Apps an, aber nur mit der Gruppe Lager,
  Vorstand oder admin. Stand: `docs/flutter-mitglieder-app-plan.md`.

Reihenfolge: nach dem Organisator-Bereich der Mitglieder-App.

## Ausleihe (entschieden 11.10.2026)

Neu, gibt es bisher nirgends. Teil des Lagers (`fwv_lager`, beide Apps).

- **Was:** Lager-Artikel mit Menge und ganze Kisten (Lagerorte) samt
  Inhalt. Das Lager markiert, was ausleihbar ist.
- **An wen:** Mitglieder leihen selbst in der App aus, **ohne Freigabe**;
  die Gruppe Lager wird benachrichtigt, das Mitglied bekommt eine
  Bestätigung. Externe (Vereine, Firmen, Private) erfasst die Gruppe Lager.
- **Verfügbarkeit vorab:** für den gewünschten Zeitraum, künftige
  Ausleihen zählen als Reservierung.
- **Ausgabe und Rückgabe** bucht das Lager; bei der Rückgabe Zustand und
  Schäden mit Foto, Fehlendes/Kaputtes wird ausgebucht.
- **Erinnerung** vor dem Rückgabedatum und bei Überfälligkeit; das Lager
  sieht die überfälligen Ausleihen.
- Keine Gebühr/Kaution.

## Regeln für den Flutter-Code

- **Logik gehört ins Backend.** Die App zeigt an, was das Backend fertig
  liefert — wie beim Arbeitsplan (`GET /events/:id/arbeitsplan`). So bleiben
  Website und App automatisch gleich.
- **Vertrags-Tests.** Die App testet gegen dieselben Dateien wie Backend und
  Website (`docker/backend-events/test/fixtures/`). Ändert sich ein Format nur
  auf einer Seite, wird die CI rot.
- **Für das Handy gebaut.** Kein seitliches Scrollen, Bedienelemente immer
  sichtbar.
- **Versionen:** Flutter 3.47 (stabil, August 2026). Material und Cupertino
  sind aus dem Kern herausgelöst; neuer Code verwendet von Anfang an die
  Pakete `material_ui` / `cupertino_ui` statt `package:flutter/material.dart`
  — die alten Importe werden im November 2026 abgekündigt.

## Was bleibt

Backend, Datenbank, Authentik-Anmeldung, Play- und App-Store-Einträge. Die
neue App übernimmt die bestehenden App-IDs, damit Mitglieder ein Update statt
einer neuen App bekommen: Android `com.fwv.members`, iOS
`ch.fwvraura.members`. Für Android braucht es dafür denselben Upload-Schlüssel
wie heute.
