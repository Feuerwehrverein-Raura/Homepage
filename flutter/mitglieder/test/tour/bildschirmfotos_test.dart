// Bildschirmfoto-Tour: zeichnet die Mitglieder-App mit erfundenen Daten
// (tour_daten.dart, "Erika Muster") und legt die Bilder fuer die Anleitungen
// der Website ab:
//
//   docker/frontend-website/images/anleitung/android/NN-*.jpg  Handy, Android
//   docker/frontend-website/images/anleitung/web/mein-NN-*.jpg Browser (Mein Bereich,
//                                                             auch Desktop-Programm)
//
// Die iPhone-Bilder (ios/NN-*.jpg) kommen nicht von hier, sondern aus dem
// echten iOS-Simulator: integration_test/iphone_bilder_test.dart mit
// denselben Daten und denselben Schritten (tour_schritte.dart).
//
// Gleiche Namen auf allen Geraeten (die Anleitung schaltet nur den Ordner
// um). Die Bilder der Organisatoren entstehen mit einem Konto ohne Vorstand
// (tourAlsOrganisator).
//
// Ausfuehren (in flutter/mitglieder):
//
//   TOUR=1 flutter test test/tour/bildschirmfotos_test.dart
//
// Ohne TOUR=1 wird alles uebersprungen — `flutter test` und die CI bleiben
// unberuehrt. Gleiche Daten, gleiche Schriften, festes "jetzt": Die Bilder
// sehen bei jedem Lauf gleich aus.
//
// Schriften: Widget-Tests zeichnen sonst Kaestchen (Testschrift). Die Tour
// laedt Roboto und die Material-Symbole aus dem Flutter-SDK
// (bin/cache/artifacts/material_fonts) und nimmt Roboto auch fuer den
// Browser — so sehen die Bilder auf jedem Rechner gleich aus. Fuer Zeichen,
// die Roboto fehlen (Pfeile), dient "Arial Unicode" vom Mac (bzw. DejaVu
// Sans unter Linux) als Ersatz.
//
// Die Statusleiste oben ist nur gezeichnet, damit die Bilder nach Handy
// aussehen.
//
// Bilder aus dem Netz gibt es im Test nicht: Die Anlass-Logos kommen aus
// docker/frontend-website/images/anlaesse, das Profilfoto ist gezeichnet.

@Tags(['tour'])
library;

import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_mitglieder/dienste.dart';
import 'package:fwv_mitglieder/main.dart';
import 'package:image/image.dart' as img;
import 'package:material_ui/material_ui.dart';

import 'tour_daten.dart';
import 'tour_schritte.dart';

final _tourAn = Platform.environment['TOUR'] == '1';

/// Ein Geraet, fuer das die Tour Bilder macht.
class _Geraet implements TourGeraet {
  const _Geraet({
    required this.ordner,
    required this.groesse,
    required this.dichte,
    required this.system,
    required this.plattform,
    this.praefix = '',
    this.oben = 0,
    this.breiteBild,
  });

  final String ordner;
  final Size groesse;
  final double dichte;
  final TargetPlatform system;
  @override
  final Plattform plattform;

  /// Vor jedem Dateinamen ("mein-" im Browser).
  final String praefix;

  /// Statusleiste oben (logische Punkte).
  final double oben;

  /// Breite der gespeicherten Datei in Pixeln (null: wie gezeichnet).
  final int? breiteBild;

  @override
  bool get handy => groesse.width < 600;
}

const _android = _Geraet(
  ordner: 'android',
  groesse: Size(393, 852),
  dichte: 2.75,
  system: TargetPlatform.android,
  plattform: Plattform.android,
  oben: 28,
  breiteBild: 540,
);

/// Browser auf dem Rechner ("Mein Bereich"): Seitenleiste links,
/// ausgeklappt mit Hilfe unten.
const _web = _Geraet(
  ordner: 'web',
  groesse: Size(1280, 800),
  dichte: 1,
  // Windows statt macOS: Die Schriftnamen des Mac-Themes (".AppleSystemUIFont")
  // nimmt der Test nicht an. Aussehen wie im Browser am Rechner
  // (Scrollbalken, dichtere Abstaende).
  system: TargetPlatform.windows,
  plattform: Plattform.andere,
  praefix: 'mein-',
);

