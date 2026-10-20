// Einladung zu einem Anlass (vorstand.html: "Einladung generieren" mit der
// Vorlage Event-Einladung): Betreff und Text fuer "Verfassen", gefuellt mit
// den Daten des Anlasses. Die Website baut daraus ein eigenes Layout mit
// Tabelle, Unterschriften und QR; hier geht es als normaler Text ueber
// denselben Versand wie jede Nachricht (Gruss setzt das Brief-Layout des
// Backends selbst darunter). Der Link fuehrt zur Anmeldung auf der Website.

import 'package:fwv_core/fwv_core.dart';

/// Betreff und Text, mit denen "Verfassen" startet.
typedef NachrichtEntwurf = ({String betreff, String text});

/// Seite des Anlasses auf der Website (wie der QR in vorstand.html).
Uri anlassSeite(Anlass a) =>
    Uri.https('www.fwv-raura.ch', '/events.html', {'event': a.slug ?? a.id});

NachrichtEntwurf einladungsEntwurf(Anlass a) {
  final wann = a.app.datumOffen
      ? 'Datum noch offen'
      : [?a.app.datumText, ?a.app.zeitText].join(', ');
  final schluss = jsonDatum(a.anmeldeschluss);
  final zeilen = [
    'Was: ${a.titel}',
    if (a.ort case final ort? when ort.trim().isNotEmpty) 'Wo: ${ort.trim()}',
    if (wann.isNotEmpty) 'Wann: $wann',
    'Anmeldung: ${a.anmeldungVerlangt ? 'Zwingend' : 'Freiwillig'}',
    if (schluss != null) 'Anmeldeschluss: ${schweizerDatum(schluss)}',
    if (a.kosten case final k? when k.trim().isNotEmpty) 'Kosten: ${k.trim()}',
  ];
  final beschreibung = a.beschreibung?.trim() ?? '';
  final text = [
    'Hiermit möchte der Vorstand euch zum Anlass «${a.titel}» einladen.',
    if (beschreibung.isNotEmpty) beschreibung,
    'Die wichtigsten Daten zusammengefasst:\n${zeilen.join('\n')}',
    if (a.hatSchichten)
      'Für diesen Anlass suchen wir Helferinnen und Helfer – bitte tragt euch '
          'für eine Schicht ein.',
    'Anmeldung und alle Infos: ${anlassSeite(a)}',
    a.hatSchichten
        ? 'Ohne Helferinnen und Helfer geht es nicht – herzlichen Dank fürs Mitmachen.'
        : 'Wir freuen uns über zahlreiches Erscheinen.',
  ].join('\n\n');
  return (betreff: 'Einladung: ${a.titel}', text: text);
}
