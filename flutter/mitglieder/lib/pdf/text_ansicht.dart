// Text-Beleg in der App ansehen, im gleichen Stil wie Foto und PDF
// (bild_ansicht.dart, pdf_ansicht.dart): ganze Seite, Dateiname als Titel,
// Teilen oben in der Leiste. Gebraucht fuer die Porto-Spesen des Aktuars:
// deren Beleg ist die Pingen-Abrechnung als .txt (backend-dispatch,
// pingen-spesen.js) - vorher ging die beim «Beleg ansehen» gleich ins
// Teilen-Menue.

import 'dart:convert';
import 'dart:typed_data';

import 'package:material_ui/material_ui.dart';

import '../dienste.dart';

/// Oeffnet den Text [bytes] (UTF-8) als ganze Seite; zurueck mit dem Pfeil.
Future<void> textImViewer(
  BuildContext context,
  Uint8List bytes,
  String dateiname,
  DateiTeilen teilen,
) => Navigator.of(context).push(
  MaterialPageRoute<void>(
    builder: (_) =>
        TextAnsicht(bytes: bytes, dateiname: dateiname, teilen: teilen),
  ),
);

class TextAnsicht extends StatelessWidget {
  const TextAnsicht({
    super.key,
    required this.bytes,
    required this.dateiname,
    required this.teilen,
  });

  final Uint8List bytes;
  final String dateiname;
  final DateiTeilen teilen;

  Rect? _stelle(BuildContext context) {
    final box = context.findRenderObject() as RenderBox?;
    return box == null ? null : box.localToGlobal(Offset.zero) & box.size;
  }

  @override
  Widget build(BuildContext context) {
    final titel = dateiname
        .replaceAll(RegExp(r'\.txt$', caseSensitive: false), '')
        .replaceAll('_', ' ');
    final text = utf8.decode(bytes, allowMalformed: true);
    return Scaffold(
      appBar: AppBar(
        title: Text(titel, overflow: TextOverflow.ellipsis),
        actions: [
          Builder(
            builder: (knopf) => IconButton(
              key: const Key('text-teilen'),
              tooltip: 'Teilen',
              icon: Icon(Icons.adaptive.share),
              onPressed: () => teilen(
                bytes,
                dateiname,
                'text/plain',
                ursprung: _stelle(knopf),
              ),
            ),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Align(
          alignment: Alignment.topLeft,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 800),
            child: SelectableText(
              text.trim().isEmpty ? '(leer)' : text,
              key: const Key('text-inhalt'),
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ),
        ),
      ),
    );
  }
}
