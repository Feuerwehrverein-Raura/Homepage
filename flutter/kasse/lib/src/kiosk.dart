// Geraetesperre statt Fully Kiosk (android/.../MainActivity.kt, KioskAdmin.kt;
// gleich wie flutter/kueche). Aktiv, sobald die App per adb Geraetebesitzer
// ist. Verlassen und Aufheben nur mit dem Kiosk-Code - den Reiter
// Einstellungen sieht jeder an der Kasse.
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _kanal = MethodChannel('ch.fwvraura.kasse/update');

/// Wie die Kuechen-App (Ausgangs-Code), aenderbar in den Einstellungen.
const standardKioskCode = '9876';

Future<T?> _rufen<T>(String methode) async {
  try {
    return await _kanal.invokeMethod<T>(methode);
  } on Object {
    return null;
  }
}

/// Ist die Kasse Geraetebesitzer, ist die Sperre gerade aktiv?
Future<({bool besitzer, bool aktiv})> sperre() async {
  final m = await _rufen<Map>('sperre') ?? const {};
  return (besitzer: m['besitzer'] == true, aktiv: m['aktiv'] == true);
}

/// Home und Statusleiste bis zum naechsten Start freigeben und schliessen.
Future<void> kasseVerlassen() => _rufen('beenden');

/// Sperre loesen und Geraetebesitz abgeben - danach eine gewoehnliche App.
Future<void> sperreAufheben() => _rufen('sperreAufheben');

Future<String> kioskCode() async {
  final c = (await SharedPreferences.getInstance()).getString('kiosk_code')?.trim();
  return c == null || c.isEmpty ? standardKioskCode : c;
}

Future<void> kioskCodeSetzen(String c) async =>
    (await SharedPreferences.getInstance()).setString('kiosk_code', c.trim());
