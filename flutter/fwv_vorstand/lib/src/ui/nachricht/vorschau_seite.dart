// Vorschau einer Nachricht oder Einladung, direkt beim Verfassen: E-Mail und
// Brief zum Umschalten, jeweils so, wie der Versand sie baut - vom Server als
// Bild gerendert (Layout, hervorgehobene Links, im Brief der QR-Code). Sie
// laedt kurz nach dem Tippen neu; Antippen zeigt sie gross zum Zoomen.
//
// Vorher zeigte die App nur das Textfeld nochmals; am 23.11.2026 ging
// deshalb eine Einladung mit doppeltem Text raus.

import 'dart:async';
import 'dart:typed_data';

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:material_ui/material_ui.dart';

import '../../mitglieder/modelle.dart';
import '../../versand/versand.dart';
import '../../versand/versand_dienst.dart';

/// Wartezeit nach der letzten Aenderung, bis die Vorschau neu geladen wird
/// (Tests setzen sie auf null).
Duration vorschauVerzoegerung = const Duration(milliseconds: 900);

class VorschauAnsicht extends StatefulWidget {
  const VorschauAnsicht({
    super.key,
    required this.dienst,
    required this.betreff,
    required this.text,
    this.anlassId,
    this.emailProbe,
    this.briefProbe,
  });

  final VersandDienst dienst;
  final String betreff;
  final String text;
  final String? anlassId;

  /// Fuer wen die E-Mail bzw. der Brief gezeigt wird; null = gibt es nicht.
  final VorstandMitglied? emailProbe;
  final VorstandMitglied? briefProbe;

  @override
  State<VorschauAnsicht> createState() => _VorschauAnsichtState();
}

class _VorschauAnsichtState extends State<VorschauAnsicht> {
  VorschauArt? _gewaehlt;
  Timer? _warten;
  String? _geladenFuer;
  Uint8List? _bild;
  Object? _fehler;
  bool _laedt = false;

  /// Schon geladene Vorschauen (Umschalten E-Mail/Brief laedt nicht neu).
  final _cache = <String, Uint8List>{};

  VorschauArt? get _art {
    final g = _gewaehlt;
    if (g != null && _probe(g) != null) return g;
    if (widget.emailProbe != null) return VorschauArt.email;
    if (widget.briefProbe != null) return VorschauArt.brief;
    return null;
  }

  VorstandMitglied? _probe(VorschauArt a) =>
      a == VorschauArt.email ? widget.emailProbe : widget.briefProbe;

  String? get _schluessel {
    final a = _art;
    if (a == null || widget.text.trim().isEmpty) return null;
    return [a.name, _probe(a)!.id, widget.betreff, widget.text, widget.anlassId].join('\u0000');
  }

  @override
  void initState() {
    super.initState();
    _planen(sofort: true);
  }

  @override
  void didUpdateWidget(VorschauAnsicht alt) {
    super.didUpdateWidget(alt);
    _planen();
  }

  @override
  void dispose() {
    _warten?.cancel();
    super.dispose();
  }

  void _planen({bool sofort = false}) {
    final s = _schluessel;
    if (s == _geladenFuer) return;
    _warten?.cancel();
    if (s == null) {
      _geladenFuer = null;
      _bild = null;
      _fehler = null;
      return;
    }
    if (_cache[s] case final bild?) {
      _geladenFuer = s;
      _bild = bild;
      _fehler = null;
      return;
    }
    _warten = Timer(sofort ? Duration.zero : vorschauVerzoegerung, _laden);
  }

  Future<void> _laden() async {
    final s = _schluessel;
    final a = _art;
    if (s == null || a == null || !mounted) return;
    _geladenFuer = s;
    setState(() => _laedt = true);
    try {
      final bild = await widget.dienst.vorschauBild(
        art: a,
        mitgliedId: _probe(a)!.id,
        betreff: widget.betreff,
        text: widget.text,
        anlassId: widget.anlassId,
      );
      // Inzwischen weitergetippt: das neuere Ergebnis gewinnt.
      if (!mounted || _geladenFuer != s) return;
      _cache[s] = bild;
      setState(() {
        _bild = bild;
        _fehler = null;
      });
    } on Object catch (e) {
      if (!mounted || _geladenFuer != s) return;
      setState(() => _fehler = e);
    } finally {
      if (mounted && _geladenFuer == s) setState(() => _laedt = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final art = _art;
    final probe = art == null ? null : _probe(art);
    final bild = _bild;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SegmentedButton<VorschauArt>(
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
          emptySelectionAllowed: true,
          selected: {?art},
          onSelectionChanged: (w) {
            if (w.isEmpty) return;
            setState(() => _gewaehlt = w.first);
            _planen(sofort: true);
          },
        ),
        const SizedBox(height: 6),
        Text(
          probe == null
              ? 'Noch kein Empfänger gewählt'
              : '${art == VorschauArt.email ? 'E-Mail' : 'Brief'} an ${mitgliedName(probe)}'
                    '${bild == null ? '' : ' – antippen zum Vergrössern'}',
          key: const Key('versand-vorschau'),
          style: t.textTheme.bodySmall,
        ),
        const SizedBox(height: 6),
        SizedBox(height: 3, child: _laedt ? const LinearProgressIndicator() : null),
        if (widget.text.trim().isEmpty)
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              'Die Vorschau erscheint, sobald Text da ist.',
              style: t.textTheme.bodySmall,
            ),
          )
        else if (_fehler != null && bild == null)
          Padding(padding: const EdgeInsets.all(16), child: Text(fehlerText(_fehler!)))
        else if (bild != null)
          GestureDetector(
            onTap: () =>
                Navigator.of(context)
                    .push<void>(MaterialPageRoute(builder: (_) => _GrossesBild(bild: bild))),
            child: DecoratedBox(
              decoration: BoxDecoration(border: Border.all(color: t.colorScheme.outlineVariant)),
              child: Image.memory(
                bild,
                key: Key('vorschau-bild-${art?.name}'),
                fit: BoxFit.fitWidth,
                gaplessPlayback: true,
              ),
            ),
          ),
      ],
    );
  }
}

/// Vorschau ganzseitig zum Zoomen (zwei Finger, Mausrad).
class _GrossesBild extends StatelessWidget {
  const _GrossesBild({required this.bild});

  final Uint8List bild;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Vorschau')),
    body: ColoredBox(
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      child: InteractiveViewer(
        maxScale: 4,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(8),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 820),
              child: Image.memory(bild, fit: BoxFit.fitWidth),
            ),
          ),
        ),
      ),
    ),
  );
}
