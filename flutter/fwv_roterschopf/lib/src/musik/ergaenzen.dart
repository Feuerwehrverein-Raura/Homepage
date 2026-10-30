// "Ergänzen": Songs in die Sammlung holen - auf YouTube suchen oder einen
// Link (YouTube, Spotify: Song, Album, Playlist) einfuegen. Geladen wird auf
// dem Server mit spotDL (docker/musik-dl) in den Nextcloud-Ordner Musik; von
// dort holt sich der Laptop im Roten Schopf die Sammlung, und erst dann
// stehen die Songs ueberall zur Auswahl. Nur Gruppe Roter Schopf, Vorstand,
// admin - das prueft auch api-members.

import 'dart:async';

import 'package:fwv_anlass/fwv_anlass.dart' show fehlerText, meldung, mitSystemleiste;
import 'package:material_ui/material_ui.dart';

import 'modelle.dart';
import 'player.dart' show zeitText;
import 'zugang.dart';

class ErgaenzenSeite extends StatefulWidget {
  const ErgaenzenSeite({super.key, required this.zugang});

  final MusikZugang zugang;

  @override
  State<ErgaenzenSeite> createState() => _ErgaenzenSeiteState();
}

class _ErgaenzenSeiteState extends State<ErgaenzenSeite> {
  final _eingabe = TextEditingController();
  List<YoutubeTreffer>? _treffer;
  List<ErgaenzenAuftrag> _auftraege = const [];
  final _beauftragt = <String>{}; // URLs, die schon in der Schlange sind
  bool _sucht = false;
  String? _fehler;
  Timer? _nachfragen;

  static final _link = RegExp(r'^https?://', caseSensitive: false);

  @override
  void initState() {
    super.initState();
    _auftraegeLaden();
  }

  @override
  void dispose() {
    _nachfragen?.cancel();
    _eingabe.dispose();
    super.dispose();
  }

  Future<void> _auftraegeLaden() async {
    try {
      final a = await widget.zugang.ergaenzenAuftraege();
      if (!mounted) return;
      setState(() => _auftraege = a);
      // Solange etwas laeuft, alle paar Sekunden nachsehen.
      _nachfragen?.cancel();
      if (a.any((x) => x.laeuft)) {
        _nachfragen = Timer(const Duration(seconds: 5), _auftraegeLaden);
      }
    } on Object catch (e) {
      if (mounted) setState(() => _fehler = fehlerText(e));
    }
  }

  Future<void> _los() async {
    final text = _eingabe.text.trim();
    if (text.isEmpty) return;
    if (_link.hasMatch(text)) {
      await _ergaenzen(text);
      _eingabe.clear();
      return;
    }
    setState(() {
      _sucht = true;
      _fehler = null;
    });
    try {
      final t = await widget.zugang.youtubeSuchen(text);
      if (mounted) setState(() => _treffer = t);
    } on Object catch (e) {
      if (mounted) setState(() => _fehler = fehlerText(e));
    } finally {
      if (mounted) setState(() => _sucht = false);
    }
  }

  Future<void> _ergaenzen(String quelle) async {
    try {
      await widget.zugang.ergaenzen(quelle);
      setState(() => _beauftragt.add(quelle));
      if (mounted) meldung(context, 'Wird geladen – erscheint danach in der Sammlung');
      await _auftraegeLaden();
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    }
  }

