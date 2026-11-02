// Alles, was die Oberflaeche braucht, an einem Ort - in Tests mit Attrappen.

import 'geraet.dart';
import 'netz.dart';
import 'steuerung.dart';

class Dienste {
  Dienste({
    required this.einstellungen,
    required this.geraet,
    required this.system,
    required this.live,
    required this.vorOrt,
    required this.anmelden,
    required this.qrAnmelden,
    required this.erneuern,
    this.updateSuche,
    this.version,
    DateTime Function()? jetzt,
  }) : jetzt = jetzt ?? DateTime.now;

  /// Echte Dienste fuer die App.
  static Future<Dienste> echt() async {
    final netz = await Netz.erstellen();
    const geraet = Geraet();
    final auth = Anmeldedienst(netz);
    final version = await geraet.version();
    return Dienste(
      einstellungen: await Einstellungen.laden(geraet),
      geraet: geraet,
      system: (url, token) => HttpBestellsystem(netz, url, token),
      live: (url, token) => IoLiveVerbindung.verbinden(netz, url, token),
      vorOrt: () => vorOrtErreichbar(netz),
      anmelden: auth.anmelden,
      qrAnmelden: auth.qrAnmelden,
      erneuern: auth.erneuern,
      updateSuche: () => updatePruefen(netz.client, version),
      version: version,
    );
  }

  final Einstellungen einstellungen;
  final Geraet geraet;
  final SystemFabrik system;
  final LiveVerbinder live;
  final Future<bool> Function() vorOrt;
  final Future<AuthErgebnis> Function(String url, String passwort) anmelden;
  final Future<AuthErgebnis> Function(String url, String code) qrAnmelden;
  final Future<AuthErgebnis> Function(String url, String token) erneuern;
  final Future<NeueVersion?> Function()? updateSuche;
  final String? version;
  final DateTime Function() jetzt;

  /// Vor-Ort-Server (T400) bevorzugen, sonst der eingestellte (Cloud).
  Future<String> server() async => await vorOrt() ? lokalUrl : einstellungen.serverUrl;
}
