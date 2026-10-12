// "Musik im Roten Schopf": Playlists und Radiosender fuer den Laptop im
// Lokal - wie der Reiter "Musik" im Mitgliederbereich der Webseite
// (mein.html). Jedes Mitglied darf zusammenstellen; der Laptop holt sich
// alles alle fuenf Minuten selbst ab.
//
// Vorhoeren (Knopf neben jedem Titel) siehe vorhoeren.dart.

import 'dart:async';

import 'package:fwv_anlass/fwv_anlass.dart'
    show
        LadeAnsicht,
        LadeAnsichtState,
        fehlerText,
        meldung,
        nachfragen,
        reiterAufRot,
        mitSystemleiste;
import 'package:material_ui/material_ui.dart';

import 'modelle.dart';
import 'vorhoeren.dart';
import 'zugang.dart';

class MusikScreen extends StatefulWidget {
  const MusikScreen({super.key, required this.zugang, this.abspieler});

  final MusikZugang zugang;

  /// Nur fuer Tests; sonst just_audio.
  final Abspieler? abspieler;

  @override
  State<MusikScreen> createState() => _MusikScreenState();
}

class _MusikScreenState extends State<MusikScreen> {
  late final _vorhoerer = Vorhoerer(laden: widget.zugang.titelLaden, abspieler: widget.abspieler);

