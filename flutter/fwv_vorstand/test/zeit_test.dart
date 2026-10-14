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
}
