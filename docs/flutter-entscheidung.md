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
- **Alle Apps werden eine Flutter-Codebasis**: Android, iOS, Desktop (macOS,
  Windows, Linux) und — später — Web für den Vorstandsbereich. Mitglieder-
  und Vorstands-Funktionen in einer App, freigeschaltet nach Anmeldung.

Aus fünf Oberflächen werden zwei.

## Vorgehen

Schrittweise, die bestehenden Apps laufen weiter, bis der Ersatz fertig ist.

1. **Mitglieder-App** in Flutter (ersetzt `members-android` und
   `members-ios`). Kleinster Umfang, Android und iOS heute doppelt.
2. **Vorstand-Funktionen** dazu (ersetzt `vorstand-android` und
   `vorstand-desktop`).
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
