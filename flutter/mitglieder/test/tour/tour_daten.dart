// Erfundene Testdaten fuer die Bildschirmfoto-Tour (bildschirmfotos_test.dart):
// ein nachgebautes Backend (backend-members, backend-events, Inventar-API,
// Roter Schopf, Musik) und die Dienste der App ohne Netz, Browser, Kamera
// oder Firebase.
//
// Grundlage sind die Vertragsdateien, die auch die normalen Tests lesen
// (docker/backend-events/test/fixtures, docker/backend-members/test/fixtures,
// flutter/fwv_lager/test/fixtures) — dazu ein paar Ergaenzungen, damit die
// Bilder nach einem echten Vereinsjahr aussehen. Keine echten Mitglieder:
// Alle Namen, Adressen, Nummern und die IBAN sind erfunden.

import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:fwv_mitglieder/anmeldung/authentik_anmeldung.dart';
import 'package:fwv_mitglieder/dienste.dart';
import 'package:fwv_mitglieder/einstellungen/kontakte_abgleich.dart';
import 'package:fwv_mitglieder/push/push_dienst.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Wurzel des Repos (enthaelt docker/ und flutter/).
Directory repoWurzel() {
  var dir = Directory.current.absolute;
  while (true) {
    if (Directory('${dir.path}/docker/frontend-website').existsSync() &&
        Directory('${dir.path}/flutter').existsSync()) {
      return dir;
    }
    if (dir.parent.path == dir.path) throw StateError('Repo-Wurzel nicht gefunden');
    dir = dir.parent;
  }
}

Object? _json(String pfad) => jsonDecode(File('${repoWurzel().path}/$pfad').readAsStringSync());

Map<String, dynamic> _karte(Object? o) => (o as Map).cast<String, dynamic>();

/// "Jetzt" der Tour: wie in den Vertragsdateien Sonntag, 11.10.2026, 10:00.
final tourJetzt = DateTime(2026, 10, 11, 10);

/// Unsigniertes JWT (die App prueft keine Signatur, das Backend schon).
String _jwt(Map<String, Object?> angaben) {
  String teil(Object o) => base64Url.encode(utf8.encode(jsonEncode(o))).replaceAll('=', '');
  return '${teil({'alg': 'RS256', 'typ': 'JWT'})}.${teil(angaben)}.signatur';
}

/// Erika Muster ist im Vorstand: Damit erscheinen Vorstand, Lager,
/// Schopf und (auf grossen Bildschirmen) Gruppen.
final tourToken = _jwt({
  'iss': 'https://auth.fwv-raura.ch/application/o/fwv-members-app/',
  'sub': 'tour-erika',
  'name': 'Erika Muster',
  'email': 'erika@example.ch',
  'groups': ['Mitglieder', 'Vorstand', 'Lager', 'Roter Schopf'],
});

/// Dieselbe Erika als gewoehnliches Mitglied, das die Chilbi organisiert:
/// Der Vorstand sieht statt "Organisator" den Reiter "Vorstand" - fuer die
/// Bilder der Organisatoren braucht es darum ein Konto ohne Vorstand.
final tourTokenOrganisator = _jwt({
  'iss': 'https://auth.fwv-raura.ch/application/o/fwv-members-app/',
  'sub': 'tour-erika',
  'name': 'Erika Muster',
  'email': 'erika@example.ch',
  'groups': ['Mitglieder'],
});

Sitzung tourSitzung({bool vorstand = true}) => Sitzung(
  accessToken: vorstand ? tourToken : tourTokenOrganisator,
  refreshToken: 'tour-refresh',
  kontotyp: Kontotyp.mitglied,
  name: 'Erika Muster',
  email: 'erika@example.ch',
);

/// Adresse des (erfundenen) Profilfotos — die Tour legt dafuer ein
/// gezeichnetes Bild in den Bild-Speicher.
const profilFotoPfad = '/uploads/tour-erika.jpg';

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

class _TourPush implements PushDienst {
  @override
  Future<void> starten() async {}

  @override
  bool get verfuegbar => true;

  @override
  set beiNeuemToken(void Function(String token)? rueckruf) {}

  @override
  Future<String?> token() async => 'tour-fcm';

  @override
  Future<PushErlaubnis> erlaubnis() async => PushErlaubnis.erlaubt;

