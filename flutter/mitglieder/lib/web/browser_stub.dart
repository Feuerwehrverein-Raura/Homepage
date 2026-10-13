// Gegenstueck zu browser_web.dart fuer Android und iOS: dort gibt es weder
// localStorage noch die Anmeldung ueber die Website.

import 'package:fwv_core/fwv_core.dart';

import '../anmeldung/authentik_anmeldung.dart';

GeheimSpeicher browserSpeicher() => throw UnsupportedError('nur im Browser');

AuthentikAnmeldung websiteAnmeldung() => throw UnsupportedError('nur im Browser');

/// Nach dem Abmelden auch die Website-Sitzung bei Authentik beenden.
void websiteAbmelden() {}
