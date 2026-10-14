// Hinweis auf eine neue App-Version beim Start (Android; Desktop siehe
// desktop/desktop.dart).
//
// Aus Google Play installiert: Play In-App-Updates, flexibel — Hinweis, auf
// Antippen laedt Play im Hintergrund, danach "Neu starten". Gilt auch fuer
// Tester (Play liefert die Version ihres Tracks).
//
// Sonst (APK von GitHub, members-latest): die Datei members-latest.json am
// GitHub-Release sagt, welche Version dort liegt; ist sie neuer, fuehrt der
// Hinweis zum Herunterladen der APK. Installieren muss man sie von Hand.
//
// Der native Teil (Kanal "ch.fwvraura.members/update") steht in
// android/app/src/main/kotlin/.../AppUpdateKanal.kt:
//  - "quelle"       -> "play" oder "andere" (wer die App installiert hat)
//  - "pruefen"      -> {"verfuegbar": bool, "geladen": bool}
//  - "laden"        -> bool: flexibles Update gestartet?
//  - "abschliessen" -> null: installiert das geladene Update, App startet neu
// Umgekehrt ruft er "geladen" auf, sobald Play fertig heruntergeladen hat.

import 'dart:async';
import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;

/// Wo die GitHub-APK ihre Version ankuendigt (siehe
/// .github/workflows/build-android-members.yml, members-latest).
final githubVersionsDatei = Uri.parse(
  'https://github.com/Feuerwehrverein-Raura/Homepage/releases/download/members-latest/members-latest.json',
);

sealed class UpdateStand {
  const UpdateStand();
}

class KeinUpdate extends UpdateStand {
  const KeinUpdate();
}

/// Neue Version in Play; [geladen]: schon heruntergeladen, nur noch
/// neu starten.
class PlayUpdate extends UpdateStand {
  const PlayUpdate({required this.geladen});
  final bool geladen;
}

/// Neuere APK auf GitHub.
class ApkUpdate extends UpdateStand {
  const ApkUpdate({required this.version, required this.apk});
  final String version;
  final Uri apk;
}

/// Neuere Desktop-Fassung: [seite] ist die Release-Seite mit den Dateien.
class DownloadUpdate extends UpdateStand {
  const DownloadUpdate({required this.version, required this.seite});
  final String version;
  final Uri seite;
}

abstract class AppUpdate {
  Future<UpdateStand> pruefen();

  /// Startet das flexible Play-Update; true, wenn Play es angenommen hat.
  Future<bool> playLaden();

  /// Wird aufgerufen, sobald das Play-Update heruntergeladen ist.
  set beiGeladen(void Function()? f);

  Future<void> playAbschliessen();
}

/// Tests, iOS: nie ein Hinweis.
class KeinAppUpdate implements AppUpdate {
  const KeinAppUpdate();

  @override
  Future<UpdateStand> pruefen() async => const KeinUpdate();

  @override
  Future<bool> playLaden() async => false;

  @override
  set beiGeladen(void Function()? f) {}

  @override
  Future<void> playAbschliessen() async {}
}

class AndroidAppUpdate implements AppUpdate {
  AndroidAppUpdate({
    required this.appVersion,
    http.Client? client,
    this.kanal = const MethodChannel(kanalName),
  }) : _client = client ?? http.Client() {
    kanal.setMethodCallHandler((call) async {
      if (call.method == 'geladen') _beiGeladen?.call();
    });
  }

  static const kanalName = 'ch.fwvraura.members/update';

  /// "1.0.1 (10001)" — wie [Dienste.appVersion].
  final Future<String> Function() appVersion;
  final http.Client _client;
  final MethodChannel kanal;
  void Function()? _beiGeladen;

  @override
  set beiGeladen(void Function()? f) => _beiGeladen = f;

  @override
  Future<UpdateStand> pruefen() async {
    try {
      final quelle = await kanal.invokeMethod<String>('quelle');
      if (quelle == 'play') {
        final antwort = await kanal.invokeMapMethod<String, Object?>('pruefen') ?? const {};
        if (antwort['geladen'] == true) return const PlayUpdate(geladen: true);
        if (antwort['verfuegbar'] == true) return const PlayUpdate(geladen: false);
        return const KeinUpdate();
      }
      return await _github();
    } on Object {
      // Kein Netz, kein Play, kein nativer Teil: dann eben kein Hinweis.
      return const KeinUpdate();
    }
  }

  Future<UpdateStand> _github() async {
    final antwort = await _client.get(githubVersionsDatei).timeout(const Duration(seconds: 10));
    if (antwort.statusCode != 200) return const KeinUpdate();
    return githubStand(antwort.body, await appVersion());
  }

  @override
  Future<bool> playLaden() async => await kanal.invokeMethod<bool>('laden') ?? false;

  @override
  Future<void> playAbschliessen() => kanal.invokeMethod<void>('abschliessen');
}

/// Wertet members-latest.json aus: {"version": "1.0.2", "apk": "https://…"}.
/// [installiert] wie [Dienste.appVersion] ("1.0.1 (10001)").
UpdateStand githubStand(String json, String installiert) {
  final daten = jsonDecode(json);
  if (daten is! Map) return const KeinUpdate();
  final version = daten['version'];
  final apk = daten['apk'];
  if (version is! String || apk is! String) return const KeinUpdate();
  final adresse = Uri.tryParse(apk);
  if (adresse == null || !istNeuer(version, installiert.split(' ').first)) return const KeinUpdate();
  return ApkUpdate(version: version, apk: adresse);
}

/// "1.0.10" > "1.0.9"; Unlesbares gilt nie als neuer.
bool istNeuer(String angeboten, String installiert) {
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
