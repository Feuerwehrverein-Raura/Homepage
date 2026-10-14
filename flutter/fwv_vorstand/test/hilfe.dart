// Gemeinsames fuer die Tests: nachgebautes Backend (MockClient) und die
// Ansicht in einer MaterialApp in Handy- oder Desktop-Groesse.

import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:fwv_vorstand/fwv_vorstand.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';

/// Antwort des nachgebauten Backends: JSON-Wert, oder (Status, JSON).
typedef Antwort = Object? Function(http.Request a);

class FalschesBackend {
  FalschesBackend(this.antwort);

  Antwort antwort;
  final anfragen = <http.Request>[];
  final links = <Uri>[];

  /// Ueber das Teilen-Menue weitergegebene Dateien (Name, Groesse).
  final geteilt = <(String, int)>[];

  /// Was der PDF-Waehler liefert (null = Abbruch).
  ({Uint8List bytes, String dateiname})? pdf;

  late final api = ApiClient(
    http: MockClient((a) async {
      anfragen.add(a);
      var o = antwort(a);
      var status = 200;
      if (o case (int s, Object? j)) {
        status = s;
        o = j;
      }
      return http.Response.bytes(utf8.encode(jsonEncode(o)), status);
    }),
  );

  late final umgebung = VerwaltungsUmgebung(
    dateiTeilen: (bytes, name, typ, {ursprung}) async => geteilt.add((name, bytes.length)),
    fotoWaehlen: ({required bool kamera}) async => Uint8List(0),
    linkOeffnen: (u) async {
      links.add(u);
      return true;
    },
    anhangVerkleinern: (roh) async => roh,
    pdfWaehlen: () async => pdf,
  );

  late final dienste = VorstandDienste(
    api: api,
    anlaesse: AnlassVerwaltung(zugang: OrganisatorZugang(api), umgebung: umgebung),
    umgebung: umgebung,
  );

  /// "PATCH /membership-fees/payments/p1/pay" ohne GET-Aufrufe.
  List<String> get aenderungen => [
    for (final a in anfragen)
      if (a.method != 'GET') '${a.method} ${a.url.path}',
  ];

  Object? body(String weg) {
    final a = anfragen.lastWhere((a) => '${a.method} ${a.url.path}' == weg);
    return a.body.isEmpty ? null : jsonDecode(a.body);
  }
}

/// Handy (iPhone 15: 393 Punkte) und Desktop (1300 Punkte neben der Leiste).
const handy = Size(393, 852);
const desktop = Size(1300, 900);

Future<void> zeigen(WidgetTester tester, Widget kind, {Size groesse = handy}) async {
  tester.view.physicalSize = groesse * 3;
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      locale: const Locale('de', 'CH'),
      supportedLocales: const [Locale('de', 'CH')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      home: Scaffold(body: kind),
    ),
  );
  await tester.pumpAndSettle();
}

/// Zu [f] scrollen (falls noetig) und antippen.
Future<void> tippen(WidgetTester tester, Finder f) async {
  if (f.hitTestable().evaluate().isEmpty) {
    await tester.scrollUntilVisible(f, 200, scrollable: find.byType(Scrollable).first);
  }
  await tester.tap(f);
  await tester.pumpAndSettle();
}

/// Knopf im offenen Dialog.
Finder imDialog(String text) =>
    find.descendant(of: find.byType(AlertDialog), matching: find.text(text));
