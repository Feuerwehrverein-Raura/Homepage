// Die App als Desktop-Programm (Linux, Windows, macOS) - Nachfolger von
// vorstand-desktop (Tauri). Was dort anders ist als auf dem Handy:
//
// - Anmeldung: Loopback statt flutter_appauth (anmeldung/loopback_anmeldung.dart).
// - Schluesselbund: flutter_secure_storage (Linux: libsecret / GNOME-Schluessel-
//   bund bzw. KWallet ueber den Secret Service, Windows: Anmeldeinformationen,
//   macOS: Schluesselbund) - wie keyring in vorstand-desktop.
// - Dateien (PDF, .ics): kein Teilen-Menue, sondern speichern unter
//   "Downloads" und mit dem passenden Programm oeffnen.
// - Update: aus www.fwv-raura.ch/download/versionen.json; Windows und macOS
//   installieren selbst (fwv_core DesktopUpdater), Linux: Release-Seite.
// - Kein Push (Firebase gibt es auf Linux/Windows nicht), kein
//   Kontakt-Abgleich (Adressbuch ueber CardDAV).

import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart' show Rect;
import 'package:fwv_core/desktop.dart' show DesktopFassung, DesktopUpdater;
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../einstellungen/app_update.dart';

/// Laeuft die App als Desktop-Programm?
bool get istDesktop => !kIsWeb && (Platform.isLinux || Platform.isWindows || Platform.isMacOS);

/// Freier Dateiname in [ordner]: "Liste.pdf", sonst "Liste (2).pdf" usw.
String freierDateiname(String ordner, String dateiname, {bool Function(String pfad)? vorhanden}) {
  final gibts = vorhanden ?? (pfad) => File(pfad).existsSync();
  // Keine Pfadteile aus dem Dateinamen uebernehmen.
  var name = dateiname.replaceAll(r'\', '/').split('/').last;
  if (name.isEmpty || name == '.' || name == '..') name = 'Datei';
  final punkt = name.lastIndexOf('.');
  final stamm = punkt > 0 ? name.substring(0, punkt) : name;
  final endung = punkt > 0 ? name.substring(punkt) : '';
  String imOrdner(String n) => '$ordner${Platform.pathSeparator}$n';
  var pfad = imOrdner(name);
  for (var i = 2; gibts(pfad); i++) {
    pfad = imOrdner('$stamm ($i)$endung');
  }
  return pfad;
}

/// Statt Teilen: Datei unter "Downloads" speichern und mit dem Programm
/// oeffnen, das das System dafuer vorsieht (wie `open` in vorstand-desktop).
Future<void> dateiSpeichernUndOeffnen(Uint8List bytes, String dateiname, String mimeTyp, {Rect? ursprung}) async {
  final ordner = await _downloadOrdner();
  final pfad = freierDateiname(ordner.path, dateiname);
  await File(pfad).writeAsBytes(bytes, flush: true);
  if (!await launchUrl(Uri.file(pfad))) {
    throw FileSystemException('Datei gespeichert, aber kein Programm zum Oeffnen gefunden', pfad);
  }
}

Future<Directory> _downloadOrdner() async {
  try {
    final d = await getDownloadsDirectory();
    if (d != null) {
      await d.create(recursive: true);
      return d;
    }
  } on Object {
    // weiter unten
  }
  return getTemporaryDirectory();
}

/// Neuere Desktop-Fassung? Dieselbe versionen.json wie die APK
/// (www.fwv-raura.ch/download/), Eintrag mitglieder.desktop. Windows und
/// macOS installieren selbst (fwv_core DesktopUpdater), Linux fuehrt zur
/// Release-Seite.
class DesktopAppUpdate implements AppUpdate {
  DesktopAppUpdate({required Future<String> Function() appVersion, http.Client? client, String? system})
    : updater = DesktopUpdater(app: 'mitglieder', appVersion: appVersion, client: client, system: system);

  final DesktopUpdater updater;

  @override
  Future<UpdateStand> pruefen() async => desktopStand(updater, await updater.pruefen());

  @override
  Future<bool> playLaden() async => false;

  @override
  set beiGeladen(void Function()? f) {}

  @override
  Future<void> playAbschliessen() async {}
}

UpdateStand desktopStand(DesktopUpdater updater, DesktopFassung? f) {
  if (f == null) return const KeinUpdate();
  return DownloadUpdate(
    version: f.version,
    seite: f.seite,
    installieren: updater.kannSelbst(f) ? (fortschritt) => updater.installieren(f, fortschritt: fortschritt) : null,
    dmg: updater.system == 'macos',
  );
}