  @override
  Future<PushErlaubnis> erlaubnisAnfragen() async => PushErlaubnis.erlaubt;

  @override
  Future<void> tokenVerwerfen() async {}

  @override
  String get plattform => 'android';
}

const _chilbi = '00000000-0000-0000-0000-e00000000001';
const _preisjassen = '00000000-0000-0000-0000-e00000000099';

/// Das nachgebaute Backend aller Dienste.
class TourBackend {
  TourBackend() {
    // Preisjassen dazu (mit Logo), damit die Liste nach Vereinsjahr aussieht.
    anlaesse.add(_preisjassenAnlass);
    kalender.add({
      'id': 'event:$_preisjassen',
      'type': 'event',
      'date': '2026-11-28',
      'title': 'Preisjassen 2026',
      'subtitle': '19:00',
      'description': null,
      'refId': _preisjassen,
      'datum_text': 'Samstag, 28. November 2026',
    });
    // Der Vertrag braucht keine echte Adresse; im Bild sieht "Roter Schopf"
    // mit Ort besser aus.
    for (final a in anlaesse) {
      if (a['id'] == _chilbi) a['location'] = 'Roter Schopf, Kaiseraugst';
    }
  }

  final anlaesse = (_json('docker/backend-events/test/fixtures/anlaesse-app.json') as List)
      .map(_karte)
      .toList();
  final kalender = (_json('docker/backend-events/test/fixtures/kalender-app.json') as List)
      .map(_karte)
      .toList();
  final meine = _json('docker/backend-events/test/fixtures/meine-anmeldungen.json');
  final arbeitsplan = _json('docker/backend-events/test/fixtures/arbeitsplan.json');
  final organisator = _karte(
    _json('docker/backend-events/test/fixtures/organisator-uebersicht.json'),
  );
  // Lampen-Kennungen sind Adressen im Netz des Schopfs - im Bild erfundene.
  final schopf = jsonDecode(
    jsonEncode(_json('docker/backend-members/test/fixtures/roter-schopf-app.json'))
        .replaceAll('192.168.33.', '10.0.0.'),
  );
  final schopfZugang = _karte(_json('docker/backend-members/test/fixtures/schopf-zugang-app.json'));
  final musik = _karte(_json('docker/backend-members/test/fixtures/kiosk-musik-app.json'));
  final gruppen = _karte(_json('docker/backend-members/test/fixtures/gruppen-app.json'));
  final lager = _karte(_json('flutter/fwv_lager/test/fixtures/inventar-api.json'));
  final ausleihe = _karte(_json('flutter/fwv_lager/test/fixtures/ausleihe-api.json'));

  static final _preisjassenAnlass = <String, dynamic>{
    'id': _preisjassen,
    'slug': 'preisjassen-2026',
    'title': 'Preisjassen 2026',
    'category': 'Sonstiges',
    'status': 'planned',
    'location': 'Roter Schopf, Kaiseraugst',
    'start_date': '2026-11-28 19:00:00',
    'end_date': null,
    'registration_deadline': '2026-11-25 23:59:00',
    'max_participants': 48,
    'registration_required': true,
    'app': {
      'datum_text': 'Samstag, 28. November 2026',
      'zeit_text': '19:00 Uhr',
      'datum_offen': false,
      'gruppe': 'kommend',
      'abgesagt': false,
      'anmeldung': {
        'moeglich': true,
        'grund': null,
        'art': 'teilnahme',
        'pflicht': true,
        'anmeldeschluss_text': 'Mittwoch, 25. November 2026, 23:59 Uhr',
        'plaetze_frei': 31,
        'plaetze_text': '31 Plätze frei',
      },
      'kann_bearbeiten': false,
      'logo': 'https://www.fwv-raura.ch/images/anlaesse/preisjassen.png',
      'reihe': 'preisjassen',
    },
    'shifts': <Object>[],
  };

  /// Felder, die nur die Detailansicht liest.
  static const _detail = <String, Map<String, Object?>>{
    _chilbi: {
      'subtitle': 'Das Dorffest im Roten Schopf',
      'description':
          'Zwei Tage Festbetrieb mit Bar, Grill und Kaffeestube. Wir freuen uns '
          'über jede helfende Hand – auch für eine einzelne Schicht.',
      'cost': 'gratis',
      'organizer_name': 'Hans Beispiel',
    },
    _preisjassen: {
      'subtitle': 'Schieber mit zugelostem Partner',
      'description': 'Mindestens 8 Teilnehmende, sonst wird der Anlass abgesagt.',
      'cost': 'CHF 25.– inkl. Nachtessen',
      'organizer_name': 'Erika Muster',
    },
  };

