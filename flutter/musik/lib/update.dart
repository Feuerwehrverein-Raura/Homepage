// Updates fuer FWV Musik auf Android (nicht im Play Store): fragt
// www.fwv-raura.ch/download/versionen.json (vom Vereinsserver gepflegt,
// docker/app-downloads/holen.sh) nach der neuesten Fassung. Laden, SHA-256
// pruefen und Installer oeffnen macht android/.../MainActivity.kt ueber den
// Kanal ch.fwvraura.musik/update - wie in der Kassen-App.

import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:material_ui/material_ui.dart';

const _versionenUrl = 'https://www.fwv-raura.ch/download/versionen.json';
const _apkUrl = 'https://www.fwv-raura.ch/download/';
const _kanal = MethodChannel('ch.fwvraura.musik/update');

class NeueVersion {
  const NeueVersion(this.version, this.url, this.sha256);
  final String version;
  final String url;
  final String? sha256;
}

/// "1.10.0" > "1.9.3", fehlende Stellen zaehlen als 0.
int versionVergleichen(String a, String b) {
  List<int> teile(String v) =>
      v.split('.').map((t) => int.tryParse(t.replaceAll(RegExp(r'[^0-9]'), '')) ?? 0).toList();
  final x = teile(a), y = teile(b);
  for (var i = 0; i < (x.length > y.length ? x.length : y.length); i++) {
    final d = (i < x.length ? x[i] : 0) - (i < y.length ? y[i] : 0);
    if (d != 0) return d.sign;
  }
  return 0;
}

/// Neuere Fassung im Eintrag "musik" von versionen.json? null = aktuell.
NeueVersion? neuereVersion(Map<String, dynamic> versionen, String ich) {
  final m = versionen['musik'];
  if (m is! Map || m['version'] is! String) return null;
  final neu = m['version'] as String;
  if (versionVergleichen(neu, ich) <= 0) return null;
  return NeueVersion(neu, '$_apkUrl${m['datei'] ?? 'musik.apk'}', m['sha256'] as String?);
}

/// Neuere Fassung auf der Website? null = aktuell oder nicht pruefbar.
Future<NeueVersion?> updatePruefen() async {
  try {
    final ich = await _kanal.invokeMethod<String>('version');
    if (ich == null) return null;
    final r = await http.get(Uri.parse(_versionenUrl)).timeout(const Duration(seconds: 10));
    if (r.statusCode != 200) return null;
    return neuereVersion(Map<String, dynamic>.from(json.decode(r.body) as Map), ich);
  } on Object {
    return null;
  }
}

/// Laedt, prueft und oeffnet den Android-Installer. Fehlt die Erlaubnis
/// "Unbekannte Apps installieren", oeffnet es zuerst diese Einstellung.
Future<void> installieren(NeueVersion v, {void Function(int prozent)? fortschritt}) async {
  final darf = await _kanal.invokeMethod<bool>('darfInstallieren') ?? false;
  if (!darf) {
    await _kanal.invokeMethod<void>('erlaubnisOeffnen');
    return;
  }
  _kanal.setMethodCallHandler((c) async {
    if (c.method == 'fortschritt' && c.arguments is int) fortschritt?.call(c.arguments as int);
  });
  try {
    await _kanal.invokeMethod<void>('installieren', {'url': v.url, 'sha256': v.sha256});
  } on PlatformException catch (e) {
    throw Exception(e.message ?? 'Update fehlgeschlagen');
  }
}

/// Hinweis oben in der App: "Neue Version 1.4.0 - Aktualisieren".
class UpdateHinweis extends StatefulWidget {
  const UpdateHinweis({super.key, required this.version});

  final NeueVersion version;

  @override
  State<UpdateHinweis> createState() => _UpdateHinweisState();
}

class _UpdateHinweisState extends State<UpdateHinweis> {
  int? _prozent;
  String? _fehler;

  Future<void> _los() async {
    setState(() {
      _prozent = 0;
      _fehler = null;
    });
    try {
      await installieren(widget.version, fortschritt: (p) => setState(() => _prozent = p));
    } on Object catch (e) {
      _fehler = '$e'.replaceFirst('Exception: ', '');
    }
    if (mounted) setState(() => _prozent = null);
  }

  @override
  Widget build(BuildContext context) {
    final p = _prozent;
    return MaterialBanner(
      key: const Key('update-hinweis'),
      leading: const Icon(Icons.system_update),
      content: Text(
        _fehler ??
            (p == null
                ? 'FWV Musik ${widget.version.version} ist da.'
                : 'Lädt FWV Musik ${widget.version.version} … $p %'),
      ),
      actions: [TextButton(onPressed: p == null ? _los : null, child: const Text('Aktualisieren'))],
    );
  }
}
