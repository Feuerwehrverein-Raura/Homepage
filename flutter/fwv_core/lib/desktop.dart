/// Teile von fwv_core, die nur ausserhalb des Browsers laufen (dart:io):
/// die Anmeldung ueber Authentik auf dem Desktop. Getrennt von
/// fwv_core.dart, damit die Web-Fassung der Mitglieder-App nichts davon
/// mitbringt.
library;

export 'src/auth/loopback_anmeldung.dart';
