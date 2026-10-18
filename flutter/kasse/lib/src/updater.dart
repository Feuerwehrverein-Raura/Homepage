// Updater der Kassen-App: fragt www.fwv-raura.ch/download/versionen.json
// (vom Vereinsserver gepflegt, docker/app-downloads/holen.sh) nach der
// neuesten Kasse. Laden, SHA-256 pruefen und Installer oeffnen macht
// android/.../MainActivity.kt ueber den Kanal ch.fwvraura.kasse/update.
import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;

const _versionenUrl = 'https://www.fwv-raura.ch/download/versionen.json';
const _apkUrl = 'https://www.fwv-raura.ch/download/';
const _kanal = MethodChannel('ch.fwvraura.kasse/update');

class NeueVersion {
  const NeueVersion(this.version, this.url, this.sha256);
  final String version;
  final String url;
  final String? sha256;
}

/// "2.10" > "2.9", fehlende Stellen zaehlen als 0
int versionVergleichen(String a, String b) {
  List<int> teile(String v) => v.split('.').map((t) => int.tryParse(t.replaceAll(RegExp(r'[^0-9]'), '')) ?? 0).toList();
  final x = teile(a), y = teile(b);
  for (var i = 0; i < (x.length > y.length ? x.length : y.length); i++) {
    final d = (i < x.length ? x[i] : 0) - (i < y.length ? y[i] : 0);
    if (d != 0) return d.sign;
  }
  return 0;
}

Future<String?> eigeneVersion() async {
  try {
    return await _kanal.invokeMethod<String>('version');
  } catch (_) {
    return null;
  }
}

/// Neuere Kasse auf der Website? null = aktuell oder nicht pruefbar.
Future<NeueVersion?> updatePruefen() async {
  try {
    final ich = await eigeneVersion();
    if (ich == null) return null;
    final r = await http.get(Uri.parse(_versionenUrl)).timeout(const Duration(seconds: 10));
    if (r.statusCode != 200) return null;
    final k = (json.decode(r.body) as Map)['kasse'];
    if (k is! Map || k['version'] is! String) return null;
    final neu = k['version'] as String;
    if (versionVergleichen(neu, ich) <= 0) return null;
    return NeueVersion(neu, '$_apkUrl${k['datei'] ?? 'kasse.apk'}', k['sha256'] as String?);
  } catch (_) {
    return null;
  }
}

Future<bool> darfInstallieren() async {
  try {
    return await _kanal.invokeMethod<bool>('darfInstallieren') ?? false;
  } catch (_) {
    return false;
  }
}

Future<void> erlaubnisOeffnen() => _kanal.invokeMethod('erlaubnisOeffnen');

/// Laedt, prueft und oeffnet den Android-Installer. Wirft bei Fehlern.
/// [fortschritt] bekommt 0..100 waehrend des Ladens (wie die Kuechen-App).
Future<void> installieren(NeueVersion v, {void Function(int prozent)? fortschritt}) async {
  _kanal.setMethodCallHandler((c) async {
    if (c.method == 'fortschritt' && c.arguments is int) fortschritt?.call(c.arguments as int);
  });
  try {
    await _kanal.invokeMethod('installieren', {'url': v.url, 'sha256': v.sha256});
  } on PlatformException catch (e) {
    throw Exception(e.message ?? 'Update fehlgeschlagen');
  }
}
