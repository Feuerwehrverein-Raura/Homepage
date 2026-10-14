// Mitglieder im Vorstand-Bereich gegen ein nachgebautes Backend (Antworten
// in der Form von docker/backend-members/src/index.js: GET /members liefert
// die ganzen Zeilen, Kennzahlen als Text). Kein Netz.

import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:fwv_vorstand/fwv_vorstand.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';

Map<String, dynamic> _zeile(
  String id,
  String vorname,
  String nachname,
  Map<String, Object?> mehr,
) => {
  'id': id,
  'anrede': null,
  'geschlecht': null,
  'vorname': vorname,
  'nachname': nachname,
  'geburtstag': null,
  'email': null,
  'versand_email': null,
  'telefon': null,
  'mobile': null,
  'strasse': null,
  'adresszusatz': null,
  'plz': null,
  'ort': null,
  'status': 'Aktivmitglied',
  'funktion': null,
  'eintrittsdatum': '2010-03-01',
  'zustellung_email': true,
  'zustellung_post': false,
  'bemerkungen': null,
  'feuerwehr_zugehoerigkeit': 'keine',
  'foto': null,
  'benutzername': null,
  'authentik_user_id': null,
  'created_at': '2010-03-01T10:00:00.000Z',
  ...mehr,
};

/// Nachgebautes Backend mit Gedaechtnis: schreibt jede Anfrage mit.
class _Backend {
  final anfragen = <http.Request>[];
  late Map<String, Map<String, dynamic>> mitglieder;

  _Backend() {
    mitglieder = {
      'm1': _zeile('m1', 'Erika', 'Muster', {
        'anrede': 'Frau',
        'geschlecht': 'W',
        'geburtstag': '1980-05-12',
        'email': 'erika@example.ch',
        'mobile': '+41 79 123 45 67',
        'telefon': '+41 61 811 00 00',
        'strasse': 'Hauptstrasse 1',
        'plz': '4303',
        'ort': 'Kaiseraugst',
        'funktion': 'Kassier, Admin',
        'feuerwehr_zugehoerigkeit': 'feuerwehr_raurica',
        'bemerkungen': 'Hat den Schlüssel zum Magazin.',
        'benutzername': 'erika.muster',
        'authentik_user_id': '42',
      }),
      'm2': _zeile('m2', 'Hans', 'Helfer', {
        'status': 'Aufnahme pendent',
        'mobile': '+41 78 000 00 00',
      }),
      'm3': _zeile('m3', 'Otto', 'Alt', {'status': 'Ehrenmitglied'}),
    };
  }

  List<http.Request> wo(String methode, String pfad) => [
    for (final a in anfragen)
      if (a.method == methode && a.url.path == pfad) a,
  ];

  Object? body(http.Request a) => jsonDecode(a.body);

