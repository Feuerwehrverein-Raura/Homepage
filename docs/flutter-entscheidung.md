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
  mitglieder/   Mitglieder + Organisatoren (com.fwv.members)
  vorstand/     Vorstand (später, ch.fwvraura.vorstand)
```

## Vorgehen

Schrittweise, die bestehenden Apps laufen weiter, bis der Ersatz fertig ist.

1. **Mitglieder-App inklusive Organisator** in Flutter (ersetzt
   `members-android` und `members-ios`). Wird noch wenig genutzt, Android und
   iOS heute doppelt.
2. **Vorstand-App** in Flutter (ersetzt `vorstand-android` und
   `vorstand-desktop`), auf demselben Kern.
3. Danach entscheiden, ob `vorstand.html` durch die Web-Version ersetzt wird.

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
