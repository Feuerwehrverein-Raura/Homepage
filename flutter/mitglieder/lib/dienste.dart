// Alles, was die Oberflaeche von aussen braucht, an einer Stelle — damit
// Tests es durch Nachbauten ersetzen koennen (kein Netz, kein Browser, keine
// Kamera, kein echter Schluesselbund).

import 'package:fwv_core/fwv_core.dart';
import 'package:http/http.dart' as http;

import 'anmeldung/authentik_anmeldung.dart';

class Dienste {
  Dienste({
    required this.sitzung,
    required this.authentik,
    required this.uebernahme,
    this.qrScannen,
  });

  /// Die echte App: Geraete-Schluesselbund, echtes Backend.
  factory Dienste.echt() {
    final speicher = SitzungsSpeicher(SichererSpeicher());
    return Dienste(
      sitzung: SitzungsVerwaltung(
        speicher: speicher,
        http: http.Client(),
        beimAbmelden: pushTokenAbmelden,
      ),
      authentik: AppAuthAnmeldung(),
      uebernahme: AltdatenUebernahme(
        quelle: const MethodChannelAltdatenQuelle(),
        speicher: speicher,
      ),
    );
  }

  final SitzungsVerwaltung sitzung;
  final AuthentikAnmeldung authentik;
  final AltdatenUebernahme uebernahme;

  /// Ersetzt in Tests den Kamera-Screen; liefert den gelesenen Text.
  final Future<String?> Function()? qrScannen;

  /// Beim Start: alte Anmeldung uebernehmen (einmalig), dann Sitzung laden.
  Future<void> starten() async {
    await uebernahme.ausfuehren();
    await sitzung.laden();
  }
}

/// Meldet beim Abmelden das Push-Token dieses Geraets beim Backend ab
/// (`members/me/fcm-token`), damit keine Benachrichtigungen mehr ankommen.
/// Solange die App noch keine Push-Nachrichten empfaengt, gibt es nichts
/// abzumelden.
Future<void> pushTokenAbmelden(ApiClient api) async {}