  late final client = MockClient((a) async {
    anfragen.add(a);
    http.Response json(Object? o, [int status = 200]) =>
        http.Response.bytes(utf8.encode(jsonEncode(o)), status);
    final p = a.url.path;
    final q = a.url.queryParameters;

    if (a.method == 'GET' && p == '/members') {
      final suche = (q['search'] ?? '').toLowerCase();
      final status = q['status'];
      return json([
        for (final m in mitglieder.values)
          if ((status == null || m['status'] == status) &&
              (suche.isEmpty ||
                  '${m['vorname']} ${m['nachname']} ${m['email']}'.toLowerCase().contains(suche)))
            m,
      ]);
    }
    if (a.method == 'GET' && p == '/members/stats/overview') {
      return json({
        'total': '3',
        'aktiv': '1',
        'passiv': '0',
        'pendent': '1',
        'ehren': '1',
        'email_zustellung': '3',
        'post_zustellung': '0',
      });
    }
    if (a.method == 'POST' && p == '/members') {
      final neu = _zeile('m9', '', '', {
        ...jsonDecode(a.body) as Map<String, dynamic>,
        'authentik_user_id': '99',
      });
      mitglieder['m9'] = neu;
      return json(neu, 201);
    }
    if (a.method == 'POST' && p == '/push/to-members') {
      final b = jsonDecode(a.body) as Map;
      return json({'success': true, 'pushed': (b['memberIds'] as List).length, 'emailed': 1});
    }
    final teile = p.split('/'); // ['', 'members', id, ...]
    if (teile.length >= 3 && teile[1] == 'members') {
      final id = teile[2];
      final m = mitglieder[id];
      if (m == null) return json({'error': 'Member not found'}, 404);
      final rest = teile.skip(3).join('/');
      switch ((a.method, rest)) {
        case ('GET', ''):
          return json(m);
        case ('PUT', ''):
          m.addAll(jsonDecode(a.body) as Map<String, dynamic>);
          return json(m);
        case ('DELETE', ''):
          return json({
            'message': 'Löschanfrage erstellt. Aktuar und Kassier wurden per Email benachrichtigt.',
            'request_id': 'r1',
            'requires_confirmation': ['aktuar', 'kassier'],
          });
        case ('POST', 'photo'):
          m['foto'] = '/uploads/photo-1.jpg';
          return json({'success': true, 'photo_url': '/uploads/photo-1.jpg', 'member': m});
        case ('DELETE', 'photo'):
          m['foto'] = null;
          return json({'success': true, 'message': 'Photo deleted'});
        case ('POST', 'reset-password'):
          return json({
            'success': true,
            'tempPassword': 'FWV-123456',
            'message': 'Temporaeres Passwort fuer Erika Muster gesetzt',
          });
        case ('POST', 'set-password'):
          return json({'success': true, 'message': 'Passwort fuer Erika Muster gesetzt'});
        case ('GET', 'nextcloud-admin'):
          return m['authentik_user_id'] == null
              ? json({'has_authentik': false, 'nextcloud_admin': false})
              : json({'has_authentik': true, 'nextcloud_admin': true});
        case ('GET', 'vorstand-group'):
          return json({'has_authentik': true, 'vorstand_group': true});
        case ('GET', 'social-media-group'):
          return json({'has_authentik': true, 'social_media_group': false});
        case ('POST', 'nextcloud-admin' || 'vorstand-group' || 'social-media-group'):
          return json({'success': true});
      }
    }
    return json({'error': 'nicht gefunden'}, 404);
  });
}

