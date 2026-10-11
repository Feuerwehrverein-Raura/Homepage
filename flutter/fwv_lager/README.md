# fwv_lager

Lager mit Oberfläche, gemeinsam für die Mitglieder-App (Reiter "Lager" für
die Authentik-Gruppen Lager, Vorstand, admin) und die spätere Vorstand-App
(docs/flutter-entscheidung.md, "Inventar, Einkauf, Kasse").

- `LagerZugang` (`lib/src/zugang.dart`): einzige Verbindung zum Backend. Die
  Screens kennen keine Routen.
- `ApiLagerZugang`: Inventar-API `https://inventar.fwv-raura.ch/api/` mit dem
  Authentik-Token der App (`SitzungsVerwaltung.apiFuer`). Das Inventar nimmt
  Tokens von `fwv-members-app` und `fwv-members` nur mit Gruppe Lager,
  Vorstand oder admin an.
- `LagerUmgebung`: was vom Gerät kommt (Barcode-Scanner); in Tests ersetzt.
- Screens: `LagerScreen` (Artikel suchen, Lagerorte, Nachbestellen, Scannen,
  Artikel anlegen), `ArtikelScreen` (Bestand je Lagerort, Mindestbestand,
  Eingang/Ausgang, letzte Buchungen), `LagerortScreen`.
- Bausteine der Oberfläche (Laden, Meldungen, Chips) aus `fwv_anlass`.

Tests: `flutter test` — Modelle gegen `test/fixtures/inventar-api.json`
(geschrieben vom Backend-Test `simple-inventory-system/backend/test/
api.test.mjs`, der sie auch gegen die echten Antworten prüft), Zugang gegen
einen nachgebauten Server, Oberfläche mit nachgebautem Zugang.
