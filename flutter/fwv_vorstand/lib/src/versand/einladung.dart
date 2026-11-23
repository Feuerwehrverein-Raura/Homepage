// Einladung zu einem Anlass: Betreff und die ganze Einladung als Text
// (Beschreibung, Was/Wo/Wann, Link, «Im Namen des Vorstandes») fuer
// "Verfassen". Titel, Schichten, Gruss mit Unterschriften und QR-Code
// setzt das Backend im Einladungs-Layout dazu
// (docker/backend-dispatch/src/einladung-layout.js, dasselbe wie die
// Website), und das PDF des Anlasses kommt als Anhang mit.

import 'package:fwv_core/fwv_core.dart';

/// Betreff und Text, mit denen "Verfassen" startet. Bei einer Einladung
/// dazu der Anlass: der Versand schickt dann sein PDF (Flyer, Programm) mit,
/// als Anhang der E-Mail und als weitere Seiten des Briefs ([anhang] ist
/// sein Dateiname, null ohne PDF).
typedef NachrichtEntwurf = ({String betreff, String text, String? anlassId, String? anhang});

/// Seite des Anlasses auf der Website (wie der QR in vorstand.html).
Uri anlassSeite(Anlass a) => a.webseite;

NachrichtEntwurf einladungsEntwurf(Anlass a) {
  // Die ganze Einladung steht im Editor - wie frueher: Text des Anlasses,
  // die wichtigsten Daten (Was, Wo, Wann, Anmeldung, Kosten), Link und
  // «Im Namen des Vorstandes». Was dort steht, geht genau so raus; das
  // Backend (einladung-layout.js, text_vollstaendig) setzt nur Titel,
  // Schichten, «Mit freundlichen Grüssen» mit Unterschriften und QR dazu.
  final beschreibung = a.beschreibung?.trim() ?? '';
  final einleitung = beschreibung.isNotEmpty
      ? beschreibung
      : a.hatSchichten
      ? 'Für unseren Anlass «${a.titel}» suchen wir Helferinnen und Helfer – bitte tragt euch '
            'für eine Schicht ein.'
      : 'Hiermit möchte der Vorstand euch zum Anlass «${a.titel}» einladen.';
  final app = a.app;
  final wann = [?app.datumText, ?app.zeitText].join(', ');
  final daten = [
    'Was: ${a.titel}',
    if (a.ort != null) 'Wo: ${a.ort}',
    if (wann.isNotEmpty) 'Wann: $wann',
    'Anmeldung: ${a.anmeldungVerlangt ? 'Zwingend' : 'Freiwillig'}',
    if (app.anmeldung.anmeldeschlussText != null)
      'Anmeldeschluss: ${app.anmeldung.anmeldeschlussText}',
    if (a.kosten != null) 'Kosten: ${a.kosten}',
  ];
  final text = [
    einleitung,
    'Die wichtigsten Daten nochmals zusammengefasst:\n${daten.join('\n')}',
    'Anmeldung und alle Infos: ${anlassSeite(a)}',
    '${a.hatSchichten ? 'Ohne Helferinnen und Helfer geht es nicht – herzlichen Dank fürs Mitmachen.' : 'Wir freuen uns über zahlreiches Erscheinen.'}\n'
        'Im Namen des Vorstandes.',
  ].join('\n\n');
  return (betreff: 'Einladung: ${a.titel}', text: text, anlassId: a.id, anhang: a.pdfDateiname);
}
