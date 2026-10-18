import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_mitglieder/einstellungen/app_update.dart';
import 'package:fwv_mitglieder/einstellungen/update_hinweis.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('istNeuer', () {
    test('vergleicht Zahl fuer Zahl', () {
      expect(istNeuer('1.0.2', '1.0.1'), isTrue);
      expect(istNeuer('1.0.10', '1.0.9'), isTrue);
      expect(istNeuer('2.0.0', '1.99.99'), isTrue);
      expect(istNeuer('1.0.1', '1.0.1'), isFalse);
      expect(istNeuer('1.0.0', '1.0.1'), isFalse);
    });

    test('Unlesbares ist nie neuer', () {
      expect(istNeuer('1.0', '0.9.0'), isFalse);
      expect(istNeuer('x.y.z', '1.0.0'), isFalse);
      expect(istNeuer('1.0.1', ''), isFalse);
    });
  });

  group('versionsStand', () {
    const json = '{"version":"1.0.2","versionCode":10002,"apk":"https://example.org/a.apk"}';

    test('neuere APK', () {
      final s = versionsStand(json, '1.0.1 (10001)');
      expect(s, isA<ApkUpdate>());
      expect((s as ApkUpdate).version, '1.0.2');
      expect(s.apk, Uri.parse('https://example.org/a.apk'));
    });

    test('gleiche oder aeltere Version: kein Hinweis', () {
      expect(versionsStand(json, '1.0.2 (10002)'), isA<KeinUpdate>());
      expect(versionsStand(json, '1.1.0 (10100)'), isA<KeinUpdate>());
    });

    test('kaputte Datei: kein Hinweis', () {
      expect(versionsStand('[]', '1.0.0'), isA<KeinUpdate>());
      expect(versionsStand('{"version":1}', '1.0.0'), isA<KeinUpdate>());
    });
  });

  group('AndroidAppUpdate', () {
    const kanal = MethodChannel('test/update');

    void nativ(Object? Function(MethodCall) antwort) {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
        kanal,
        (call) async => antwort(call),
      );
    }

    AndroidAppUpdate dienst(http.Client client) =>
        AndroidAppUpdate(appVersion: () async => '1.0.1 (10001)', client: client, kanal: kanal);

    final keinNetz = MockClient((_) async => throw StateError('kein Netz erwartet'));

    test('aus Play: fragt Play, nicht GitHub', () async {
      nativ(
        (c) => switch (c.method) {
          'quelle' => 'play',
          'pruefen' => {'verfuegbar': true, 'geladen': false},
          _ => null,
        },
      );
      final s = await dienst(keinNetz).pruefen();
      expect(s, isA<PlayUpdate>());
      expect((s as PlayUpdate).geladen, isFalse);
    });

    test('aus Play, schon geladen', () async {
      nativ((c) => c.method == 'quelle' ? 'play' : {'verfuegbar': false, 'geladen': true});
      final s = await dienst(keinNetz).pruefen();
      expect((s as PlayUpdate).geladen, isTrue);
    });

    test('APK von der Website: liest versionen.json', () async {
      nativ((c) => 'andere');
      Uri? gefragt;
      final client = MockClient((r) async {
        gefragt = r.url;
        return http.Response('{"mitglieder":{"datei":"mitglieder.apk","version":"99.0.0"},"kasse":{"version":"2.6"}}', 200);
      });
      final s = await dienst(client).pruefen();
      expect(gefragt, versionsDatei);
      expect((s as ApkUpdate).apk, Uri.parse('https://www.fwv-raura.ch/download/mitglieder.apk'));
      expect(s.version, '99.0.0');
    });

    test('altes Format members-latest.json geht weiterhin', () async {
      nativ((c) => 'andere');
      final client = MockClient((r) async => http.Response('{"version":"99.0.2","apk":"https://example.org/a.apk"}', 200));
      expect(await dienst(client).pruefen(), isA<ApkUpdate>());
    });

    test('Fehler: kein Hinweis statt Absturz', () async {
      nativ((c) => 'andere');
      final s = await dienst(MockClient((_) async => http.Response('', 404))).pruefen();
      expect(s, isA<KeinUpdate>());
      nativ((c) => throw PlatformException(code: 'x'));
      expect(await dienst(keinNetz).pruefen(), isA<KeinUpdate>());
    });
  });

  group('apkUpdateErklaeren', () {
    final apk = Uri.parse('https://example.org/members-latest.apk');

    Future<List<Uri>> oeffnen(WidgetTester tester, String knopf) async {
      final geoeffnet = <Uri>[];
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => TextButton(
              onPressed: () => apkUpdateErklaeren(context, '1.0.2', apk, (u) async {
                geoeffnet.add(u);
                return true;
              }),
              child: const Text('los'),
            ),
          ),
        ),
      );
      await tester.tap(find.text('los'));
      await tester.pumpAndSettle();
      expect(find.text('Version 1.0.2 installieren'), findsOneWidget);
      expect(find.textContaining('Trotzdem herunterladen'), findsOneWidget);
      await tester.tap(find.text(knopf));
      await tester.pumpAndSettle();
      expect(find.text('Version 1.0.2 installieren'), findsNothing);
      return geoeffnet;
    }

    testWidgets('erklaert die Chrome-Rueckfrage, dann Link im Browser', (tester) async {
      expect(await oeffnen(tester, 'Herunterladen'), [apk]);
    });

    testWidgets('Später: kein Download', (tester) async {
      expect(await oeffnen(tester, 'Später'), isEmpty);
    });
  });
}
