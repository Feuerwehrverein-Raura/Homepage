// Organisator-Notizen eines Anlasses mit Anhaengen (Fotos von Quittungen,
// Plaenen ...). Nur Organisatoren und Vorstand sehen sie. Vorbild:
// members-ios OrganizerNotesView, members-android OrganizerNotesActivity.
//
// Fotos werden vor dem Hochladen auf 1600 Pixel verkleinert und gehen als
// Base64 im JSON mit (so will es das Backend). Anhaenge oeffnen sich ueber
// das Teilen-Menue (Ansehen, Sichern, Weiterschicken).

import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../bausteine.dart';
import '../daten.dart';
import '../zugang.dart';

class NotizenAnsicht extends StatefulWidget {
  const NotizenAnsicht({super.key, required this.verwaltung, required this.anlass});

  final AnlassVerwaltung verwaltung;
  final Anlass anlass;

  @override
  State<NotizenAnsicht> createState() => _NotizenAnsichtState();
}

class _NotizenAnsichtState extends State<NotizenAnsicht> {
  final _lader = GlobalKey<LadeAnsichtState<List<Notiz>>>();
  final _text = TextEditingController();
  final _anhaenge = <AnhangUpload>[];
  bool _laeuft = false;

  AnlassVerwaltungZugang get _dienst => widget.verwaltung.zugang;
  String get _id => widget.anlass.id;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _foto(_Quelle quelle) async {
    try {
      final roh = await widget.verwaltung.umgebung.fotoWaehlen(kamera: quelle == _Quelle.kamera);
      if (roh == null) return;
      setState(() => _laeuft = true);
      final jpeg = await widget.verwaltung.umgebung.anhangVerkleinern(roh);
      if (!mounted) return;
      final nr = _anhaenge.length + 1;
      setState(
        () =>
            _anhaenge.add(AnhangUpload(dateiname: 'foto-$nr.jpg', typ: 'image/jpeg', bytes: jpeg)),
      );
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _laeuft = false);
    }
  }

  Future<void> _senden() async {
    if (_text.text.trim().isEmpty && _anhaenge.isEmpty) {
      meldung(context, 'Bitte Text schreiben oder ein Foto anhängen.');
      return;
    }
    setState(() => _laeuft = true);
    try {
      await _dienst.notizAnlegen(_id, text: _text.text, anhaenge: List.of(_anhaenge));
      if (!mounted) return;
      _text.clear();
      setState(_anhaenge.clear);
      FocusScope.of(context).unfocus();
      await _lader.currentState?.neuLaden();
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _laeuft = false);
    }
  }

  Future<void> _notizLoeschen(Notiz n) async {
    final ok = await nachfragen(
      context,
      titel: 'Notiz löschen?',
      text: n.anhaenge.isEmpty
          ? 'Die Notiz wird entfernt.'
          : 'Die Notiz und ihre Anhänge werden entfernt.',
      ja: 'Löschen',
    );
    if (!ok) return;
    try {
      await _dienst.notizLoeschen(_id, n.id);
      await _lader.currentState?.neuLaden();
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    }
  }

  Future<void> _anhangLoeschen(Notiz n, NotizAnhang a) async {
    final ok = await nachfragen(
      context,
      titel: 'Anhang löschen?',
      text: a.dateiname,
      ja: 'Löschen',
    );
    if (!ok) return;
    try {
      await _dienst.anhangLoeschen(_id, n.id, a.id);
      await _lader.currentState?.neuLaden();
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    }
  }

  Future<void> _anhangOeffnen(BuildContext knopf, Notiz n, NotizAnhang a) async {
    final ursprung = stelleVon(knopf);
    try {
      final bytes = await _dienst.anhang(_id, n.id, a.id);
      await widget.verwaltung.umgebung.dateiTeilen(bytes, a.dateiname, a.typ, ursprung: ursprung);
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Scaffold(
      resizeToAvoidBottomInset: false,
      body: LadeAnsicht<List<Notiz>>(
        key: _lader,
        laden: () => _dienst.notizen(_id),
        istLeer: (l) => l.isEmpty,
        leer: 'Noch keine Notizen. Was sich das Team merken soll, kommt hierher.',
        bauen: (context, notizen, _) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 16),
          children: [
            for (final n in notizen)
              Card(
                key: Key('notiz-${n.id}'),
                margin: const EdgeInsets.symmetric(vertical: 5),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(14, 8, 4, 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              [?n.von, ?n.erstelltText].join(' · '),
                              style: t.textTheme.labelMedium?.copyWith(
                                color: t.colorScheme.outline,
                              ),
                            ),
                          ),
                          IconButton(
                            onPressed: () => _notizLoeschen(n),
                            icon: const Icon(Icons.delete_outline),
                            tooltip: 'Notiz löschen',
                          ),
                        ],
                      ),
                      if (n.text != null)
                        Padding(
                          padding: const EdgeInsets.only(right: 10),
                          child: SelectableText(n.text!, style: t.textTheme.bodyMedium),
                        ),
                      for (final a in n.anhaenge)
                        Builder(
                          builder: (knopf) => ListTile(
                            contentPadding: EdgeInsets.zero,
                            dense: true,
                            leading: Icon(a.istBild ? Icons.image_outlined : Icons.attach_file),
                            title: Text(a.dateiname, overflow: TextOverflow.ellipsis),
                            onTap: () => _anhangOeffnen(knopf, n, a),
                            trailing: IconButton(
                              onPressed: () => _anhangLoeschen(n, a),
                              icon: const Icon(Icons.close),
                              tooltip: 'Anhang löschen',
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
      bottomNavigationBar: Material(
        color: t.colorScheme.surfaceContainer,
        child: SafeArea(
          top: false,
          child: Padding(
            // Der Anlass-Screen aussen schiebt alles ueber die Tastatur.
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_anhaenge.isNotEmpty)
                  Wrap(
                    spacing: 6,
                    children: [
                      for (final (i, a) in _anhaenge.indexed)
                        InputChip(
                          avatar: const Icon(Icons.image_outlined, size: 18),
                          label: Text(a.dateiname),
                          onDeleted: () => setState(() => _anhaenge.removeAt(i)),
                        ),
                    ],
                  ),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    IconButton(
                      onPressed: _laeuft ? null : () => _foto(_Quelle.kamera),
                      icon: const Icon(Icons.photo_camera_outlined),
                      tooltip: 'Foto aufnehmen',
                    ),
                    IconButton(
                      onPressed: _laeuft ? null : () => _foto(_Quelle.galerie),
                      icon: const Icon(Icons.photo_library_outlined),
                      tooltip: 'Foto auswählen',
                    ),
                    Expanded(
                      child: TextField(
                        key: const Key('notiz-text'),
                        controller: _text,
                        minLines: 1,
                        maxLines: 5,
                        decoration: const InputDecoration(hintText: 'Neue Notiz', isDense: true),
                      ),
                    ),
                    IconButton.filled(
                      onPressed: _laeuft ? null : _senden,
                      icon: const Icon(Icons.send),
                      tooltip: 'Notiz speichern',
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

enum _Quelle { kamera, galerie }