  Future<void> _alsPlaylist(ErgaenzenAuftrag a) async {
    final name = await showDialog<String>(
      context: context,
      builder: (_) => _NameDialog(vorschlag: ''),
    );
    if (name == null || name.isEmpty) return;
    try {
      await widget.zugang.speichern(name: name, pfade: a.dateien);
      if (mounted) meldung(context, '„$name“ angelegt');
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final treffer = _treffer;
    return ListView(
      padding: mitSystemleiste(context, const EdgeInsets.only(bottom: 24)),
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
          child: TextField(
            key: const Key('ergaenzen-eingabe'),
            controller: _eingabe,
            textInputAction: TextInputAction.search,
            onSubmitted: (_) => _los(),
            decoration: InputDecoration(
              prefixIcon: const Icon(Icons.search),
              hintText: 'Auf YouTube suchen oder Link einfügen',
              suffixIcon: IconButton(
                tooltip: 'Los',
                icon: const Icon(Icons.arrow_forward),
                onPressed: _sucht ? null : _los,
              ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Text(
            'Links: YouTube oder Spotify – ein Song, ein Album oder eine ganze Playlist. '
            'Neue Songs kommen nach ein paar Minuten auf den Laptop und in die Sammlung.',
            style: text.bodySmall,
          ),
        ),
        if (_sucht)
          const Padding(padding: EdgeInsets.only(top: 12), child: LinearProgressIndicator()),
        if (_fehler != null)
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(_fehler!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ),
        if (treffer != null) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
            child: Text('Auf YouTube', style: text.titleSmall),
          ),
          if (treffer.isEmpty)
            const Padding(padding: EdgeInsets.all(16), child: Text('Nichts gefunden.')),
          for (final t in treffer)
            ListTile(
              leading: _Vorschau(bild: t.bild),
              title: Text(t.titel, maxLines: 2, overflow: TextOverflow.ellipsis),
              subtitle: Text(
                [
                  if (t.offiziell) 'Offizielle Tonspur' else ?t.kanal,
                  if (t.dauer case final d?) zeitText(d),
                ].join(' · '),
              ),
              trailing: _beauftragt.contains(t.url)
                  ? const Icon(Icons.check)
                  : IconButton(
                      tooltip: 'In die Sammlung',
                      icon: const Icon(Icons.library_add),
                      onPressed: () => _ergaenzen(t.url),
                    ),
            ),
        ],
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 4),
          child: Row(
            children: [
              Expanded(child: Text('Aufträge', style: text.titleSmall)),
              IconButton(
                tooltip: 'Neu laden',
                icon: const Icon(Icons.refresh),
                onPressed: _auftraegeLaden,
              ),
            ],
          ),
        ),
        if (_auftraege.isEmpty)
          const Padding(padding: EdgeInsets.fromLTRB(16, 0, 16, 16), child: Text('Noch keine.')),
        for (final a in _auftraege)
          ListTile(
            leading: switch (a.stand) {
              AuftragsStand.wartet => const Icon(Icons.schedule),
              AuftragsStand.laedt => const SizedBox.square(
                dimension: 24,
                child: CircularProgressIndicator(strokeWidth: 2.5),
              ),
              AuftragsStand.fertig => const Icon(Icons.check_circle_outline),
              AuftragsStand.fehler => Icon(
                Icons.error_outline,
                color: Theme.of(context).colorScheme.error,
              ),
            },
            title: Text(_titel(a), maxLines: 2, overflow: TextOverflow.ellipsis),
            subtitle: Text(_stand(a)),
            trailing: a.stand == AuftragsStand.fertig && a.dateien.length > 1
                ? IconButton(
                    tooltip: 'Als Playlist anlegen',
                    icon: const Icon(Icons.playlist_add),
                    onPressed: () => _alsPlaylist(a),
                  )
                : null,
          ),
      ],
    );
  }

  /// Ein Song: sein Name; sonst die Quelle.
  String _titel(ErgaenzenAuftrag a) {
    if (a.dateien.length == 1) {
      final d = a.dateien.single;
      final punkt = d.lastIndexOf('.');
      return punkt > 0 ? d.substring(0, punkt) : d;
    }
    return a.quelle;
  }

  String _stand(ErgaenzenAuftrag a) => [
    switch (a.stand) {
      AuftragsStand.wartet => 'Wartet',
      AuftragsStand.laedt => 'Lädt …',
      AuftragsStand.fertig =>
        a.schonDa == 0
            ? (a.neu == 1 ? '1 Song neu' : '${a.neu} Songs neu')
            : '${a.neu} neu, ${a.schonDa} schon in der Sammlung',
      AuftragsStand.fehler => a.meldung ?? 'Nicht geklappt',
    },
    ?a.wer,
  ].join(' · ');
}

class _Vorschau extends StatelessWidget {
  const _Vorschau({required this.bild});

  final Uri? bild;

  @override
  Widget build(BuildContext context) {
    const platz = SizedBox(width: 64, height: 36, child: Icon(Icons.music_video));
    final b = bild;
    if (b == null) return platz;
    return ClipRRect(
      borderRadius: BorderRadius.circular(4),
      child: Image.network(
        b.toString(),
        width: 64,
        height: 36,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => platz,
      ),
    );
  }
}

class _NameDialog extends StatefulWidget {
  const _NameDialog({required this.vorschlag});

  final String vorschlag;

  @override
  State<_NameDialog> createState() => _NameDialogState();
}

class _NameDialogState extends State<_NameDialog> {
  late final _name = TextEditingController(text: widget.vorschlag);

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Als Playlist anlegen'),
      content: TextField(
        controller: _name,
        autofocus: true,
        decoration: const InputDecoration(labelText: 'Name der Playlist'),
        onSubmitted: (v) => Navigator.of(context).pop(v.trim()),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Abbrechen')),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(_name.text.trim()),
          child: const Text('Anlegen'),
        ),
      ],
    );
  }
}
