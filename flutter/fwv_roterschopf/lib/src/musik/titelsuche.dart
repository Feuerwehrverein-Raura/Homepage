// "Titel suchen": die ganze Sammlung nach Interpret oder Titel durchsuchen,
// einen Treffer abspielen (danach laufen die weiteren Treffer) oder zu
// einer Playlist hinzufuegen. Erreichbar ueber die Lupe in der Titelleiste
// von "Musik", am Computer auch mit Cmd/Ctrl+F.
//
// Anders als TitelSuche im Playlist-Editor (dort: Titel ankreuzen und
// uebernehmen) geht es hier ums Hoeren.

import 'dart:async';

import 'package:fwv_anlass/fwv_anlass.dart' show fehlerText, meldung, mitSystemleiste;
import 'package:material_ui/material_ui.dart';

import 'modelle.dart';
import 'player.dart';
import 'zugang.dart';

class TitelSucheSeite extends StatefulWidget {
  const TitelSucheSeite({super.key, required this.zugang, required this.player});

  final MusikZugang zugang;
  final MusikPlayer player;

  @override
  State<TitelSucheSeite> createState() => _TitelSucheSeiteState();
}

class _TitelSucheSeiteState extends State<TitelSucheSeite> {
  Timer? _verzoegert;
  Bibliothek? _ergebnis;
  String _suche = '';
  String? _fehler;
  bool _sucht = false;
  int _nr = 0;

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
        _suche = suche;
        _fehler = null;
      });
    } on Object catch (e) {
      if (mounted && nr == _nr) setState(() => _fehler = fehlerText(e));
    } finally {
      if (mounted && nr == _nr) setState(() => _sucht = false);
    }
  }

  /// Treffer [index] abspielen; danach laufen die weiteren Treffer.
  Future<void> _abspielen(List<MusikTitel> treffer, int index) async {
    final t = treffer[index];
    final p = widget.player;
    if (p.istAktuell(t.pfad)) return p.umschalten();
    try {
      await p.spieleListe(_suche.isEmpty ? 'Suche' : 'Suche «$_suche»', treffer, ab: index);
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    }
  }

  Future<void> _zuPlaylist(MusikTitel t) async {
    final List<PlaylistKurz> liste;
    try {
      liste = await widget.zugang.playlists();
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
      return;
    }
    if (!mounted) return;
    if (liste.isEmpty) {
      meldung(context, 'Noch keine Playlist - lege zuerst eine an.');
      return;
    }
    final gewaehlt = await showDialog<PlaylistKurz>(
      context: context,
      builder: (context) => SimpleDialog(
        title: Text('«${t.anzeige}» hinzufügen zu'),
        children: [
          for (final p in liste)
            SimpleDialogOption(
              onPressed: () => Navigator.of(context).pop(p),
              child: Text('${p.name}  (${p.anzahl})'),
            ),
        ],
      ),
    );
    if (gewaehlt == null || !mounted) return;
    try {
      final p = await widget.zugang.playlist(gewaehlt.id);
      final pfade = [for (final x in p.titel) x.pfad];
      if (pfade.contains(t.pfad)) {
        if (mounted) meldung(context, 'Schon in «${p.name}».');
        return;
      }
      await widget.zugang.speichern(id: p.id, name: p.name, pfade: [...pfade, t.pfad]);
      if (mounted) meldung(context, 'Zu «${p.name}» hinzugefügt.');
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final b = _ergebnis;
    final treffer = b?.titel ?? const <MusikTitel>[];
    return Scaffold(
      appBar: AppBar(title: const Text('Titel suchen')),
      bottomNavigationBar: MiniPlayer(player: widget.player),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              key: const Key('titelsuche-feld'),
              autofocus: true,
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.search),
                hintText: 'Interpret oder Titel',
              ),
              onChanged: _eingabe,
              textInputAction: TextInputAction.search,
              // Enter spielt den ersten Treffer.
              onSubmitted: (_) {
                if (treffer.isNotEmpty) _abspielen(treffer, 0);
              },
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
                  _suche.isEmpty
                      ? '${b.gesamt} Titel in der Sammlung'
                      : '${treffer.length} Treffer${treffer.length < b.gesamt ? ' (die ersten)' : ''}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
            ),
          if (b != null && treffer.isEmpty && _suche.isNotEmpty)
            const Padding(padding: EdgeInsets.all(24), child: Text('Kein Titel gefunden.')),
          Expanded(
            child: ListenableBuilder(
              listenable: widget.player,
              builder: (context, _) => ListView.builder(
                padding: mitSystemleiste(context, const EdgeInsets.only(bottom: 24)),
                itemCount: treffer.length,
                itemBuilder: (context, i) {
                  final t = treffer[i];
                  final aktuell = widget.player.istAktuell(t.pfad);
                  final spielt = aktuell && widget.player.spielt;
                  return ListTile(
                    key: ValueKey('treffer-${t.pfad}'),
                    selected: aktuell,
                    leading: aktuell && widget.player.laedt && !widget.player.spielt
                        ? const SizedBox.square(
                            dimension: 24,
                            child: CircularProgressIndicator(strokeWidth: 2.5),
                          )
                        : Icon(spielt ? Icons.pause_circle_outline : Icons.play_circle_outline),
                    title: Text(t.titel ?? t.anzeige),
                    subtitle: t.interpret == null ? null : Text(t.interpret!),
                    onTap: () => _abspielen(treffer, i),
                    trailing: PopupMenuButton<void>(
                      tooltip: 'Mehr',
                      itemBuilder: (context) => [
                        PopupMenuItem(
                          onTap: () => _zuPlaylist(t),
                          child: const Text('Zu Playlist hinzufügen…'),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}
