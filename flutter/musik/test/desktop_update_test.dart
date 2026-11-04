import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/desktop.dart';
import 'package:fwv_musik/update.dart';
import 'package:material_ui/material_ui.dart';

void main() {
  final fassung = DesktopFassung(
    version: '1.4.0',
    seite: Uri.parse('https://github.com/Feuerwehrverein-Raura/Homepage/releases/tag/musik-v1.4.0'),
    datei: Uri.parse('https://example.org/fwv-musik-1.4.0-macos.dmg'),
    sha256: 'a' * 64,
  );

  Future<List<Uri>> zeigen(WidgetTester tester, String system) async {
    final geoeffnet = <Uri>[];
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: DesktopUpdateHinweis(
            updater: DesktopUpdater(app: 'musik', appVersion: () async => '1.3.1', system: system),
            fassung: fassung,
            seiteOeffnen: (s) async => geoeffnet.add(s),
          ),
        ),
      ),
    );
    return geoeffnet;
  }

  testWidgets('Linux: Hinweis fuehrt zur Download-Seite', (tester) async {
    final geoeffnet = await zeigen(tester, 'linux');
    expect(find.text('FWV Musik 1.4.0 ist da.'), findsOneWidget);
    await tester.tap(find.text('Herunterladen'));
    await tester.pump();
    expect(geoeffnet, [fassung.seite]);
  });

  testWidgets('macOS: erklaert vorher das Fenster zum Installieren', (tester) async {
    await zeigen(tester, 'macos');
    expect(find.textContaining('in «Programme» ziehen'), findsOneWidget);
    expect(find.text('Aktualisieren'), findsOneWidget);
  });
}
