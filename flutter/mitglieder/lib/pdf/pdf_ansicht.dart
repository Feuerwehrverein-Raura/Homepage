// PDF in der App ansehen (Beitragsbriefe im Vorstand), statt es gleich ins
// Teilen-Menue zu geben: wer nur nachschauen will, ob der Brief stimmt,
// braucht kein Teilen. Drucken und Teilen gibt es oben in der Leiste.
//
// Anzeige mit PdfPreview aus package:printing (Android, iOS, Web, Desktop;
// Seiten als Bilder gerastert, Zoomen mit zwei Fingern). Teilen geht ueber
// dieselbe dateiTeilen-Funktion wie bisher (Desktop: Downloads), nicht ueber
// das Teilen von printing - so verhalten sich alle Teilen-Knoepfe der App
// gleich.

import 'dart:typed_data';

import 'package:material_ui/material_ui.dart';
import 'package:printing/printing.dart';

import '../dienste.dart';

/// Oeffnet [bytes] als ganze Seite; zurueck mit dem Pfeil.
Future<void> pdfImViewer(
  BuildContext context,
  Uint8List bytes,
  String dateiname,
  DateiTeilen teilen,
) => Navigator.of(context).push(
  MaterialPageRoute<void>(
    builder: (_) => PdfAnsicht(bytes: bytes, dateiname: dateiname, teilen: teilen),
  ),
);

class PdfAnsicht extends StatelessWidget {
  const PdfAnsicht({super.key, required this.bytes, required this.dateiname, required this.teilen});

  final Uint8List bytes;
  final String dateiname;
  final DateiTeilen teilen;

  Rect? _stelle(BuildContext context) {
    final box = context.findRenderObject() as RenderBox?;
    return box == null ? null : box.localToGlobal(Offset.zero) & box.size;
  }

  @override
  Widget build(BuildContext context) {
    final titel = dateiname.replaceAll(RegExp(r'\.pdf$'), '').replaceAll('_', ' ');
    return Scaffold(
      appBar: AppBar(
        title: Text(titel, overflow: TextOverflow.ellipsis),
        actions: [
          IconButton(
            key: const Key('pdf-drucken'),
            tooltip: 'Drucken',
            icon: const Icon(Icons.print_outlined),
            onPressed: () => Printing.layoutPdf(onLayout: (_) async => bytes, name: dateiname),
          ),
          Builder(
            builder: (knopf) => IconButton(
              key: const Key('pdf-teilen'),
              tooltip: 'Teilen',
              icon: Icon(Icons.adaptive.share),
              onPressed: () =>
                  teilen(bytes, dateiname, 'application/pdf', ursprung: _stelle(knopf)),
            ),
          ),
        ],
      ),
      body: PdfPreview(
        build: (_) async => bytes,
        pdfFileName: dateiname,
        // Fertiges PDF vom Backend: Format und Ausrichtung stehen fest, und
        // Drucken/Teilen sitzen schon oben in der Leiste.
        useActions: false,
        canChangePageFormat: false,
        canChangeOrientation: false,
        canDebug: false,
        maxPageWidth: 900,
      ),
    );
  }
}
