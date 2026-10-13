// Radiosender auf dem Handy: Adresse vor dem Abspielen aufloesen.
//
// Android laesst Apps nicht unverschluesselt ins Netz, und der Player folgt
// keiner Weiterleitung von https auf http. Genau das tun manche Sender (die
// alten SRG-Adressen /m/drs3/mp3_128 leiteten auf http um - am 13.10.2026
// deshalb "Source error"). Hier wird der Weiterleitung selbst gefolgt; zeigt
// sie auf http, wird dieselbe Adresse mit https versucht.

import 'package:http/http.dart' as http;

/// Der Sender spielt nur unverschluesselt (http) - auf dem Handy nicht
/// moeglich. Eine FormatException, damit die App den Text zeigt
/// (fehlerText).
class UnverschluesselterSender extends FormatException {
  const UnverschluesselterSender()
    : super(
        'Dieser Sender sendet nur unverschlüsselt (http) – das Handy spielt ihn nicht ab. '
        'Auf dem Laptop im Lokal geht er.',
      );
}

/// Folgt Weiterleitungen (hoechstens 5) und gibt die https-Adresse zurueck,
/// die tatsaechlich sendet. Wirft [UnverschluesselterSender], wenn eine
/// http-Adresse auch als https nicht erreichbar ist.
Future<Uri> senderAufloesen(Uri adresse, {http.Client? client}) async {
  final c = client ?? http.Client();
  var angehoben = adresse.scheme == 'http';
  var ziel = angehoben ? adresse.replace(scheme: 'https') : adresse;
  try {
    for (var i = 0; i < 5; i++) {
      final anfrage = http.Request('GET', ziel)..followRedirects = false;
      final http.StreamedResponse antwort;
      try {
        antwort = await c.send(anfrage).timeout(const Duration(seconds: 8));
      } on Object {
        // Die angehobene https-Variante gibt es nicht: nur http.
        if (angehoben) throw const UnverschluesselterSender();
        // Sonst soll der Player es selbst versuchen und den Fehler melden.
        return ziel;
      }
      // Ein Stream endet nie - nur die Kopfzeilen lesen.
      await antwort.stream.listen((_) {}).cancel();
      final weiter = antwort.headers['location'];
      if (antwort.statusCode >= 300 && antwort.statusCode < 400 && weiter != null) {
        var naechstes = ziel.resolve(weiter);
        angehoben = naechstes.scheme == 'http';
        if (angehoben) naechstes = naechstes.replace(scheme: 'https');
        ziel = naechstes;
        continue;
      }
      return ziel;
    }
    return ziel;
  } finally {
    if (client == null) c.close();
  }
}
