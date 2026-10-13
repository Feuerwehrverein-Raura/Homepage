// Profil, Einstellungen, Zugaenge, Benachrichtigungen, Push-Abmeldung und
// Organisator-Reiter mit nachgebautem Backend — keine echten Konten, kein
// Netz, kein Firebase.

import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:fwv_mitglieder/anmeldung/authentik_anmeldung.dart';
import 'package:fwv_mitglieder/dienste.dart';
import 'package:fwv_mitglieder/einstellungen/kontakte_abgleich.dart';
import 'package:fwv_mitglieder/main.dart';
import 'package:fwv_mitglieder/push/push_dienst.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';

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

class _FalschePush implements PushDienst {
  bool verworfen = false;
  int erlaubnisGefragt = 0;

  @override
  Future<void> starten() async {}

  @override
  bool get verfuegbar => true;

  @override
  set beiNeuemToken(void Function(String token)? rueckruf) {}

  @override
  Future<String?> token() async => verworfen ? null : 'fcm-1';

  @override
  Future<PushErlaubnis> erlaubnis() async => PushErlaubnis.erlaubt;

  @override
  Future<PushErlaubnis> erlaubnisAnfragen() async {
    erlaubnisGefragt++;
    return PushErlaubnis.erlaubt;
  }

  @override
  Future<void> tokenVerwerfen() async => verworfen = true;

  @override
  String get plattform => 'android';
}

/// Nachgebautes backend-members / api-dispatch / api-events.
class _Backend {
  Map<String, Object?> profil = {
    'id': 'a1',
    'anrede': 'Frau',
    'vorname': 'Erika',
    'nachname': 'Muster',
    'email': 'erika@example.ch',
    'mobile': '+41 79 000 00 00',
    'strasse': 'Weg 1',
    'plz': '4303',
    'ort': 'Kaiseraugst',
    'funktion': 'Kassier',
    'geburtstag': '1990-05-04',
    'foto': '/uploads/photo-1.jpg',
  };
  List<Map<String, Object?>> prefs = [];
  List<Object> organisiert = [];
  bool newsletterOk = true;
  bool darfSteuern = false;
  List<Map<String, Object?>> vpn = [
    {'name': 'ma1b2c3d4-laptop', 'geraet': 'laptop', 'adresse': '10.20.0.7', 'zuletzt': null},
  ];
  final anfragen = <(String, String, Object?)>[];

  Object? letzter(String methode, String pfad) =>
      anfragen.lastWhere((a) => a.$1 == methode && a.$2 == pfad).$3;

  bool gab(String methode, String pfad) => anfragen.any((a) => a.$1 == methode && a.$2 == pfad);

