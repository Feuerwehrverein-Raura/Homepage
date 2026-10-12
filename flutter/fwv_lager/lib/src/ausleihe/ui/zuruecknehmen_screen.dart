// Zuruecknehmen (Lager): jede Position bzw. jede Zeile einer Kiste mit
// Menge zurueck, Zustand (in Ordnung / beschaedigt / fehlt), Schaden-Text
// und Fotos. Vorbelegt: alles zurueck, in Ordnung — antippen oeffnet den
// Dialog. "Rueckgabe buchen" bucht Zurueckgekommenes wieder ein;
// Kaputtes und Fehlendes bleibt ausgebucht (rechnet das Backend).

import 'dart:typed_data';

import 'package:fwv_anlass/fwv_anlass.dart'
    show Abschnitt, UntenLeiste, fehlerText, meldung, nachfragen, mitSystemleiste;
import 'package:material_ui/material_ui.dart';

import '../modelle.dart';
import '../zugang.dart';
import 'bausteine.dart';

/// Eingabe einer Zeile.
class _Eingabe {
  _Eingabe(this.menge) : zurueck = menge;

  final int menge;
  int zurueck;
  Zustand zustand = Zustand.ok;
  String schaden = '';

  String get text => [
    if (zurueck != menge) 'zurück $zurueck von $menge' else 'alles zurück',
    zustand.text,
    if (schaden.trim().isNotEmpty) schaden.trim(),
  ].join(' · ');
}

class ZuruecknehmenScreen extends StatefulWidget {
  const ZuruecknehmenScreen({super.key, required this.ausleihen, required this.ausleihe});

  final Ausleihen ausleihen;
  final Ausleihe ausleihe;

  @override
  State<ZuruecknehmenScreen> createState() => _ZuruecknehmenScreenState();
}

class _ZuruecknehmenScreenState extends State<ZuruecknehmenScreen> {
  /// Artikel-Positionen: Position-Id -> Eingabe.
  final _artikel = <int, _Eingabe>{};

  /// Kisten-Zeilen: Zeilen-Id -> Eingabe; Kisten selbst: Position-Id.
  final _zeilen = <int, _Eingabe>{};
  final _kisten = <int, _Eingabe>{};
  final _notiz = TextEditingController();
  final _fotos = <AusleiheFoto>[];
  bool _laeuft = false;

  Ausleihe get _a => widget.ausleihe;

  @override
  void initState() {
    super.initState();
    _fotos.addAll(_a.fotos);
    for (final p in _a.positionen) {
      if (p.istKiste) {
        _kisten[p.id] = _Eingabe(1);
        for (final z in p.inhalt) {
          if (z.id != null) _zeilen[z.id!] = _Eingabe(z.menge);
        }
      } else {
        _artikel[p.id] = _Eingabe(p.menge);
      }
    }
  }

  @override
  void dispose() {
    _notiz.dispose();
    super.dispose();
  }

  Future<bool> _foto(int? positionId, {required bool kamera}) async {
    final u = widget.ausleihen.umgebung;
    final waehlen = u.fotoWaehlen;
    if (waehlen == null) return false;
    try {
      final roh = await waehlen(kamera: kamera);
      if (roh == null) return false;
      final Uint8List jpeg = u.verkleinern == null ? roh : await u.verkleinern!(roh);
      final f = await widget.ausleihen.zugang.fotoHochladen(_a.id, jpeg, positionId: positionId);
      if (mounted) setState(() => _fotos.add(f));
      return true;
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
      return false;
    }
  }

  Future<void> _bearbeiten(
    String titel,
    _Eingabe e,
    int positionId, {
    bool nurZustand = false,
  }) async {
    final neu = await showDialog<_Eingabe>(
      context: context,
      builder: (_) => _RueckgabeDialog(
        titel: titel,
        eingabe: e,
        nurZustand: nurZustand,
        foto: widget.ausleihen.umgebung.fotoWaehlen == null
            ? null
            : ({required bool kamera}) => _foto(positionId, kamera: kamera),
      ),
    );
    if (neu != null) setState(() {});
  }

