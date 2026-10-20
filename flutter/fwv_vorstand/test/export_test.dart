// Mitglieder-Exporte: CSV wie exportCSV() in vorstand.html und das Menue
// in der Mitgliederliste (Telefonliste-PDF, CSV) gegen ein nachgebautes
// Backend. Kein Netz.

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_vorstand/fwv_vorstand.dart';
import 'package:material_ui/material_ui.dart';

import 'hilfe.dart';

Map<String, dynamic> _m(String vorname, String status, {bool post = false, bool mail = true}) => {
  'id': vorname,
  'anrede': 'Frau',
  'vorname': vorname,
  'nachname': 'Muster',
  'geburtstag': '1980-05-12',
  'eintrittsdatum': '2010-03-01T00:00:00.000Z',
  'austrittsdatum': null,
  'strasse': 'Dorfstrasse 1',
  'plz': '4303',
  'ort': 'Kaiseraugst',
  'email': '$vorname@example.ch',
  'status': status,
  'funktion': 'Kassier, Admin',
  'iban': 'CH00 0000',
  'zustellung_email': mail,
  'zustellung_post': post,
  'bemerkungen': null,
};

void main() {
  final zeilen = [
    _m('Erika', 'Aktivmitglied'),
    _m('Hans', 'Ehrenmitglied', post: true, mail: false),
    _m('Otto', 'Ausgetreten', post: true),
    _m('Vera', 'Verstorben'),
  ];

  group('mitgliederCsv', () {
    test('Kopf und Spalten wie vorstand.html, Semikolon, Datum TT.MM.JJJJ', () {
      final zeilenText = mitgliederCsv(zeilen, MitgliederExport.alle).split('\r\n');
      expect(zeilenText.first, startsWith('Anrede;Vorname;Nachname;Geschlecht;Geburtstag;'));
      expect(zeilenText.first, endsWith('Zustellung E-Mail;Zustellung Post;Bemerkungen'));
      expect(zeilenText.first.split(';'), hasLength(23));
      final erika = zeilenText[1].split(';');
      expect(erika, hasLength(23));
      expect(erika.sublist(0, 6), ['Frau', 'Erika', 'Muster', '', '12.05.1980', '01.03.2010']);
      expect(erika[16], 'Kassier, Admin');
      expect(erika.sublist(20), ['ja', 'nein', '']);
    });

    test('Ausgetretene und Verstorbene fehlen immer', () {
      final text = mitgliederCsv(zeilen, MitgliederExport.alle);
      expect(text, contains('Erika'));
      expect(text, contains('Hans'));
      expect(text, isNot(contains('Otto')));
      expect(text, isNot(contains('Vera')));
    });

    test('Filter: Aktive, Post, E-Mail', () {
      String namen(MitgliederExport art) =>
          mitgliederCsv(zeilen, art).split('\r\n').skip(1).map((z) => z.split(';')[1]).join(',');
      expect(namen(MitgliederExport.aktive), 'Erika');
      expect(namen(MitgliederExport.post), 'Hans');
      expect(namen(MitgliederExport.email), 'Erika');
    });

    test('Semikolon, Anfuehrungszeichen und Zeilenumbruch werden eingefasst', () {
      final m = {..._m('Erika', 'Aktivmitglied'), 'bemerkungen': 'a;b "c"\nd'};
      final zeile = mitgliederCsv([m], MitgliederExport.alle).split('\r\n').skip(1).join('\r\n');
      expect(zeile, endsWith('"a;b ""c""\nd"'));
    });

    test('Dateiname mit Datum', () {
      expect(
        exportDateiname(MitgliederExport.post, DateTime(2026, 10, 20)),
        'post-zustellung-2026-10-20.csv',
      );
    });
  });

  group('Menue in der Mitgliederliste', () {
    late FalschesBackend b;

    setUp(() {
      b = FalschesBackend(
        (a) => switch (a.url.path) {
          '/members' => zeilen,
          '/members/stats/overview' => {
            'total': '2',
            'active': '1',
            'pending': '0',
            'honorary': '1',
          },
          '/members/pdf/telefonliste' => 'PDF',
          _ => (404, {'error': 'unbekannt'}),
        },
      );
    });

    testWidgets('CSV: Alle wird mit BOM geteilt', (tester) async {
      await zeigen(tester, MitgliederAnsicht(dienste: b.dienste));
      await tester.tap(find.byKey(const Key('mitglieder-export')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('export-alle')));
      await tester.pumpAndSettle();
      expect(b.geteilt, hasLength(1));
      final (name, groesse) = b.geteilt.single;
      expect(name, matches(RegExp(r'^mitglieder-\d{4}-\d{2}-\d{2}\.csv$')));
      expect(groesse, 3 + utf8.encode(mitgliederCsv(zeilen, MitgliederExport.alle)).length);
      expect(find.text('2 Mitglieder exportiert.'), findsOneWidget);
    });

    testWidgets('Telefonliste holt das PDF vom Backend', (tester) async {
      await zeigen(tester, MitgliederAnsicht(dienste: b.dienste));
      await tester.tap(find.byKey(const Key('mitglieder-export')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('export-telefonliste')));
      await tester.pumpAndSettle();
      expect(b.anfragen.map((a) => a.url.path), contains('/members/pdf/telefonliste'));
      expect(b.geteilt.single.$1, matches(RegExp(r'^Telefonliste_\d{4}-\d{2}-\d{2}\.pdf$')));
    });
  });
}
