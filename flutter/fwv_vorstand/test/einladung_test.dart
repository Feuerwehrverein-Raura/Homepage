// Einladung zu einem Anlass: Entwurf aus den Daten des Anlasses und
// "Verfassen" damit gefuellt. Kein Netz.

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:fwv_vorstand/fwv_vorstand.dart';
import 'package:material_ui/material_ui.dart';

import 'hilfe.dart';

Anlass _anlass([Map<String, Object?> mehr = const {}]) => Anlass.ausJson({
  'id': 'e1',
  'slug': 'chilbi-2026',
  'title': 'Chilbi 2026',
  'location': 'Roter Schopf',
  'description': 'Grill und Bar.',
  'cost': 'gratis',
  'registration_required': true,
  'registration_deadline': '2026-10-01',
  'app': {'datum_text': 'Sa 17.10.2026', 'zeit_text': '10:00–02:00'},
  ...mehr,
});

void main() {
  group('einladungsEntwurf', () {
    test('Betreff, Daten, Beschreibung und Link', () {
      final e = einladungsEntwurf(_anlass());
      expect(e.betreff, 'Einladung: Chilbi 2026');
      expect(e.text, contains('zum Anlass «Chilbi 2026» einladen'));
      expect(e.text, contains('Grill und Bar.'));
      expect(
        e.text,
        contains(
          'Was: Chilbi 2026\nWo: Roter Schopf\nWann: Sa 17.10.2026, 10:00–02:00\n'
          'Anmeldung: Zwingend\nAnmeldeschluss: 01.10.2026\nKosten: gratis',
        ),
      );
      expect(e.text, contains('https://www.fwv-raura.ch/events.html?event=chilbi-2026'));
      expect(e.text, endsWith('Wir freuen uns über zahlreiches Erscheinen.'));
      expect(unbekanntePlatzhalter(e.text), isEmpty);
    });

    test('Datum offen, ohne Ort/Kosten/Schluss, freiwillig', () {
      final e = einladungsEntwurf(
        Anlass.ausJson({
          'id': 'e2',
          'title': 'Ausflug',
          'app': {'datum_offen': true},
        }),
      );
      expect(e.text, contains('Was: Ausflug\nWann: Datum noch offen\nAnmeldung: Freiwillig'));
      expect(e.text, isNot(contains('Wo:')));
      expect(e.text, isNot(contains('Kosten:')));
      expect(e.text, contains('events.html?event=e2'));
    });

    test('Mit Schichten wird es ein Helferaufruf', () {
      final e = einladungsEntwurf(
        _anlass({
          'shifts': [
            {'id': 's1', 'name': 'Bar', 'needed': 2},
          ],
        }),
      );
      expect(e.text, contains('suchen wir Helferinnen und Helfer'));
      expect(e.text, endsWith('herzlichen Dank fürs Mitmachen.'));
    });
  });

  testWidgets('Verfassen startet mit dem Entwurf', (tester) async {
    final b = FalschesBackend(
      (a) => switch (a.url.path) {
        '/members' => <Object>[],
        '/templates' => <Object>[],
        _ => (404, {'error': 'unbekannt'}),
      },
    );
    await zeigen(
      tester,
      VerfassenAnsicht(dienste: b.dienste, entwurf: einladungsEntwurf(_anlass())),
    );
    final felder = [
      for (final f in tester.widgetList<EditableText>(find.byType(EditableText))) f.controller.text,
    ];
    expect(felder, contains('Einladung: Chilbi 2026'));
    expect(felder.where((t) => t.contains('Anmeldeschluss: 01.10.2026')), hasLength(1));
    // Ohne PDF am Anlass kein Hinweis.
    expect(find.byKey(const Key('versand-anhang')), findsNothing);
  });

  test('Entwurf nennt den Anlass und sein PDF', () {
    final e = einladungsEntwurf(_anlass({'pdf_filename': 'Jass-Einladung 2026.pdf'}));
    expect(e.anlassId, 'e1');
    expect(e.anhang, 'Jass-Einladung 2026.pdf');
    expect(einladungsEntwurf(_anlass()).anhang, isNull);
  });

  testWidgets('Verfassen zeigt, dass das PDF mitkommt', (tester) async {
    final b = FalschesBackend(
      (a) => switch (a.url.path) {
        '/members' => <Object>[],
        '/templates' => <Object>[],
        _ => (404, {'error': 'unbekannt'}),
      },
    );
    await zeigen(
      tester,
      VerfassenAnsicht(
        dienste: b.dienste,
        entwurf: einladungsEntwurf(_anlass({'pdf_filename': 'Jass-Einladung 2026.pdf'})),
      ),
    );
    expect(find.byKey(const Key('versand-anhang')), findsOneWidget);
    expect(find.textContaining('«Jass-Einladung 2026.pdf»'), findsOneWidget);
  });
}
