// Android-Updates: Eintrag "musik" aus www.fwv-raura.ch/download/versionen.json.

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_musik/update.dart';

void main() {
  test('Neuere Fassung nur, wenn die Website eine hoehere Version hat', () {
    final versionen = {
      'kasse': {'datei': 'kasse.apk', 'version': '9.9'},
      'musik': {'datei': 'musik.apk', 'version': '1.10.0', 'sha256': 'abc'},
    };
    final v = neuereVersion(versionen, '1.9.3')!;
    expect(v.version, '1.10.0');
    expect(v.url, 'https://www.fwv-raura.ch/download/musik.apk');
    expect(v.sha256, 'abc');
    expect(neuereVersion(versionen, '1.10.0'), isNull);
    expect(neuereVersion(versionen, '2.0.0'), isNull);
    expect(neuereVersion({'kasse': versionen['kasse']}, '1.0.0'), isNull);
  });
}
