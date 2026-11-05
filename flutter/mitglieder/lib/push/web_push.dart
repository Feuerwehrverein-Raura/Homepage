// Web-Push fuer die App im Browser (mein.html): siehe web_push_web.dart.
// Auf Android, iOS und Desktop gibt es das nicht (web_push_stub.dart).

export 'web_push_stub.dart' if (dart.library.js_interop) 'web_push_web.dart';
