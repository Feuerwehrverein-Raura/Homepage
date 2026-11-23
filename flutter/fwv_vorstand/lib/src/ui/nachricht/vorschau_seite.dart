// Vorschau einer Nachricht oder Einladung: E-Mail und Brief zum Umschalten,
// jeweils so, wie der Versand sie baut - vom Server als Bild gerendert
// (Layout, hervorgehobene Links, beim Brief der QR-Code). Vorher zeigte die
// App nur das Textfeld; am 23.11.2026 ging deshalb eine Einladung mit
// doppeltem Text raus.

import 'dart:typed_data';

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:material_ui/material_ui.dart';

import '../../mitglieder/modelle.dart';
import '../../versand/versand.dart';
import '../../versand/versand_dienst.dart';

class VorschauSeite extends StatefulWidget {
  const VorschauSeite({
    super.key,
    required this.dienst,
    required this.betreff,
    required this.text,
    this.anlassId,
    this.emailProbe,
    this.briefProbe,
    this.briefAlsPdf,
  });

  final VersandDienst dienst;
  final String betreff;
  final String text;
  final String? anlassId;

  /// Fuer wen die E-Mail bzw. der Brief gezeigt wird; null = gibt es nicht.
  final VorstandMitglied? emailProbe;
  final VorstandMitglied? briefProbe;

  /// Brief als PDF oeffnen (drucken, teilen); null = kein Knopf.
  final VoidCallback? briefAlsPdf;

  @override
  State<VorschauSeite> createState() => _VorschauSeiteState();
}

class _VorschauSeiteState extends State<VorschauSeite> {
  late VorschauArt _art = widget.emailProbe != null ? VorschauArt.email : VorschauArt.brief;
  final _bilder = <VorschauArt, Future<Uint8List>>{};

  VorstandMitglied? _probe(VorschauArt a) =>
      a == VorschauArt.email ? widget.emailProbe : widget.briefProbe;

  Future<Uint8List> _bild(VorschauArt a) => _bilder[a] ??= widget.dienst.vorschauBild(
    art: a,
    mitgliedId: _probe(a)!.id,
    betreff: widget.betreff,
    text: widget.text,
    anlassId: widget.anlassId,
  );

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final probe = _probe(_art);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Vorschau'),
        actions: [
          if (_art == VorschauArt.brief && widget.briefAlsPdf != null)
            IconButton(
              key: const Key('vorschau-brief-pdf'),
              tooltip: 'Brief als PDF',
              icon: const Icon(Icons.picture_as_pdf_outlined),
              onPressed: widget.briefAlsPdf,
            ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: SegmentedButton<VorschauArt>(
              key: const Key('vorschau-art'),
              segments: [
                ButtonSegment(
                  value: VorschauArt.email,
                  icon: const Icon(Icons.mail_outline),
                  label: const Text('E-Mail'),
                  enabled: widget.emailProbe != null,
                ),
                ButtonSegment(
                  value: VorschauArt.brief,
                  icon: const Icon(Icons.description_outlined),
                  label: const Text('Brief'),
                  enabled: widget.briefProbe != null,
                ),
              ],
              selected: {_art},
              onSelectionChanged: (w) => setState(() => _art = w.first),
            ),
          ),
          if (probe != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                '${_art == VorschauArt.email ? 'E-Mail' : 'Brief'} an ${mitgliedName(probe)} – '
                'mit zwei Fingern vergrössern',
                style: t.textTheme.bodySmall,
              ),
            ),
          const SizedBox(height: 8),
          Expanded(
            child: probe == null
                ? const Center(child: Text('Kein Empfänger für diese Versandart.'))
                : FutureBuilder<Uint8List>(
                    key: ValueKey(_art),
                    future: _bild(_art),
                    builder: (context, s) => switch (s) {
                      AsyncSnapshot(:final error?) => Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Text(fehlerText(error), textAlign: TextAlign.center),
                        ),
                      ),
                      AsyncSnapshot(:final data?) => ColoredBox(
                        color: t.colorScheme.surfaceContainerHighest,
                        child: InteractiveViewer(
                          maxScale: 4,
                          child: SingleChildScrollView(
                            padding: const EdgeInsets.all(8),
                            child: Center(
                              child: ConstrainedBox(
                                constraints: const BoxConstraints(maxWidth: 820),
                                child: Image.memory(
                                  data,
                                  key: Key('vorschau-bild-${_art.name}'),
                                  fit: BoxFit.fitWidth,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                      _ => const Center(child: CircularProgressIndicator()),
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
