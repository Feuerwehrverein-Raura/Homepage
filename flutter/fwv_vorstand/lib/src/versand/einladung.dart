// Einladung zu einem Anlass: Betreff und Einleitung fuer "Verfassen". Den
// Rest - Titel, Beschreibung, Datentabelle, Schichten, Unterschriften und
// QR-Code - setzt das Backend im Einladungs-Layout dazu
// (docker/backend-dispatch/src/einladung-layout.js, dasselbe wie die
// Website), und das PDF des Anlasses kommt als Anhang mit.

import 'package:fwv_core/fwv_core.dart';

/// Betreff und Text, mit denen "Verfassen" startet. Bei einer Einladung
/// dazu der Anlass: der Versand schickt dann sein PDF (Flyer, Programm) mit,
/// als Anhang der E-Mail und als weitere Seiten des Briefs ([anhang] ist
/// sein Dateiname, null ohne PDF).
typedef NachrichtEntwurf = ({String betreff, String text, String? anlassId, String? anhang});

/// Seite des Anlasses auf der Website (wie der QR in vorstand.html).
Uri anlassSeite(Anlass a) =>
    Uri.https('www.fwv-raura.ch', '/events.html', {'event': a.slug ?? a.id});

NachrichtEntwurf einladungsEntwurf(Anlass a) {
  // Nur die Einleitung: Titel, Beschreibung, Datentabelle, Schichten, Gruss
  // und QR setzt das Backend (einladung-layout.js, wie die Website).
  final text = a.hatSchichten
      ? 'Für unseren Anlass «${a.titel}» suchen wir Helferinnen und Helfer – bitte tragt euch '
            'für eine Schicht ein.'
      : 'Hiermit möchte der Vorstand euch zum Anlass «${a.titel}» einladen.';
  return (betreff: 'Einladung: ${a.titel}', text: text, anlassId: a.id, anhang: a.pdfDateiname);
}
