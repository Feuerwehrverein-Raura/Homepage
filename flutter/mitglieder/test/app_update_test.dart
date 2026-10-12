import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_mitglieder/einstellungen/app_update.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

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

  group('githubStand', () {
    const json = '{"version":"1.0.2","versionCode":10002,"apk":"https://example.org/a.apk"}';

    test('neuere APK', () {
      final s = githubStand(json, '1.0.1 (10001)');
      expect(s, isA<ApkUpdate>());
      expect((s as ApkUpdate).version, '1.0.2');
      expect(s.apk, Uri.parse('https://example.org/a.apk'));
    });

    test('gleiche oder aeltere Version: kein Hinweis', () {
      expect(githubStand(json, '1.0.2 (10002)'), isA<KeinUpdate>());
      expect(githubStand(json, '1.1.0 (10100)'), isA<KeinUpdate>());
    });

    test('kaputte Datei: kein Hinweis', () {
      expect(githubStand('[]', '1.0.0'), isA<KeinUpdate>());
      expect(githubStand('{"version":1}', '1.0.0'), isA<KeinUpdate>());
    });
  });

  group('AndroidAppUpdate', () {
    const kanal = MethodChannel('test/update');

    void nativ(Object? Function(MethodCall) antwort) {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(kanal, (call) async => antwort(call));
    }

    AndroidAppUpdate dienst(http.Client client) =>
        AndroidAppUpdate(appVersion: () async => '1.0.1 (10001)', client: client, kanal: kanal);

    final keinNetz = MockClient((_) async => throw StateError('kein Netz erwartet'));

    test('aus Play: fragt Play, nicht GitHub', () async {
      nativ((c) => switch (c.method) {
        'quelle' => 'play',
        'pruefen' => {'verfuegbar': true, 'geladen': false},
        _ => null,
      });
      final s = await dienst(keinNetz).pruefen();
      expect(s, isA<PlayUpdate>());
      expect((s as PlayUpdate).geladen, isFalse);
    });

    test('aus Play, schon geladen', () async {
      nativ((c) => c.method == 'quelle' ? 'play' : {'verfuegbar': false, 'geladen': true});
      final s = await dienst(keinNetz).pruefen();
      expect((s as PlayUpdate).geladen, isTrue);
    });

    test('APK von GitHub: liest members-latest.json', () async {
      nativ((c) => 'andere');
      Uri? gefragt;
      final client = MockClient((r) async {
        gefragt = r.url;
        return http.Response('{"version":"1.0.2","apk":"https://example.org/a.apk"}', 200);
      });
      final s = await dienst(client).pruefen();
      expect(gefragt, githubVersionsDatei);
      expect(s, isA<ApkUpdate>());
    });

    test('Fehler: kein Hinweis statt Absturz', () async {
      nativ((c) => 'andere');
      final s = await dienst(MockClient((_) async => http.Response('', 404))).pruefen();
      expect(s, isA<KeinUpdate>());
      nativ((c) => throw PlatformException(code: 'x'));
      expect(await dienst(keinNetz).pruefen(), isA<KeinUpdate>());
    });
  });
}
