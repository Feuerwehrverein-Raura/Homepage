// Datei ansehen (pdf/pdf_ansicht.dart dateiImViewer, pdf/bild_ansicht.dart):
// Fotos in der eigenen Bildansicht mit Zoom und Teilen-Knopf, unbekannte
// Typen weiter ins Teilen-Menue.

import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_mitglieder/pdf/bild_ansicht.dart';
import 'package:fwv_mitglieder/pdf/pdf_ansicht.dart';
import 'package:material_ui/material_ui.dart';

// 1x1 Pixel, PNG.
final _png = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
);

void main() {
  late List<(String, String, int)> geteilt;

  Future<void> teilen(Uint8List bytes, String name, String typ, {Rect? ursprung}) async =>
      geteilt.add((name, typ, bytes.length));

  setUp(() => geteilt = []);

  Future<void> oeffnen(WidgetTester tester, String name, String typ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => dateiImViewer(context, _png, name, typ, teilen),
              child: const Text('Ansehen'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Ansehen'));
    await tester.pumpAndSettle();
  }

  testWidgets('Foto: eigene Ansicht mit Titel, Zoom und Teilen-Knopf', (tester) async {
    await oeffnen(tester, 'Quittung_Chilbi.png', 'image/png');
    expect(find.byType(BildAnsicht), findsOneWidget);
    expect(find.text('Quittung Chilbi'), findsOneWidget);
    final zoom = tester.widget<InteractiveViewer>(find.byKey(const Key('bild-zoom')));
    expect(zoom.maxScale, greaterThan(1));
    expect(geteilt, isEmpty, reason: 'ansehen teilt nicht');

    await tester.tap(find.byKey(const Key('bild-teilen')));
    await tester.pumpAndSettle();
    expect(geteilt.single, ('Quittung_Chilbi.png', 'image/png', _png.length));

    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.byType(BildAnsicht), findsNothing);
  });

  testWidgets('Unbekannter Typ: direkt ins Teilen-Menue', (tester) async {
    await oeffnen(tester, 'Abrechnung.docx', 'application/vnd.ms-word');
    expect(find.byType(BildAnsicht), findsNothing);
    expect(geteilt.single.$1, 'Abrechnung.docx');
  });
}
