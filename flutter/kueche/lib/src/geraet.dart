// Kanal zum Android-Teil (android/.../MainActivity.kt) und gespeicherte
// Einstellungen. Ohne Android (Tests) tut der Kanal nichts.

import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'modelle.dart';
import 'netz.dart' show cloudUrl;
import 'token.dart';

const _kanal = MethodChannel('ch.fwvraura.kitchendisplay/geraet');

/// Ablage der APKs; fuer Tests umstellbar (--dart-define KUECHE_DOWNLOAD=...).
const downloadUrl = String.fromEnvironment(
  'KUECHE_DOWNLOAD',
  defaultValue: 'https://www.fwv-raura.ch/download',
);

class Geraet {
  const Geraet();

  Future<T?> _rufen<T>(String methode, [Object? argumente]) async {
    try {
      return await _kanal.invokeMethod<T>(methode, argumente);
    } on Object {
      return null;
    }
  }

  Future<String?> version() => _rufen<String>('version');

  /// Drei Toene wie bisher (ToneGenerator).
  Future<void> ton() => _rufen('ton');

  Future<Map<String, Object?>> alteEinstellungen() async =>
      Map<String, Object?>.from(await _rufen<Map>('alteEinstellungen') ?? const {});

  Future<void> alteEinstellungenLoeschen() => _rufen('alteEinstellungenLoeschen');

  Future<void> alsStartbildschirm(bool an) => _rufen('alsStartbildschirm', {'an': an});

  Future<void> beenden() => _rufen('beenden');

  /// Geraetesperre (KioskAdmin.kt): ist die App Geraetebesitzer, ist die Sperre aktiv?
  Future<({bool besitzer, bool aktiv})> sperre() async {
    final m = await _rufen<Map>('sperre') ?? const {};
    return (besitzer: m['besitzer'] == true, aktiv: m['aktiv'] == true);
  }

  /// Sperre loesen und Geraetebesitz abgeben - danach eine gewoehnliche App.
  Future<void> sperreAufheben() => _rufen('sperreAufheben');

  Future<bool> darfInstallieren() async => await _rufen<bool>('darfInstallieren') ?? false;

  Future<void> erlaubnisOeffnen() => _rufen('erlaubnisOeffnen');

  /// Laedt, prueft (SHA-256) und oeffnet den Installer. Wirft bei Fehlern.
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
}

class NeueVersion {
  const NeueVersion(this.version, this.url, this.sha256);
  final String version;
  final String url;
  final String? sha256;
}

/// Neuere Kuechen-App auf www.fwv-raura.ch/download/versionen.json
/// (Schluessel "kueche", docker/app-downloads/holen.sh)? null = aktuell oder
/// nicht pruefbar.
Future<NeueVersion?> updatePruefen(http.Client client, String? ich) async {
  if (ich == null) return null;
  try {
    final r = await client.get(Uri.parse('$downloadUrl/versionen.json')).timeout(const Duration(seconds: 10));
    if (r.statusCode != 200) return null;
    final k = (jsonDecode(r.body) as Map)['kueche'];
    if (k is! Map || k['version'] is! String) return null;
    final neu = k['version'] as String;
    if (versionVergleichen(neu, ich) <= 0) return null;
    return NeueVersion(neu, '$downloadUrl/${k['datei'] ?? 'kueche.apk'}', k['sha256'] as String?);
  } on Object {
    return null;
  }
}

/// Gespeicherte Einstellungen. Beim ersten Start nach dem Wechsel von der
/// nativen App (kds-v3.x) werden deren Werte uebernommen.
class Einstellungen {
  Einstellungen(this._p);

  final SharedPreferences _p;

  static const standardCode = '9876';

  static Future<Einstellungen> laden(Geraet geraet) async {
    final p = await SharedPreferences.getInstance();
    final e = Einstellungen(p);
    if (p.getBool('uebernommen') != true) {
      final alt = await geraet.alteEinstellungen();
      if (alt['token'] is String) await p.setString('token', alt['token'] as String);
      if (alt['station'] is String) await p.setString('station', alt['station'] as String);
      if (alt['server_url'] is String) await p.setString('server_url', alt['server_url'] as String);
      if (alt['sound_enabled'] is bool) await p.setBool('ton', alt['sound_enabled'] as bool);
      if (alt['exit_code'] is String) await p.setString('code', alt['exit_code'] as String);
      if (alt['as_home'] is bool) await p.setBool('als_start', alt['as_home'] as bool);
      await p.setBool('uebernommen', true);
    }
    return e;
  }

  String? get token => _p.getString('token');
  Future<void> tokenSetzen(String? t) => t == null ? _p.remove('token') : _p.setString('token', t);

  /// null, solange noch keine gewaehlt wurde.
  Station? get station => Station.ausKennung(_p.getString('station'));
  Future<void> stationSetzen(Station s) => _p.setString('station', s.kennung);

  String get serverUrl {
    final u = _p.getString('server_url')?.trim();
    return u == null || u.isEmpty ? cloudUrl : u;
  }

  Future<void> serverUrlSetzen(String u) => _p.setString('server_url', u.trim());

  bool get ton => _p.getBool('ton') ?? true;
  Future<void> tonSetzen(bool an) => _p.setBool('ton', an);

  /// Ausgangs-Code fuer den Kioskmodus. Das Repo ist oeffentlich - der Code
  /// schuetzt nur vor versehentlichem Verlassen, nicht vor Angriffen.
  String get code {
    final c = _p.getString('code')?.trim();
    return c == null || c.isEmpty ? standardCode : c;
  }

  Future<void> codeSetzen(String c) => _p.setString('code', c.trim());

  bool get alsStart => _p.getBool('als_start') ?? false;
  Future<void> alsStartSetzen(bool an) => _p.setBool('als_start', an);
}