  @override
  void dispose() {
    _vorhoerer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final zugang = widget.zugang;
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Musik im Roten Schopf'),
          bottom: reiterAufRot(
            tabs: const [
              Tab(text: 'Playlists'),
              Tab(text: 'Radiosender'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _PlaylistsSeite(zugang: zugang, vorhoerer: _vorhoerer),
            _SenderSeite(zugang: zugang),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Playlists

class _PlaylistsSeite extends StatefulWidget {
  const _PlaylistsSeite({required this.zugang, required this.vorhoerer});

  final MusikZugang zugang;
  final Vorhoerer vorhoerer;

  @override
  State<_PlaylistsSeite> createState() => _PlaylistsSeiteState();
}

class _PlaylistsSeiteState extends State<_PlaylistsSeite> {
  final _ansicht = GlobalKey<LadeAnsichtState<List<PlaylistKurz>>>();

  Future<void> _bearbeiten(String? id) async {
    final geaendert = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => PlaylistEditor(zugang: widget.zugang, vorhoerer: widget.vorhoerer, id: id),
      ),
    );
    // Was im Editor lief, verstummt mit dem Zurueck.
    await widget.vorhoerer.anhalten();
    if (geaendert == true) unawaited(_ansicht.currentState?.neuLaden());
  }

  Future<void> _loeschen(PlaylistKurz p) async {
    final ja = await nachfragen(
      context,
      titel: '„${p.name}“ löschen?',
      text: 'Die Playlist verschwindet auch vom Laptop im Lokal.',
      ja: 'Löschen',
    );
    if (!ja) return;
    try {
      await widget.zugang.loeschen(p.id);
      if (mounted) meldung(context, '„${p.name}“ gelöscht');
      unawaited(_ansicht.currentState?.neuLaden());
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'neue-playlist',
        onPressed: () => _bearbeiten(null),
        icon: const Icon(Icons.playlist_add),
        label: const Text('Neue Playlist'),
      ),
      body: LadeAnsicht<List<PlaylistKurz>>(
        key: _ansicht,
        laden: widget.zugang.playlists,
        istLeer: (l) => l.isEmpty,
        leer: 'Noch keine Playlists. „Alle Titel“ gibt es auf dem Laptop immer.',
        bauen: (context, liste, _) => ListView(
          padding: mitSystemleiste(context, const EdgeInsets.only(bottom: 96)),
          children: [
            for (final p in liste)
              ListTile(
                leading: const Icon(Icons.queue_music),
                title: Text(p.name),
                subtitle: Text(
                  [
                    p.anzahl == 1 ? '1 Titel' : '${p.anzahl} Titel',
                    if (p.erstelltVon != null) 'von ${p.erstelltVon}',
                  ].join(' · '),
                ),
                onTap: () => _bearbeiten(p.id),
                trailing: IconButton(
                  tooltip: 'Löschen',
                  icon: const Icon(Icons.delete_outline),
                  onPressed: () => _loeschen(p),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Playlist anlegen ([id] null) oder bearbeiten. Gibt true zurueck, wenn
/// gespeichert wurde.
class PlaylistEditor extends StatefulWidget {
  const PlaylistEditor({super.key, required this.zugang, required this.vorhoerer, this.id});

  final MusikZugang zugang;
  final Vorhoerer vorhoerer;
  final String? id;

  @override
  State<PlaylistEditor> createState() => _PlaylistEditorState();
}

class _PlaylistEditorState extends State<PlaylistEditor> {
  final _name = TextEditingController();
  final _titel = <MusikTitel>[];
  bool _laedt = false;
  bool _speichert = false;
  bool _geaendert = false;
  String? _fehler;

  @override
  void initState() {
    super.initState();
    if (widget.id != null) _laden();
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _laden() async {
    setState(() => _laedt = true);
    try {
      final p = await widget.zugang.playlist(widget.id!);
      if (!mounted) return;
      setState(() {
        _name.text = p.name;
        _titel
          ..clear()
          ..addAll(p.titel);
        _fehler = null;
      });
    } on Object catch (e) {
      if (mounted) setState(() => _fehler = fehlerText(e));
    } finally {
      if (mounted) setState(() => _laedt = false);
    }
  }

  void _hinzufuegen(Iterable<MusikTitel> neu) {
    final schon = {for (final t in _titel) t.pfad};
    final dazu = [
      for (final t in neu)
        if (schon.add(t.pfad)) t,
    ];
    if (dazu.isEmpty) return;
    setState(() {
      _titel.addAll(dazu);
      _geaendert = true;
    });
    meldung(context, dazu.length == 1 ? '1 Titel hinzugefügt' : '${dazu.length} Titel hinzugefügt');
  }

  Future<void> _suchen() async {
    final gewaehlt = await Navigator.of(context).push<List<MusikTitel>>(
      MaterialPageRoute(
        builder: (_) => TitelSuche(
          zugang: widget.zugang,
          vorhoerer: widget.vorhoerer,
          schonDrin: {for (final t in _titel) t.pfad},
        ),
      ),
    );
    if (gewaehlt != null && mounted) _hinzufuegen(gewaehlt);
  }

  Future<void> _abgleichen() async {
    final gewaehlt = await Navigator.of(context).push<List<MusikTitel>>(
      MaterialPageRoute(
        builder: (_) => ListenAbgleich(zugang: widget.zugang, vorhoerer: widget.vorhoerer),
      ),
    );
    if (gewaehlt != null && mounted) _hinzufuegen(gewaehlt);
  }

  Future<void> _speichern() async {
    final name = _name.text.trim();
    if (name.isEmpty) {
      meldung(context, 'Die Playlist braucht einen Namen.');
      return;
    }
    setState(() => _speichert = true);
    try {
      await widget.zugang.speichern(
        id: widget.id,
        name: name,
        pfade: [for (final t in _titel) t.pfad],
      );
      if (!mounted) return;
      meldung(context, '„$name“ gespeichert');
      Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _speichert = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_geaendert,
      onPopInvokedWithResult: (weg, _) async {
        if (weg) return;
        final ja = await nachfragen(
          context,
          titel: 'Änderungen verwerfen?',
          text: 'Die Playlist wurde noch nicht gespeichert.',
          ja: 'Verwerfen',
        );
        if (ja && context.mounted) Navigator.of(context).pop(false);
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(widget.id == null ? 'Neue Playlist' : 'Playlist bearbeiten'),
          actions: [
            IconButton(
              tooltip: 'Speichern',
              onPressed: _speichert || _laedt ? null : _speichern,
              icon: const Icon(Icons.check),
            ),
          ],
        ),
        body: _laedt
            ? const Center(child: CircularProgressIndicator())
            : _fehler != null
            ? Center(
                child: Padding(padding: const EdgeInsets.all(24), child: Text(_fehler!)),
              )
            : Column(
                children: [
                  if (_speichert) const LinearProgressIndicator(),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                    child: TextField(
                      controller: _name,
                      decoration: const InputDecoration(labelText: 'Name der Playlist'),
                      // setState: Erst dann baut PopScope neu und fragt beim Zurueck nach.
                      onChanged: (_) {
                        if (!_geaendert) setState(() => _geaendert = true);
                      },
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: _suchen,
                            icon: const Icon(Icons.search),
                            label: const Text('Titel suchen'),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: _abgleichen,
                            icon: const Icon(Icons.playlist_add_check),
                            label: const Text('Liste abgleichen'),
                          ),
                        ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        _titel.length == 1 ? '1 Titel' : '${_titel.length} Titel',
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                    ),
                  ),
                  Expanded(
                    child: _titel.isEmpty
                        ? const Padding(
                            padding: EdgeInsets.all(24),
                            child: Text(
                              'Noch keine Titel. Über „Titel suchen“ einzeln hinzufügen oder '
                              'mit „Liste abgleichen“ eine kopierte Liste (Spotify, YouTube …) '
                              'übernehmen.',
                              textAlign: TextAlign.center,
                            ),
                          )
                        : ReorderableListView.builder(
                            padding: mitSystemleiste(context, const EdgeInsets.only(bottom: 24)),
                            itemCount: _titel.length,
                            onReorderItem: (alt, neu) => setState(() {
                              _titel.insert(neu, _titel.removeAt(alt));
                              _geaendert = true;
                            }),
                            itemBuilder: (context, i) {
                              final t = _titel[i];
                              return ListTile(
                                key: ValueKey(t.pfad),
                                leading: const Icon(Icons.drag_handle),
                                title: Text(t.anzeige),
                                subtitle: t.vorhanden
                                    ? null
                                    : const Text('nicht mehr auf dem Laptop'),
                                enabled: t.vorhanden,
                                trailing: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    if (t.vorhanden)
                                      VorhoerKnopf(
                                        vorhoerer: widget.vorhoerer,
                                        pfad: t.pfad,
                                        beiFehler: (e) => meldung(context, fehlerText(e)),
                                      ),
                                    IconButton(
                                      tooltip: 'Entfernen',
                                      icon: const Icon(Icons.remove_circle_outline),
                                      onPressed: () => setState(() {
                                        _titel.removeAt(i);
                                        _geaendert = true;
                                      }),
                                    ),
                                  ],
                                ),
                              );
                            },
                          ),
                  ),
                ],
              ),
      ),
    );
  }
}

/// Titel aus der Sammlung suchen; mehrere antippen, "Übernehmen" gibt sie
/// zurueck.
class TitelSuche extends StatefulWidget {
  const TitelSuche({
    super.key,
    required this.zugang,
    required this.vorhoerer,
    required this.schonDrin,
  });

  final MusikZugang zugang;
  final Vorhoerer vorhoerer;
  final Set<String> schonDrin;

  @override
  State<TitelSuche> createState() => _TitelSucheState();
}

class _TitelSucheState extends State<TitelSuche> {
  Timer? _verzoegert;
  Bibliothek? _ergebnis;
  String? _fehler;
  bool _sucht = false;
  int _nr = 0;
  final _gewaehlt = <String, MusikTitel>{};

  @override
  void initState() {
    super.initState();
    _suchen('');
  }

  @override
  void dispose() {
    _verzoegert?.cancel();
    super.dispose();
  }

  void _eingabe(String text) {
    _verzoegert?.cancel();
    _verzoegert = Timer(const Duration(milliseconds: 300), () => _suchen(text.trim()));
  }

  Future<void> _suchen(String suche) async {
    final nr = ++_nr;
    setState(() => _sucht = true);
    try {
      final b = await widget.zugang.bibliothek(suche: suche);
      if (!mounted || nr != _nr) return;
      setState(() {
        _ergebnis = b;
        _fehler = null;
      });
    } on Object catch (e) {
      if (mounted && nr == _nr) setState(() => _fehler = fehlerText(e));
    } finally {
      if (mounted && nr == _nr) setState(() => _sucht = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final b = _ergebnis;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Titel suchen'),
        actions: [
          TextButton(
            onPressed: _gewaehlt.isEmpty
                ? null
                : () => Navigator.of(context).pop(_gewaehlt.values.toList()),
            style: TextButton.styleFrom(
              foregroundColor: Theme.of(context).colorScheme.onPrimary,
              // Ausgegraut sonst dunkelrot auf Rot - kaum zu sehen.
              disabledForegroundColor: Theme.of(context).colorScheme.onPrimary
                  .withValues(alpha: 0.5),
            ),
            child: Text(_gewaehlt.isEmpty ? 'Übernehmen' : 'Übernehmen (${_gewaehlt.length})'),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              autofocus: true,
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.search),
                hintText: 'Interpret oder Titel',
              ),
              onChanged: _eingabe,
            ),
          ),
          if (_sucht) const LinearProgressIndicator(),
          if (_fehler != null) Padding(padding: const EdgeInsets.all(16), child: Text(_fehler!)),
          if (b != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  '${b.titel.length} von ${b.gesamt} Titeln',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
            ),
          Expanded(
            child: ListView(
              padding: mitSystemleiste(context, const EdgeInsets.only(bottom: 24)),
              children: [
                for (final t in b?.titel ?? const <MusikTitel>[])
                  CheckboxListTile(
                    value: widget.schonDrin.contains(t.pfad) || _gewaehlt.containsKey(t.pfad),
                    onChanged: widget.schonDrin.contains(t.pfad)
                        ? null
                        : (an) => setState(() {
                            if (an == true) {
                              _gewaehlt[t.pfad] = t;
                            } else {
                              _gewaehlt.remove(t.pfad);
                            }
                          }),
                    title: Text(t.anzeige),
                    subtitle: widget.schonDrin.contains(t.pfad)
                        ? const Text('schon in der Playlist')
                        : null,
                    // Vorhoeren links, Auswaehlen rechts.
                    controlAffinity: ListTileControlAffinity.trailing,
                    secondary: VorhoerKnopf(
                      vorhoerer: widget.vorhoerer,
                      pfad: t.pfad,
                      beiFehler: (e) => meldung(context, fehlerText(e)),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Eine kopierte Titelliste gegen die Sammlung halten. Der Abgleich schlaegt
/// vor, er entscheidet nicht: alle Treffer sind angehakt, knappe markiert.
class ListenAbgleich extends StatefulWidget {
  const ListenAbgleich({super.key, required this.zugang, required this.vorhoerer});

  final MusikZugang zugang;
  final Vorhoerer vorhoerer;

  @override
  State<ListenAbgleich> createState() => _ListenAbgleichState();
}

class _ListenAbgleichState extends State<ListenAbgleich> {
  final _text = TextEditingController();
  Abgleich? _ergebnis;
  final _aus = <String>{};
  bool _laeuft = false;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _abgleichen() async {
    if (_text.text.trim().isEmpty) return;
    setState(() => _laeuft = true);
    try {
      final a = await widget.zugang.abgleichen(_text.text);
      if (mounted) {
        setState(() {
          _ergebnis = a;
          _aus.clear();
        });
      }
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _laeuft = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final a = _ergebnis;
    final gewaehlt = [
      for (final t in a?.gefunden ?? const <AbgleichTreffer>[])
        if (!_aus.contains(t.titel.pfad)) t.titel,
    ];
    return Scaffold(
      appBar: AppBar(
        title: const Text('Liste abgleichen'),
        actions: [
          if (a != null)
            TextButton(
              onPressed: gewaehlt.isEmpty ? null : () => Navigator.of(context).pop(gewaehlt),
              style: TextButton.styleFrom(
                foregroundColor: Theme.of(context).colorScheme.onPrimary,
                // Ausgegraut sonst dunkelrot auf Rot - kaum zu sehen.
                disabledForegroundColor: Theme.of(context).colorScheme.onPrimary
                    .withValues(alpha: 0.5),
              ),
              child: Text('Übernehmen (${gewaehlt.length})'),
            ),
        ],
      ),
      body: ListView(
        padding: mitSystemleiste(context, const EdgeInsets.fromLTRB(16, 16, 16, 24)),
        children: [
          if (a == null) ...[
            const Text(
              'Titelliste einfügen, eine Zeile pro Titel – kopiert aus Spotify, Apple Music, '
              'YouTube oder einer Tabelle. Gefunden wird, was auf dem Laptop liegt.',
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _text,
              minLines: 8,
              maxLines: 16,
              decoration: const InputDecoration(
                hintText: 'Queen – Bohemian Rhapsody\nBaschi – Gib mer e Chance\n…',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: _laeuft ? null : _abgleichen,
              icon: const Icon(Icons.playlist_add_check),
              label: const Text('Abgleichen'),
            ),
            if (_laeuft)
              const Padding(padding: EdgeInsets.only(top: 12), child: LinearProgressIndicator()),
          ] else ...[
            Text(
              '${a.gelesen} Zeilen gelesen · ${a.gefunden.length} gefunden · '
              '${a.fehlend.length} nicht in der Sammlung',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            if (a.gefunden.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text('Gefunden', style: Theme.of(context).textTheme.titleSmall),
              for (final t in a.gefunden)
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  value: !_aus.contains(t.titel.pfad),
                  onChanged: (an) => setState(() {
                    if (an == true) {
                      _aus.remove(t.titel.pfad);
                    } else {
                      _aus.add(t.titel.pfad);
                    }
                  }),
                  title: Text(t.titel.anzeige),
                  subtitle: Text(t.sicher ? t.zeile : 'knapp – bitte prüfen: ${t.zeile}'),
                  controlAffinity: ListTileControlAffinity.trailing,
                  secondary: VorhoerKnopf(
                    vorhoerer: widget.vorhoerer,
                    pfad: t.titel.pfad,
                    beiFehler: (e) => meldung(context, fehlerText(e)),
                  ),
                ),
            ],
            if (a.fehlend.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text('Nicht in der Sammlung', style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 4),
              for (final z in a.fehlend)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Text('• $z', style: Theme.of(context).textTheme.bodySmall),
                ),
            ],
            const SizedBox(height: 16),
            OutlinedButton(
              onPressed: () => setState(() => _ergebnis = null),
              child: const Text('Andere Liste'),
            ),
          ],
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Radiosender

class _SenderSeite extends StatefulWidget {
  const _SenderSeite({required this.zugang});

  final MusikZugang zugang;

  @override
  State<_SenderSeite> createState() => _SenderSeiteState();
}

class _SenderSeiteState extends State<_SenderSeite> {
  final _ansicht = GlobalKey<LadeAnsichtState<List<Radiosender>>>();

  Future<void> _anlegen() async {
    final neu = await showDialog<(String, String)>(
      context: context,
      builder: (_) => const _SenderDialog(),
    );
    if (neu == null) return;
    try {
      await widget.zugang.senderAnlegen(name: neu.$1, url: neu.$2);
      if (mounted) meldung(context, '„${neu.$1}“ hinzugefügt');
      unawaited(_ansicht.currentState?.neuLaden());
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    }
  }

  Future<void> _loeschen(Radiosender s) async {
    final ja = await nachfragen(
      context,
      titel: '„${s.name}“ entfernen?',
      text: 'Der Sender verschwindet auch vom Laptop im Lokal.',
      ja: 'Entfernen',
    );
    if (!ja) return;
    try {
      await widget.zugang.senderLoeschen(s.id);
      unawaited(_ansicht.currentState?.neuLaden());
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'neuer-sender',
        onPressed: _anlegen,
        icon: const Icon(Icons.add),
        label: const Text('Sender'),
      ),
      body: LadeAnsicht<List<Radiosender>>(
        key: _ansicht,
        laden: widget.zugang.sender,
        istLeer: (l) => l.isEmpty,
        leer: 'Noch keine Radiosender.',
        bauen: (context, liste, _) => ListView(
          padding: mitSystemleiste(context, const EdgeInsets.only(bottom: 96)),
          children: [
            for (final s in liste)
              ListTile(
                leading: const Icon(Icons.radio),
                title: Text(s.name),
                subtitle: Text(s.url, maxLines: 1, overflow: TextOverflow.ellipsis),
                trailing: IconButton(
                  tooltip: 'Entfernen',
                  icon: const Icon(Icons.delete_outline),
                  onPressed: () => _loeschen(s),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _SenderDialog extends StatefulWidget {
  const _SenderDialog();

  @override
  State<_SenderDialog> createState() => _SenderDialogState();
}

class _SenderDialogState extends State<_SenderDialog> {
  final _formular = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _url = TextEditingController();

  @override
  void dispose() {
    _name.dispose();
    _url.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Radiosender hinzufügen'),
      content: Form(
        key: _formular,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextFormField(
              controller: _name,
              autofocus: true,
              decoration: const InputDecoration(labelText: 'Name'),
              validator: (v) => (v ?? '').trim().isEmpty ? 'Bitte einen Namen angeben.' : null,
            ),
            TextFormField(
              controller: _url,
              keyboardType: TextInputType.url,
              decoration: const InputDecoration(labelText: 'Stream-Adresse (https://…)'),
              // Wie das Backend: nur http/https - MPD wuerde bei file: im
              // Dateisystem des Laptops landen.
              validator: (v) =>
                  RegExp(r'^https?://\S+$', caseSensitive: false).hasMatch((v ?? '').trim())
                  ? null
                  : 'Die Adresse muss mit http:// oder https:// beginnen.',
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Abbrechen')),
        FilledButton(
          onPressed: () {
            if (_formular.currentState!.validate()) {
              Navigator.of(context).pop((_name.text.trim(), _url.text.trim()));
            }
          },
          child: const Text('Hinzufügen'),
        ),
      ],
    );
  }
}
