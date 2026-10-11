# fwv_anlass

Anlass-Verwaltung mit Oberfläche, gemeinsam für den Organisator-Bereich der
Mitglieder-App und die spätere Vorstand-App (docs/flutter-entscheidung.md).

- `AnlassVerwaltungZugang` (`lib/src/zugang.dart`): einzige Verbindung zum
  Backend. Die Screens kennen keine Routen.
- `OrganisatorZugang`: eigene Anlässe, Routen `…-as-organizer` bzw.
  `events/my-event/…` (externer Organisator), Übersicht
  `GET events/organisator-uebersicht`.
- Ein `VorstandZugang` kommt mit der Vorstand-App dazu.
- Screens: `VerwaltungsUebersichtScreen`, `VerwaltungsAnlassScreen` (Reiter
  Anmeldungen, Schichten, Notizen, Material) und die Formulare dazu.

Tests: `flutter test` (mit nachgebautem Zugang und Vertrag
`organisator-uebersicht.json` aus `docker/backend-events/test/fixtures/`).
