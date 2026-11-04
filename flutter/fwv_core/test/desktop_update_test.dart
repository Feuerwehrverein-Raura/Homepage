import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/desktop.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

final _sha = 'a' * 64;

String _versionen({String version = '1.3.1', Map<String, Object?>? systeme}) => jsonEncode({
  'musik': {
    'datei': 'musik.apk',
    'version': version,
    'desktop': {
      'version': version,
      'seite': 'https://github.com/Feuerwehrverein-Raura/Homepage/releases/tag/musik-v$version',
      ...(systeme ??
          {
            'windows': {'url': 'https://example.org/fwv-musik-$version-windows-x64-setup.exe', 'sha256': _sha},
            'macos': {'url': 'https://example.org/fwv-musik-$version-macos.dmg', 'sha256': _sha},
            'linux': {'url': 'https://example.org/fwv-musik_${version}_amd64.deb', 'sha256': _sha},
          }),
    },
  },
});

void main() {
  group('desktopFassung', () {
    test('neuere Fassung mit Datei fuer das System', () {
      final f = desktopFassung(_versionen(), app: 'musik', installiert: '1.3.0', system: 'windows')!;
      expect(f.version, '1.3.1');
      expect(f.datei.toString(), endsWith('-windows-x64-setup.exe'));
      expect(f.sha256, _sha);
      expect(f.seite.toString(), endsWith('musik-v1.3.1'));
    });

    test('gleiche oder neuere installiert: nichts', () {
      expect(desktopFassung(_versionen(), app: 'musik', installiert: '1.3.1', system: 'macos'), isNull);
      expect(desktopFassung(_versionen(), app: 'musik', installiert: '1.4.0', system: 'macos'), isNull);
    });

    test('Version mit Build-Nummer wie in der Mitglieder-App', () {
      expect(desktopFassung(_versionen(), app: 'musik', installiert: '1.3.0 (10300)', system: 'linux'), isNotNull);
    });

    test('ohne Datei fuer das System nur die Seite', () {
      final f = desktopFassung(
        _versionen(systeme: {}),
        app: 'musik',
        installiert: '1.0.0',
        system: 'windows',
      )!;
      expect(f.datei, isNull);
      expect(DesktopUpdater(app: 'musik', appVersion: () async => '1.0.0', system: 'windows').kannSelbst(f), isFalse);
    });

    test('Unlesbares, andere App oder ohne desktop: nichts', () {
      expect(desktopFassung('kaputt', app: 'musik', installiert: '1.0.0', system: 'macos'), isNull);
      expect(desktopFassung(_versionen(), app: 'mitglieder', installiert: '1.0.0', system: 'macos'), isNull);
      expect(
        desktopFassung('{"musik":{"version":"9.0.0"}}', app: 'musik', installiert: '1.0.0', system: 'macos'),
        isNull,
      );
    });
  });

  group('DesktopUpdater', () {
    DesktopUpdater updater(http.Client client, String system) =>
        DesktopUpdater(app: 'musik', appVersion: () async => '1.3.0', client: client, system: system);

    test('pruefen liest versionen.json der Website', () async {
      final client = MockClient((r) async {
        expect(r.url, desktopVersionsDatei);
        return http.Response(_versionen(), 200);
      });
      expect((await updater(client, 'macos').pruefen())?.version, '1.3.1');
    });

    test('kein Netz: kein Hinweis', () async {
      final client = MockClient((r) async => throw http.ClientException('offline'));
      expect(await updater(client, 'windows').pruefen(), isNull);
    });

    test('selbst installieren nur auf Windows und macOS', () {
      final f = desktopFassung(_versionen(), app: 'musik', installiert: '1.0.0', system: 'linux')!;
      final client = MockClient((r) async => http.Response('', 404));
      expect(updater(client, 'windows').kannSelbst(f), isTrue);
      expect(updater(client, 'macos').kannSelbst(f), isTrue);
      expect(updater(client, 'linux').kannSelbst(f), isFalse);
    });

    test('falsche Pruefsumme: Fehler statt Installieren', () async {
      final f = desktopFassung(_versionen(), app: 'musik', installiert: '1.0.0', system: 'windows')!;
      final client = MockClient((r) async => http.Response('nicht die Datei', 200));
      await expectLater(
        updater(client, 'windows').installieren(f),
        throwsA(isA<DesktopUpdateFehler>().having((e) => e.meldung, 'meldung', contains('beschädigt'))),
      );
    });
  });

  test('versionNeuer', () {
    expect(versionNeuer('1.0.10', '1.0.9'), isTrue);
    expect(versionNeuer('1.0.9', '1.0.10'), isFalse);
    expect(versionNeuer('x', '1.0.0'), isFalse);
  });
}
