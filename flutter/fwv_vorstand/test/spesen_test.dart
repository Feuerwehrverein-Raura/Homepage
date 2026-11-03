// Spesen (Vorstand -> Spesen, api-members /members/spesen): Liste nach
// Status, Summe offen, Beleg, bezahlt, ablehnen mit Begruendung.

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_vorstand/fwv_vorstand.dart';
import 'package:http/http.dart' as http;
import 'package:material_ui/material_ui.dart';

import 'hilfe.dart';

class _Kasse {
  _Kasse() {
    backend = FalschesBackend(antwort);
  }

  late final FalschesBackend backend;
  var spesen = <Map<String, Object?>>[
    {
      'id': 's1',
      'betrag': '23.50',
      'datum': '2026-11-02',
      'zweck': 'Brot Preisjassen',
      'kategorie': 'Einkauf',
      'status': 'eingereicht',
      'iban': 'CH9300762011623852957',
      'vorname': 'Anna',
      'nachname': 'Muster',
      'anlass': 'Preisjassen 2026',
      'beleg_name': 'Quittung.jpg',
      'beleg_typ': 'image/jpeg',
      'quelle': 'mitglied',
    },
    {
      'id': 's2',
      'betrag': '22.30',
      'datum': '2026-11-03',
      'zweck': 'Spesenabrechnung Pingen 03.11.2026: 14 Briefe, CHF 22.30',
      'kategorie': 'Porto',
      'status': 'eingereicht',
      'vorname': 'Stefan',
      'nachname': 'Müller',
      'beleg_name': 'Pingen.txt',
      'beleg_typ': 'text/plain',
      'quelle': 'pingen',
    },
  ];

  Object? antwort(http.Request a) {
    final weg = '${a.method} ${a.url.path}';
    switch (weg) {
      case 'GET /members/spesen':
        final status = a.url.queryParameters['status'];
        final liste = [
          for (final s in spesen)
            if (status == null || s['status'] == status) s,
        ];
        final offen = spesen.where((s) => s['status'] == 'eingereicht');
        return {
          'spesen': liste,
          'offen': {
            'anzahl': offen.length,
            'summe': offen.fold<double>(0, (x, s) => x + double.parse('${s['betrag']}')),
          },
        };
      case 'GET /members/spesen/s1/beleg':
        return 'JPEG';
      case 'PATCH /members/spesen/s1':
      case 'PATCH /members/spesen/s2':
        final id = a.url.pathSegments.last;
        final b = jsonDecode(a.body) as Map<String, dynamic>;
        spesen = [
          for (final s in spesen)
            s['id'] == id ? {...s, 'status': b['status'], 'grund': b['grund']} : s,
        ];
        return {'id': id};
    }
    return (404, {'error': 'nicht gefunden: $weg'});
  }

  List<Map<String, dynamic>> patches() => [
    for (final a in backend.anfragen)
      if (a.method == 'PATCH') {'pfad': a.url.path, ...jsonDecode(a.body) as Map<String, dynamic>},
  ];
}

void main() {
  testWidgets('Offen: Summe, Beleg, bezahlt, ablehnen mit Begruendung', (tester) async {
    final k = _Kasse();
    await zeigen(tester, SpesenAnsicht(dienste: k.backend.dienste));
    expect(find.text('2 offen · CHF 45.80 auszuzahlen'), findsOneWidget);
    expect(find.text('Brot Preisjassen'), findsOneWidget);
    expect(find.textContaining('automatisch (Pingen)'), findsOneWidget);
    expect(find.text('IBAN CH93 0076 2011 6238 5295 7'), findsOneWidget);

    await tippen(tester, find.byKey(const Key('spesen-beleg-s1')));
    expect(k.backend.geteilt.single.$1, 'Quittung.jpg');

    await tippen(tester, find.byKey(const Key('spesen-bezahlt-s1')));
    await tippen(
      tester,
      find.descendant(of: find.byType(AlertDialog), matching: find.text('Bezahlt')),
    );
    expect(k.patches().single, {'pfad': '/members/spesen/s1', 'status': 'bezahlt'});
    expect(find.text('Brot Preisjassen'), findsNothing, reason: 'nicht mehr offen');
    expect(find.text('1 offen · CHF 22.30 auszuzahlen'), findsOneWidget);

    await tippen(tester, find.byKey(const Key('spesen-ablehnen-s2')));
    final ablehnen = find.descendant(
      of: find.byType(AlertDialog),
      matching: find.byType(FilledButton),
    );
    expect(tester.widget<FilledButton>(ablehnen).onPressed, isNull, reason: 'Begruendung fehlt');
    await tester.enterText(find.byKey(const Key('spesen-grund')), 'Schon bezahlt');
    await tester.pump();
    await tippen(tester, ablehnen);
    expect(k.patches().last, {
      'pfad': '/members/spesen/s2',
      'status': 'abgelehnt',
      'grund': 'Schon bezahlt',
    });
    expect(find.text('Keine offenen Spesen.'), findsOneWidget);

    await tippen(tester, find.text('Alle'));
    expect(k.backend.anfragen.last.url.queryParameters.containsKey('status'), isFalse);
    expect(find.textContaining('Schon bezahlt'), findsOneWidget);
  });
}
