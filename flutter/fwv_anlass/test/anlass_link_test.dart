// Direktlink auf die Anlass-Seite (DirektlinkKnopf): kopieren mit Meldung.

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

void main() {
  test('Webseite: Slug, sonst ID', () {
    expect(
      Anlass.ausJson({'id': 'e1', 'slug': 'weihnachtshock-a5c80f', 'title': 'W'}).webseite
          .toString(),
      'https://www.fwv-raura.ch/events.html?event=weihnachtshock-a5c80f',
    );
    expect(
      Anlass.ausJson({'id': 'e1', 'title': 'W'}).webseite.toString(),
      'https://www.fwv-raura.ch/events.html?event=e1',
    );
  });

  testWidgets('Knopf kopiert den Link und meldet ihn', (tester) async {
    String? kopiert;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (
      c,
    ) async {
      if (c.method == 'Clipboard.setData') kopiert = (c.arguments as Map)['text'] as String?;
      return null;
    });
    final a = Anlass.ausJson({'id': 'e1', 'slug': 'chilbi-2026', 'title': 'Chilbi'});
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          appBar: AppBar(actions: [DirektlinkKnopf(anlass: a)]),
        ),
      ),
    );
    await tester.tap(find.byKey(const Key('anlass-link-kopieren')));
    await tester.pump();
    expect(kopiert, 'https://www.fwv-raura.ch/events.html?event=chilbi-2026');
    expect(
      find.text('Direktlink kopiert: https://www.fwv-raura.ch/events.html?event=chilbi-2026'),
      findsOneWidget,
    );
  });
}
