// Alles, was die Oberflaeche von aussen braucht, an einer Stelle - damit
// Tests es durch Nachbauten ersetzen koennen (kein Netz, kein Browser, kein
// echter Schluesselbund, kein Lautsprecher).

import 'dart:async';
import 'dart:io';

import 'package:fwv_core/desktop.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:fwv_roterschopf/fwv_roterschopf.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:url_launcher/url_launcher.dart';

class Dienste {
  Dienste({
    required this.sitzung,
    required this.authentik,
    MusikZugang Function(SitzungsVerwaltung sitzung)? musikZugang,
    this.wiedergabe,
    this.senderAdresse,
    this.musikOrdner,
  }) : _musikZugang = musikZugang ?? ((s) => ApiMusikZugang(s.api));

  /// Die echte App: Schluesselbund des Systems (macOS Schluesselbund,
  /// Windows Anmeldeinformationen, Linux Secret Service), echtes Backend,
  /// Anmeldung im System-Browser ueber Loopback - wie die Mitglieder-App als
  /// Desktop-Programm (docs/flutter-desktop.md). Dieselbe Authentik-
  /// Anwendung (fwv-members-app), darum dieselbe Rueckleitungs-Regel.
  factory Dienste.echt() {
    return Dienste(
      sitzung: SitzungsVerwaltung(
        // Eigener Bereich im macOS-Schluesselbund (siehe SichererSpeicher):
        // sonst fragt macOS fuer jeden Eintrag der Mitglieder-App nach dem
        // Passwort.
        speicher: SitzungsSpeicher(SichererSpeicher(null, 'ch.fwvraura.musik')),
        http: http.Client(),
      ),
      authentik: LoopbackAnmeldung(
        browserOeffnen: (adresse) => launchUrl(adresse, mode: LaunchMode.externalApplication),
      ),
      // Nicht im Cache-Ordner: den raeumt das System von sich aus.
      musikOrdner: () async => Directory(
        '${(await getApplicationSupportDirectory()).path}${Platform.pathSeparator}Musik',
      ),
    );
  }

  final SitzungsVerwaltung sitzung;
  final AuthentikAnmeldung authentik;
  final MusikZugang Function(SitzungsVerwaltung sitzung) _musikZugang;

  /// Nur fuer Tests: statt just_audio bzw. media_kit.
  final Wiedergabe? wiedergabe;

  /// Nur fuer Tests: Radio-Adressen nicht im Netz aufloesen.
  final Future<Uri> Function(Uri adresse)? senderAdresse;

  /// Playlists, Sender und der Laptop im Schopf (api-members, /kiosk/...).
  late final MusikZugang musik = _musikZugang(sitzung);

  /// Wo gespeicherte Musik liegt. Null (Tests): kein Speichern.
  final Future<Directory> Function()? musikOrdner;

  MusikAblage? _ablage;

  /// Musik auf diesem Computer, spielt auch ohne Netz. Beim ersten Zugriff
  /// wird mit dem Server abgeglichen (ohne Netz: still nichts).
  MusikAblage? get ablage {
    final ordner = musikOrdner;
    if (ordner == null) return null;
    if (_ablage case final a?) return a;
    final a = _ablage = MusikAblage(ordner: ordner, zugang: musik);
    unawaited(a.laden().then((_) => a.aktualisieren()).catchError((Object _) {}));
    return a;
  }

  MusikPlayer? _player;

  /// Der eine Player der App; er lebt laenger als jeder Bildschirm.
  MusikPlayer get player => _player ??= MusikPlayer(
    zugang: musik,
    ablage: ablage,
    wiedergabe: wiedergabe,
    senderAdresse: senderAdresse,
  );

  /// Reiter "Im Schopf": den Laptop im Lokal fernbedienen. Gruppe Roter
  /// Schopf, Vorstand, admin - dasselbe prueft api-members.
  bool get laptopSteuern => hatRoterSchopfZugang(sitzung.sitzung);

  /// Abmelden - danach spielt hier nichts mehr weiter, und die gespeicherte
  /// Musik ist vom Computer geloescht (sie ist nur fuer Mitglieder).
  Future<void> abmelden() async {
    final player = _player;
    _player = null;
    await player?.beenden();
    final ablage = musikOrdner == null
        ? null
        : (_ablage ?? MusikAblage(ordner: musikOrdner!, zugang: musik));
    _ablage = null;
    await ablage?.leeren();
    await sitzung.abmelden();
  }
}
