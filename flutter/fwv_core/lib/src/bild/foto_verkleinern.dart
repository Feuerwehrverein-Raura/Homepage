// Fotos vor dem Hochladen verkleinern: hoechstens 1024 Pixel an der
// laengeren Kante, JPEG mit Qualitaet 85, Drehung aus den EXIF-Daten
// eingerechnet (sonst liegen Hochformat-Aufnahmen quer). Wie
// EditProfileActivity.kt der alten Android-App.
//
// Vorerst im Geraet; auf Dauer gehoert das ins Backend
// (docs/flutter-mitglieder-app-plan.md, "Was ins Backend gehoert" Nr. 10).

import 'package:flutter/foundation.dart';
import 'package:image/image.dart' as img;

/// Laengste Kante nach dem Verkleinern.
const fotoMaxKante = 1024;

/// JPEG-Qualitaet (0-100).
const fotoQualitaet = 85;

/// Verkleinert [roh] (JPEG, PNG, ...) und gibt ein JPEG zurueck.
/// Wirft [FormatException], wenn sich das Bild nicht lesen laesst.
Uint8List fotoVerkleinern(
  Uint8List roh, {
  int maxKante = fotoMaxKante,
  int qualitaet = fotoQualitaet,
}) {
  final bild = img.decodeImage(roh);
  if (bild == null) {
    throw const FormatException('Das Bild konnte nicht gelesen werden.');
  }
  // Drehung einrechnen; danach ist das EXIF-Feld zurueckgesetzt.
  var b = img.bakeOrientation(bild);
  final laengste = b.width > b.height ? b.width : b.height;
  if (laengste > maxKante) {
    b = b.width >= b.height
        ? img.copyResize(b, width: maxKante, interpolation: img.Interpolation.average)
        : img.copyResize(b, height: maxKante, interpolation: img.Interpolation.average);
  }
  return img.encodeJpg(b, quality: qualitaet);
}

/// Wie [fotoVerkleinern], aber in einem eigenen Isolate, damit die
/// Oberflaeche nicht stockt.
Future<Uint8List> fotoVerkleinernImHintergrund(Uint8List roh) =>
    compute(_verkleinern, roh, debugLabel: 'fotoVerkleinern');

Uint8List _verkleinern(Uint8List roh) => fotoVerkleinern(roh);