  Map<String, Object?> profil = {
    'id': 'tour-a1',
    'anrede': 'Frau',
    'vorname': 'Erika',
    'nachname': 'Muster',
    'email': 'erika@example.ch',
    'mobile': '+41 79 000 00 00',
    'telefon': '+41 61 000 00 00',
    'strasse': 'Musterweg 1',
    'plz': '4303',
    'ort': 'Kaiseraugst',
    'funktion': 'Aktuarin',
    'status': 'Aktivmitglied',
    'geburtstag': '1985-05-04',
    'iban': 'CH00 0000 0000 0000 0000 0',
    'foto': profilFotoPfad,
  };

  late final client = MockClient((a) async {
    http.Response json(Object? o, [int status = 200]) =>
        http.Response.bytes(utf8.encode(jsonEncode(o)), status);
    final weg = '${a.method} ${a.url.path}';
    if (a.url.host == 'inventar.fwv-raura.ch') return json(_inventar(a));
    final teile = a.url.path.split('/');
    switch (weg) {
      case 'GET /members/me':
        return json(profil);
      case 'GET /members/me/notifications':
        return json([
          {'notification_type': 'newsletter', 'enabled': false},
        ]);
      case 'GET /members/me/accesses':
        return json(_zugaenge);
      case 'GET /members/me/vpn':
        return json([
          {
            'name': 'mtour-laptop',
            'geraet': 'laptop',
            'adresse': '10.0.0.7',
            'zuletzt': '2026-10-10T19:42:00.000Z',
          },
          {'name': 'mtour-handy', 'geraet': 'handy', 'adresse': '10.0.0.8', 'zuletzt': null},
        ]);
      case 'GET /members/me/bildschirm':
        return json({'schauen': null, 'steuern': null});
      case 'GET /members/directory':
        return json(_verzeichnis);
      case 'POST /members/me/fcm-token':
      case 'DELETE /members/me/fcm-token':
        return json({'success': true});
      case 'GET /events':
        return json(anlaesse);
      case 'GET /events/organized-by-me':
        return json([
          {'id': _chilbi, 'title': 'Chilbi 2026'},
        ]);
      case 'GET /events/organisator-uebersicht':
        return json(organisator);
      case 'GET /calendar/items':
        return json(kalender);
      case 'GET /registrations/mine':
        return json(meine);
      case 'GET /event-optionen':
        return json({
          'kategorien': ['Dorffest', 'Ausflug', 'GV', 'Sonstiges'],
          'anmeldepflichtige_kategorien': ['Dorffest', 'GV'],
          'bereiche': [
            {'wert': 'Allgemein', 'text': 'Allgemein'},
            {'wert': 'Bar', 'text': 'Bar'},
            {'wert': 'Kueche', 'text': 'Küche'},
          ],
          'status': [
            {'wert': 'planned', 'text': 'Geplant'},
            {'wert': 'cancelled', 'text': 'Abgesagt'},
          ],
        });
      case 'GET /kiosk/roter-schopf':
        return json(schopf);
      case 'GET /kiosk/roter-schopf/zugang':
        return json(schopfZugang['gruppe']);
      case 'GET /kiosk/playlists':
        return json(_playlists);
      case 'GET /kiosk/sender':
        return json([
          {'id': 's1', 'name': 'SRF 3', 'url': 'https://stream.srg-ssr.ch/m/drs3/mp3_128'},
          {'id': 's2', 'name': 'Radio Swiss Pop', 'url': 'https://stream.srg-ssr.ch/m/rsp/mp3_128'},
        ]);
      case 'GET /kiosk/t400/musik':
        return json(musik['zustand']);
      case 'GET /vorstand/gruppen':
        return json(gruppen['gruppen']);
      case 'GET /vorstand/gruppen/kandidaten':
        return json(gruppen['kandidaten']);
      case 'GET /events/proposals':
        return json(<Object>[]);
      case 'GET /members':
        return json(_mitglieder);
      case 'GET /members/stats/overview':
        return json({'total': 5, 'aktiv': 3, 'ehren': 1, 'pendent': 1});
      // Zweite Anmeldung derselben Person (backend-events
      // src/doppelte-anmeldung.js): kein Fehler, sondern ein Hinweis.
      case 'POST /registrations/public':
        return json({
          'success': true,
          'bereits_angemeldet': true,
          'message':
              'Du bist schon angemeldet (2 Personen). Eine zweite Anmeldung ist nicht nötig.',
        });
      case 'GET /events/$_chilbi/organizers':
        return json(_organisatoren);
    }
    if (a.method == 'GET' && teile.length == 3 && teile[1] == 'events') {
      final e = anlaesse.where((e) => e['id'] == teile[2] || e['slug'] == teile[2]).firstOrNull;
      if (e == null) return json({'error': 'Event not found'}, 404);
      return json({...e, ...?_detail[e['id']]});
    }
    if (a.method == 'GET' && a.url.path == '/events/$_chilbi/arbeitsplan') return json(arbeitsplan);
    if (a.method == 'GET' && teile.length == 4 && teile[1] == 'events') {
      return switch (teile[3]) {
        'organizer-notes' => json(_notizen),
        'recipes' || 'receipts' || 'available-recipes' || 'available-items' => json(<Object>[]),
        'shopping-list' => json({'items': <Object>[]}),
        _ => json({'error': 'nicht gefunden'}, 404),
      };
    }
    debugPrint('Tour: keine Antwort fuer $weg');
    return json({'error': 'nicht gefunden'}, 404);
  });

