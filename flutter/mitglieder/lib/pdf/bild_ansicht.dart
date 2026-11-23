// Foto in der App ansehen (Spesen-Belege, Notiz-Anhaenge), im gleichen Stil
// wie der PDF-Viewer (pdf_ansicht.dart): ganze Seite, Dateiname als Titel,
// Teilen oben in der Leiste. Vorher ging ein Foto beim «Beleg ansehen» gleich
// ins Teilen-Menue.
//
// Zoomen mit zwei Fingern bzw. Mausrad/Ctrl+Mausrad (InteractiveViewer),
// vergroessert mit dem Finger oder der Maus verschieben.

import 'dart:typed_data';

import 'package:material_ui/material_ui.dart';

import '../dienste.dart';

/// Oeffnet das Foto [bytes] als ganze Seite; zurueck mit dem Pfeil.
Future<void> bildImViewer(
  BuildContext context,
  Uint8List bytes,
  String dateiname,
  String mimeTyp,
  DateiTeilen teilen,
) => Navigator.of(context).push(
  MaterialPageRoute<void>(
    builder: (_) =>
        BildAnsicht(bytes: bytes, dateiname: dateiname, mimeTyp: mimeTyp, teilen: teilen),
  ),
);

class BildAnsicht extends StatelessWidget {
  const BildAnsicht({
    super.key,
    required this.bytes,
    required this.dateiname,
    required this.teilen,
    this.mimeTyp = 'image/jpeg',
  });

  final Uint8List bytes;
  final String dateiname;
  final String mimeTyp;
  final DateiTeilen teilen;

  Rect? _stelle(BuildContext context) {
    final box = context.findRenderObject() as RenderBox?;
    return box == null ? null : box.localToGlobal(Offset.zero) & box.size;
  }

  @override
  Widget build(BuildContext context) {
    final titel = dateiname
        .replaceAll(RegExp(r'\.(jpe?g|png|gif|webp)$', caseSensitive: false), '')
        .replaceAll('_', ' ');
    return Scaffold(
      appBar: AppBar(
        title: Text(titel, overflow: TextOverflow.ellipsis),
        actions: [
          Builder(
            builder: (knopf) => IconButton(
              key: const Key('bild-teilen'),
              tooltip: 'Teilen',
              icon: Icon(Icons.adaptive.share),
              onPressed: () => teilen(bytes, dateiname, mimeTyp, ursprung: _stelle(knopf)),
            ),
          ),
        ],
      ),
      body: ColoredBox(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        child: SizedBox.expand(
          child: InteractiveViewer(
            key: const Key('bild-zoom'),
            minScale: 1,
            maxScale: 8,
            child: Center(
              child: Image.memory(
                bytes,
                fit: BoxFit.contain,
                semanticLabel: titel,
                errorBuilder: (_, _, _) => const Padding(
                  padding: EdgeInsets.all(24),
                  child: Text('Das Bild lässt sich nicht anzeigen.', textAlign: TextAlign.center),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
