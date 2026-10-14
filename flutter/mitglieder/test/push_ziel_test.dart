// Wohin das Antippen einer Push-Mitteilung fuehrt (PushZiel.ausDaten,
// Hauptseite): Anlass-Mitteilungen zum Anlass, Profil/Beitraege ins Profil,
// ohne Ziel die Mitteilung als Dialog. Vorstand-Mitteilungen:
// vorstand_push_test.dart. Nachgebautes Backend, kein Netz, kein Firebase.

import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:fwv_mitglieder/anlaesse/anlass_detail_screen.dart';
import 'package:fwv_mitglieder/anmeldung/authentik_anmeldung.dart';
import 'package:fwv_mitglieder/dienste.dart';
import 'package:fwv_mitglieder/einstellungen/kontakte_abgleich.dart';
import 'package:fwv_mitglieder/main.dart';
import 'package:fwv_mitglieder/push/push_dienst.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';

String _jwt(Map<String, Object?> angaben) {
  String teil(Object o) => base64Url.encode(utf8.encode(jsonEncode(o))).replaceAll('=', '');
  return '${teil({'alg': 'RS256', 'typ': 'JWT'})}.${teil(angaben)}.signatur';
}

const _iss = 'https://auth.fwv-raura.ch/application/o/fwv-members-app/';
const _chilbi = '00000000-0000-0000-0000-e00000000001';
const _weg = '00000000-0000-0000-0000-e00000000099';

class _KeinBrowser implements AuthentikAnmeldung {
  @override
  Future<AuthentikTokens?> anmelden() async => null;
}

class _KeineAltdaten implements AltdatenQuelle {
  @override
  Future<Map<String, String>?> lesen() async => null;

  @override
  Future<void> loeschen() async {}
}