  late final client = MockClient((a) async {
    final body = a.body.isEmpty ? null : jsonDecode(a.body);
    anfragen.add((a.method, a.url.path, body));
    http.Response json(Object? o, [int status = 200]) =>
        http.Response.bytes(utf8.encode(jsonEncode(o)), status);
    switch ('${a.method} ${a.url.path}') {
      case 'GET /members/me':
        return json(profil);
      case 'PUT /members/me':
        profil = {...profil, ...(body as Map).cast<String, Object?>()};
        return json(profil);
      case 'POST /members/me/austritt':
        return json({
          'success': true,
          'message': 'Austritts-Antrag wurde an den Vorstand gesendet.',
        });
      case 'GET /members/me/notifications':
        return json(prefs);
      case 'GET /members/me/vpn':
        return json(vpn);
      case 'POST /members/me/vpn':
        return json({
          'name': 'ma1b2c3d4-handy',
          'geraet': (body as Map)['geraet'],
          'adresse': '10.20.0.8',
          'konfiguration': '[Interface]\nPrivateKey = fake\n',
        }, 201);
      case 'DELETE /members/me/vpn/ma1b2c3d4-laptop':
        vpn = [];
        return json({'success': true});
      case 'GET /members/me/bildschirm':
        return json({
          'schauen': {'url': '/bildschirm/vnc.html?autoconnect=true&password=s'},
          'steuern': darfSteuern
              ? {'url': '/bildschirm-steuern/vnc.html?autoconnect=true&password=t'}
              : null,
        });
      case 'GET /kiosk/playlists':
        return json([
          {'id': 'p1', 'name': 'Chilbi Abend', 'anzahl': 12, 'erstellt_von_name': 'Erika Muster'},
        ]);
      case 'PUT /members/me/notifications':
        prefs = ((body as Map)['preferences'] as List).cast<Map<String, Object?>>();
        return json(prefs);
      case 'GET /members/me/accesses':
        return json({
          'functionEmails': [
            {
              'function': 'Kassier',
              'email': 'kassier@fwv-raura.ch',
              'password': 'Fake-Passwort-123',
              'server': 'mail.example.net',
              'imapPort': 993,
              'smtpPort': 587,
            },
          ],
          'nextcloudFolders': [
            {'id': 1, 'name': 'Vorstand'},
          ],
          'systemAccesses': [
            {'system': 'Website', 'url': 'https://fwv-raura.ch', 'access': 'Mitglied'},
          ],
          'serviceAccounts': [],
        });
      case 'PUT /members/me/function-email-password':
        return json({'success': true, 'message': 'Passwort erfolgreich geändert'});
      case 'POST /members/me/fcm-token':
      case 'DELETE /members/me/fcm-token':
        return json({'success': true});
      case 'POST /newsletter/subscribe':
      case 'POST /newsletter/unsubscribe':
        return newsletterOk
            ? json({'success': true, 'message': 'Bitte die E-Mail bestätigen.'})
            : json({'success': false, 'message': 'Ungültige E-Mail-Adresse'}, 400);
      case 'GET /events/organized-by-me':
        return json(organisiert);
      case 'GET /events/organisator-uebersicht':
        return json({
          'zugang': 'mitglied',
          'anlaesse': [
            for (final a in organisiert)
              {
                ...(a as Map),
                'app': {'datum_text': 'Samstag, 17. Oktober 2026'},
                'organisator': {
                  'aktuell': true,
                  'zahlen': {'offen': 1, 'text': '1 offen · 1 Person'},
                },
              },
          ],
        });
      case 'GET /events':
      case 'GET /registrations/mine':
        return json([]);
    }
    return json({'error': 'nicht gefunden'}, 404);
  });
}

