import 'package:flutter_test/flutter_test.dart';
import 'package:kasse/src/updater.dart';

void main() {
  test('Versionen vergleichen', () {
    expect(versionVergleichen('2.2', '2.1.2'), 1);
    expect(versionVergleichen('2.10', '2.9'), 1);
    expect(versionVergleichen('2.2', '2.2.0'), 0);
    expect(versionVergleichen('2.1.2', '2.2'), -1);
  });
}
