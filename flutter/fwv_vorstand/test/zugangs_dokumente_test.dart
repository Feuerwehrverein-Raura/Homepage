// Zugangsdokumente im Mitglied-Detail: Datenblatt (setzt ein neues
// Passwort - nur nach Haken), Anmeldebon (Bondrucker), App-QR (Liste nur
// dieses Mitglieds, erstellen zeigt den QR, widerrufen nach Rueckfrage).
// Antworten wie docker/backend-members/src/index.js.

import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:fwv_vorstand/fwv_vorstand.dart';
import 'package:material_ui/material_ui.dart';
import 'package:qr_flutter/qr_flutter.dart';

import 'hilfe.dart';

Map<String, Object?> _mitglied({bool konto = true}) => {
  'id': 'm1',
  'vorname': 'Erika',
  'nachname': 'Muster',
  'email': 'erika@example.ch',
  'status': 'Aktivmitglied',
  'zustellung_email': true,
  'benutzername': 'erika.muster',
  'authentik_user_id': konto ? '42' : null,
};

final _tokens = [
  {
    'id': 't1',
    'member_id': 'm1',
    'description': 'Handy Erika',
    'created_at': '2026-09-01 10:00:00',
    'created_by': 'aktuar@fwv-raura.ch',
    'last_used_at': '2026-10-01 18:00:00',
    'vorname': 'Erika',
    'nachname': 'Muster',
  },
  {
    'id': 't2',
    'member_id': 'm9',
    'description': 'Fremdes Handy',
    'created_at': '2026-09-02 10:00:00',
    'vorname': 'Otto',
    'nachname': 'Alt',
  },
];

