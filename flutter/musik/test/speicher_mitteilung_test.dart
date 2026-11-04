import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_musik/dienste.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const kanal = MethodChannel('test/geraet');
  late List<MethodCall> aufrufe;
  late DateTime jetzt;

  setUp(() {
    aufrufe = [];
    jetzt = DateTime(2026, 11, 4, 15);
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      kanal,
      (c) async => aufrufe.add(c),
    );
  });

  test('meldet Fortschritt hoechstens einmal je Sekunde und beendet den Dienst', () async {
    final m = SpeicherMitteilung(kanal, jetzt: () => jetzt);
    m.stand(laeuft: false, fertig: 0, offen: 0);
    m.stand(laeuft: true, fertig: 10, offen: 90, titel: 'Queen – Bohemian Rhapsody');
    m.stand(laeuft: true, fertig: 11, offen: 89, titel: 'Queen – Radio Ga Ga');
    jetzt = jetzt.add(const Duration(seconds: 2));
    m.stand(laeuft: true, fertig: 11, offen: 89, titel: 'Queen – Radio Ga Ga');
    m.stand(laeuft: false, fertig: 100, offen: 0);
    m.stand(laeuft: false, fertig: 100, offen: 0);
    await Future<void>.delayed(Duration.zero);

    expect(aufrufe.map((c) => c.method), ['speichernStand', 'speichernStand', 'speichernEnde']);
    expect(aufrufe.first.arguments, {
      'text': 'Noch 90 Titel · Queen – Bohemian Rhapsody',
      'fertig': 10,
      'gesamt': 100,
    });
    expect((aufrufe[1].arguments as Map)['text'], 'Noch 89 Titel · Queen – Radio Ga Ga');
  });
}
