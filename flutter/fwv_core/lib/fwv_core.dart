/// Gemeinsamer Kern der FWV-Apps (Mitglieder und Vorstand): Modelle so, wie
/// das Backend sie liefert, API-Zugriff und Anmeldung. Hier liegt alles, was
/// beide Apps gleich brauchen — damit es nicht wieder doppelt gebaut wird
/// (siehe docs/flutter-entscheidung.md). Keine Oberflaeche.
library;

export 'src/api/api_client.dart';
export 'src/arbeitsplan.dart';
export 'src/auth/altdaten_uebernahme.dart';
export 'src/auth/konfiguration.dart';
export 'src/auth/qr_login_code.dart';
export 'src/auth/sitzung.dart';
export 'src/auth/sitzungs_verwaltung.dart';
