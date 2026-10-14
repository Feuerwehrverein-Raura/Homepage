// Nachgebautes api-members fuer die Vorstand-Tests, kein Netz.
//
// Die Antworten folgen docker/backend-members/src/index.js: die Listen sind
// `SELECT *` aus member_registrations bzw. audit_log. Zeitstempel kommen als
// Text ohne Zeitzone, weil das Backend die pg-Typen roh durchreicht
// (types.setTypeParser 1082/1114 -> Text), DATE als 'YYYY-MM-DD'. Eine
// Vertragsdatei gibt es (noch) nicht: die Routen stehen direkt in index.js
// und brauchen eine Datenbank.

import 'dart:convert';
import 'dart:typed_data';

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:fwv_vorstand/fwv_vorstand.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

Map<String, Object?> antragJson({
  required String id,
  required String vorname,
  required String nachname,
  String status = 'pending',
  String feuerwehr = 'Ja (aktiv)',
  String created = '2026-10-12 19:04:33.512345',
  String? processedBy,
  String? processedAt,
  String? grund,
}) => {
  'id': id,
  'vorname': vorname,
  'nachname': nachname,
  'strasse': 'Hauptstrasse 5',
  'plz': '4303',
  'ort': 'Kaiseraugst',
  'telefon': '061 811 22 33',
  'mobile': '079 123 45 67',
  'email': '${vorname.toLowerCase()}@example.ch',
  'feuerwehr_status': feuerwehr,
  'korrespondenz_methode': 'E-Mail',
  'korrespondenz_adresse': 'Haupt-E-Mail (wie oben angegeben)',
  'status': status,
  'processed_by': processedBy,
  'processed_at': processedAt,
  'rejection_reason': grund,
  'member_id': status == 'approved' ? 'm-$id' : null,
  'created_at': created,
  'anrede': 'Frau',
  'geburtstag': '1990-05-12',
  'geschlecht': 'weiblich',
};

final antraegeStart = [
  antragJson(id: 'r1', vorname: 'Anna', nachname: 'Aktiv'),
  antragJson(
    id: 'r2',
    vorname: 'Beat',
    nachname: 'Gönner',
    feuerwehr: 'Nein',
    created: '2026-10-10 08:15:00',
  ),
  antragJson(
    id: 'r3',
    vorname: 'Carla',
    nachname: 'Alt',
    status: 'approved',
    created: '2026-09-01 10:00:00',
    processedBy: 'aktuar@fwv-raura.ch',
    processedAt: '2026-09-03 18:30:00',
  ),
  antragJson(
    id: 'r4',
    vorname: 'Dario',
    nachname: 'Nein',
    status: 'rejected',
    feuerwehr: 'former',
    created: '2026-08-20 12:00:00',
    processedBy: 'praesident@fwv-raura.ch',
    processedAt: '2026-08-22 09:00:00',
    grund: 'Wohnt nicht in der Region',
  ),
];

/// Eintraege wie logAudit() und der members-Trigger sie schreiben.
List<Map<String, Object?>> auditStart() => [
  {
    'id': 'a1',
    'action': 'LOGIN_FAILED',
    'entity_type': 'auth',
    'entity_id': null,
    'old_values': null,
    'new_values': {'email': 'boese@example.ch', 'reason': 'Invalid credentials'},
    'user_id': null,
    'ip_address': '203.0.113.7',
    'created_at': '2026-10-14 09:05:11.123',
    'email': 'boese@example.ch',
    'details': null,
  },
  {
    'id': 'a2',
    'action': 'MEMBER_UPDATE',
    'entity_type': 'members',
    'entity_id': 'm-7',
    'old_values': {'id': 'm-7', 'vorname': 'Erika', 'nachname': 'Muster', 'ort': 'Raura'},
    'new_values': {'id': 'm-7', 'vorname': 'Erika', 'nachname': 'Muster', 'ort': 'Giebenach'},
    'user_id': null,
    'ip_address': '127.0.0.1',
    'created_at': '2026-10-14 08:00:00',
    'email': 'db-trigger',
    'details': null,
  },
  {
    'id': 'a3',
    'action': 'REGISTRATION_APPROVED',
    'entity_type': 'auth',
    'entity_id': null,
    'old_values': null,
    'new_values': {
      'email': 'aktuar@fwv-raura.ch',
      'registration_id': 'r3',
      'member_id': 'm-r3',
      'member_name': 'Carla Alt',
      'authentik_synced': true,
    },
    'user_id': null,
    'ip_address': '198.51.100.4',
    'created_at': '2026-10-13 18:30:00',
    'email': 'aktuar@fwv-raura.ch',
    'details': null,
  },
  {
    'id': 'a4',
    'action': 'REMINDERS_SENT',
    'entity_type': null,
    'entity_id': null,
    'old_values': null,
    'new_values': null,
    'user_id': null,
    'ip_address': '10.0.0.2',
    'created_at': '2026-10-12 07:00:00',
    'email': 'system',
    'details': {'date': '2026-10-13', 'sent': 12, 'skipped': 1},
  },
];