  Future<void> _buchen() async {
    final ok = await nachfragen(
      context,
      titel: 'Rückgabe buchen?',
      text: 'Was zurück ist, wird wieder eingebucht. Beschädigtes und Fehlendes bleibt ausgebucht.',
      ja: 'Buchen',
      gefaehrlich: false,
    );
    if (!ok || !mounted) return;
    setState(() => _laeuft = true);
    try {
      final rueckgabe = Rueckgabe(
        notiz: _notiz.text,
        positionen: [
          for (final p in _a.positionen)
            if (p.istKiste)
              RueckgabePosition(
                id: p.id,
                zustand: _kisten[p.id]!.zustand,
                schaden: _kisten[p.id]!.schaden,
                inhalt: [
                  for (final z in p.inhalt)
                    if (_zeilen[z.id] case final e?)
                      RueckgabeZeile(
                        id: z.id!,
                        zurueck: e.zurueck,
                        zustand: e.zustand,
                        schaden: e.schaden,
                      ),
                ],
              )
            else
              RueckgabePosition(
                id: p.id,
                zurueck: _artikel[p.id]!.zurueck,
                zustand: _artikel[p.id]!.zustand,
                schaden: _artikel[p.id]!.schaden,
              ),
        ],
      );
      final neu = await widget.ausleihen.zugang.zuruecknehmen(_a.id, rueckgabe);
      if (mounted) Navigator.of(context).pop(neu);
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _laeuft = false);
    }
  }

  Widget _zeile(String titel, _Eingabe e, int positionId, {Key? key, bool nurZustand = false}) {
    final t = Theme.of(context);
    final schlecht = e.zustand != Zustand.ok;
    return ListTile(
      key: key,
      contentPadding: EdgeInsets.zero,
      leading: Icon(
        schlecht ? Icons.report_problem_outlined : Icons.check_circle_outline,
        color: schlecht ? t.colorScheme.error : t.colorScheme.primary,
      ),
      title: Text(titel),
      subtitle: Text(
        nurZustand
            ? [e.zustand.text, if (e.schaden.trim().isNotEmpty) e.schaden.trim()].join(' · ')
            : e.text,
      ),
      trailing: const Icon(Icons.edit_outlined),
      onTap: () => _bearbeiten(titel, e, positionId, nurZustand: nurZustand),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Rückgabe #${_a.id}')),
      body: ListView(
        padding: mitSystemleiste(context, const EdgeInsets.fromLTRB(16, 8, 16, 24)),
        children: [
          Text(
            [?_a.app.ausleiherText, ?_a.app.zeitraumText].join(' · '),
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 4),
          Text(
            'Antippen, wenn etwas fehlt oder beschädigt ist.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          for (final p in _a.positionen)
            if (p.istKiste) ...[
              Abschnitt(p.name),
              _zeile(
                'Kiste selbst',
                _kisten[p.id]!,
                p.id,
                key: Key('rueckgabe-kiste-${p.id}'),
                nurZustand: true,
              ),
              for (final z in p.inhalt)
                if (z.id != null)
                  _zeile(z.anzeige, _zeilen[z.id!]!, p.id, key: Key('rueckgabe-zeile-${z.id}')),
            ] else
              _zeile(p.anzeige, _artikel[p.id]!, p.id, key: Key('rueckgabe-pos-${p.id}')),
          if (_fotos.isNotEmpty) ...[
            const Abschnitt('Fotos'),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final f in _fotos) AusleiheBild(ausleihen: widget.ausleihen, pfad: f.bild),
              ],
            ),
          ],
          const SizedBox(height: 16),
          TextField(
            key: const Key('rueckgabe-notiz'),
            controller: _notiz,
            minLines: 1,
            maxLines: 4,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              labelText: 'Notiz (optional)',
              border: OutlineInputBorder(),
            ),
          ),
        ],
      ),
      bottomNavigationBar: UntenLeiste(
        kinder: [
          FilledButton.icon(
            key: const Key('rueckgabe-buchen'),
            onPressed: _laeuft ? null : _buchen,
            icon: const Icon(Icons.move_to_inbox_outlined),
            label: const Text('Rückgabe buchen'),
          ),
        ],
      ),
    );
  }
}

/// Menge zurueck, Zustand, Schaden, Fotos. Aendert [eingabe] erst beim
/// Uebernehmen.
class _RueckgabeDialog extends StatefulWidget {
  const _RueckgabeDialog({
    required this.titel,
    required this.eingabe,
    required this.nurZustand,
    required this.foto,
  });