  Object? _inventar(http.Request a) {
    final items = (lager['items'] as List).cast<Map<String, dynamic>>();
    return switch ('${a.method} ${a.url.path}') {
      'GET /api/items' => items,
      'GET /api/items/1' => lager['item'],
      'GET /api/transactions' => lager['transactions'],
      'GET /api/locations/overview' => lager['locations_overview'],
      'GET /api/reports/low-stock' => lager['low_stock'],
      'GET /api/categories' => lager['categories'],
      'GET /api/ausleihe/angebot' => ausleihe['angebot'],
      'GET /api/ausleihe/meine' => ausleihe['meine'],
      'GET /api/ausleihe' => <Object>[],
      _ => {'error': 'nicht gefunden'},
    };
  }

  static const _zugaenge = {
    'functionEmails': [
      {
        'function': 'Aktuarin',
        'email': 'aktuar@fwv-raura.ch',
        'password': 'Beispiel-Passwort-1',
        'server': 'mail.example.net',
        'imapPort': 993,
        'smtpPort': 587,
      },
    ],
    'nextcloudFolders': [
      {'id': 1, 'name': 'Vorstand'},
      {'id': 2, 'name': 'Anlässe'},
    ],
    'systemAccesses': [
      {'system': 'Website', 'url': 'https://www.fwv-raura.ch', 'access': 'Mitglied'},
      {'system': 'Cloud', 'url': 'https://nextcloud.fwv-raura.ch', 'access': 'Vorstand'},
    ],
    'serviceAccounts': <Object>[],
  };

  static const _verzeichnis = [
    {'id': 'm1', 'vorname': 'Erika', 'nachname': 'Muster', 'funktion': 'Aktuarin'},
    {'id': 'm2', 'vorname': 'Hans', 'nachname': 'Beispiel', 'funktion': 'Präsident'},
    {'id': 'm3', 'vorname': 'Max', 'nachname': 'Beispiel', 'funktion': 'Kassier'},
    {'id': 'm4', 'vorname': 'Anna', 'nachname': 'Muster'},
  ];

