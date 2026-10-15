// iPhone-Bilder fuer die Anleitungen aus dem echten iOS-Simulator: die
// Mitglieder-App mit den erfundenen Daten der Foto-Tour ("Erika Muster",
// test/tour/tour_daten.dart) und denselben Schritten
// (test/tour/tour_schritte.dart) - aber mit echter iOS-Darstellung,
// Systemschrift und Statusleiste. Ziel:
//
//   docker/frontend-website/images/anleitung/ios/NN-*.jpg
//
// Ausfuehren (Mac mit Xcode, in flutter/mitglieder):
//
//   tool/iphone_bilder.sh
//
// Das Skript legt den Simulator "FWV Tour iPhone 17" an (falls noetig),
// startet ihn, stellt die Statusleiste fest (10:00, volle Balken, Akku
// voll) und laesst diesen Test laufen. Bildschirmfotos kann die App selbst
// nicht machen (die Statusleiste gehoert iOS, nicht der App) - darum:
// An jeder Bildstelle legt der Test im Ordner FOTO_ORDNER (auf dem Mac)
// eine Datei NN-name.anfrage ab und wartet. Das Skript macht dann mit
// `xcrun simctl io <udid> screenshot` das Bild, verkleinert es auf 540 px
// Breite (JPEG) und antwortet mit NN-name.fertig. Das geht nur im
// Simulator: Dort liest und schreibt die App direkt Pfade des Macs (auch
// die Vertragsdateien unter REPO_WURZEL), auf einem echten iPhone nicht.
//
// Nie echte Daten: Die App bekommt die Nachbau-Dienste der Tour (MockClient
// als Backend, Sitzung im Arbeitsspeicher, kein Push, kein Browser). Dazu
// sperrt HttpOverrides jede echte Verbindung aus Dart heraus - auch Bilder
// (Image.network); die Anlass-Logos und das Profilfoto liegen vorab im
// Bild-Speicher.
//
// Nur ueber das Skript sinnvoll: Ohne FOTO_ORDNER und REPO_WURZEL
// (--dart-define) wird alles uebersprungen. `flutter test` ohne Pfad
// startet integration_test/ ohnehin nicht.

import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_mitglieder/dienste.dart';
import 'package:fwv_mitglieder/main.dart';
import 'package:integration_test/integration_test.dart';
import 'package:material_ui/material_ui.dart';

import '../test/tour/tour_daten.dart';
import '../test/tour/tour_schritte.dart';

const _fotoOrdner = String.fromEnvironment('FOTO_ORDNER');
const _repoWurzel = String.fromEnvironment('REPO_WURZEL');

/// Nur diese Bilder (Komma-getrennt, z.B. "05-profil,21-austritt"); leer:
/// alle.
const _nur = String.fromEnvironment('NUR');

class _IPhone implements TourGeraet {
  const _IPhone();

  @override
  bool get handy => true;

  @override
  Plattform get plattform => Plattform.ios;
}

/// Keine echte Verbindung ins Netz, egal woher.
class _KeinNetz extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) =>
      throw const SocketException('Foto-Tour: kein Netz');
}

/// Laedt Bilder aus der App (Logo) wirklich, sonst fehlen sie im Bild.
Future<void> _bilderLaden(WidgetTester tester) async {
  final elemente = find.byType(Image).evaluate().toList();
  await tester.runAsync(() async {
    for (final e in elemente) {
      final bild = (e.widget as Image).image;
      if (bild is NetworkImage) continue;
      await precacheImage(bild, e);
    }
  });
  await tester.pumpAndSettle();
}

/// Bittet das Skript auf dem Mac um ein Bildschirmfoto und wartet darauf.
Future<void> _foto(WidgetTester tester, String name) async {
  await _bilderLaden(tester);
  // Die Kreise, die der Test beim Tippen zeichnet, ausklingen lassen.
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
  expect(tester.takeException(), isNull);
  final fertig = File('$_fotoOrdner/$name.fertig');
  if (fertig.existsSync()) fertig.deleteSync();
  File('$_fotoOrdner/$name.anfrage').writeAsStringSync(name);
  await tester.runAsync(() async {
    final bis = DateTime.now().add(const Duration(seconds: 60));
    while (!fertig.existsSync()) {
      if (DateTime.now().isAfter(bis)) throw TimeoutException('Kein Bildschirmfoto: $name');
      await Future<void>.delayed(const Duration(milliseconds: 100));
    }
  });
  // ignore: avoid_print
  print('iPhone-Bild: $name');
}

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  final aktiv = _fotoOrdner.isNotEmpty && _repoWurzel.isNotEmpty;
  final nur = _nur.isEmpty ? null : _nur.split(',').toSet();

  setUpAll(() async {
    if (!aktiv) return;
    HttpOverrides.global = _KeinNetz();
    // Ohne das rote "DEBUG"-Band oben rechts.
    WidgetsApp.debugAllowBannerOverride = false;
    await tourNetzBilderVorbereiten();
  });

  for (final MapEntry(key: name, value: schritte) in tourBilder.entries) {
    testWidgets(name, skip: !aktiv || (nur != null && !nur.contains(name)), (tester) async {
      // Der Testname, den die Live-Bindung sonst oben links hinmalt.
      // ignore: invalid_use_of_protected_member
      binding.setLabel('');
      tourNetzBilderEinlegen();
      final d = await tourDienste(
        tester,
        plattform: Plattform.ios,
        angemeldet: !tourAbgemeldet.contains(name),
        vorstand: !tourAlsOrganisator.contains(name),
      );
      await tester.pumpWidget(FwvApp(dienste: d));
      await tester.pumpAndSettle();
      await schritte(tester, const _IPhone());
      await _foto(tester, name);
    });
  }
}