final _wurzel = GlobalKey();

// ---------------------------------------------------------------------------
// Schriften und Bilder

Directory get _flutterWurzel {
  final umgebung = Platform.environment['FLUTTER_ROOT'];
  if (umgebung != null && umgebung.isNotEmpty) return Directory(umgebung);
  // flutter_tester liegt unter <sdk>/bin/cache/artifacts/engine/<plattform>/.
  var dir = File(Platform.resolvedExecutable).parent;
  while (dir.parent.path != dir.path) {
    if (Directory('${dir.path}/bin/cache/artifacts/material_fonts').existsSync()) return dir;
    dir = dir.parent;
  }
  throw StateError('Flutter-SDK nicht gefunden (FLUTTER_ROOT setzen)');
}

Future<ByteData> _datei(String pfad) async => ByteData.sublistView(await File(pfad).readAsBytes());

/// Roboto unter allen Namen, die die Themes der Plattformen verlangen, dazu
/// die Material-Symbole.
Future<void> _schriftenLaden() async {
  final ordner = '${_flutterWurzel.path}/bin/cache/artifacts/material_fonts';
  const schnitte = ['Thin', 'Light', 'Regular', 'Medium', 'Bold', 'Black'];
  for (final familie in [
    'Roboto',
    'CupertinoSystemText',
    'CupertinoSystemDisplay',
    '.SF Pro Text',
    '.SF Pro Display',
    '.SF UI Text',
    '.SF UI Display',
    '.AppleSystemUIFont',
    'Segoe UI',
    // Passwort-Feld der Zugaenge (zeigt nur Punkte).
    'monospace',
  ]) {
    final lader = FontLoader(familie);
    for (final s in schnitte) {
      lader.addFont(_datei('$ordner/Roboto-$s.ttf'));
    }
    await lader.load();
  }
  await (FontLoader('MaterialIcons')..addFont(_datei('$ordner/MaterialIcons-Regular.otf'))).load();
  // Zeichen, die Roboto nicht hat (z.B. Pfeile "→"), nimmt das Geraet aus
  // einer Systemschrift. Im Test gibt es keine - darum eine vom Rechner,
  // falls vorhanden.
  for (final pfad in _zeichenSchriften) {
    if (File(pfad).existsSync()) {
      await (FontLoader(_zeichenFamilie)..addFont(_datei(pfad))).load();
      break;
    }
  }
}

const _zeichenFamilie = 'TourZeichen';
const _zeichenSchriften = [
  '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
];

// ---------------------------------------------------------------------------
// Statusleiste (nur gezeichnet, damit die Bilder nach Handy aussehen)

class _Statusleiste extends StatelessWidget {
  const _Statusleiste();

