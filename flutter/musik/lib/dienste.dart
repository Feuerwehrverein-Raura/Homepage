// Alles, was die Oberflaeche von aussen braucht, an einer Stelle - damit
// Tests es durch Nachbauten ersetzen koennen (kein Netz, kein Browser, kein
// echter Schluesselbund, kein Lautsprecher).

import 'package:fwv_core/desktop.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:fwv_roterschopf/fwv_roterschopf.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';

class Dienste {
  Dienste({
    required this.sitzung,
    required this.authentik,
    MusikZugang Function(SitzungsVerwaltung sitzung)? musikZugang,
    this.wiedergabe,
    this.senderAdresse,
  }) : _musikZugang = musikZugang ?? ((s) => ApiMusikZugang(s.api));

  /// Die echte App: Schluesselbund des Systems (macOS Schluesselbund,
  /// Windows Anmeldeinformationen, Linux Secret Service), echtes Backend,
  /// Anmeldung im System-Browser ueber Loopback - wie die Mitglieder-App als
  /// Desktop-Programm (docs/flutter-desktop.md). Dieselbe Authentik-
  /// Anwendung (fwv-members-app), darum dieselbe Rueckleitungs-Regel.
  factory Dienste.echt() {
    return Dienste(
      sitzung: SitzungsVerwaltung(
        speicher: SitzungsSpeicher(SichererSpeicher()),
        http: http.Client(),
      ),
      authentik: LoopbackAnmeldung(
        browserOeffnen: (adresse) => launchUrl(adresse, mode: LaunchMode.externalApplication),
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

  MusikPlayer? _player;

  /// Der eine Player der App; er lebt laenger als jeder Bildschirm.
  MusikPlayer get player =>
      _player ??= MusikPlayer(zugang: musik, wiedergabe: wiedergabe, senderAdresse: senderAdresse);

  /// Reiter "Im Schopf": den Laptop im Lokal fernbedienen. Gruppe Roter
  /// Schopf, Vorstand, admin - dasselbe prueft api-members.
  bool get laptopSteuern => hatRoterSchopfZugang(sitzung.sitzung);

  /// Abmelden - danach spielt hier nichts mehr weiter.
  Future<void> abmelden() async {
    final player = _player;
    _player = null;
    await player?.beenden();
    await sitzung.abmelden();
  }
}
