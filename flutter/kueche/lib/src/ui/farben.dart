// Farben wie in der frueheren nativen App (res/values/colors.xml): dunkel,
// Feuerwehr-Rot, Bar violett, Kueche orange.

import 'package:flutter/material.dart';

abstract final class Farben {
  static const hintergrund = Color(0xFF111827);
  static const flaeche = Color(0xFF1F2937);
  static const flaecheHoch = Color(0xFF374151);
  static const rot = Color(0xFFDC2626);
  static const akzent = Color(0xFFFBBF24);
  static const dringend = Color(0xFFEF4444);
  static const warnung = Color(0xFFF59E0B);
  static const text = Color(0xFFFFFFFF);
  static const textLeise = Color(0xFF9CA3AF);
  static const textGedaempft = Color(0xFF6B7280);
  static const bar = Color(0xFF8B5CF6);
  static const kueche = Color(0xFFF97316);
  static const erledigt = Color(0xFF22C55E);
  static const erledigtHinten = Color(0xFF14532D);
  static const putzen = Color(0xFF3B82F6);
}

ThemeData kuechenThema() => ThemeData(
  useMaterial3: true,
  brightness: Brightness.dark,
  colorScheme: ColorScheme.fromSeed(
    seedColor: Farben.rot,
    brightness: Brightness.dark,
    primary: Farben.rot,
    surface: Farben.flaeche,
  ),
  scaffoldBackgroundColor: Farben.hintergrund,
  filledButtonTheme: FilledButtonThemeData(
    style: FilledButton.styleFrom(
      minimumSize: const Size(64, 52),
      textStyle: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
    ),
  ),
  outlinedButtonTheme: OutlinedButtonThemeData(
    style: OutlinedButton.styleFrom(
      minimumSize: const Size(64, 52),
      textStyle: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
    ),
  ),
);
