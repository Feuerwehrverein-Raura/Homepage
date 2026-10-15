// Bildschirmfoto-Tour: zeichnet die Mitglieder-App mit erfundenen Daten
// (tour_daten.dart, "Erika Muster") und legt die Bilder fuer die Anleitungen
// der Website ab:
//
//   docker/frontend-website/images/anleitung/android/NN-*.jpg  Handy, Android
//   docker/frontend-website/images/anleitung/ios/NN-*.jpg      Handy, iOS
//   docker/frontend-website/images/anleitung/web/mein-NN-*.jpg Browser (Mein Bereich,
//                                                             auch Desktop-Programm)
//
// Gleiche Namen auf allen drei Geraeten (die Anleitung schaltet nur den
// Ordner um). Die Bilder der Organisatoren entstehen mit einem Konto ohne
// Vorstand (_alsOrganisator).
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
// (bin/cache/artifacts/material_fonts) und nimmt Roboto auch fuer iOS und
// den Browser — so sehen die Bilder auf jedem Rechner gleich aus. Fuer
// Zeichen, die Roboto fehlen (Pfeile), dient "Arial Unicode" vom Mac (bzw.
// DejaVu Sans unter Linux) als Ersatz.
//
// Die Statusleiste oben (und auf iOS die Wischleiste unten) ist nur
// gezeichnet, damit die Bilder nach Handy aussehen.
//
// Bilder aus dem Netz gibt es im Test nicht: Die Anlass-Logos kommen aus
// docker/frontend-website/images/anlaesse, das Profilfoto ist gezeichnet.

@Tags(['tour'])
library;

import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_mitglieder/dienste.dart';
import 'package:fwv_mitglieder/main.dart';
import 'package:image/image.dart' as img;
import 'package:material_ui/material_ui.dart';

import 'tour_daten.dart';

final _tourAn = Platform.environment['TOUR'] == '1';

/// Ein Geraet, fuer das die Tour Bilder macht.
class _Geraet {
  const _Geraet({
    required this.ordner,
    required this.groesse,
    required this.dichte,
    required this.system,
    required this.plattform,
    this.praefix = '',
    this.oben = 0,
    this.unten = 0,
    this.breiteBild,
  });

  final String ordner;
  final Size groesse;
  final double dichte;
  final TargetPlatform system;
  final Plattform plattform;

  /// Vor jedem Dateinamen ("mein-" im Browser).
  final String praefix;

  /// Statusleiste oben, Wischleiste unten (logische Punkte).
  final double oben;
  final double unten;

  /// Breite der gespeicherten Datei in Pixeln (null: wie gezeichnet).
  final int? breiteBild;

