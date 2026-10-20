// Anlaesse, Kalender, Detail, Anmelden, Arbeitsplan, Meine Anmeldungen und
// Vorschlagen gegen ein nachgebautes backend-events. Die Antworten sind die
// Vertragsdateien aus docker/backend-events/test/fixtures/ (aus dem Repo
// gelesen, nie kopiert) — keine echten Konten, kein Netz.

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:fwv_mitglieder/dienste.dart';
import 'package:fwv_mitglieder/einstellungen/kontakte_abgleich.dart';
import 'package:fwv_mitglieder/main.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';

Object? _vertrag(String name) {
  var dir = Directory.current;
  while (true) {
    final f = File('${dir.path}/docker/backend-events/test/fixtures/$name');
    if (f.existsSync()) return jsonDecode(f.readAsStringSync());
    if (dir.parent.path == dir.path) throw StateError('Vertragsdatei $name nicht gefunden');
    dir = dir.parent;
  }
}

const _chilbi = '00000000-0000-0000-0000-e00000000001';
const _ausflug = '00000000-0000-0000-0000-e00000000002';
const _markt = '00000000-0000-0000-0000-e00000000007';

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

/// Nachgebautes backend-events (+ members/me fuers Vorbelegen).
class _Backend {
  final anlaesse = (_vertrag('anlaesse-app.json') as List).cast<Map<String, dynamic>>();
  final kalender = _vertrag('kalender-app.json');
  final meine = _vertrag('meine-anmeldungen.json');
  final arbeitsplan = _vertrag('arbeitsplan.json');

  /// Felder, die nur die Detailansicht liest (nicht im Listen-Vertrag).
  final detailExtras = <String, Map<String, Object?>>{
    _chilbi: {
      'subtitle': 'Das Dorffest',
      'description': 'Wir brauchen viele Helfer.',
      'cost': 'gratis',
      'organizer_name': 'Hans Helfer',
    },
  };
  var kannBearbeiten = false;
  http.Response Function()? anmeldeAntwort;

  /// Haelt die Antwort auf die Anmeldung zurueck, bis der Test sie freigibt.
  Completer<void>? anmeldungHalten;
  final anfragen = <http.Request>[];

  Object? letzterBody(String methode, String pfad) {
    final a = anfragen.lastWhere((a) => a.method == methode && a.url.path == pfad);
    return a.body.isEmpty ? null : jsonDecode(a.body);
  }

  int zaehle(String methode, String pfad) =>
      anfragen.where((a) => a.method == methode && a.url.path == pfad).length;

  late final client = MockClient((a) async {
    anfragen.add(a);
    http.Response json(Object? o, [int status = 200]) =>
        http.Response.bytes(utf8.encode(jsonEncode(o)), status);
    final pfad = a.url.path;
    final teile = pfad.split('/');
    switch ('${a.method} $pfad') {
      case 'GET /events':
        return json(anlaesse);
      case 'GET /events/organized-by-me':
        return json([]);
      case 'GET /calendar/items':
        return json(kalender);
      case 'GET /registrations/mine':
        return json(meine);
      case 'GET /members/me':
        return json({
          'id': 'a1',
          'vorname': 'Erika',
          'nachname': 'Muster',
          'email': 'erika@example.ch',
          'mobile': '+41 79 000 00 00',
        });
      case 'POST /registrations/public':
        await anmeldungHalten?.future;
        return anmeldeAntwort?.call() ??
            json({
              'success': true,
              'message': 'Anmeldung erfolgreich (als Mitglied verknüpft)',
              'registrationId': 'r1',
              'isMember': true,
            });
      case 'GET /event-optionen':
        return json({
          'kategorien': ['Dorffest', 'Ausflug', 'Sonstiges'],
          'anmeldepflichtige_kategorien': ['Dorffest'],
          'bereiche': [],
        });
      case 'POST /events/propose':
        return json({'id': 'neu', 'status': 'proposed'}, 201);
    }
    if (a.method == 'GET' && teile.length == 3 && teile[1] == 'events') {
      final e = anlaesse.where((e) => e['id'] == teile[2]).firstOrNull;
      if (e == null) return json({'error': 'Event not found'}, 404);
      return json({
        ...e,
        ...?detailExtras[e['id']],
        'app': {...(e['app'] as Map), 'kann_bearbeiten': kannBearbeiten},
      });
    }
    if (a.method == 'GET' && pfad == '/events/$_chilbi/arbeitsplan') return json(arbeitsplan);
    if (a.method == 'GET' && pfad == '/events/$_chilbi/pdf/arbeitsplan') {
      return http.Response.bytes(
        [37, 80, 68, 70, 45],
        200,
        headers: {'content-type': 'application/pdf'},
      );
    }
    return json({'error': 'nicht gefunden'}, 404);
  });
}