class FalschesBackend {
  FalschesBackend() {
    antraege = [for (final a in antraegeStart) Map<String, Object?>.of(a)];
    audit = auditStart();
  }

  late List<Map<String, Object?>> antraege;
  late List<Map<String, Object?>> audit;
  final anfragen = <http.Request>[];

  /// Wenn gesetzt: so viele Audit-Eintraege zusaetzlich (fuer "Mehr laden").
  int auditZusatz = 0;

  late final client = MockClient((a) async {
    anfragen.add(a);
    http.Response json(Object? o, [int status = 200]) =>
        http.Response.bytes(utf8.encode(jsonEncode(o)), status);
    final weg = '${a.method} ${a.url.path}';
    final teile = a.url.pathSegments;
    final q = a.url.queryParameters;

    if (weg == 'GET /member-registrations/count/pending') {
      return json({'count': antraege.where((r) => r['status'] == 'pending').length});
    }
    if (weg == 'GET /member-registrations') {
      final status = q['status'] ?? 'pending';
      return json([
        for (final r in antraege)
          if (status == 'all' || r['status'] == status) r,
      ]);
    }
    if (teile.length >= 2 && teile[0] == 'member-registrations') {
      final r = antraege.where((r) => r['id'] == teile[1]).firstOrNull;
      if (r == null) return json({'error': 'Registration not found'}, 404);
      if (a.method == 'GET' && teile.length == 2) return json(r);
      if (a.method == 'POST' && teile.length == 3) {
        if (r['status'] != 'pending') {
          return json({'error': 'Registration already processed'}, 400);
        }
        r['processed_by'] = 'vorstand@fwv-raura.ch';
        r['processed_at'] = '2026-10-14 10:00:00';
        if (teile[2] == 'approve') {
          r['status'] = 'approved';
          r['member_id'] = 'm-${r['id']}';
          return json({
            'success': true,
            'message': 'Registration approved',
            'member_id': r['member_id'],
          });
        }
        if (teile[2] == 'reject') {
          final body = jsonDecode(a.body) as Map<String, dynamic>;
          r['status'] = 'rejected';
          r['rejection_reason'] = body['reason'];
          return json({'success': true, 'message': 'Registration rejected'});
        }
      }
    }
    if (weg == 'GET /audit') {
      final limit = int.parse(q['limit'] ?? '100');
      final offset = int.parse(q['offset'] ?? '0');
      final alle = [
        ...audit,
        for (var i = 0; i < auditZusatz; i++)
          {
            'id': 'z$i',
            'action': 'AUDIT_VIEW',
            'entity_type': 'auth',
            'new_values': {'email': 'aktuar@fwv-raura.ch', 'filters': <String, Object?>{}},
            'ip_address': '10.0.0.9',
            'created_at': '2026-10-01 12:00:00',
            'email': 'aktuar@fwv-raura.ch',
          },
      ];
      final email = q['email']?.toLowerCase();
      final treffer = [
        for (final e in alle)
          if ((q['action'] == null || e['action'] == q['action']) &&
              (email == null || '${e['email']}'.toLowerCase().contains(email)))
            e,
      ];
      return json(treffer.skip(offset).take(limit).toList());
    }
    return json({'error': 'nicht gefunden: $weg'}, 404);
  });

  /// Die Bodies der POST-Aufrufe an [pfad].
  List<Map<String, dynamic>> posts(String pfad) => [
    for (final a in anfragen)
      if (a.method == 'POST' && a.url.path == pfad) jsonDecode(a.body) as Map<String, dynamic>,
  ];

  List<Map<String, String>> auditAbfragen() => [
    for (final a in anfragen)
      if (a.url.path == '/audit') a.url.queryParameters,
  ];

  VorstandDienste dienste() {
    final api = ApiClient(http: client);
    return VorstandDienste(
      api: api,
      anlaesse: AnlassVerwaltung(zugang: OrganisatorZugang(api), umgebung: umgebung),
      umgebung: umgebung,
    );
  }

  final links = <Uri>[];

  late final umgebung = VerwaltungsUmgebung(
    dateiTeilen: (bytes, name, typ, {ursprung}) async {},
    fotoWaehlen: ({required bool kamera}) async => Uint8List(0),
    linkOeffnen: (u) async {
      links.add(u);
      return true;
    },
  );
}
