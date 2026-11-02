# Küchendisplay (Flutter)

Küchen-/Bar-Anzeige des FWV Raura für das Bestellsystem (order-backend), ab
kds-v4.0. Ersetzt die native App `simple-order-system/kitchen-display-android`
(bis kds-v3.4) mit **gleicher Paket-ID** `ch.fwvraura.kitchendisplay` und
gleicher Signatur (Schlüssel `kds`): Die Tablets aktualisieren sich über die
blaue Leiste und übernehmen beim ersten Start Token, Station, Ton und
Ausgangs-Code der alten App (`lib/src/geraet.dart`, `Einstellungen.laden`).

- Verhalten wie bisher: WebSocket mit Ping, Abruf alle 30 s, Wächter (60 s →
  neu verbinden, 10 min → neu aufbauen), T400 im Schopf alle 20 s suchen,
  Token täglich erneuern (`lib/src/steuerung.dart`).
- Neu: «Bon nicht gedruckt» (print_failed) als Leiste.
- Android 7.1 kennt ISRG Root X2 nicht: Dart bekommt X1/X2 aus `assets/`
  (`lib/src/netz.dart`), der native Update-Download über
  `network_security_config.xml`.
- Kiosk: Vollbild, quer, Bildschirm an, Start nach Neustart und Update
  (`BootReceiver.kt`), Neustart nach Absturz (`KdsApplication.kt`),
  Einstellungen nur mit Logo 3 s + Code.

Release: Tag `kds-vX.Y` (Workflow `build-android-kds.yml`, Skill
`fwv-app-downloads`). Testen im Emulator wie die Kasse (Skill
`fwv-kasse-testen`) mit `--dart-define=KUECHE_CLOUD=… KUECHE_LOKAL=…`.