void main() {
  late _Backend backend;
  late SpeicherImArbeitsspeicher roh;
  late _FalschePush push;
  late List<Uri> geoeffnet;
  late List<(String, String)> geteilt;

  setUp(() {
    backend = _Backend();
    roh = SpeicherImArbeitsspeicher();
    push = _FalschePush();
    geoeffnet = [];
    geteilt = [];
  });

  /// Angemeldetes Mitglied, Handy-Bildschirm (360 x 800).
  Future<Dienste> starten(
    WidgetTester tester, {
    Plattform plattform = Plattform.android,
    KontakteAbgleich kontakte = const KontakteAbgleich(),
  }) async {
    // Ohne nativen Kontakt-Abgleich (wie heute): der Kanal meldet
    // MissingPluginException — sofort, nicht erst ueber die echte Engine.
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel(KontakteAbgleich.kanalName),
      (_) async => throw MissingPluginException(),
    );
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);

    final speicher = SitzungsSpeicher(roh);
    await speicher.speichern(
      const Sitzung(
        accessToken: 'jwt',
        kontotyp: Kontotyp.mitglied,
        name: 'Erika Muster',
        email: 'erika@example.ch',
      ),
    );
    late final Dienste d;
    d = Dienste(
      sitzung: SitzungsVerwaltung(
        speicher: speicher,
        http: backend.client,
        beimAbmelden: (api) => abmeldenAufraeumen(api, d),
      ),
      authentik: _KeinBrowser(),
      uebernahme: AltdatenUebernahme(quelle: _KeineAltdaten(), speicher: speicher),
      speicher: roh,
      push: push,
      kontakte: kontakte,
      appVersion: () async => '1.2.3 (45)',
      linkOeffnen: (u) async {
        geoeffnet.add(u);
        return true;
      },
      dateiTeilen: (bytes, name, typ, {ursprung}) async => geteilt.add((name, utf8.decode(bytes))),
      plattform: plattform,
    );
    await tester.pumpWidget(FwvApp(dienste: d));
    await tester.pumpAndSettle();
    return d;
  }

  Future<void> reiter(WidgetTester tester, String name) async {
    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text(name)));
    await tester.pumpAndSettle();
  }

  /// Scrollt die sichtbare Liste, bis [f] gebaut und zu sehen ist.
  Future<void> sichtbar(WidgetTester tester, Finder f) async {
    if (f.evaluate().isEmpty) {
      await tester.scrollUntilVisible(
        f,
        200,
        scrollable: find.byType(Scrollable).hitTestable().first,
      );
    }
    await tester.ensureVisible(f);
    await tester.pumpAndSettle();
  }

  Future<void> tippen(WidgetTester tester, Finder f) async {
    await sichtbar(tester, f);
    await tester.tap(f);
    await tester.pumpAndSettle();
  }

  group('Profil', () {
    testWidgets('zeigt Name, Funktion, Kontakt, Adresse und Foto', (tester) async {
      await starten(tester);
      await reiter(tester, 'Profil');

      expect(find.text('Erika Muster'), findsOneWidget);
      expect(find.text('Kassier'), findsOneWidget);
      expect(find.text('+41 79 000 00 00'), findsOneWidget);
      expect(find.text('Weg 1\n4303 Kaiseraugst'), findsOneWidget);
      expect(find.text('04.05.1990'), findsOneWidget);
      // Relativer Foto-Pfad wird gegen die API aufgeloest.
      final foto = tester.widget<Image>(find.byType(Image).first);
      expect((foto.image as NetworkImage).url, 'https://api.fwv-raura.ch/uploads/photo-1.jpg');
      expect((foto.image as NetworkImage).headers, {'Authorization': 'Bearer jwt'});
    });

    testWidgets('Bearbeiten prueft Pflichtfelder und E-Mail', (tester) async {
      await starten(tester);
      await reiter(tester, 'Profil');
      await tippen(tester, find.byTooltip('Profil bearbeiten'));

      await tester.enterText(find.widgetWithText(TextFormField, 'Vorname *'), '  ');
      await tester.enterText(find.widgetWithText(TextFormField, 'E-Mail *'), 'keine-mail');
      await tester.enterText(find.widgetWithText(TextFormField, 'PLZ'), '!');
      await tester.tap(find.byKey(const Key('profil-speichern')));
      await tester.pumpAndSettle();

      expect(find.text('Bitte Vorname angeben.'), findsOneWidget);
      expect(find.text('Bitte eine gültige E-Mail-Adresse angeben.'), findsOneWidget);
      expect(find.text('Ungültige PLZ.'), findsOneWidget);
      expect(backend.gab('PUT', '/members/me'), isFalse);
    });

    testWidgets('Bearbeiten: Geburtstag aus dem Datumswaehler, Speichern', (tester) async {
      await starten(tester);
      await reiter(tester, 'Profil');
      await tippen(tester, find.byTooltip('Profil bearbeiten'));

      expect(find.text('04.05.1990'), findsOneWidget);
      await tippen(tester, find.byKey(const Key('geburtstag')));
      await tester.tap(find.text('15'));
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
      expect(find.text('15.05.1990'), findsOneWidget);

      await tester.enterText(find.widgetWithText(TextFormField, 'Telefon'), '061 811 00 00');
      await tester.enterText(find.widgetWithText(TextFormField, 'Mobile'), '');
      await tester.tap(find.byKey(const Key('profil-speichern')));
      await tester.pumpAndSettle();

      final b = backend.letzter('PUT', '/members/me') as Map;
      expect(b['geburtstag'], '1990-05-15');
      expect(b['telefon'], '061 811 00 00');
      expect(b['mobile'], isNull, reason: 'leeres Feld loescht den Eintrag');
      expect(b['anrede'], 'Frau');
      expect(
        b.keys,
        containsAll(['vorname', 'nachname', 'email', 'strasse', 'plz', 'ort', 'iban']),
      );
      // Zurueck im Profil, neu geladen.
      expect(find.text('Profil gespeichert'), findsOneWidget);
      expect(find.text('15.05.1990'), findsOneWidget);
    });

    testWidgets(
      'IBAN: falsche Pruefziffer abgewiesen, richtige in Vierergruppen gespeichert und gezeigt',
      (tester) async {
        await starten(tester);
        await reiter(tester, 'Profil');
        await tippen(tester, find.byTooltip('Profil bearbeiten'));
        final feld = find.widgetWithText(TextFormField, 'IBAN (für Rückerstattungen)');
        await tester.ensureVisible(feld);
        await tester.pumpAndSettle();
        await tester.enterText(feld, 'CH93 0076 2011 6238 5295 8');
        await tester.tap(find.byKey(const Key('profil-speichern')));
        await tester.pumpAndSettle();
        expect(
          find.text('Diese IBAN stimmt nicht – bitte Zeichen und Prüfziffer kontrollieren.'),
          findsOneWidget,
        );
        expect(backend.gab('PUT', '/members/me'), isFalse);

        await tester.enterText(feld, 'ch9300762011623852957');
        await tester.tap(find.byKey(const Key('profil-speichern')));
        await tester.pumpAndSettle();
        final b = backend.letzter('PUT', '/members/me') as Map;
        expect(b['iban'], 'CH93 0076 2011 6238 5295 7');
        await tester.ensureVisible(find.text('CH93 0076 2011 6238 5295 7'));
        expect(find.text('CH93 0076 2011 6238 5295 7'), findsOneWidget);
      },
    );

    testWidgets('Austritt: Bestaetigung, Antrag, danach abgemeldet', (tester) async {
      await starten(tester);
      await reiter(tester, 'Profil');
      await tippen(tester, find.text('Austritt beantragen'));

      await tester.enterText(find.widgetWithText(TextField, 'Begründung (optional)'), 'Umzug');
      await tippen(tester, find.widgetWithText(FilledButton, 'Austritt beantragen'));
      expect(find.text('Austritt beantragen?'), findsOneWidget);
      await tippen(tester, find.text('Antrag senden'));

      expect(backend.letzter('POST', '/members/me/austritt'), {'reason': 'Umzug'});
      expect(find.text('Austritts-Antrag gesendet'), findsOneWidget);
      await tippen(tester, find.text('OK'));

      expect(find.text('Mit Vereinskonto anmelden'), findsOneWidget);
      expect(roh.werte.containsKey('auth_token'), isFalse);
    });

    testWidgets('Meine Anmeldungen ist erreichbar', (tester) async {
      await starten(tester);
      await reiter(tester, 'Profil');
      await tippen(tester, find.text('Meine Anmeldungen'));
      expect(find.text('Du hast dich noch für keinen Anlass angemeldet.'), findsOneWidget);
    });
  });

  group('Push', () {
    testWidgets('Token beim Start anmelden, beim Abmelden abmelden', (tester) async {
      await starten(tester);

      final an = backend.letzter('POST', '/members/me/fcm-token') as Map;
      expect(an['token'], 'fcm-1');
      expect(an['platform'], 'android');
      expect(an['device_id'], roh.werte['geraete_id']);
      expect(an['device_id'], isNotEmpty);

      await reiter(tester, 'Mehr');
      await tippen(tester, find.text('Abmelden'));

      expect(backend.letzter('DELETE', '/members/me/fcm-token'), {'token': 'fcm-1'});
      expect(push.verworfen, isTrue);
      expect(find.text('Mit Vereinskonto anmelden'), findsOneWidget);
      // Die Geraete-Kennung ueberdauert das Abmelden.
      expect(roh.werte['geraete_id'], an['device_id']);
    });
  });

  group('Einstellungen', () {
    testWidgets('VPN: Geraete sehen, Zugang anlegen und an WireGuard geben, entfernen', (
      tester,
    ) async {
      await starten(tester);
      await reiter(tester, 'Profil');
      await tippen(tester, find.text('VPN-Zugang'));
      expect(find.text('laptop'), findsOneWidget);
      expect(find.text('10.20.0.7 · noch nie verbunden'), findsOneWidget);

      await tester.enterText(
        find.widgetWithText(TextField, 'Gerätename, z.B. handy'),
        'Mein Handy!',
      );
      await tippen(tester, find.text('Zugang erstellen'));
      expect(backend.letzter('POST', '/members/me/vpn'), {'geraet': 'mein-handy'});
      expect(find.text('Jetzt einrichten: „mein-handy“'), findsOneWidget);
      await tippen(tester, find.text('In WireGuard öffnen'));
      expect(geteilt.single.$1, 'fwv-mein-handy.conf');
      expect(geteilt.single.$2, contains('PrivateKey'));

      await tippen(tester, find.byTooltip('Entfernen'));
      await tippen(tester, find.widgetWithText(FilledButton, 'Entfernen'));
      expect(backend.gab('DELETE', '/members/me/vpn/ma1b2c3d4-laptop'), isTrue);
      expect(find.text('Noch kein Gerät verbunden.'), findsOneWidget);
    });

    testWidgets('Bildschirm: Mitglied schaut direkt, Vorstand waehlt Ansehen oder Steuern', (
      tester,
    ) async {
      await starten(tester);
      await reiter(tester, 'Mehr');
      await tester.ensureVisible(find.text('Bildschirm Roter Schopf'));
      await tippen(tester, find.text('Bildschirm Roter Schopf'));
      expect(
        geoeffnet.single.toString(),
        'https://www.fwv-raura.ch/bildschirm/vnc.html?autoconnect=true&password=s',
      );

      backend.darfSteuern = true;
      await tippen(tester, find.text('Bildschirm Roter Schopf'));
      await tippen(tester, find.text('Steuern'));
      expect(
        geoeffnet.last.toString(),
        'https://www.fwv-raura.ch/bildschirm-steuern/vnc.html?autoconnect=true&password=t',
      );
    });

    testWidgets('Musik: Playlists von api-members', (tester) async {
      await starten(tester);
      await reiter(tester, 'Mehr');
      await tester.ensureVisible(find.widgetWithText(ListTile, 'Musik'));
      await tippen(tester, find.widgetWithText(ListTile, 'Musik'));
      expect(find.text('Chilbi Abend'), findsOneWidget);
      expect(find.text('12 Titel · von Erika Muster'), findsOneWidget);
      expect(backend.gab('GET', '/kiosk/playlists'), isTrue);
    });

    testWidgets('Version, Newsletter an (lokal gemerkt)', (tester) async {
      await starten(tester);
      await reiter(tester, 'Mehr');
      await tippen(tester, find.byKey(const Key('newsletter')));
      expect(backend.letzter('POST', '/newsletter/subscribe'), {'email': 'erika@example.ch'});
      expect(roh.werte['newsletter_abonniert'], 'true');
      expect(tester.widget<SwitchListTile>(find.byKey(const Key('newsletter'))).value, isTrue);
      // Unter "Hilfe" ganz unten.
      await sichtbar(tester, find.text('1.2.3 (45)'));
    });

    testWidgets('Newsletter: Fehler setzt den Schalter zurueck', (tester) async {
      backend.newsletterOk = false;
      await starten(tester);
      await reiter(tester, 'Mehr');
      await tippen(tester, find.byKey(const Key('newsletter')));
      expect(tester.widget<SwitchListTile>(find.byKey(const Key('newsletter'))).value, isFalse);
      expect(find.textContaining('Ungültige E-Mail-Adresse'), findsOneWidget);
      expect(roh.werte.containsKey('newsletter_abonniert'), isFalse);
    });

    testWidgets('Android: Kontakt-Abgleich ohne nativen Teil', (tester) async {
      await starten(tester);
      await reiter(tester, 'Mehr');
      await sichtbar(tester, find.byKey(const Key('kontakte-nicht-verfuegbar')));
      expect(find.text('In dieser Version noch nicht verfügbar.'), findsOneWidget);
    });

    testWidgets('Android: Kontakt-Abgleich ueber den Kanal', (tester) async {
      const kanal = MethodChannel('test/kontakte');
      final aufrufe = <String>[];
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(kanal, (c) async {
        aufrufe.add(c.method);
        return switch (c.method) {
          'status' => true,
          'wiederherstellen' => 3,
          _ => null,
        };
      });
      addTearDown(
        () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(kanal, null),
      );

      await starten(tester, kontakte: const KontakteAbgleich(kanal));
      await reiter(tester, 'Mehr');
      await tippen(tester, find.text('Jetzt abgleichen'));
      await tippen(tester, find.text('Gelöschte wiederherstellen'));
      expect(find.text('3 gelöschte Mitglieder werden wiederhergestellt.'), findsOneWidget);
      await tippen(tester, find.byKey(const Key('kontakte')));
      // "token" beim Start, "status" fuer die Frage nach dem Login (Abgleich
      // schon an: keine Frage) und beim Oeffnen der Einstellungen.
      expect(aufrufe.where((m) => m != 'token'), [
        'status',
        'status',
        'jetztAbgleichen',
        'wiederherstellen',
        'deaktivieren',
      ]);
      expect(roh.werte['contacts_sync_asked'], 'true');
      expect(find.text('Jetzt abgleichen'), findsNothing);
    });

    testWidgets('iOS: CardDAV-Profil oeffnen', (tester) async {
      await starten(tester, plattform: Plattform.ios);
      await reiter(tester, 'Mehr');
      expect(find.text('Kontakte abgleichen'), findsNothing);
      await tippen(tester, find.text('Mitglieder-Adressbuch einrichten'));
      await tippen(tester, find.text('Profil installieren'));
      expect(geoeffnet, [Uri.parse('https://www.fwv-raura.ch/carddav.mobileconfig')]);
    });

    testWidgets('Hilfe: die vier Anleitungen der Website', (tester) async {
      await starten(tester);
      await reiter(tester, 'Mehr');
      for (final (titel, seite) in [
        ('Anleitung App', 'anleitung-app.html'),
        ('Anleitung Website', 'anleitung-website.html'),
        ('Passwort setzen', 'anleitung-passwort.html'),
        ('Anleitung Cloud', 'anleitung-nextcloud.html'),
      ]) {
        await tippen(tester, find.text(titel));
        expect(geoeffnet.last, Uri.parse('https://www.fwv-raura.ch/$seite'));
      }
    });

    testWidgets('Benachrichtigungen: Schalter speichert alle Arten', (tester) async {
      backend.prefs = [
        {'notification_type': 'general', 'enabled': false},
      ];
      await starten(tester);
      await reiter(tester, 'Profil');
      await tippen(tester, find.text('Benachrichtigungen'));

      SwitchListTile schalter(String art) =>
          tester.widget<SwitchListTile>(find.byKey(Key('art-$art')));
      expect(schalter('general').value, isFalse);
      expect(schalter('shift_reminder').value, isTrue);

      await tippen(tester, find.byKey(const Key('art-newsletter')));
      final b = backend.letzter('PUT', '/members/me/notifications') as Map;
      final arten = {
        for (final p in (b['preferences'] as List).cast<Map>())
          p['notification_type']: p['enabled'],
      };
      expect(arten, {
        'shift_reminder': true,
        'event_update': true,
        'newsletter': false,
        'general': false,
      });
      expect(schalter('newsletter').value, isFalse);
      expect(find.text('Mitteilungen auf diesem Gerät erlaubt'), findsOneWidget);
    });

    testWidgets('Zugaenge: Passwort verdeckt, kopieren, aendern (min. 12)', (tester) async {
      final kopiert = <String>[];
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (
        c,
      ) async {
        if (c.method == 'Clipboard.setData') kopiert.add((c.arguments as Map)['text'] as String);
        return null;
      });
      addTearDown(
        () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          SystemChannels.platform,
          null,
        ),
      );

      await starten(tester);
      await reiter(tester, 'Profil');
      await tippen(tester, find.text('Zugänge'));

      expect(find.text('kassier@fwv-raura.ch'), findsOneWidget);
      expect(find.text('Vorstand'), findsOneWidget);
      expect(find.text('Fake-Passwort-123'), findsNothing);
      expect(find.text('••••••••••'), findsOneWidget);

      await tippen(tester, find.byTooltip('Passwort kopieren'));
      expect(kopiert, ['Fake-Passwort-123']);
      await tippen(tester, find.byTooltip('Anzeigen'));
      expect(find.text('Fake-Passwort-123'), findsOneWidget);

      await tippen(tester, find.text('Website'));
      expect(geoeffnet, [Uri.parse('https://fwv-raura.ch')]);

      // Die Meldung "Passwort kopiert" verschwindet, sonst liegt sie ueber
      // dem Knopf unten.
      await tester.pump(const Duration(seconds: 5));
      await tester.pumpAndSettle();
      await tippen(tester, find.text('Passwort ändern'));
      await tester.enterText(find.widgetWithText(TextFormField, 'Neues Passwort'), 'zu-kurz');
      await tester.enterText(find.widgetWithText(TextFormField, 'Wiederholen'), 'zu-kurz');
      await tippen(tester, find.text('Passwort setzen'));
      expect(find.text('Mindestens 12 Zeichen.'), findsOneWidget);
      expect(backend.gab('PUT', '/members/me/function-email-password'), isFalse);

      await tester.enterText(
        find.widgetWithText(TextFormField, 'Neues Passwort'),
        'lang-genug-fake-1',
      );
      await tester.enterText(find.widgetWithText(TextFormField, 'Wiederholen'), 'anders');
      await tippen(tester, find.text('Passwort setzen'));
      expect(find.text('Die Wiederholung stimmt nicht überein.'), findsOneWidget);

      await tester.enterText(
        find.widgetWithText(TextFormField, 'Wiederholen'),
        'lang-genug-fake-1',
      );
      await tippen(tester, find.text('Passwort setzen'));
      expect(backend.letzter('PUT', '/members/me/function-email-password'), {
        'email': 'kassier@fwv-raura.ch',
        'password': 'lang-genug-fake-1',
      });
      expect(find.text('Zugänge'), findsOneWidget);
    });
  });

  group('Kontakt-Abgleich (Android)', () {
    const kanal = MethodChannel('test/kontakte2');
    late List<MethodCall> aufrufe;
    late bool aktiv;

    void kanalNachbauen(WidgetTester tester) {
      aufrufe = [];
      aktiv = false;
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(kanal, (c) async {
        aufrufe.add(c);
        switch (c.method) {
          case 'status':
            return aktiv;
          case 'aktivieren':
            aktiv = true;
            return true;
          case 'deaktivieren':
            aktiv = false;
        }
        return null;
      });
      addTearDown(
        () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(kanal, null),
      );
    }

    List<Object?> tokens() => [
      for (final c in aufrufe)
        if (c.method == 'token') (c.arguments as Map)['token'],
    ];

    testWidgets('Token beim Start, null beim Abmelden; Frage danach wieder offen', (tester) async {
      kanalNachbauen(tester);
      await roh.schreiben('contacts_sync_asked', 'true');
      await starten(tester, kontakte: const KontakteAbgleich(kanal));
      expect(tokens(), ['jwt']);
      expect(find.text('Mitglieder ins Adressbuch übernehmen?'), findsNothing);

      await reiter(tester, 'Mehr');
      await tippen(tester, find.text('Abmelden'));
      expect(tokens(), ['jwt', null]);
      final namen = aufrufe.map((c) => c.method).toList();
      expect(namen.indexOf('deaktivieren'), lessThan(namen.lastIndexOf('token')));
      expect(roh.werte.containsKey('contacts_sync_asked'), isFalse);
    });

    testWidgets('einmalige Frage nach dem Login: Ja schaltet ein', (tester) async {
      kanalNachbauen(tester);
      await starten(tester, kontakte: const KontakteAbgleich(kanal));
      expect(find.text('Mitglieder ins Adressbuch übernehmen?'), findsOneWidget);
      await tester.tap(find.text('Ja, übernehmen'));
      await tester.pumpAndSettle();
      expect(aufrufe.map((c) => c.method), contains('aktivieren'));
      expect(roh.werte['contacts_sync_asked'], 'true');
      expect(find.text('Mitglieder werden ins Adressbuch übernommen.'), findsOneWidget);

      // Einstellungen zeigen den Abgleich als eingeschaltet.
      await reiter(tester, 'Mehr');
      await sichtbar(tester, find.byKey(const Key('kontakte')));
      expect(tester.widget<SwitchListTile>(find.byKey(const Key('kontakte'))).value, isTrue);
    });

    testWidgets('Nein wird gemerkt, keine zweite Frage', (tester) async {
      kanalNachbauen(tester);
      await starten(tester, kontakte: const KontakteAbgleich(kanal));
      await tester.tap(find.text('Nein, danke'));
      await tester.pumpAndSettle();
      expect(aufrufe.map((c) => c.method), isNot(contains('aktivieren')));
      expect(roh.werte['contacts_sync_asked'], 'true');
    });

    testWidgets('iOS: keine Frage, kein Token an den Kanal', (tester) async {
      kanalNachbauen(tester);
      await starten(tester, plattform: Plattform.ios, kontakte: const KontakteAbgleich(kanal));
      expect(find.text('Mitglieder ins Adressbuch übernehmen?'), findsNothing);
      expect(aufrufe, isEmpty);
    });
  });

  testWidgets('schmales Handy im Dunkelmodus: bleibt hell, nichts laeuft ueber', (tester) async {
    await starten(tester);
    // 320 x 640 Punkte, System dunkel. Die App bleibt hell wie die alte
    // (kein dunkler Modus). Ueberlaeufe wuerden den Test scheitern lassen.
    tester.view.physicalSize = const Size(640, 1280);
    tester.view.devicePixelRatio = 2;
    tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
    addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
    await tester.pumpAndSettle();

    expect(Theme.of(tester.element(find.byType(NavigationBar))).brightness, Brightness.light);
    await reiter(tester, 'Profil');
    await tippen(tester, find.byTooltip('Profil bearbeiten'));
    await tester.tap(find.byTooltip('Zurück'));
    await tester.pumpAndSettle();
    await reiter(tester, 'Profil');
    await tippen(tester, find.text('Zugänge'));
    await tippen(tester, find.text('Passwort ändern'));
    expect(tester.takeException(), isNull);
  });

  group('Organisator-Reiter', () {
    testWidgets('erscheint nur, wenn das Mitglied Anlaesse organisiert', (tester) async {
      backend.organisiert = [
        {'id': 'e1', 'title': 'Grillfest'},
      ];
      await starten(tester);
      expect(
        find.descendant(of: find.byType(NavigationBar), matching: find.text('Organisator')),
        findsOneWidget,
      );
      await reiter(tester, 'Organisator');
      expect(find.text('Grillfest'), findsOneWidget);
      expect(find.text('1 offen · 1 Person'), findsOneWidget);
    });

    testWidgets('fehlt ohne eigene Anlaesse', (tester) async {
      await starten(tester);
      expect(backend.gab('GET', '/events/organized-by-me'), isTrue);
      expect(find.text('Organisator'), findsNothing);
      expect(find.text('Zurzeit sind keine Anlässe geplant.'), findsOneWidget);
    });
  });
}