void main() {
  late _Backend backend;
  late List<(Uint8List, String, String)> geteilt;
  late List<Uri> geoeffnet;
  late bool linkGeht;

  setUp(() {
    backend = _Backend();
    geteilt = [];
    geoeffnet = [];
    linkGeht = true;
  });

  /// Angemeldetes Mitglied, Handy-Bildschirm (360 x 800), "jetzt" wie im
  /// Vertrag: Sonntag, 11.10.2026.
  Future<void> starten(WidgetTester tester, {Brightness hell = Brightness.light}) async {
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel(KontakteAbgleich.kanalName),
      (_) async => throw MissingPluginException(),
    );
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 3;
    tester.platformDispatcher.platformBrightnessTestValue = hell;
    addTearDown(tester.view.reset);
    addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);

    final roh = SpeicherImArbeitsspeicher();
    final speicher = SitzungsSpeicher(roh);
    await speicher.speichern(
      const Sitzung(
        accessToken: 'jwt',
        kontotyp: Kontotyp.mitglied,
        name: 'Erika Muster',
        email: 'erika@example.ch',
      ),
    );
    final d = Dienste(
      sitzung: SitzungsVerwaltung(speicher: speicher, http: backend.client),
      authentik: _KeinBrowser(),
      uebernahme: AltdatenUebernahme(quelle: _KeineAltdaten(), speicher: speicher),
      speicher: roh,
      appVersion: () async => '1.0.0 (1)',
      dateiTeilen: (bytes, name, typ, {ursprung}) async => geteilt.add((bytes, name, typ)),
      jetzt: () => DateTime(2026, 10, 11, 10),
      plattform: Plattform.android,
      linkOeffnen: (adresse) async {
        geoeffnet.add(adresse);
        return linkGeht;
      },
    );
    await tester.pumpWidget(FwvApp(dienste: d));
    await tester.pumpAndSettle();
  }

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

  Future<void> detailOeffnen(WidgetTester tester, String titel) async {
    await starten(tester);
    await tippen(tester, find.text(titel));
    expect(find.byType(AppBar), findsOneWidget);
  }

  group('Kalender-Abo', () {
    testWidgets('oeffnet webcal-Abo; ohne passende App wird der Link kopiert', (tester) async {
      String? zwischenablage;
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (
        call,
      ) async {
        if (call.method == 'Clipboard.setData') {
          zwischenablage = (call.arguments as Map)['text'] as String?;
        }
        return null;
      });
      await starten(tester);
      await tester.tap(find.byTooltip('Kalender abonnieren'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('In der Kalender-App abonnieren'));
      await tester.pumpAndSettle();
      expect(geoeffnet.single.toString(), 'webcal://api.fwv-raura.ch/calendar/ics');
      expect(zwischenablage, isNull);

      linkGeht = false;
      await tester.tap(find.byTooltip('Kalender abonnieren'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('In der Kalender-App abonnieren'));
      await tester.pumpAndSettle();
      expect(zwischenablage, 'https://api.fwv-raura.ch/calendar/ics');
      expect(find.textContaining('Der Link ist kopiert'), findsOneWidget);
    });
  });

  group('Liste', () {
    testWidgets('zeigt die Anlässe aus dem Vertrag, Ideen in eigenem Abschnitt', (tester) async {
      await starten(tester);

      final liste = backend.anfragen.firstWhere((a) => a.url.path == '/events');
      expect(liste.url.queryParameters, {'aktuell': 'true'});
      expect(liste.headers['Authorization'], 'Bearer jwt');

      expect(find.text('Chilbi 2026'), findsOneWidget);
      expect(find.text('Sa 17.10. – So 18.10.2026 · ab 10:00 Uhr'), findsOneWidget);
      expect(find.text('Roter Schopf'), findsOneWidget);
      expect(find.text('Helfer gesucht'), findsOneWidget);
      expect(find.text('Anmeldung offen'), findsOneWidget, reason: 'Herbstmarkt');
      expect(find.text('Anmeldeschluss vorbei'), findsOneWidget);
      expect(find.text('Ausgebucht'), findsOneWidget);

      await sichtbar(tester, find.text('Rega Besichtigung'));
      final kopf = tester.getTopLeft(find.text('Ideen – Datum noch offen')).dy;
      expect(kopf, greaterThan(tester.getTopLeft(find.text('Grillabend')).dy));
      expect(tester.getTopLeft(find.text('Rega Besichtigung')).dy, greaterThan(kopf));
      expect(find.text('Datum noch offen'), findsWidgets);
      // Schlichte Karte: kein Grund-Chip bei Ideen.
      expect(find.text('Anmeldung, sobald das Datum feststeht'), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('Fehler mit "Erneut versuchen", leer mit Hinweis', (tester) async {
      final echt = backend.anlaesse.toList();
      backend.anlaesse.clear();
      await starten(tester);
      expect(find.text('Zurzeit sind keine Anlässe geplant.'), findsOneWidget);

      backend.anlaesse.addAll(echt);
      await tester.fling(
        find.text('Zurzeit sind keine Anlässe geplant.'),
        const Offset(0, 400),
        1000,
      );
      await tester.pumpAndSettle();
      expect(find.text('Chilbi 2026'), findsOneWidget, reason: 'Pull-to-refresh lädt neu');
    });

    testWidgets('Logo nur an der Chilbi; Ladefehler (kein Netz im Test) macht nichts kaputt', (
      tester,
    ) async {
      await starten(tester);
      final logo = find.byKey(const Key('anlass-logo'));
      expect(logo, findsOneWidget);
      expect(
        find.descendant(of: find.widgetWithText(Card, 'Chilbi 2026'), matching: logo),
        findsOneWidget,
      );
      expect(
        find.descendant(of: find.widgetWithText(Card, 'Herbstmarkt'), matching: logo),
        findsNothing,
      );
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 200)));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(tester.getSize(logo), Size.zero, reason: 'kaputtes Bild verschwindet');
      expect(find.text('Chilbi 2026'), findsOneWidget);
      expect(find.text('Helfer gesucht'), findsOneWidget);
    });

    testWidgets('dunkler Modus ohne Überlauf', (tester) async {
      await starten(tester, hell: Brightness.dark);
      expect(find.text('Chilbi 2026'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('Detail', () {
    testWidgets('Chilbi: Helfen, Schichten, Arbeitsplan, Kalender', (tester) async {
      await detailOeffnen(tester, 'Chilbi 2026');

      expect(find.text('Das Dorffest'), findsOneWidget);
      expect(find.text('gratis'), findsOneWidget);
      expect(find.text('Hans Helfer'), findsOneWidget);
      expect(find.text('Donnerstag, 15. Oktober 2026, 23:59 Uhr'), findsOneWidget);
      expect(find.byKey(const Key('anlass-anmelden')), findsOneWidget);
      expect(find.text('Helfen'), findsOneWidget);
      expect(find.text('Arbeitsplan ansehen'), findsOneWidget);
      expect(find.byTooltip('Bearbeiten'), findsNothing);

      await sichtbar(tester, find.text('Küche'));
      expect(find.text('Samstag, 17. Oktober 2026 · 17:00–20:00 Uhr'), findsOneWidget);
      expect(find.text('1 Platz frei'), findsOneWidget);
      expect(find.text('voll'), findsOneWidget);
      expect(find.text('3 Plätze frei'), findsOneWidget);

      await tester.tap(find.byTooltip('Zum Kalender'));
      await tester.pumpAndSettle();
      final (bytes, name, typ) = geteilt.single;
      expect(name, 'Chilbi_2026.ics');
      expect(typ, 'text/calendar');
      expect(utf8.decode(bytes), contains('DTSTART;TZID=Europe/Zurich:20261017T100000'));
    });

    testWidgets('Logo im Kopf nur, wenn der Anlass eines hat', (tester) async {
      await detailOeffnen(tester, 'Chilbi 2026');
      final logo = find.byKey(const Key('anlass-logo'));
      expect(logo, findsOneWidget);
      expect(tester.widget<AnlassLogo>(logo).groesse, greaterThan(48));
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 200)));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('Das Dorffest'), findsOneWidget);
    });

    testWidgets('Ohne Logo bleibt der Kopf wie er war', (tester) async {
      await detailOeffnen(tester, 'Vereinsausflug');
      expect(find.byKey(const Key('anlass-logo')), findsNothing);
      expect(find.byType(AnlassLogo), findsNothing);
    });

    testWidgets('Ausflug: keine Anmeldung, Grund sichtbar; Bearbeiten wenn erlaubt', (
      tester,
    ) async {
      backend.kannBearbeiten = true;
      await detailOeffnen(tester, 'Vereinsausflug');

      expect(find.byKey(const Key('anlass-anmelden')), findsNothing);
      expect(
        find.descendant(
          of: find.byKey(const Key('anlass-grund')),
          matching: find.text('Anmeldeschluss vorbei'),
        ),
        findsOneWidget,
      );
      expect(find.text('Arbeitsplan ansehen'), findsNothing);
      expect(find.text('9 Plätze frei'), findsOneWidget);
      expect(backend.zaehle('GET', '/events/$_ausflug'), 1);

      await tester.tap(find.byTooltip('Bearbeiten'));
      await tester.pumpAndSettle();
      // Die Anlass-Verwaltung aus fwv_anlass, geladen ueber die
      // Organisator-Uebersicht.
      expect(find.byType(VerwaltungsAnlassScreen), findsOneWidget);
      expect(backend.zaehle('GET', '/events/organisator-uebersicht'), 1);
    });

    testWidgets('Idee ohne Datum: kein Kalender, Grund statt Anmelden', (tester) async {
      await starten(tester);
      await tippen(tester, find.text('Rega Besichtigung'));
      expect(find.byTooltip('Zum Kalender'), findsNothing);
      expect(find.text('Anmeldung, sobald das Datum feststeht'), findsOneWidget);
      expect(find.byKey(const Key('anlass-anmelden')), findsNothing);
    });
  });

  group('Anmelden', () {
    testWidgets('Schichten: Prüfung, nur wählbare, Senden, Meldung des Servers', (tester) async {
      await detailOeffnen(tester, 'Chilbi 2026');
      await tester.tap(find.byKey(const Key('anlass-anmelden')));
      await tester.pumpAndSettle();

      // Vorbelegt aus members/me.
      expect(find.widgetWithText(TextFormField, 'Erika Muster'), findsOneWidget);
      expect(find.widgetWithText(TextFormField, '+41 79 000 00 00'), findsOneWidget);
      // Nur waehlbare Schichten (Bar ist voll), mit Belegung.
      expect(find.byKey(const Key('schicht-00000000-0000-0000-0000-500000000002')), findsNothing);
      expect(
        find.text('Samstag, 17. Oktober 2026 · 17:00–20:00 Uhr\n1 Platz frei'),
        findsOneWidget,
      );

      await tester.enterText(find.widgetWithText(TextFormField, 'Name *'), ' ');
      await tester.enterText(find.widgetWithText(TextFormField, 'E-Mail *'), 'kaputt');
      await tester.tap(find.byKey(const Key('anmelden-senden')));
      await tester.pumpAndSettle();
      expect(find.text('Bitte den Namen angeben.'), findsOneWidget);
      expect(find.text('Keine gültige E-Mail-Adresse.'), findsOneWidget);
      expect(find.text('Bitte mindestens eine Schicht wählen.'), findsOneWidget);
      expect(backend.zaehle('POST', '/registrations/public'), 0);

      await tester.enterText(find.widgetWithText(TextFormField, 'Name *'), 'Erika Muster');
      await tester.enterText(find.widgetWithText(TextFormField, 'E-Mail *'), 'erika@example.ch');
      await tippen(tester, find.byKey(const Key('schicht-00000000-0000-0000-0000-500000000003')));
      await tippen(tester, find.byKey(const Key('schicht-00000000-0000-0000-0000-500000000001')));
      await tester.tap(find.byKey(const Key('anmelden-senden')));
      await tester.pumpAndSettle();

      expect(backend.letzterBody('POST', '/registrations/public'), {
        'type': 'shift',
        'eventId': _chilbi,
        'name': 'Erika Muster',
        'email': 'erika@example.ch',
        'phone': '+41 79 000 00 00',
        'shiftIds': [
          '00000000-0000-0000-0000-500000000001',
          '00000000-0000-0000-0000-500000000003',
        ],
      });
      expect(find.text('Anmeldung erfolgreich (als Mitglied verknüpft)'), findsOneWidget);
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
      // Zurueck im Detail, Belegung neu geladen.
      expect(find.text('Arbeitsplan ansehen'), findsOneWidget);
      expect(backend.zaehle('GET', '/events/$_chilbi'), 2);
    });

    testWidgets('Teilnahme mit Personen; Absage des Servers wird angezeigt', (tester) async {
      backend.anmeldeAntwort = () => http.Response.bytes(
        utf8.encode(
          jsonEncode({
            'success': false,
            'message': 'Das Event ist bereits voll. Bitte wende dich an den Organisator.',
            'code': 'event_full',
          }),
        ),
        409,
      );
      await detailOeffnen(tester, 'Herbstmarkt');
      expect(find.text('Anmelden'), findsOneWidget);
      await tester.tap(find.byKey(const Key('anlass-anmelden')));
      await tester.pumpAndSettle();

      await tippen(tester, find.byTooltip('Mehr Personen'));
      await tippen(tester, find.byTooltip('Mehr Personen'));
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Allergien / Unverträglichkeiten'),
        'Nüsse',
      );
      await tester.tap(find.byKey(const Key('anmelden-senden')));
      await tester.pumpAndSettle();

      expect(backend.letzterBody('POST', '/registrations/public'), {
        'type': 'participant',
        'eventId': _markt,
        'name': 'Erika Muster',
        'email': 'erika@example.ch',
        'phone': '+41 79 000 00 00',
        'participants': 3,
        'allergies': 'Nüsse',
      });
      expect(
        find.descendant(
          of: find.byKey(const Key('anmelden-fehler')),
          matching: find.text('Das Event ist bereits voll. Bitte wende dich an den Organisator.'),
        ),
        findsOneWidget,
      );
      expect(find.text('Anmeldung senden'), findsOneWidget, reason: 'Formular bleibt offen');
    });

    testWidgets('Doppeltipp sendet einmal; schon angemeldet wird freundlich gezeigt', (
      tester,
    ) async {
      backend.anmeldeAntwort = () => http.Response.bytes(
        utf8.encode(
          jsonEncode({
            'success': true,
            'bereits_angemeldet': true,
            'registrationId': 'r1',
            'isMember': true,
            'message':
                'Du bist schon angemeldet (1 Person). Eine zweite Anmeldung ist nicht nötig.',
          }),
        ),
        200,
      );
      await detailOeffnen(tester, 'Herbstmarkt');
      await tester.tap(find.byKey(const Key('anlass-anmelden')));
      await tester.pumpAndSettle();
      expect(find.text('Wie viele Personen kommen, dich eingeschlossen?'), findsOneWidget);

      final senden = find.byKey(const Key('anmelden-senden'));
      await tester.ensureVisible(senden);
      backend.anmeldungHalten = Completer<void>();
      await tester.tap(senden);
      await tester.tap(senden, warnIfMissed: false);
      await tester.pump();
      // Waehrend des Sendens gesperrt, mit Ladeanzeige.
      expect(tester.widget<FilledButton>(senden).onPressed, isNull);
      expect(
        find.descendant(of: senden, matching: find.byType(CircularProgressIndicator)),
        findsOneWidget,
      );
      await tester.tap(senden, warnIfMissed: false);
      backend.anmeldungHalten!.complete();
      await tester.pumpAndSettle();

      expect(backend.zaehle('POST', '/registrations/public'), 1);
      expect(find.text('Schon angemeldet'), findsOneWidget);
      expect(
        find.text('Du bist schon angemeldet (1 Person). Eine zweite Anmeldung ist nicht nötig.'),
        findsOneWidget,
      );
    });
  });

  group('Arbeitsplan', () {
    testWidgets('Karten pro Zeitfenster und PDF teilen', (tester) async {
      await detailOeffnen(tester, 'Chilbi 2026');
      await tester.tap(find.text('Arbeitsplan ansehen'));
      await tester.pumpAndSettle();

      expect(find.text('Samstag, 17.10.2026'), findsOneWidget);
      expect(find.text('10:00–14:00 Uhr'), findsWidgets);
      expect(find.text('Grill'), findsOneWidget);
      expect(find.text('noch niemand'), findsOneWidget);
      expect(find.text('Anna A'), findsOneWidget);
      expect(find.text('1 Platz frei'), findsNWidgets(2));
      await sichtbar(tester, find.text('Bea B, Cem C'));
      expect(find.text('Allgemein'), findsOneWidget);
      // Bereiche ohne Schicht im Zeitfenster erscheinen nicht.
      expect(find.text('Bar'), findsOneWidget);

      await tester.tap(find.byTooltip('PDF'));
      await tester.pumpAndSettle();
      final (bytes, name, typ) = geteilt.single;
      expect(bytes, [37, 80, 68, 70, 45]);
      expect(name, 'Arbeitsplan_Chilbi_2026.pdf');
      expect(typ, 'application/pdf');
    });
  });

  group('Meine Anmeldungen', () {
    testWidgets('Status, Datum, Schichten; Antippen öffnet den Anlass', (tester) async {
      await starten(tester);
      await tester.tap(
        find.descendant(of: find.byType(NavigationBar), matching: find.text('Profil')),
      );
      await tester.pumpAndSettle();
      await tippen(tester, find.text('Meine Anmeldungen'));

      expect(find.text('abgelehnt'), findsOneWidget);
      expect(find.text('offen'), findsOneWidget);
      expect(find.text('bestätigt'), findsNWidgets(2));
      expect(find.text('Sa 17.10. – So 18.10.2026'), findsOneWidget);
      expect(find.text('Bar – Schicht 1 · Sa 17.10. · 12:00–14:00'), findsOneWidget);

      await tippen(tester, find.text('Chilbi 2026'));
      expect(find.text('Arbeitsplan ansehen'), findsOneWidget);
      expect(backend.zaehle('GET', '/events/$_chilbi'), 1);
    });
  });

  group('Kalender', () {
    testWidgets('Monat mit Punkten, Tag wählen zeigt nur dessen Einträge', (tester) async {
      await starten(tester);
      await tester.tap(find.text('Kalender'));
      await tester.pumpAndSettle();

      expect(find.text('Oktober 2026'), findsOneWidget);
      // Ganzer Monat: alle Oktober-Eintraege.
      expect(find.text('Vergangener Anlass'), findsOneWidget);
      await sichtbar(tester, find.text('Helferessen'));

      await tippen(tester, find.byKey(const Key('tag-2026-10-17')));
      expect(find.text('Helferessen'), findsNothing);
      expect(find.text('Chilbi 2026'), findsOneWidget);
      expect(find.text('Samstag, 17. Oktober 2026\n10:00 · Roter Schopf'), findsOneWidget);

      await tester.tap(find.byKey(const Key('tag-2026-10-05')));
      await tester.pumpAndSettle();
      expect(find.text('Keine Einträge an diesem Tag.'), findsOneWidget);

      await tester.tap(find.byTooltip('Nächster Monat'));
      await tester.pumpAndSettle();
      expect(find.text('November 2026'), findsOneWidget);
      await tippen(tester, find.text('Grillabend'));
      expect(backend.zaehle('GET', '/events/00000000-0000-0000-0000-e00000000003'), 1);
      expect(find.text('Keine Anmeldung nötig'), findsOneWidget);
    });

    testWidgets('Beiträge sind nicht antippbar', (tester) async {
      await starten(tester);
      await tester.tap(find.text('Kalender'));
      await tester.pumpAndSettle();
      for (var i = 0; i < 5; i++) {
        await tester.tap(find.byTooltip('Nächster Monat'));
        await tester.pumpAndSettle();
      }
      expect(find.text('März 2027'), findsOneWidget);
      final tile = tester.widget<ListTile>(
        find.ancestor(
          of: find.text('Mitgliederbeitrag 2027 faellig'),
          matching: find.byType(ListTile),
        ),
      );
      expect(tile.onTap, isNull);
    });
  });

  group('Anlass vorschlagen', () {
    testWidgets('Kategorien vom Backend, Prüfung, Senden', (tester) async {
      await starten(tester);
      await tester.tap(find.byTooltip('Anlass vorschlagen'));
      await tester.pumpAndSettle();
      expect(backend.zaehle('GET', '/event-optionen'), 1);

      await tester.tap(find.byKey(const Key('vorschlag-senden')));
      await tester.pumpAndSettle();
      expect(find.text('Bitte einen Titel angeben.'), findsOneWidget);
      expect(find.text('Bitte das Datum wählen.'), findsOneWidget);
      expect(backend.zaehle('POST', '/events/propose'), 0);

      await tester.enterText(find.widgetWithText(TextFormField, 'Titel *'), 'Lottoabend');
      await tester.tap(find.byKey(const Key('vorschlag-beginn')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('20'));
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
      // Uhrzeit: 18:00 vorgeschlagen, uebernehmen.
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
      expect(find.text('20.10.2026, 18:00 Uhr'), findsOneWidget);

      await tippen(tester, find.byKey(const Key('vorschlag-kategorie')));
      await tester.tap(find.text('Ausflug').last);
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('vorschlag-senden')));
      await tester.pumpAndSettle();
      expect(backend.letzterBody('POST', '/events/propose'), {
        'title': 'Lottoabend',
        'start_date': '2026-10-20 18:00:00',
        'end_date': null,
        'location': null,
        'category': 'Ausflug',
        'cost': null,
        'description': null,
      });
      expect(find.text('Danke!'), findsOneWidget);
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
      expect(find.text('Chilbi 2026'), findsOneWidget);
    });
  });
}