void main() {
  group('PushZiel.ausDaten', () {
    test('Anlass-Mitteilungen fuehren zum Anlass', () {
      for (final art in ['event_update', 'shift_reminder']) {
        expect(
          PushZiel.ausDaten({'notificationType': art, 'eventId': _chilbi}),
          const AnlassZiel(_chilbi),
        );
        expect(
          PushZiel.ausDaten({'notificationType': art, 'eventId': _chilbi, 'ziel': 'anlass'}),
          const AnlassZiel(_chilbi),
        );
      }
      // Push an alle mit Ziel Anlass.
      expect(
        PushZiel.ausDaten({'notificationType': 'general', 'ziel': 'anlass', 'eventId': _chilbi}),
        const AnlassZiel(_chilbi),
      );
    });

    test('Profil und Beitraege', () {
      expect(
        PushZiel.ausDaten({'notificationType': 'general', 'ziel': 'profil', 'title': 'Daten'}),
        const ProfilZiel(),
      );
      expect(
        PushZiel.ausDaten({
          'notificationType': 'general',
          'ziel': 'beitraege',
          'year': '2026',
          'title': 'Beitrag 2026 verbucht',
          'body': 'Danke!',
        }),
        const ProfilZiel(beitraege: true, titel: 'Beitrag 2026 verbucht', text: 'Danke!'),
      );
    });

    test('ohne Ziel: die Mitteilung als Dialog', () {
      expect(
        PushZiel.ausDaten({
          'notificationType': 'general',
          'title': 'Übung',
          'body': 'Samstag 9 Uhr',
        }),
        const MitteilungZiel(titel: 'Übung', text: 'Samstag 9 Uhr'),
      );
      // Alte Anlass-Mitteilung ohne eventId, Ziel Anlass ohne eventId,
      // unbekanntes Ziel: ebenfalls der Dialog.
      expect(
        PushZiel.ausDaten({'notificationType': 'event_update', 'title': 'Anmeldung'}),
        const MitteilungZiel(titel: 'Anmeldung', text: ''),
      );
      expect(
        PushZiel.ausDaten({'ziel': 'anlass', 'body': 'Text'}),
        const MitteilungZiel(titel: 'FWV Raura', text: 'Text'),
      );
      expect(
        PushZiel.ausDaten({'ziel': 'lager', 'title': 'Neu', 'body': 'x'}),
        const MitteilungZiel(titel: 'Neu', text: 'x'),
      );
    });

    test('nirgends hin: ohne Text, Schopf-Musik', () {
      expect(PushZiel.ausDaten({}), isNull);
      expect(PushZiel.ausDaten({'notificationType': 'general'}), isNull);
      expect(PushZiel.ausDaten({'notificationType': 'event_update', 'eventId': ''}), isNull);
      expect(
        PushZiel.ausDaten({'notificationType': 'schopf_musik', 'title': 'Im Schopf läuft'}),
        isNull,
      );
    });

    test('mitText: Titel und Text aus notification, Daten gehen vor', () {
      expect(mitText({'eventId': _chilbi}, titel: 'T', text: 'B'), {
        'eventId': _chilbi,
        'title': 'T',
        'body': 'B',
      });
      expect(mitText({'title': 'Daten'}, titel: 'T'), {'title': 'Daten'});
      expect(mitText({'a': '1'}), {'a': '1'});
    });
  });

  final anfragen = <String>[];
  late final client = MockClient((a) async {
    http.Response json(Object? o, [int status = 200]) =>
        http.Response.bytes(utf8.encode(jsonEncode(o)), status);
    final weg = '${a.method} ${a.url.path}';
    anfragen.add(weg);
    return switch (weg) {
      'GET /events' => json([]),
      'GET /events/organized-by-me' => json([]),
      'GET /events/organisator-uebersicht' => json({'zugang': 'organisator', 'anlaesse': []}),
      'GET /events/$_chilbi' => json({'id': _chilbi, 'title': 'Chilbi Raura'}),
      'GET /members/me' => json({'id': 'a1', 'vorname': 'Erika', 'nachname': 'Muster'}),
      _ => json({'error': 'Event not found'}, 404),
    };
  });

  Future<Dienste> dienste(WidgetTester tester, {Kontotyp kontotyp = Kontotyp.mitglied}) async {
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel(KontakteAbgleich.kanalName),
      (_) async => throw MissingPluginException(),
    );
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final roh = SpeicherImArbeitsspeicher();
    final speicher = SitzungsSpeicher(roh);
    await speicher.speichern(
      Sitzung(
        accessToken: _jwt({
          'iss': _iss,
          'sub': 'u1',
          'groups': ['Mitglieder'],
        }),
        refreshToken: 'r',
        kontotyp: kontotyp,
        name: 'Erika Muster',
        eventId: kontotyp == Kontotyp.organisator ? 'e1' : null,
      ),
    );
    return Dienste(
      sitzung: SitzungsVerwaltung(speicher: speicher, http: client),
      authentik: _KeinBrowser(),
      uebernahme: AltdatenUebernahme(quelle: _KeineAltdaten(), speicher: speicher),
      speicher: roh,
      appVersion: () async => '1.0.0 (1)',
      plattform: Plattform.ios,
      roterSchopfTakt: null,
    );
  }

  NavigationBar leiste(WidgetTester tester) => tester.widget(find.byType(NavigationBar));

  String aktiverReiter(WidgetTester tester) {
    final l = leiste(tester);
    return (l.destinations[l.selectedIndex] as NavigationDestination).label;
  }

  testWidgets('Anlass-Mitteilung bei offener App: Reiter Anlaesse und Detailseite', (tester) async {
    final d = await dienste(tester);
    await tester.pumpWidget(FwvApp(dienste: d));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Profil'));
    await tester.pumpAndSettle();
    expect(aktiverReiter(tester), 'Profil');

    d.pushAngetippt({
      'notificationType': 'event_update',
      'eventId': _chilbi,
      'ziel': 'anlass',
      'title': 'Anmeldung bestaetigt: Chilbi Raura',
    });
    await tester.pumpAndSettle();
    expect(find.byType(AnlassDetailScreen), findsOneWidget);
    expect(find.text('Chilbi Raura'), findsWidgets);
    expect(d.pushZiel.value, isNull, reason: 'abgearbeitet');

    // Zurueck: der Reiter Anlaesse ist gewaehlt.
    tester.state<NavigatorState>(find.byType(Navigator).first).pop();
    await tester.pumpAndSettle();
    expect(aktiverReiter(tester), 'Anlässe');
    expect(tester.takeException(), isNull);
  });

  testWidgets('Mit einer Schicht-Erinnerung gestartet: gleich beim Anlass', (tester) async {
    final d = await dienste(tester);
    d.pushAngetippt({'notificationType': 'shift_reminder', 'eventId': _chilbi});
    await tester.pumpWidget(FwvApp(dienste: d));
    await tester.pumpAndSettle();
    expect(find.byType(AnlassDetailScreen), findsOneWidget);
    expect(find.text('Chilbi Raura'), findsWidgets);
    expect(d.pushZiel.value, isNull);
  });

  testWidgets('Anlass gibt es nicht mehr: freundliche Meldung', (tester) async {
    final d = await dienste(tester);
    await tester.pumpWidget(FwvApp(dienste: d));
    await tester.pumpAndSettle();
    d.pushAngetippt({'notificationType': 'event_update', 'eventId': _weg});
    await tester.pumpAndSettle();
    expect(find.byType(AnlassDetailScreen), findsOneWidget);
    expect(find.text('Diesen Anlass gibt es nicht mehr.'), findsOneWidget);
  });

  testWidgets('Beitrag verbucht: Reiter Profil und die Mitteilung', (tester) async {
    final d = await dienste(tester);
    await tester.pumpWidget(FwvApp(dienste: d));
    await tester.pumpAndSettle();
    d.pushAngetippt({
      'notificationType': 'general',
      'ziel': 'beitraege',
      'title': 'Beitrag 2026 verbucht',
      'body': 'Dein Mitgliederbeitrag wurde als bezahlt verbucht. Danke!',
    });
    await tester.pumpAndSettle();
    expect(aktiverReiter(tester), 'Profil');
    expect(find.byKey(const Key('push-mitteilung')), findsOneWidget);
    expect(find.text('Beitrag 2026 verbucht'), findsOneWidget);
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('push-mitteilung')), findsNothing);
  });

  testWidgets('Ziel Profil: nur der Reiter, kein Dialog', (tester) async {
    final d = await dienste(tester);
    d.pushAngetippt({'notificationType': 'general', 'ziel': 'profil', 'title': 'Daten'});
    await tester.pumpWidget(FwvApp(dienste: d));
    await tester.pumpAndSettle();
    expect(aktiverReiter(tester), 'Profil');
    expect(find.byKey(const Key('push-mitteilung')), findsNothing);
  });

  testWidgets('Ohne Ziel: Mitteilung als Dialog, Reiter bleibt', (tester) async {
    final d = await dienste(tester);
    await tester.pumpWidget(FwvApp(dienste: d));
    await tester.pumpAndSettle();
    d.pushAngetippt({
      'notificationType': 'general',
      'title': 'Übung am Samstag',
      'body': 'Treffpunkt 9 Uhr Magazin.',
    });
    await tester.pumpAndSettle();
    expect(aktiverReiter(tester), 'Anlässe');
    expect(find.text('Übung am Samstag'), findsOneWidget);
    expect(find.text('Treffpunkt 9 Uhr Magazin.'), findsOneWidget);
    expect(d.pushZiel.value, isNull);
  });

  testWidgets('Externer Organisator: Anlass ja, Profil nur als Mitteilung', (tester) async {
    final d = await dienste(tester, kontotyp: Kontotyp.organisator);
    await tester.pumpWidget(FwvApp(dienste: d));
    await tester.pumpAndSettle();
    expect(aktiverReiter(tester), 'Organisator');

    d.pushAngetippt({
      'notificationType': 'general',
      'ziel': 'beitraege',
      'title': 'Beitrag offen',
      'body': 'Bitte begleichen.',
    });
    await tester.pumpAndSettle();
    expect(aktiverReiter(tester), 'Organisator', reason: 'kein Reiter Profil');
    expect(find.text('Beitrag offen'), findsOneWidget);
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();

    d.pushAngetippt({'notificationType': 'event_update', 'eventId': _chilbi});
    await tester.pumpAndSettle();
    expect(find.byType(AnlassDetailScreen), findsOneWidget);
    tester.state<NavigatorState>(find.byType(Navigator).first).pop();
    await tester.pumpAndSettle();
    expect(aktiverReiter(tester), 'Anlässe');
    expect(tester.takeException(), isNull);
  });
}
