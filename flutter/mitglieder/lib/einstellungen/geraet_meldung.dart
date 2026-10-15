// Geraete-Meldung: Die App sagt dem Backend einmal pro Start, welche
// Version auf welchem Geraet laeuft (POST members/me/geraet, Tabelle
// app_geraete, docker/backend-members/src/app-geraete.js). Der Vorstand
// sieht das unter Vorstand -> Geraete ("Welcher Tester hat welche Version?").
//
// Gemeldet wird nur:
//  - geraet_id: die Zufallskennung der App ([PushAnmeldung.geraeteId]) -
//    keine Hardware-ID
//  - plattform: android | ios | web | linux | windows | macos
//  - quelle: play | apk (Android, nativer Kanal "ch.fwvraura.members/update",
//    Methode "quelle"), web, desktop, sonst unbekannt
//  - app_version, build_nummer (PackageInfo)
//  - os_version und geraet_modell, soweit ohne weiteres Paket bekannt:
//    Android ueber denselben Kanal (Methode "geraet", ab 1.0.24), sonst
//    Platform.operatingSystemVersion; im Browser nichts.
//
// Keine IP, kein Standort. Fehler werden still geschluckt - die Meldung ist
// Beiwerk und darf nie stoeren.

import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show MethodChannel;
import 'package:fwv_core/fwv_core.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../desktop/desktop.dart' show istDesktop;
import 'app_update.dart' show AndroidAppUpdate;

/// Was die App ueber dieses Geraet meldet (Feldnamen wie im Backend).
@immutable
class GeraeteAngaben {
  const GeraeteAngaben({
    required this.plattform,
    this.quelle = 'unbekannt',
    this.appVersion,
    this.buildNummer,
    this.osVersion,
    this.modell,
  });

  final String plattform;
  final String quelle;
  final String? appVersion;
  final int? buildNummer;
  final String? osVersion;
  final String? modell;

  Map<String, Object?> alsJson() => {
    'plattform': plattform,
    'quelle': quelle,
    'app_version': ?appVersion,
    'build_nummer': ?buildNummer,
    'os_version': ?_kurz(osVersion),
    'geraet_modell': ?_kurz(modell),
  };

  static String? _kurz(String? t) {
    final s = t?.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (s == null || s.isEmpty) return null;
    return s.length > 100 ? s.substring(0, 100) : s;
  }
}

/// Liest die Angaben (echte App: [geraeteAngabenAusSystem]; Tests: fest).
typedef GeraeteAngabenLesen = Future<GeraeteAngaben> Function();

/// Angaben aus dem laufenden System. Wirft nie: was fehlt, bleibt leer.
Future<GeraeteAngaben> geraeteAngabenAusSystem({
  MethodChannel kanal = const MethodChannel(AndroidAppUpdate.kanalName),
}) async {
  String? version;
  int? build;
  try {
    final info = await PackageInfo.fromPlatform();
    version = info.version.isEmpty ? null : info.version;
    build = int.tryParse(info.buildNumber);
  } on Object {
    // Ohne Version melden ist besser als gar nicht.
  }
  if (kIsWeb) {
    return GeraeteAngaben(plattform: 'web', quelle: 'web', appVersion: version, buildNummer: build);
  }
  if (Platform.isAndroid) {
    String quelle = 'unbekannt';
    String? os;
    String? modell;
    try {
      final q = await kanal.invokeMethod<String>('quelle');
      quelle = q == 'play' ? 'play' : (q == null ? 'unbekannt' : 'apk');
    } on Object {
      // Kein nativer Teil (Tests, Entwicklung).
    }
    try {
      final g = await kanal.invokeMapMethod<String, Object?>('geraet');
      if (g != null) {
        modell = g['modell'] as String?;
        final android = g['android'];
        final sdk = g['sdk'];
        if (android != null) os = sdk == null ? 'Android $android' : 'Android $android (SDK $sdk)';
      }
    } on Object {
      // Aeltere native Seite ohne "geraet": nur Version und Quelle.
    }
    return GeraeteAngaben(
      plattform: 'android',
      quelle: quelle,
      appVersion: version,
      buildNummer: build,
      osVersion: os,
      modell: modell,
    );
  }
  final plattform = Platform.isIOS
      ? 'ios'
      : Platform.isMacOS
      ? 'macos'
      : Platform.isWindows
      ? 'windows'
      : 'linux';
  String? os;
  try {
    os = Platform.operatingSystemVersion;
  } on Object {
    os = null;
  }
  return GeraeteAngaben(
    plattform: plattform,
    quelle: istDesktop ? 'desktop' : 'unbekannt',
    appVersion: version,
    buildNummer: build,
    osVersion: os,
  );
}

/// Meldet das Geraet hoechstens einmal pro App-Start (und nach einem
/// Kontowechsel erneut, siehe [vergessen]).
class GeraetMeldung {
  GeraetMeldung({required this.lesen, required this.geraeteId});

  final GeraeteAngabenLesen lesen;
  final Future<String> Function() geraeteId;

  Future<Map<String, Object?>>? _angaben;
  bool _gemeldet = false;

  /// Die Angaben als JSON (einmal gelesen), oder leer bei Fehlern - fuer
  /// die Push-Token-Anmeldung.
  Future<Map<String, Object?>> felder() => _angaben ??= () async {
    try {
      return (await lesen()).alsJson();
    } on Object catch (e) {
      debugPrint('Geraete-Angaben nicht lesbar: $e');
      return const <String, Object?>{};
    }
  }();

  /// POST members/me/geraet - einmal, Fehler werden geschluckt.
  Future<void> melden(MitgliederDienst dienst) async {
    if (_gemeldet) return;
    _gemeldet = true;
    try {
      final angaben = await felder();
      if (angaben.isEmpty) return;
      await dienst.geraetMelden(geraeteId: await geraeteId(), angaben: angaben);
    } on Object catch (e) {
      debugPrint('Geraet nicht gemeldet: $e');
    }
  }

  /// Nach dem Abmelden: das naechste Konto meldet sich wieder.
  void vergessen() => _gemeldet = false;
}
