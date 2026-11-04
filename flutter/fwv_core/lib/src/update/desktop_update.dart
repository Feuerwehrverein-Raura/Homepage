// Updates fuer die Desktop-Programme (Mitglieder-App, FWV Musik).
//
// www.fwv-raura.ch/download/versionen.json (Vereinsserver,
// docker/app-downloads/holen.sh) nennt je App unter "desktop" die neueste
// Fassung mit Adresse und SHA-256 der Datei je System:
//
//   "musik": {..., "desktop": {"version": "1.3.1", "seite": "https://github.com/...",
//     "windows": {"url": ".../fwv-musik-1.3.1-windows-x64-setup.exe", "sha256": "...", "groesse": 1},
//     "macos":   {"url": ".../fwv-musik-1.3.1-macos.dmg", ...},
//     "linux":   {"url": ".../fwv-musik_1.3.1_amd64.deb", ...}}}
//
// Installieren:
// - Windows: Installer laden, still starten (/VERYSILENT), App beenden. Der
//   Installer (flutter/packaging/windows-setup.iss) startet sie danach wieder.
// - macOS: DMG laden und im Finder oeffnen, App beenden - man zieht sie in
//   «Programme» (Pfeil im Fenster, flutter/packaging/dmg-bauen.sh). Selbst
//   austauschen geht nicht: die App laeuft in der Sandbox.
// - Linux: Installieren braucht das Systempasswort - nur Hinweis, die
//   Release-Seite oeffnet die App selbst.
//
// Die Datei kommt ueber den eigenen http-Client, also ohne Quarantaene-
// bzw. Mark-of-the-Web-Vermerk: weder Gatekeeper noch SmartScreen fragen.

import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;

final desktopVersionsDatei = Uri.parse('https://www.fwv-raura.ch/download/versionen.json');

/// Eine neuere Desktop-Fassung fuer dieses System.
class DesktopFassung {
  const DesktopFassung({required this.version, required this.seite, this.datei, this.sha256});

  final String version;

  /// Release-Seite mit allen Dateien (Linux, oder wenn Selbst-Installieren
  /// nicht geht).
  final Uri seite;

  /// Datei fuer dieses System; null, wenn es keine gibt.
  final Uri? datei;
  final String? sha256;
}

/// Wertet versionen.json aus: neuere Fassung von [app] fuer [system]
/// ("windows", "macos", "linux") als [installiert] ("1.3.0" oder
/// "1.0.42 (10042)")? Sonst null.
DesktopFassung? desktopFassung(
  String json, {
  required String app,
  required String installiert,
  required String system,
}) {
  final Object? daten;
  try {
    daten = jsonDecode(json);
  } on FormatException {
    return null;
  }
  if (daten is! Map || daten[app] is! Map) return null;
  final d = (daten[app] as Map)['desktop'];
  if (d is! Map || d['version'] is! String) return null;
  final version = d['version'] as String;
  if (!versionNeuer(version, installiert.split(' ').first)) return null;
  final seite = Uri.tryParse('${d['seite'] ?? ''}');
  if (seite == null || !seite.hasScheme) return null;
  final f = d[system];
  final url = f is Map ? Uri.tryParse('${f['url'] ?? ''}') : null;
  final sha = f is Map && f['sha256'] is String && (f['sha256'] as String).length == 64 ? f['sha256'] as String : null;
  return DesktopFassung(version: version, seite: seite, datei: url != null && url.hasScheme ? url : null, sha256: sha);
}

/// "1.0.10" > "1.0.9"; Unlesbares gilt nie als neuer.
bool versionNeuer(String angeboten, String installiert) {
  List<int>? teile(String v) {
    final t = v.split('.').map(int.tryParse).toList();
    return t.length == 3 && !t.contains(null) ? t.cast<int>() : null;
  }

  final a = teile(angeboten);
  final b = teile(installiert);
  if (a == null || b == null) return false;
  for (var i = 0; i < 3; i++) {
    if (a[i] != b[i]) return a[i] > b[i];
  }
  return false;
}

class DesktopUpdater {
  DesktopUpdater({required this.app, required this.appVersion, http.Client? client, String? system})
    : _client = client ?? http.Client(),
      system = system ?? Platform.operatingSystem;

  /// Schluessel in versionen.json ("mitglieder", "musik").
  final String app;

  /// Installierte Version ("1.3.0" oder "1.0.42 (10042)").
  final Future<String> Function() appVersion;
  final String system;
  final http.Client _client;

  /// Neuere Fassung? null = aktuell, kein Netz oder nicht lesbar.
  Future<DesktopFassung?> pruefen() async {
    try {
      final antwort = await _client.get(desktopVersionsDatei).timeout(const Duration(seconds: 10));
      if (antwort.statusCode != 200) return null;
      return desktopFassung(antwort.body, app: app, installiert: await appVersion(), system: system);
    } on Object {
      return null;
    }
  }

  /// Kann sich die App selbst ersetzen? Sonst nur die Release-Seite.
  bool kannSelbst(DesktopFassung f) {
    if (f.datei == null || f.sha256 == null) return false;
    return system == 'windows' || system == 'macos';
  }

  /// Laedt, prueft und installiert [f], dann beendet sich die App (sie
  /// startet als neue Fassung wieder). Kommt nur bei einem Fehler zurueck.
  Future<void> installieren(DesktopFassung f, {void Function(double anteil)? fortschritt}) async {
    if (!kannSelbst(f)) throw const DesktopUpdateFehler('Bitte von der Download-Seite installieren.');
    final ordner = await Directory.systemTemp.createTemp('fwv-update-');
    final name = f.datei!.pathSegments.last;
    final datei = File('${ordner.path}${Platform.pathSeparator}$name');
    await _laden(f.datei!, datei, fortschritt);
    final summe = await sha256.bind(datei.openRead()).first;
    if ('$summe' != f.sha256!.toLowerCase()) {
      await ordner.delete(recursive: true);
      throw const DesktopUpdateFehler('Die geladene Datei ist beschädigt. Bitte später nochmals versuchen.');
    }
    if (system == 'windows') {
      await Process.start(datei.path, const [
        '/VERYSILENT',
        '/SUPPRESSMSGBOXES',
        '/NORESTART',
      ], mode: ProcessStartMode.detached);
    } else {
      // Beenden, sonst weigert sich der Finder, die laufende App zu ersetzen.
      final r = await Process.run('/usr/bin/open', [datei.path]);
      if (r.exitCode != 0) throw const DesktopUpdateFehler('Die neue Fassung liess sich nicht öffnen.');
    }
    exit(0);
  }

  Future<void> _laden(Uri url, File ziel, void Function(double anteil)? fortschritt) async {
    final antwort = await _client.send(http.Request('GET', url));
    if (antwort.statusCode != 200) {
      throw DesktopUpdateFehler('Download fehlgeschlagen (${antwort.statusCode}).');
    }
    final gesamt = antwort.contentLength;
    final aus = ziel.openWrite();
    var geladen = 0;
    try {
      await for (final stueck in antwort.stream) {
        aus.add(stueck);
        geladen += stueck.length;
        if (gesamt != null && gesamt > 0) fortschritt?.call(geladen / gesamt);
      }
    } finally {
      await aus.close();
    }
  }
}

class DesktopUpdateFehler implements Exception {
  const DesktopUpdateFehler(this.meldung);
  final String meldung;

  @override
  String toString() => meldung;
}
