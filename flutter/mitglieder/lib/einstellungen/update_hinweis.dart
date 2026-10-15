// Hinweis unten am Bildschirm, wenn es eine neue App-Version gibt (siehe
// app_update.dart). Einmal pro Start, nie blockierend. Beim APK-Update
// erklaert vor dem Herunterladen ein kurzer Dialog die Rueckfrage von Chrome.

import 'dart:async';

import 'package:material_ui/material_ui.dart';

import '../dienste.dart';
import 'app_update.dart';

Future<void> updateHinweisZeigen(BuildContext context, Dienste dienste) async {
  final messenger = ScaffoldMessenger.of(context);
  final update = dienste.update;
  final stand = await update.pruefen();

  void neuStartenAnbieten() => messenger.showSnackBar(
    SnackBar(
      content: const Text('Neue Version geladen.'),
      duration: const Duration(minutes: 10),
      action: SnackBarAction(
        label: 'Neu starten',
        onPressed: () => unawaited(update.playAbschliessen()),
      ),
    ),
  );

  switch (stand) {
    case KeinUpdate():
      return;
    case PlayUpdate(geladen: true):
      neuStartenAnbieten();
    case PlayUpdate():
      update.beiGeladen = neuStartenAnbieten;
      messenger.showSnackBar(
        SnackBar(
          content: const Text('Eine neue Version der App ist verfügbar.'),
          duration: const Duration(seconds: 15),
          action: SnackBarAction(label: 'Laden', onPressed: () => unawaited(update.playLaden())),
        ),
      );
    case ApkUpdate(:final version, :final apk):
      messenger.showSnackBar(
        SnackBar(
          content: Text('Version $version ist verfügbar.'),
          duration: const Duration(seconds: 15),
          action: SnackBarAction(
            label: 'Herunterladen',
            onPressed: () {
              if (context.mounted) {
                unawaited(apkUpdateErklaeren(context, version, apk, dienste.linkOeffnen));
              } else {
                unawaited(dienste.linkOeffnen(apk));
              }
            },
          ),
        ),
      );
    case DownloadUpdate(:final version, :final seite):
      messenger.showSnackBar(
        SnackBar(
          content: Text('Neue Version verfügbar: $version'),
          duration: const Duration(seconds: 30),
          action: SnackBarAction(
            label: 'Herunterladen',
            onPressed: () => unawaited(dienste.linkOeffnen(seite)),
          ),
        ),
      );
  }
}

/// APK-Update (Installation nicht aus Play): erst sagen, was Chrome gleich
/// fragt, dann die Datei im Browser oeffnen. Chrome fragt bei jeder APK
/// ausserhalb von Play «Die Datei könnte schädlich sein»; ohne Hinweis
/// brechen viele dort ab.
///
/// Die App laedt und installiert die APK bewusst nicht selbst: dafuer
/// braeuchte sie REQUEST_INSTALL_PACKAGES, und die Play-Fassung (dieselbe
/// Datei, von Play signiert) darf sich nach der Play-Richtlinie «Device and
/// Network Abuse» nicht an Play vorbei aktualisieren.
Future<void> apkUpdateErklaeren(
  BuildContext context,
  String version,
  Uri apk,
  Future<bool> Function(Uri adresse) linkOeffnen,
) async {
  final laden = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text('Version $version installieren'),
      content: const SingleChildScrollView(
        child: Text(
          'Die neue Version öffnet sich in Chrome.\n\n'
          '1. Chrome fragt «Die Datei könnte schädlich sein» – das kommt bei jeder App '
          'ausserhalb des Play Stores. Tippe auf «Trotzdem herunterladen».\n'
          '2. Dann auf «Öffnen» und «Aktualisieren» tippen.\n\n'
          'Deine Anmeldung bleibt erhalten.',
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Später')),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(true),
          child: const Text('Herunterladen'),
        ),
      ],
    ),
  );
  if (laden == true) await linkOeffnen(apk);
}