  final String titel;
  final _Eingabe eingabe;

  /// Kiste selbst: nur Zustand und Schaden.
  final bool nurZustand;
  final Future<bool> Function({required bool kamera})? foto;

  @override
  State<_RueckgabeDialog> createState() => _RueckgabeDialogState();
}

class _RueckgabeDialogState extends State<_RueckgabeDialog> {
  late int _zurueck = widget.eingabe.zurueck;
  late Zustand _zustand = widget.eingabe.zustand;
  late final _schaden = TextEditingController(text: widget.eingabe.schaden);
  int _fotos = 0;

  int get _menge => widget.eingabe.menge;

  @override
  void dispose() {
    _schaden.dispose();
    super.dispose();
  }

  /// Gleiche Regeln wie das Backend (rueckgabePruefen).
  String? get _problem {
    if (widget.nurZustand) return null;
    if (_zustand == Zustand.ok && _zurueck != _menge) {
      return 'Bei «In Ordnung» muss alles zurück sein.';
    }
    if (_zustand == Zustand.fehlt && _zurueck == _menge) {
      return 'Es ist alles zurück — dann fehlt nichts.';
    }
    return null;
  }

  void _mengeAendern(int neu) => setState(() {
    _zurueck = neu;
    // Etwas fehlt nun: Zustand passend vorschlagen.
    if (neu < _menge && _zustand == Zustand.ok) _zustand = Zustand.fehlt;
    if (neu == _menge && _zustand == Zustand.fehlt) _zustand = Zustand.ok;
  });

  @override
  Widget build(BuildContext context) {
    final problem = _problem;
    return AlertDialog(
      title: Text(widget.titel),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (!widget.nurZustand) ...[
              Text('Zurück ins Lager (von $_menge)', style: Theme.of(context).textTheme.labelLarge),
              Center(
                child: MengenWaehler(
                  schluessel: 'zurueck',
                  wert: _zurueck,
                  max: _menge,
                  aendern: _mengeAendern,
                ),
              ),
              const SizedBox(height: 8),
            ],
            Text(
              widget.nurZustand || _zurueck == _menge
                  ? 'Zustand'
                  : 'Der Rest (${_menge - _zurueck}) ist …',
              style: Theme.of(context).textTheme.labelLarge,
            ),
            const SizedBox(height: 4),
            SegmentedButton<Zustand>(
              key: const Key('zustand'),
              showSelectedIcon: false,
              segments: [
                for (final z in Zustand.values)
                  ButtonSegment(
                    value: z,
                    label: Text(z.text, overflow: TextOverflow.ellipsis),
                  ),
              ],
              selected: {_zustand},
              onSelectionChanged: (s) => setState(() => _zustand = s.first),
            ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('schaden'),
              controller: _schaden,
              minLines: 1,
              maxLines: 3,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                labelText: 'Schaden / Bemerkung',
                border: OutlineInputBorder(),
              ),
            ),
            if (widget.foto != null) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                children: [
                  OutlinedButton.icon(
                    key: const Key('foto-kamera'),
                    onPressed: () async {
                      if (await widget.foto!(kamera: true)) setState(() => _fotos++);
                    },
                    icon: const Icon(Icons.photo_camera_outlined),
                    label: const Text('Foto'),
                  ),
                  OutlinedButton.icon(
                    key: const Key('foto-galerie'),
                    onPressed: () async {
                      if (await widget.foto!(kamera: false)) setState(() => _fotos++);
                    },
                    icon: const Icon(Icons.photo_library_outlined),
                    label: const Text('Galerie'),
                  ),
                ],
              ),
              if (_fotos > 0)
                Text(
                  _fotos == 1 ? '1 Foto gespeichert' : '$_fotos Fotos gespeichert',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
            ],
            if (problem != null) ...[
              const SizedBox(height: 8),
              Text(problem, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Abbrechen')),
        FilledButton(
          key: const Key('rueckgabe-ok'),
          onPressed: problem != null
              ? null
              : () {
                  widget.eingabe
                    ..zurueck = _zurueck
                    ..zustand = _zustand
                    ..schaden = _schaden.text;
                  Navigator.of(context).pop(widget.eingabe);
                },
          child: const Text('Übernehmen'),
        ),
      ],
    );
  }
}
