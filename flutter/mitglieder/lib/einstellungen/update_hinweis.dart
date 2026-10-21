// Hinweis unten am Bildschirm, wenn es eine neue App-Version gibt (siehe
// app_update.dart). Beim Start, bei der Rueckkehr in die App (hauptseite.dart,
// hoechstens alle paar Stunden) und auf Wunsch unter Mehr > Version; nie
// blockierend. Mit Schaltflaeche bleibt der Hinweis stehen, bis man sie oder
// das Kreuz antippt - immer nur einer auf einmal. Beim APK-Update erklaert
// vor dem Herunterladen ein kurzer Dialog die Rueckfrage von Chrome.

import 'dart:async';

import 'package:material_ui/material_ui.dart';

import '../dienste.dart';
import 'app_update.dart';

/// Der gerade sichtbare Update-Hinweis samt seinem ScaffoldMessenger; ein
/// neuer ersetzt ihn statt sich dahinter einzureihen. Den Messenger braucht
/// es, weil ein Hinweis eines inzwischen abgebauten Bildschirms nicht mehr
/// geschlossen werden darf.
(ScaffoldMessengerState, ScaffoldFeatureController<SnackBar, SnackBarClosedReason>)? _offen;

/// [auchOhneUpdate]: von Hand gesucht - dann auch "neueste Version" melden.
Future<void> updateHinweisZeigen(
  BuildContext context,
  Dienste dienste, {
  bool auchOhneUpdate = false,
}) async {
  final messenger = ScaffoldMessenger.of(context);
  final update = dienste.update;
  final stand = await update.pruefen();

  void zeigen(SnackBar hinweis) {
    if (_offen case (final bei, final alt) when bei == messenger && bei.mounted) alt.close();
    final c = messenger.showSnackBar(hinweis);
    _offen = (messenger, c);
    unawaited(c.closed.then((_) => _offen?.$2 == c ? _offen = null : null));
  }

  void neuStartenAnbieten() => zeigen(
    SnackBar(
      showCloseIcon: true,
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
      if (auchOhneUpdate) zeigen(const SnackBar(content: Text('Du hast die neueste Version.')));
    case PlayUpdate(geladen: true):
      neuStartenAnbieten();
    case PlayUpdate():
      update.beiGeladen = neuStartenAnbieten;
      zeigen(
        SnackBar(
          showCloseIcon: true,
          content: const Text('Eine neue Version der App ist verfügbar.'),
          duration: const Duration(seconds: 15),
          action: SnackBarAction(label: 'Laden', onPressed: () => unawaited(update.playLaden())),
        ),
      );
    case ApkUpdate(:final version, :final apk):
      zeigen(
        SnackBar(
          showCloseIcon: true,
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
      zeigen(
        SnackBar(
          showCloseIcon: true,
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
