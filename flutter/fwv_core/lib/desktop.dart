/// Teile von fwv_core, die nur ausserhalb des Browsers laufen (dart:io):
/// die Anmeldung ueber Authentik auf dem Desktop und das Update der
/// Desktop-Programme. Getrennt von
/// fwv_core.dart, damit die Web-Fassung der Mitglieder-App nichts davon
/// mitbringt.
library;

export 'src/auth/loopback_anmeldung.dart';
export 'src/update/desktop_update.dart';
