// Hinweis unten am Bildschirm, wenn es eine neue App-Version gibt (siehe
// app_update.dart). Einmal pro Start, nie blockierend.

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
      action: SnackBarAction(label: 'Neu starten', onPressed: () => unawaited(update.playAbschliessen())),
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
          action: SnackBarAction(label: 'Herunterladen', onPressed: () => unawaited(dienste.linkOeffnen(apk))),
        ),
      );
    case DownloadUpdate(:final version, :final seite):
      messenger.showSnackBar(
        SnackBar(
          content: Text('Neue Version verfügbar: $version'),
          duration: const Duration(seconds: 30),
          action: SnackBarAction(label: 'Herunterladen', onPressed: () => unawaited(dienste.linkOeffnen(seite))),
        ),
      );
  }
}
