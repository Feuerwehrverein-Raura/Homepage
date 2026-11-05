import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_mitglieder/push/desktop_push.dart';

void main() {
  test('Postfach lesen: Id als Zahl oder Text, Daten fuer das Antippen', () {
    final l = postfachLesen({
      'mitteilungen': [
        {
          'id': '7',
          'titel': 'Übung',
          'text': 'Samstag',
          'daten': {'notificationType': 'general', 'ziel': 'profil'},
        },
        {'id': 8, 'titel': 'Zwei', 'text': null, 'daten': null},
      ],
    });
    expect(l.map((m) => m.id), [7, 8]);
    expect(l.first.daten['ziel'], 'profil');
    expect(l.last.text, '');
    expect(l.last.daten, isEmpty);
  });

  test('Postfach lesen: unerwartete Antwort gibt nichts', () {
    expect(postfachLesen(null), isEmpty);
    expect(postfachLesen({'mitteilungen': 'x'}), isEmpty);
  });
}
