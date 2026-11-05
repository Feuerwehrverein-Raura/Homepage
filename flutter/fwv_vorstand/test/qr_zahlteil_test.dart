import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:fwv_vorstand/src/ui/qr_zahlteil.dart';
import 'package:material_ui/material_ui.dart';

const _zahlung = QrZahlung(
  iban: 'CH9300762011623852957',
  name: 'Pia Muster',
  strasse: 'Hauptstrasse 12',
  plz: '4303',
  ort: 'Kaiseraugst',
  betrag: 146.06,
  mitteilung: 'Spesen: Spesenabrechnung Pingen 2026 (Jan–Sep): 89 Briefe, CHF 146.06',
);

void main() {
  testWidgets('Dialog zeigt Code und Angaben', (t) async {
    await t.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(builder: (c) => const QrZahlteilKnopf(zahlung: _zahlung)),
        ),
      ),
    );
    await t.tap(find.text('QR-Code'));
    await t.pumpAndSettle();
    expect(find.byType(SwissQrBild), findsOneWidget);
    expect(find.text('CHF 146.06'), findsOneWidget);
    expect(find.textContaining('CH93 0076'), findsOneWidget);
  });

  testWidgets('ohne Adresse: Hinweis statt Code', (t) async {
    await t.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (c) => const QrZahlteilKnopf(
              zahlung: QrZahlung(iban: 'CH9300762011623852957', name: 'Pia Muster'),
            ),
          ),
        ),
      ),
    );
    await t.tap(find.text('QR-Code'));
    await t.pumpAndSettle();
    expect(find.byType(SwissQrBild), findsNothing);
    expect(find.byKey(const Key('qr-zahlteil-fehlt')), findsOneWidget);
  });

  // QR_BILD=/pfad/bild.png flutter test ... schreibt das Bild zum Scannen
  // (zbarimg) - prueft, dass der Code mit dem Kreuz lesbar bleibt.
  testWidgets('Bild fuer den Scan-Test', (t) async {
    final ziel = Platform.environment['QR_BILD'];
    if (ziel == null) return;
    final schluessel = GlobalKey();
    await t.pumpWidget(
      Directionality(
        textDirection: TextDirection.ltr,
        child: Center(
          child: RepaintBoundary(
            key: schluessel,
            child: SwissQrBild(inhalt: _zahlung.inhalt),
          ),
        ),
      ),
    );
    await t.runAsync(() async {
      final grenze = schluessel.currentContext!.findRenderObject()! as RenderRepaintBoundary;
      final bild = await grenze.toImage(pixelRatio: 3);
      final png = await bild.toByteData(format: ui.ImageByteFormat.png);
      File(ziel).writeAsBytesSync(png!.buffer.asUint8List());
      File('$ziel.txt').writeAsStringSync(_zahlung.inhalt);
    });
  });
}