void main() {
  late _Backend backend;
  late List<Uri> links;
  late VorstandDienste dienste;

  setUp(() {
    backend = _Backend();
    links = [];
    final api = ApiClient(http: backend.client);
    final umgebung = VerwaltungsUmgebung(
      dateiTeilen: (_, _, _, {ursprung}) async {},
      fotoWaehlen: ({required kamera}) async => Uint8List.fromList([1, 2, 3]),
      linkOeffnen: (u) async {
        links.add(u);
        return true;
      },
      anhangVerkleinern: (roh) async => roh,
    );
    dienste = VorstandDienste(
      api: api,
      anlaesse: AnlassVerwaltung(zugang: OrganisatorZugang(api), umgebung: umgebung),
      umgebung: umgebung,
      fotoVerkleinern: (roh) async => roh,
    );
  });

  Future<void> starten(WidgetTester tester, {double breite = 393}) async {
    tester.view.physicalSize = Size(breite * 3, 2700 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        theme: fwvThema(),
        home: Scaffold(body: MitgliederAnsicht(dienste: dienste)),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> oeffnen(WidgetTester tester, String id) async {
    await tester.tap(find.byKey(Key('mitglied-$id')));
    await tester.pumpAndSettle();
  }

  group('Modell', () {
    test('Revisor schliesst Vorstandsfunktionen aus und umgekehrt', () {
      expect(funktionUmschalten(['Kassier', 'Admin'], 'Revisor', true), ['Admin', 'Revisor']);
      expect(funktionUmschalten(['Revisor', 'Social Media'], 'Aktuar', true), [
        'Aktuar',
        'Social Media',
      ]);
      expect(funktionUmschalten(['Admin', 'Kassier'], 'Kassier', false), ['Admin']);
    });

    test('Bearbeiten schickt nur Geaendertes, Leeres als null', () {
      final m = VorstandMitglied.ausJson(_Backend().mitglieder['m1']!);
      final original = MitgliedEntwurf.aus(m);
      final neu = MitgliedEntwurf.aus(m);
      expect(neu.aenderungen(original), isEmpty);
      // "Kassier, Admin" wird nicht umsortiert, solange niemand etwas aendert.
      expect(original.funktionen, ['Admin', 'Kassier']);
      final geaendert = MitgliedEntwurf(
        vorname: 'Erika',
        nachname: 'Muster',
        anrede: 'Frau',
        geschlecht: 'W',
        geburtstag: m.geburtstag,
        email: m.email,
        mobile: m.mobile,
        telefon: '',
        strasse: m.strasse,
        plz: m.plz,
        ort: m.ort,
        status: 'Aktivmitglied',
        feuerwehrZugehoerigkeit: 'feuerwehr_raurica',
        funktionen: const ['Admin', 'Kassier'],
        eintrittsdatum: m.eintrittsdatum,
        bemerkungen: m.bemerkungen,
      );
      expect(geaendert.aenderungen(original), {'telefon': null});
    });

    test('Kennzahlen kommen als Text', () {
      final z = MitgliederKennzahlen.ausJson({'total': '12', 'aktiv': 9, 'pendent': '2'});
      expect((z.gesamt, z.aktiv, z.pendent, z.ehren), (12, 9, 2, 0));
    });
  });

  testWidgets('Liste mit Kennzahlen, Suche beim Server, Statusfilter', (tester) async {
    await starten(tester);
    expect(find.text('Erika Muster'), findsOneWidget);
    expect(find.text('Hans Helfer'), findsOneWidget);
    expect(find.text('Kassier, Admin · +41 79 123 45 67'), findsOneWidget);
    expect(
      find.descendant(of: find.byKey(const Key('kennzahl-Gesamt')), matching: find.text('3')),
      findsOneWidget,
    );

    // Suche: wartet kurz, dann eine Anfrage mit search=.
    await tester.enterText(find.byKey(const Key('mitglieder-suche')), 'helf');
    await tester.pump(const Duration(milliseconds: 100));
    expect(backend.anfragen.where((a) => a.url.queryParameters['search'] == 'helf'), isEmpty);
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    expect(backend.wo('GET', '/members').last.url.queryParameters['search'], 'helf');
    expect(find.text('Hans Helfer'), findsOneWidget);
    expect(find.text('Erika Muster'), findsNothing);

    await tester.tap(find.byTooltip('Suche löschen'));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();

    // Statusfilter ueber das Menue.
    await tester.tap(find.byKey(const Key('status-filter')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ehrenmitglied').last);
    await tester.pumpAndSettle();
    expect(backend.wo('GET', '/members').last.url.queryParameters, {'status': 'Ehrenmitglied'});
    expect(find.text('Otto Alt'), findsOneWidget);
    expect(find.text('Erika Muster'), findsNothing);
    expect(find.byKey(const Key('filter-chip')), findsOneWidget);

    // Kachel "Pendent" filtert ebenfalls; Chip entfernt den Filter.
    await tester.tap(find.byKey(const Key('kennzahl-Pendent')));
    await tester.pumpAndSettle();
    expect(backend.wo('GET', '/members').last.url.queryParameters['status'], 'Aufnahme pendent');
    await tester.tap(find.byTooltip('Filter entfernen'));
    await tester.pumpAndSettle();
    expect(backend.wo('GET', '/members').last.url.queryParameters, isEmpty);
    expect(find.text('Erika Muster'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Detail: alle Angaben, schnelle Wege, Cloud-Gruppen', (tester) async {
    await starten(tester);
    await oeffnen(tester, 'm1');

    for (final t in ['Kontakt', 'Adresse', 'Mitgliedschaft', 'Zustellung', 'Bemerkungen']) {
      expect(find.text(t), findsWidgets, reason: t);
    }
    expect(find.text('Hauptstrasse 1\n4303 Kaiseraugst'), findsOneWidget);
    expect(find.text('12.05.1980'), findsOneWidget);
    expect(find.text('Feuerwehr Raurica'), findsOneWidget);
    expect(find.text('erika.muster'), findsOneWidget);
    expect(find.text('Hat den Schlüssel zum Magazin.'), findsOneWidget);

    await tester.tap(find.byKey(const Key('weg-anrufen')));
    await tester.tap(find.byKey(const Key('weg-mail')));
    await tester.tap(find.byKey(const Key('weg-karte')));
    await tester.pump();
    expect(links[0].toString(), 'tel:+41791234567');
    expect(links[1].toString(), 'mailto:erika@example.ch');
    expect(links[2].host, 'www.google.com');
    expect(links[2].queryParameters['query'], 'Hauptstrasse 1 4303 Kaiseraugst');

    // Gruppen: Nextcloud ja, Vorstand ja, Social Media nein.
    final nc = find.byKey(const Key('gruppe-Nextcloud-Admin'));
    expect(find.descendant(of: nc, matching: find.text('Mitglied')), findsOneWidget);
    final sm = find.byKey(const Key('gruppe-Social-Media-Gruppe'));
    expect(find.descendant(of: sm, matching: find.text('nicht drin')), findsOneWidget);

    await tester.tap(find.byKey(const Key('gruppen-abgleichen')));
    await tester.pumpAndSettle();
    Object? gesetzt(String g) => backend.body(backend.wo('POST', '/members/m1/$g').single);
    expect(gesetzt('nextcloud-admin'), {'enabled': true});
    expect(gesetzt('vorstand-group'), {'enabled': true});
    expect(gesetzt('social-media-group'), {'enabled': false});
    expect(tester.takeException(), isNull);
  });

  testWidgets('Detail ohne Login-Konto: keine Passwort-Knoepfe', (tester) async {
    await starten(tester);
    await oeffnen(tester, 'm2');
    expect(find.byKey(const Key('passwort-zuruecksetzen')), findsNothing);
    expect(find.text('Kein Login-Konto vorhanden.'), findsOneWidget);
    expect(backend.wo('GET', '/members/m2/vorstand-group'), isEmpty);
  });

  testWidgets('Bearbeiten schickt nur die geaenderten Felder, Revisor-Regel, Gruppen', (
    tester,
  ) async {
    await starten(tester);
    await oeffnen(tester, 'm1');
    await tester.tap(find.byKey(const Key('mitglied-bearbeiten')));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('feld-Mobile')), '079 999 88 77');
    // Revisor: Kassier faellt weg, Admin bleibt.
    await tester.tap(find.byKey(const Key('funktion-Revisor')));
    await tester.pump();
    final kassier = tester.widget<FilterChip>(find.byKey(const Key('funktion-Kassier')));
    expect(kassier.selected, isFalse);

    await tester.tap(find.byKey(const Key('mitglied-speichern')));
    await tester.pumpAndSettle();

    final put = backend.wo('PUT', '/members/m1').single;
    expect(backend.body(put), {'mobile': '079 999 88 77', 'funktion': 'Admin, Revisor'});
    // Funktion geaendert -> Gruppen nach Funktion: Admin ja, Vorstand nein.
    expect(backend.body(backend.wo('POST', '/members/m1/nextcloud-admin').single), {
      'enabled': true,
    });
    expect(backend.body(backend.wo('POST', '/members/m1/vorstand-group').single), {
      'enabled': false,
    });
    // Zurueck im Detail mit dem neuen Stand.
    expect(find.text('Admin, Revisor'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Bearbeiten ohne Aenderung schickt nichts', (tester) async {
    await starten(tester);
    await oeffnen(tester, 'm1');
    await tester.tap(find.byKey(const Key('mitglied-bearbeiten')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('mitglied-speichern')));
    await tester.pumpAndSettle();
    expect(backend.wo('PUT', '/members/m1'), isEmpty);
    expect(find.text('Keine Änderungen'), findsOneWidget);
  });

  testWidgets('Neues Mitglied: Pflichtfelder, E-Mail, Eintritt bei Feuerwehr Raurica', (
    tester,
  ) async {
    await starten(tester);
    await tester.tap(find.byKey(const Key('mitglied-neu')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('mitglied-speichern')));
    await tester.pumpAndSettle();
    expect(find.text('Bitte Vorname angeben.'), findsOneWidget);
    expect(find.text('Bitte Nachname angeben.'), findsOneWidget);
    expect(backend.wo('POST', '/members'), isEmpty);

    await tester.enterText(find.byKey(const Key('feld-Vorname')), 'Lea');
    await tester.enterText(find.byKey(const Key('feld-Nachname')), 'Neu');
    await tester.enterText(find.byKey(const Key('feld-E-Mail')), 'lea@kaputt');
    await tester.tap(find.byKey(const Key('mitglied-speichern')));
    await tester.pumpAndSettle();
    expect(find.text('Bitte eine gültige E-Mail-Adresse angeben.'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('feld-E-Mail')), 'lea@example.ch');

    // Zugehoerigkeit Feuerwehr Raurica -> Eintritt heute.
    await tester.tap(find.byKey(const Key('feld-zugehoerigkeit')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Feuerwehr Raurica').last);
    await tester.pumpAndSettle();
    final heute = DateTime.now();
    expect(find.text(schweizerDatum(heute)), findsOneWidget);

    await tester.tap(find.byKey(const Key('funktion-Social Media')));
    await tester.tap(find.byKey(const Key('mitglied-speichern')));
    await tester.pumpAndSettle();

    final body = backend.body(backend.wo('POST', '/members').single) as Map;
    expect(body['vorname'], 'Lea');
    expect(body['nachname'], 'Neu');
    expect(body['email'], 'lea@example.ch');
    expect(body['status'], 'Aktivmitglied');
    expect(body['feuerwehr_zugehoerigkeit'], 'feuerwehr_raurica');
    expect(body['eintrittsdatum'], isoDatum(heute));
    expect(body['funktion'], 'Social Media');
    expect(body['zustellung_email'], true);
    expect(body['zustellung_post'], false);
    expect(body['telefon'], isNull);
    // Neues Mitglied mit Login: Gruppen gleich abgeglichen.
    expect(backend.body(backend.wo('POST', '/members/m9/social-media-group').single), {
      'enabled': true,
    });
    // Danach oeffnet das Detail des neuen Mitglieds.
    expect(find.text('Lea Neu'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Loeschen: Rueckfrage, Grund, Meldung vom 4-Augen-Ablauf', (tester) async {
    await starten(tester);
    await oeffnen(tester, 'm2');
    await tester.tap(find.byKey(const Key('mitglied-menue')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Löschen'));
    await tester.pumpAndSettle();

    // Abbrechen schickt nichts.
    await tester.tap(find.text('Abbrechen'));
    await tester.pumpAndSettle();
    expect(backend.wo('DELETE', '/members/m2'), isEmpty);

    await tester.tap(find.byKey(const Key('mitglied-loeschen')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Aktuar und Kassier bekommen'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('loeschen-grund')), 'Weggezogen');
    await tester.tap(find.byKey(const Key('loeschen-bestaetigen')));
    await tester.pumpAndSettle();

    expect(backend.body(backend.wo('DELETE', '/members/m2').single), {'reason': 'Weggezogen'});
    expect(find.text('Löschanfrage gestellt'), findsOneWidget);
    expect(
      find.textContaining('Aktuar und Kassier wurden per Email benachrichtigt'),
      findsOneWidget,
    );
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    // Zurueck in der Liste.
    expect(find.byKey(const Key('mitglieder-suche')), findsOneWidget);
  });

  testWidgets('Passwort zuruecksetzen zeigt das temporaere Passwort, kopieren', (tester) async {
    String? kopiert;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (
      call,
    ) async {
      if (call.method == 'Clipboard.setData') kopiert = (call.arguments as Map)['text'] as String;
      return null;
    });
    await starten(tester);
    await oeffnen(tester, 'm1');
    await tester.tap(find.byKey(const Key('passwort-zuruecksetzen')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Zurücksetzen'));
    await tester.pumpAndSettle();

    expect(backend.wo('POST', '/members/m1/reset-password'), hasLength(1));
    expect(find.text('FWV-123456'), findsOneWidget);
    await tester.tap(find.byKey(const Key('temp-passwort-kopieren')));
    await tester.pumpAndSettle();
    expect(kopiert, 'FWV-123456');
  });

  testWidgets('Passwort setzen: mindestens 8 Zeichen', (tester) async {
    await starten(tester);
    await oeffnen(tester, 'm1');
    await tester.tap(find.byKey(const Key('passwort-setzen')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('neues-passwort')), 'kurz');
    await tester.tap(find.byKey(const Key('passwort-setzen-ok')));
    await tester.pumpAndSettle();
    expect(find.text('Mindestens 8 Zeichen.'), findsOneWidget);
    expect(backend.wo('POST', '/members/m1/set-password'), isEmpty);

    await tester.enterText(find.byKey(const Key('neues-passwort')), 'lang-genug-1');
    await tester.tap(find.byKey(const Key('passwort-setzen-ok')));
    await tester.pumpAndSettle();
    expect(backend.body(backend.wo('POST', '/members/m1/set-password').single), {
      'password': 'lang-genug-1',
    });
    expect(find.text('Passwort fuer Erika Muster gesetzt'), findsOneWidget);
  });

  testWidgets('Benachrichtigen: Push, auf Wunsch per E-Mail', (tester) async {
    await starten(tester);
    await oeffnen(tester, 'm1');
    await tester.tap(find.byKey(const Key('weg-benachrichtigen')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('push-senden')));
    await tester.pumpAndSettle();
    expect(find.text('Bitte einen Titel angeben.'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('push-titel')), 'Schlüssel');
    await tester.enterText(find.byKey(const Key('push-text')), 'Bitte zurückbringen.');
    await tester.tap(find.byKey(const Key('push-email')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('push-senden')));
    await tester.pumpAndSettle();

    final push = backend.wo('POST', '/push/to-members').single;
    expect(backend.body(push), {
      'memberIds': ['m1'],
      'title': 'Schlüssel',
      'body': 'Bitte zurückbringen.',
      'alsoEmail': true,
    });
    expect(find.text('Benachrichtigung gesendet (Push: 1, E-Mail: 1)'), findsOneWidget);
  });

  testWidgets('Foto: hochladen (Feld photo) und entfernen', (tester) async {
    await starten(tester);
    await oeffnen(tester, 'm2');
    await tester.tap(find.byKey(const Key('foto-galerie')));
    await tester.pumpAndSettle();
    final hoch = backend.wo('POST', '/members/m2/photo').single;
    expect(hoch.headers['content-type'], startsWith('multipart/form-data'));
    expect(hoch.body, contains('name="photo"'));
    expect(find.byKey(const Key('foto-entfernen')), findsOneWidget);

    await tester.tap(find.byKey(const Key('foto-entfernen')));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Entfernen'));
    await tester.pumpAndSettle();
    expect(backend.wo('DELETE', '/members/m2/photo'), hasLength(1));
    expect(find.byKey(const Key('foto-entfernen')), findsNothing);
  });

  testWidgets('Breiter Bildschirm (Desktop): Liste mittig, ohne Fehler', (tester) async {
    await starten(tester, breite: 1300);
    expect(find.text('Erika Muster'), findsOneWidget);
    final links = tester.getTopLeft(find.byKey(const Key('mitglieder-suche'))).dx;
    expect(links, greaterThan(200));
    await oeffnen(tester, 'm1');
    expect(find.text('Hauptstrasse 1\n4303 Kaiseraugst'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