  /// Mitgliederliste im Reiter Vorstand - alles erfunden.
  static const _mitglieder = [
    {
      'id': 'm2',
      'anrede': 'Herr',
      'vorname': 'Hans',
      'nachname': 'Beispiel',
      'email': 'hans@example.ch',
      'ort': 'Kaiseraugst',
      'status': 'Aktivmitglied',
      'funktion': 'Präsident',
    },
    {
      'id': 'm3',
      'anrede': 'Herr',
      'vorname': 'Max',
      'nachname': 'Beispiel',
      'email': 'max@example.ch',
      'ort': 'Rheinfelden',
      'status': 'Aktivmitglied',
      'funktion': 'Kassier',
    },
    {
      'id': 'm5',
      'anrede': 'Frau',
      'vorname': 'Petra',
      'nachname': 'Exempel',
      'email': 'petra@example.ch',
      'ort': 'Augst',
      'status': 'Ehrenmitglied',
    },
    {
      'id': 'tour-a1',
      'anrede': 'Frau',
      'vorname': 'Erika',
      'nachname': 'Muster',
      'email': 'erika@example.ch',
      'ort': 'Kaiseraugst',
      'status': 'Aktivmitglied',
      'funktion': 'Aktuarin',
    },
    {
      'id': 'm4',
      'anrede': 'Frau',
      'vorname': 'Anna',
      'nachname': 'Muster',
      'email': 'anna@example.ch',
      'ort': 'Kaiseraugst',
      'status': 'Aktivmitglied',
    },
  ];

  /// Organisatoren der Chilbi: Erika, dazu ein Mitglied und eine Externe.
  static const _organisatoren = {
    'hauptorganisator': {
      'id': 'o0',
      'name': 'Erika Muster',
      'member_id': 'tour-a1',
      'email': 'erika@example.ch',
      'art': 'mitglied',
    },
    'mitorganisatoren': [
      {
        'id': 'o1',
        'name': 'Hans Beispiel',
        'member_id': 'm2',
        'email': 'hans@example.ch',
        'art': 'mitglied',
      },
      {
        'id': 'o2',
        'name': 'Petra Exempel',
        'email': 'petra@example.ch',
        'art': 'extern',
        'zugang_bis': '2026-10-19',
      },
    ],
    'darf_verwalten': true,
  };

  static const _playlists = [
    {'id': 'p1', 'name': 'Chilbi Abend', 'anzahl': 42, 'erstellt_von_name': 'Hans Beispiel'},
    {'id': 'p2', 'name': 'Apéro', 'anzahl': 18, 'erstellt_von_name': 'Erika Muster'},
    {'id': 'p3', 'name': 'Schlager-Party', 'anzahl': 64, 'erstellt_von_name': 'Max Beispiel'},
  ];

  static const _notizen = [
    {
      'id': 'n1',
      'content': 'Schlüssel für den Roten Schopf liegt bei Hans Beispiel.',
      'created_by': 'Erika Muster',
      'created_at': '2026-10-09T18:00:00.000Z',
      'attachments': <Object>[],
    },
  ];
}

/// Die Dienste der App fuer die Tour: angemeldet als Erika Muster (oder
/// abgemeldet fuer den Login-Screen), "jetzt" fest, keine Push-, Kontakt-
/// oder Update-Abfragen ans Geraet.
Future<Dienste> tourDienste(
  WidgetTester tester, {
  required Plattform plattform,
  bool angemeldet = true,
  bool kontakteAn = true,
  bool vorstand = true,
}) async {
  final backend = TourBackend();
  // Android-Kontaktabgleich: eingeschaltet, ohne echten nativen Teil.
  const kanal = MethodChannel('tour/kontakte');
  tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
    kanal,
    (c) async => switch (c.method) {
      'status' => kontakteAn,
      _ => null,
    },
  );
  final roh = SpeicherImArbeitsspeicher();
  // Keine Frage nach dem Adressbuch ueber dem ersten Bild.
  await roh.schreiben(SitzungsSchluessel.kontakteGefragt, 'true');
  final speicher = SitzungsSpeicher(roh);
  if (angemeldet) await speicher.speichern(tourSitzung(vorstand: vorstand));
  return Dienste(
    sitzung: SitzungsVerwaltung(speicher: speicher, http: backend.client),
    authentik: _KeinBrowser(),
    uebernahme: AltdatenUebernahme(quelle: _KeineAltdaten(), speicher: speicher),
    speicher: roh,
    push: _TourPush(),
    kontakte: const KontakteAbgleich(kanal),
    appVersion: () async => '1.145.0 (145)',
    linkOeffnen: (_) async => true,
    dateiTeilen: (_, _, _, {ursprung}) async {},
    jetzt: () => tourJetzt,
    plattform: plattform,
    roterSchopfTakt: null,
    schopfPruefTakt: null,
    barcodeScannen: (_) async => null,
  );
}
