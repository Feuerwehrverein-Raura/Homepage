// «Ansehen» (bausteine.dart dateiAnsehen): PDF und Fotos in den Viewer der
// App, andere Typen und ohne Viewer ins Teilen-Menue.

import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:material_ui/material_ui.dart';

void main() {
  test('anzeigeTyp: Typ vom Backend, sonst aus der Endung', () {
    expect(anzeigeTyp('image/jpeg', 'x'), 'image/jpeg');
    expect(anzeigeTyp('IMAGE/JPG', 'x'), 'image/jpeg');
    expect(anzeigeTyp(null, 'Quittung.JPG'), 'image/jpeg');
    expect(anzeigeTyp('application/octet-stream', 'Beleg.pdf'), 'application/pdf');
    expect(anzeigeTyp(null, 'Beleg'), 'application/octet-stream');
    expect(inAppAnzeigbar('application/pdf'), isTrue);
    expect(inAppAnzeigbar('image/png'), isTrue);
    expect(inAppAnzeigbar('text/plain'), isFalse);
  });

  late List<(String, String)> geteilt;
  late List<(String, String)> angezeigt;

  VerwaltungsUmgebung umgebung({required bool mitViewer}) => VerwaltungsUmgebung(
    dateiTeilen: (bytes, name, typ, {ursprung}) async => geteilt.add((name, typ)),
    fotoWaehlen: ({required bool kamera}) async => null,
    linkOeffnen: (u) async => true,
    dateiAnzeigen: mitViewer
        ? (context, bytes, name, typ) async => angezeigt.add((name, typ))
        : null,
  );

  setUp(() {
    geteilt = [];
    angezeigt = [];
  });

  Future<void> ansehen(WidgetTester tester, VerwaltungsUmgebung u, String name, String? typ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () => dateiAnsehen(context, u, Uint8List(3), name, typ),
            child: const Text('Ansehen'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Ansehen'));
    await tester.pumpAndSettle();
  }

  testWidgets('Mit Viewer: Foto und PDF in der App, anderes geteilt', (tester) async {
    final u = umgebung(mitViewer: true);
    await ansehen(tester, u, 'Quittung.jpg', 'image/jpeg');
    await ansehen(tester, u, 'Beleg.pdf', null);
    await ansehen(tester, u, 'Pingen.txt', 'text/plain');
    expect(angezeigt, [('Quittung.jpg', 'image/jpeg'), ('Beleg.pdf', 'application/pdf')]);
    expect(geteilt, [('Pingen.txt', 'text/plain')]);
  });

  testWidgets('Ohne Viewer: Teilen-Menue', (tester) async {
    await ansehen(tester, umgebung(mitViewer: false), 'Quittung.jpg', 'image/jpeg');
    expect(geteilt, [('Quittung.jpg', 'image/jpeg')]);
  });
}
