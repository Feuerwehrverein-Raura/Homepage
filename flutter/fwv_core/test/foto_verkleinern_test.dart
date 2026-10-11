// Fotos vor dem Hochladen: Groesse, Format und EXIF-Drehung.

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:image/image.dart' as img;

void main() {
  test('grosses Querformat wird auf 1024 Pixel verkleinert', () {
    final roh = img.encodePng(img.Image(width: 3000, height: 1500));
    final jpeg = fotoVerkleinern(roh);
    final b = img.decodeJpg(jpeg)!;
    expect(b.width, 1024);
    expect(b.height, 512);
  });

  test('EXIF-Drehung wird eingerechnet (Hochformat-Aufnahme)', () {
    // Kamera speichert quer und vermerkt "90 Grad drehen" (Orientation 6).
    final quer = img.Image(width: 2000, height: 1000);
    quer.exif.imageIfd.orientation = 6;
    final jpeg = fotoVerkleinern(img.encodeJpg(quer));
    final b = img.decodeJpg(jpeg)!;
    expect(b.width, 512);
    expect(b.height, 1024);
    // Nach dem Einrechnen darf kein Viewer ein zweites Mal drehen.
    expect(b.exif.imageIfd.orientation ?? 1, 1);
  });

  test('kleine Bilder werden nicht vergroessert', () {
    final jpeg = fotoVerkleinern(img.encodePng(img.Image(width: 300, height: 200)));
    final b = img.decodeJpg(jpeg)!;
    expect((b.width, b.height), (300, 200));
  });

  test('kein Bild: FormatException', () {
    expect(() => fotoVerkleinern(Uint8List.fromList([1, 2, 3])), throwsFormatException);
  });
}