  @override
  Widget build(BuildContext context) {
    const weiss = Color(0xFFFFFFFF);
    return const Padding(
      padding: EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          Text(
            '10:00',
            style: TextStyle(fontFamily: 'Roboto', fontSize: 13, color: weiss),
          ),
          Spacer(),
          Icon(Icons.signal_cellular_alt, size: 15, color: weiss),
          SizedBox(width: 4),
          Icon(Icons.wifi, size: 15, color: weiss),
          SizedBox(width: 4),
          Icon(Icons.battery_full, size: 15, color: weiss),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Ablauf

/// Startet die App auf [g] (angemeldet als Erika Muster).
Future<void> _starten(
  WidgetTester tester,
  _Geraet g, {
  bool angemeldet = true,
  bool vorstand = true,
}) async {
  tester.view.physicalSize = g.groesse * g.dichte;
  tester.view.devicePixelRatio = g.dichte;
  final rand = FakeViewPadding(top: g.oben * g.dichte);
  tester.view.padding = rand;
  tester.view.viewPadding = rand;
  addTearDown(tester.view.reset);
  // Echte Schatten statt der schwarzen Raender, die Tests sonst zeichnen
  // (zurueck am Ende des Tests, siehe main).
  debugDisableShadows = false;
  tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
    SystemChannels.platform,
    (_) async => null,
  );
  tourNetzBilderEinlegen();
  final d = await tourDienste(
    tester,
    plattform: g.plattform,
    angemeldet: angemeldet,
    vorstand: vorstand,
  );
  await tester.pumpWidget(
    RepaintBoundary(
      key: _wurzel,
      child: Directionality(
        textDirection: TextDirection.ltr,
        child: Stack(
          children: [
            Positioned.fill(child: FwvApp(dienste: d)),
            if (g.oben > 0)
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                height: g.oben,
                child: const IgnorePointer(child: _Statusleiste()),
              ),
          ],
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// Laedt Bilder aus der App (Logo) wirklich, sonst bleiben sie leer.
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

/// Texte ganz ohne Schriftfamilie (z.B. eigener textStyle an einem Knopf)
/// zeichnet das Geraet in der Systemschrift, der Test aber in der
/// Testschrift - die sich nicht ersetzen laesst. Darum bekommen sie vor dem
/// Bild Roboto, alle Texte dazu die Ersatzschrift fuer fehlende Zeichen
/// (nur im Render-Baum, die App bleibt wie sie ist).
Future<void> _systemschrift(WidgetTester tester) async {
  for (final r in tester.allRenderObjects.whereType<RenderParagraph>().toList()) {
    final t = r.text;
    if (t is! TextSpan) continue;
    final stil = t.style ?? const TextStyle();
    r.text = TextSpan(
      text: t.text,
      children: t.children,
      style: stil.copyWith(
        fontFamily: stil.fontFamily ?? 'Roboto',
        fontFamilyFallback: [...?stil.fontFamilyFallback, _zeichenFamilie],
      ),
      recognizer: t.recognizer,
      semanticsLabel: t.semanticsLabel,
      locale: t.locale,
      spellOut: t.spellOut,
    );
  }
  await tester.pump();
}

/// Speichert, was gerade zu sehen ist, als JPEG.
Future<void> _foto(WidgetTester tester, _Geraet g, String name) async {
  await _bilderLaden(tester);
  await _systemschrift(tester);
  expect(tester.takeException(), isNull);
  final rand = tester.renderObject<RenderRepaintBoundary>(find.byKey(_wurzel));
  final ziel = File(
    '${repoWurzel().path}/docker/frontend-website/images/anleitung/${g.ordner}/${g.praefix}$name.jpg',
  );
  await tester.runAsync(() async {
    final bild = await rand.toImage(pixelRatio: g.dichte);
    final daten = await bild.toByteData(format: ui.ImageByteFormat.rawRgba);
    var b = img.Image.fromBytes(
      width: bild.width,
      height: bild.height,
      bytes: daten!.buffer,
      numChannels: 4,
      order: img.ChannelOrder.rgba,
    );
    bild.dispose();
    final breite = g.breiteBild;
    if (breite != null && breite < b.width) {
      b = img.copyResize(b, width: breite, interpolation: img.Interpolation.average);
    }
    ziel.parent.createSync(recursive: true);
    ziel.writeAsBytesSync(img.encodeJpg(b, quality: 85));
  });
  // ignore: avoid_print
  print('Tour: ${ziel.path.substring(repoWurzel().path.length + 1)}');
}

void main() {
  setUpAll(() async {
    if (!_tourAn) return;
    // Ohne das rote "DEBUG"-Band oben rechts.
    WidgetsApp.debugAllowBannerOverride = false;
    await _schriftenLaden();
    await tourNetzBilderVorbereiten();
  });

  for (final g in [_android, _web]) {
    group(g.ordner, () {
      for (final MapEntry(key: name, value: schritte) in tourBilder.entries) {
        if (!g.handy && tourNurHandy.contains(name)) continue;
        testWidgets(
          name,
          (tester) async {
            try {
              await _starten(
                tester,
                g,
                angemeldet: !tourAbgemeldet.contains(name),
                vorstand: !tourAlsOrganisator.contains(name),
              );
              await schritte(tester, g);
              await _foto(tester, g, name);
            } finally {
              debugDisableShadows = true;
            }
          },
          skip: !_tourAn,
          variant: TargetPlatformVariant.only(g.system),
        );
      }
    });
  }
}