  bool get handy => groesse.width < 600;
  bool get ios => system == TargetPlatform.iOS;
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

const _ios = _Geraet(
  ordner: 'ios',
  groesse: Size(393, 852),
  dichte: 2.75,
  system: TargetPlatform.iOS,
  plattform: Plattform.ios,
  oben: 59,
  unten: 34,
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

/// Bilder, die sonst aus dem Netz kaemen: Adresse -> Bild.
final _netzBilder = <String, ui.Image>{};

Future<ui.Image> _png(String pfad) async {
  final codec = await ui.instantiateImageCodec(await File(pfad).readAsBytes());
  return (await codec.getNextFrame()).image;
}

/// Erfundenes Profilfoto: Initialen auf ruhigem Grund — sieht aus wie ein
/// Bild, zeigt aber niemanden.
ui.Image _profilfoto() {
  const seite = 512.0;
  final rec = ui.PictureRecorder();
  final c = Canvas(rec);
  c.drawRect(
    const Rect.fromLTWH(0, 0, seite, seite),
    Paint()
      ..shader = ui.Gradient.linear(const Offset(0, 0), const Offset(seite, seite), const [
        Color(0xFF94A3B8),
        Color(0xFF475569),
      ]),
  );
  final tp = TextPainter(
    text: const TextSpan(
      text: 'EM',
      style: TextStyle(
        fontFamily: 'Roboto',
        fontSize: 200,
        fontWeight: FontWeight.w500,
        color: Color(0xFFFFFFFF),
      ),
    ),
    textDirection: TextDirection.ltr,
  )..layout();
  tp.paint(c, Offset((seite - tp.width) / 2, (seite - tp.height) / 2));
  return rec.endRecording().toImageSync(seite.toInt(), seite.toInt());
}

Future<void> _bilderVorbereiten() async {
  final w = repoWurzel().path;
  for (final name in ['chilbi', 'preisjassen']) {
    _netzBilder['https://www.fwv-raura.ch/images/anlaesse/$name.png'] = await _png(
      '$w/docker/frontend-website/images/anlaesse/$name.png',
    );
  }
  _netzBilder['https://api.fwv-raura.ch$profilFotoPfad'] = _profilfoto();
}

/// Legt die Bilder in den Bild-Speicher, unter denselben Schluesseln wie
/// Image.network sie sucht (mit und ohne Token im Kopf).
void _netzBilderEinlegen() {
  for (final MapEntry(key: adresse, value: bild) in _netzBilder.entries) {
    for (final kopf in [
      null,
      {'Authorization': 'Bearer $tourToken'},
      {'Authorization': 'Bearer $tourTokenOrganisator'},
    ]) {
      imageCache.putIfAbsent(
        NetworkImage(adresse, headers: kopf),
        () => OneFrameImageStreamCompleter(SynchronousFuture(ImageInfo(image: bild.clone()))),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Statusleiste (nur gezeichnet, damit die Bilder nach Handy aussehen)

class _Statusleiste extends StatelessWidget {
  const _Statusleiste({required this.geraet});

  final _Geraet geraet;

  @override
  Widget build(BuildContext context) {
    const weiss = Color(0xFFFFFFFF);
    final symbole = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.signal_cellular_alt, size: geraet.ios ? 17 : 15, color: weiss),
        const SizedBox(width: 4),
        Icon(Icons.wifi, size: geraet.ios ? 17 : 15, color: weiss),
        const SizedBox(width: 4),
        Icon(Icons.battery_full, size: geraet.ios ? 19 : 15, color: weiss),
      ],
    );
    if (!geraet.ios) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Row(
          children: [
            const Text(
              '10:00',
              style: TextStyle(fontFamily: 'Roboto', fontSize: 13, color: weiss),
            ),
            const Spacer(),
            symbole,
          ],
        ),
      );
    }
    return Stack(
      children: [
        // Dynamic Island
        Align(
          alignment: const Alignment(0, -0.35),
          child: Container(
            width: 124,
            height: 36,
            decoration: BoxDecoration(
              color: const Color(0xFF000000),
              borderRadius: BorderRadius.circular(18),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(44, 4, 28, 0),
          child: Row(
            children: [
              const Text(
                '10:00',
                style: TextStyle(
                  fontFamily: 'Roboto',
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: weiss,
                ),
              ),
              const Spacer(),
              symbole,
            ],
          ),
        ),
      ],
    );
  }
}

class _Wischleiste extends StatelessWidget {
  const _Wischleiste();

  @override
  Widget build(BuildContext context) => Align(
    alignment: const Alignment(0, 0.4),
    child: Container(
      width: 134,
      height: 5,
      decoration: BoxDecoration(
        color: const Color(0xFF111827),
        borderRadius: BorderRadius.circular(3),
      ),
    ),
  );
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
  final rand = FakeViewPadding(top: g.oben * g.dichte, bottom: g.unten * g.dichte);
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
  _netzBilderEinlegen();
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
                child: IgnorePointer(child: _Statusleiste(geraet: g)),
              ),
            if (g.unten > 0)
              Positioned(
                bottom: 0,
                left: 0,
                right: 0,
                height: g.unten,
                child: const IgnorePointer(child: _Wischleiste()),
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

Finder _leiste(String text) => find.descendant(
  of: find.byWidgetPredicate((w) => w is NavigationBar || w is NavigationRail),
  matching: find.text(text),
);

Future<void> _reiter(WidgetTester tester, _Geraet g, String name) async {
  // Unten heisst "Einstellungen" "Mehr".
  final text = g.handy && name == 'Einstellungen' ? 'Mehr' : name;
  await tester.tap(_leiste(text));
  await tester.pumpAndSettle();
}

/// Scrollt, bis [f] gebaut und zu sehen ist (oben an der Liste).
Future<void> _sichtbar(WidgetTester tester, Finder f) async {
  if (f.evaluate().isEmpty) {
    await tester.scrollUntilVisible(
      f,
      200,
      scrollable: find.byType(Scrollable).hitTestable().first,
    );
  }
  await tester.ensureVisible(f);
  await tester.pumpAndSettle();
}

Future<void> _tippen(WidgetTester tester, Finder f) async {
  await _sichtbar(tester, f);
  await tester.tap(f);
  await tester.pumpAndSettle();
}

/// Ein Bild der Tour: Name und Weg dorthin (die App ist schon gestartet).
typedef _Schritte = Future<void> Function(WidgetTester tester, _Geraet g);

/// Bilder, die als Organisator ohne Vorstand entstehen (der Vorstand sieht
/// statt "Organisator" den Reiter "Vorstand").
const _alsOrganisator = {
  '11-organisator',
  '13-organisator-anlass',
  '24-organisator-schichten',
  '25-anmeldung-aendern',
  '26-organisatoren',
};

/// Nur auf dem Handy: Im Browser stehen die Anleitungen links in der Leiste.
const _nurHandy = {'20-hilfe'};

/// Die Bilder der Tour - auf dem Handy (Android, iOS) und im Browser
/// ("mein-" davor) unter denselben Namen. Die Nummern 01-11 gab es schon in
/// den alten Apps; die Anleitungen verweisen darauf.
final _bilder = <String, _Schritte>{
  '01-anlaesse': (t, g) async {},
  '02-kalender': (t, g) async => _tippen(t, find.text('Kalender')),
  '03-anlass-detail': (t, g) async => _tippen(t, find.text('Chilbi 2026')),
  '04-anmeldung': _anmeldung,
  '05-profil': (t, g) async => _reiter(t, g, 'Profil'),
  '06-meine-anmeldungen': (t, g) async {
    await _reiter(t, g, 'Profil');
    await _tippen(t, find.text('Meine Anmeldungen'));
  },
  '07-zugaenge': (t, g) async {
    await _reiter(t, g, 'Profil');
    await _tippen(t, find.text('Zugänge'));
  },
  '08-einstellungen': (t, g) async => _reiter(t, g, 'Einstellungen'),
  '09-benachrichtigungen': (t, g) async {
    await _reiter(t, g, 'Profil');
    await _tippen(t, find.text('Benachrichtigungen'));
  },
  '10-adressbuch': (t, g) async {
    await _reiter(t, g, 'Einstellungen');
    if (g.plattform == Plattform.android) {
      await _sichtbar(t, find.text('Adressbuch'));
    } else {
      await _tippen(t, find.text('Mitglieder-Adressbuch einrichten'));
    }
  },
  '11-organisator': (t, g) async => _reiter(t, g, 'Organisator'),
  // Abgemeldet gestartet (siehe main).
  '12-login': (t, g) async {},
  '13-organisator-anlass': _organisatorAnlass,
  '14-lager': (t, g) async => _reiter(t, g, 'Lager'),
  '15-schopf-lampen': (t, g) async => _reiter(t, g, 'Schopf'),
  '16-schopf-messwerte': (t, g) async {
    await _reiter(t, g, 'Schopf');
    await _tippen(t, find.text('Messwerte'));
  },
  '17-musik': (t, g) async {
    if (!g.handy) return _reiter(t, g, 'Musik');
    await _reiter(t, g, 'Einstellungen');
    await _tippen(t, find.widgetWithText(ListTile, 'Musik'));
  },
  '18-vpn': (t, g) async {
    await _reiter(t, g, 'Profil');
    await _tippen(t, find.text('VPN-Zugang'));
  },
  '19-material-ausleihen': _ausleihen,
  '20-hilfe': (t, g) async {
    await _reiter(t, g, 'Einstellungen');
    await _sichtbar(t, find.text('Hilfe'));
  },
  '21-austritt': _austritt,
  '22-anmelden-teilnahme': _teilnahme,
  '23-schon-angemeldet': (t, g) async {
    await _teilnahme(t, g);
    await _tippen(t, find.byKey(const Key('anmelden-senden')));
    expect(find.text('Schon angemeldet'), findsOneWidget);
  },
  '24-organisator-schichten': (t, g) async {
    await _organisatorAnlass(t, g);
    await _tippen(t, find.widgetWithText(Tab, 'Schichten'));
  },
  '25-anmeldung-aendern': (t, g) async {
    await _organisatorAnlass(t, g);
    await _tippen(t, find.byKey(const Key('aktionen-00000000-0000-0000-0000-700000000001')));
    await _tippen(t, find.text('Ändern'));
  },
  '26-organisatoren': (t, g) async {
    await _organisatorAnlass(t, g);
    await _tippen(t, find.widgetWithText(ActionChip, 'Organisatoren'));
  },
  '27-vorstand': (t, g) async => _reiter(t, g, 'Vorstand'),
  '28-vorstand-mitglieder': (t, g) async {
    await _reiter(t, g, 'Vorstand');
    await _tippen(t, find.widgetWithText(Tab, 'Mitglieder'));
  },
  '29-gruppen': (t, g) async {
    if (!g.handy) return _reiter(t, g, 'Gruppen');
    await _reiter(t, g, 'Einstellungen');
    await _tippen(t, find.text('Gruppen verwalten'));
  },
};

/// Teilnahme am Preisjassen: zwei Personen.
Future<void> _teilnahme(WidgetTester t, _Geraet g) async {
  await _tippen(t, find.text('Preisjassen 2026'));
  await _tippen(t, find.byKey(const Key('anlass-anmelden')));
  await _tippen(t, find.byTooltip('Mehr Personen'));
}

Future<void> _anmeldung(WidgetTester t, _Geraet g) async {
  await _tippen(t, find.text('Chilbi 2026'));
  await _tippen(t, find.byKey(const Key('anlass-anmelden')));
  // Eine Schicht gewaehlt, damit man sieht, wie es aussieht.
  await _tippen(t, find.byKey(const Key('schicht-00000000-0000-0000-0000-500000000001')));
  // Zurueck nach oben: Name, E-Mail und die gewaehlte Schicht.
  final liste = find.byType(Scrollable).hitTestable().first;
  await t.drag(liste, const Offset(0, 2000));
  await t.pumpAndSettle();
}

/// Ausleihen: Zeitraum 13.-15.10.2026, drei Teller und eine Kiste gewaehlt.
Future<void> _ausleihen(WidgetTester t, _Geraet g) async {
  await _reiter(t, g, 'Profil');
  await _tippen(t, find.byKey(const Key('material-ausleihen')));
  await _tippen(t, find.byKey(const Key('zeitraum-waehlen')));
  await _tippen(t, find.text('13').first);
  await _tippen(t, find.text('15').first);
  final fertig = find.text('Speichern');
  await _tippen(t, fertig.evaluate().isEmpty ? find.text('OK') : fertig);
  for (var i = 0; i < 3; i++) {
    await _tippen(t, find.byKey(const Key('menge-2-plus')));
  }
  await _tippen(t, find.byKey(const Key('angebot-kiste-2')));
  await t.drag(find.byType(Scrollable).hitTestable().first, const Offset(0, 2000));
  await t.pumpAndSettle();
}

Future<void> _organisatorAnlass(WidgetTester t, _Geraet g) async {
  await _reiter(t, g, 'Organisator');
  await _tippen(t, find.text('Chilbi 2026'));
}

Future<void> _austritt(WidgetTester t, _Geraet g) async {
  await _reiter(t, g, 'Profil');
  await _tippen(t, find.text('Austritt beantragen'));
  await t.enterText(find.widgetWithText(TextField, 'Begründung (optional)'), 'Umzug ins Ausland');
  await t.pumpAndSettle();
  await _tippen(t, find.widgetWithText(FilledButton, 'Austritt beantragen'));
  expect(find.text('Austritt beantragen?'), findsOneWidget);
}

void main() {
  setUpAll(() async {
    if (!_tourAn) return;
    // Ohne das rote "DEBUG"-Band oben rechts.
    WidgetsApp.debugAllowBannerOverride = false;
    await _schriftenLaden();
    await _bilderVorbereiten();
  });

  for (final g in [_android, _ios, _web]) {
    group(g.ordner, () {
      for (final MapEntry(key: name, value: schritte) in _bilder.entries) {
        if (!g.handy && _nurHandy.contains(name)) continue;
        testWidgets(
          name,
          (tester) async {
            try {
              await _starten(
                tester,
                g,
                angemeldet: name != '12-login',
                vorstand: !_alsOrganisator.contains(name),
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
