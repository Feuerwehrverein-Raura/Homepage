// Die Mitglieder-App im Browser (Flutter Web, eingebettet in mein.html der
// Website): Anmeldung und Sitzung teilt sie mit der Website.
//
// - Sitzung: im localStorage des Browsers. Das Token liegt unter
//   `auth_token` - demselben Schluessel, den die Website nach der Anmeldung
//   schreibt (auth-callback.html). Wer auf der Website angemeldet ist, ist es
//   damit auch in der App und umgekehrt. Alles andere der App bekommt das
//   Praefix `fwv_app.`, damit es nicht mit der Website kollidiert.
// - Anmeldung: derselbe Weg wie mein.html - Authentik (Client fwv-members)
//   leitet auf auth-callback.html zurueck, das tauscht den Code beim Backend
//   und kehrt auf die Seite zurueck, von der aus angemeldet wurde.
//
// Auf Android und iOS gibt es das nicht (browser_stub.dart).

export 'browser_stub.dart' if (dart.library.js_interop) 'browser_web.dart';
