import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_vorstand/src/zeit.dart';

void main() {
  test('Text ohne Zone gilt als UTC, mit Zone bleibt sie', () {
    expect(
      utcZeitpunkt('2026-10-14 12:43:26.740218')!.toUtc(),
      DateTime.utc(2026, 10, 14, 12, 43, 26, 740, 218),
    );
    expect(utcZeitpunkt('2026-10-14T12:43:26Z')!.toUtc(), DateTime.utc(2026, 10, 14, 12, 43, 26));
    expect(
      utcZeitpunkt('2026-10-14T14:43:26+02:00')!.toUtc(),
      DateTime.utc(2026, 10, 14, 12, 43, 26),
    );
    expect(utcZeitpunkt(null), isNull);
  });

  test('vorZeit: relativ, Einzahl und Mehrzahl', () {
    final jetzt = DateTime(2026, 10, 15, 12);
    String vor(Duration d) => vorZeit(jetzt.subtract(d), jetzt);
    expect(vor(const Duration(seconds: 20)), 'gerade eben');
    expect(vor(const Duration(minutes: 1)), 'vor 1 Minute');
    expect(vor(const Duration(minutes: 45)), 'vor 45 Minuten');
    expect(vor(const Duration(hours: 3)), 'vor 3 Stunden');
    expect(vor(const Duration(hours: 30)), 'gestern');
    expect(vor(const Duration(days: 3)), 'vor 3 Tagen');
    expect(vor(const Duration(days: 65)), 'vor 2 Monaten');
    expect(vor(const Duration(days: 400)), 'vor 1 Jahr');
  });
}
