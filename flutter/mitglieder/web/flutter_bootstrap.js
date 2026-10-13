{{flutter_js}}
{{flutter_build_config}}

// Die Mitglieder-App im Browser. Gebaut nach /mein/ der Website
// (docker/frontend-website/mein/, siehe build-containers.yml).
//
// Eingebettet: Steht auf der Seite ein Element #fwv-app (mein.html), zeichnet
// die App nur dort hinein - Kopf und Fuss bleiben die der Website. Sonst
// (direkt /mein/) ganzseitig.
//
// Alles von der eigenen Adresse, auch CanvasKit: keine Abfragen bei Google.
const basis = '/mein/';
const host = document.querySelector('#fwv-app');
_flutter.loader.load({
  config: {
    entrypointBaseUrl: basis,
    assetBase: basis,
    canvasKitBaseUrl: basis + 'canvaskit/',
    ...(host ? { hostElement: host } : {}),
  },
});