void main() {
  test('Login-QR im Format des Datenblatts; SVG ist ein QR', () {
    expect(jsonDecode(loginQrInhalt('fwv-member-abc')), {
      'v': 1,
      'type': 'fwv-member-login',
      'token': 'fwv-member-abc',
    });
    // Die App liest ihn wieder.
    expect(qrLoginCodeLesen(loginQrInhalt('fwv-member-abc')).token, 'fwv-member-abc');
    final svg = qrSvg('hallo');
    expect(svg, startsWith('<svg'));
    expect(svg, contains('<path d="M'));
  });

  test('Datenblatt-HTML: Name, Passwort, beide QR, kein ungeschuetztes HTML', () {
    final html = datenblattHtml(
      const Datenblatt(
        name: 'Erika <Muster>',
        email: 'erika@example.ch',
        passwort: 'FWV-123456',
        token: 'fwv-member-abc',
      ),
    );
    expect(html, contains('Erika &lt;Muster&gt;'));
    expect(html, contains('FWV-123456'));
    expect('<svg'.allMatches(html).length, 2);
    final ohne = datenblattHtml(const Datenblatt(name: 'Otto', token: 'fwv-member-x'));
    expect(ohne, contains('Ohne Vereins-Konto gibt es kein Passwort'));
  });

  group('Detail', () {
    late FalschesBackend backend;
    late bool konto;
    final geteilt = <(String, String, String)>[];

    setUp(() {
      konto = true;
      geteilt.clear();
      backend = FalschesBackend((a) {
        final weg = '${a.method} ${a.url.path}';
        return switch (weg) {
          'GET /members/m1' => _mitglied(konto: konto),
          'GET /members/m1/nextcloud-admin' => {'has_authentik': false},
          'POST /members/m1/datenblatt' => {
            'success': true,
            'name': 'Erika Muster',
            'email': 'erika@example.ch',
            'password': konto ? 'FWV-654321' : null,
            'qr_token': 'fwv-member-xyz',
          },
          'POST /members/m1/anmeldebon' => {
            'success': true,
            'name': 'Erika Muster',
            'umfang': konto ? 'sso' : 'mitgliederbereich',
            'gilt_bis': '2026-10-14T11:30:00.000Z',
          },
          'GET /auth/member/app-tokens' => _tokens,
          'POST /auth/member/app-tokens' => {
            'id': 't3',
            'member_id': 'm1',
            'description': 'Tablet',
            'created_at': '2026-10-14 10:00:00',
            'token': 'fwv-member-neu',
            'member': {'vorname': 'Erika', 'nachname': 'Muster'},
          },
          'DELETE /auth/member/app-tokens/t1' => {'success': true},
          _ => (404, {'error': 'nicht gefunden: $weg'}),
        };
      });
    });

    VorstandDienste dienste() {
      final umgebung = VerwaltungsUmgebung(
        dateiTeilen: (bytes, name, typ, {ursprung}) async =>
            geteilt.add((name, typ, utf8.decode(bytes))),
        fotoWaehlen: ({required bool kamera}) async => Uint8List(0),
        linkOeffnen: (u) async => true,
      );
      return VorstandDienste(
        api: backend.api,
        anlaesse: AnlassVerwaltung(zugang: OrganisatorZugang(backend.api), umgebung: umgebung),
        umgebung: umgebung,
      );
    }

    Future<void> oeffnen(WidgetTester tester, {Size groesse = handy}) async {
      final m = VorstandMitglied.ausJson(_mitglied(konto: konto));
      await zeigen(
        tester,
        MitgliedDetailScreen(dienste: dienste(), mitglied: m),
        groesse: groesse,
      );
      await tester.scrollUntilVisible(
        find.byKey(const Key('zugang-app-qr')),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
    }

    testWidgets('Datenblatt mit Konto: erst nach Haken, zeigt Passwort und QR, teilt HTML', (
      tester,
    ) async {
      await oeffnen(tester);
      await tippen(tester, find.byKey(const Key('zugang-datenblatt')));
      expect(find.textContaining('NEUES Passwort'), findsOneWidget);
      final ja = find.byKey(const Key('bestaetigen-ja'));
      expect(tester.widget<FilledButton>(ja).onPressed, isNull);
      await tippen(tester, imDialog('Abbrechen'));
      expect(backend.aenderungen, isEmpty);

      await tippen(tester, find.byKey(const Key('zugang-datenblatt')));
      await tippen(tester, find.byKey(const Key('bestaetigen-haken')));
      await tippen(tester, ja);
      expect(backend.aenderungen, ['POST /members/m1/datenblatt']);
      expect(find.text('FWV-654321'), findsOneWidget);
      expect(find.byType(QrImageView), findsOneWidget);

      await tippen(tester, find.byKey(const Key('datenblatt-teilen')));
      expect(geteilt, hasLength(1));
      final (name, typ, html) = geteilt.single;
      expect(name, 'login-datenblatt-erika-muster.html');
      expect(typ, 'text/html');
      expect(html, contains('FWV-654321'));
      expect(tester.takeException(), isNull);
    });

    testWidgets('Datenblatt ohne Konto: kein Haken, nur QR', (tester) async {
      konto = false;
      await oeffnen(tester);
      await tippen(tester, find.byKey(const Key('zugang-datenblatt')));
      expect(find.textContaining('kein Login-Konto'), findsOneWidget);
      expect(find.byKey(const Key('bestaetigen-haken')), findsNothing);
      await tippen(tester, find.byKey(const Key('bestaetigen-ja')));
      expect(find.text('Kein Login-Konto – Anmeldung nur mit dem QR-Code.'), findsOneWidget);
    });

    testWidgets('Anmeldebon: Rueckfrage nennt Drucker und Einmal-Code, Ergebnis', (tester) async {
      await oeffnen(tester);
      await tippen(tester, find.byKey(const Key('zugang-anmeldebon')));
      expect(find.textContaining('Bondrucker im Roten Schopf'), findsOneWidget);
      expect(find.textContaining('EINMALIG'), findsOneWidget);
      await tippen(tester, imDialog('Abbrechen'));
      expect(backend.aenderungen, isEmpty);
      await tippen(tester, find.byKey(const Key('zugang-anmeldebon')));
      await tippen(tester, imDialog('Drucken'));
      expect(backend.aenderungen, ['POST /members/m1/anmeldebon']);
      expect(find.textContaining('meldet überall an'), findsOneWidget);
    });

    testWidgets('Anmeldebon: Druckerfehler wird gemeldet', (tester) async {
      await oeffnen(tester);
      backend.antwort = (a) => a.method == 'POST'
          ? (502, {'error': 'Der Bondrucker antwortet nicht: timeout'})
          : _mitglied();
      await tippen(tester, find.byKey(const Key('zugang-anmeldebon')));
      await tippen(tester, imDialog('Drucken'));
      expect(find.text('Der Bondrucker antwortet nicht: timeout'), findsOneWidget);
    });

    testWidgets('App-QR: nur eigene, erstellen zeigt QR, widerrufen', (tester) async {
      await oeffnen(tester);
      await tippen(tester, find.byKey(const Key('zugang-app-qr')));
      expect(find.text('Handy Erika'), findsOneWidget);
      expect(find.text('Fremdes Handy'), findsNothing);
      expect(find.textContaining('zuletzt 01.10.2026'), findsOneWidget);

      await tippen(tester, find.byKey(const Key('app-qr-neu')));
      await tester.enterText(find.byKey(const Key('app-qr-bezeichnung')), 'Tablet');
      await tippen(tester, find.byKey(const Key('app-qr-erstellen')));
      expect(backend.body('POST /auth/member/app-tokens'), {
        'member_id': 'm1',
        'description': 'Tablet',
      });
      // Der gezeigte QR traegt das neue Token im Format, das die App liest.
      final qr = tester.widget<LoginQr>(find.byKey(const Key('app-qr-bild')));
      expect(qrLoginCodeLesen(qr.inhalt).token, 'fwv-member-neu');
      expect(find.byType(QrImageView), findsOneWidget);
      await tippen(tester, find.text('Fertig'));

      await tippen(tester, find.byKey(const Key('app-qr-widerrufen-t1')));
      await tippen(tester, imDialog('Abbrechen'));
      expect(backend.aenderungen.where((w) => w.startsWith('DELETE')), isEmpty);
      await tippen(tester, find.byKey(const Key('app-qr-widerrufen-t1')));
      await tippen(tester, imDialog('Widerrufen'));
      expect(backend.aenderungen.last, 'DELETE /auth/member/app-tokens/t1');
      expect(tester.takeException(), isNull);
    });

    testWidgets('Desktop ohne Ueberlauf', (tester) async {
      await oeffnen(tester, groesse: desktop);
      expect(find.byKey(const Key('zugang-datenblatt')), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });
}
