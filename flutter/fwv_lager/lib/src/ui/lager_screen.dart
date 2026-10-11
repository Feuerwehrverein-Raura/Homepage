// Reiter "Lager": oben Artikel · Lagerorte · Nachbestellen, unten rechts
// immer "Scannen", oben rechts "Artikel anlegen". Vorbild: Inventar-PWA
// (simple-inventory-system/frontend), fuers Handy zusammengestrichen.

import 'dart:async';

import 'package:fwv_anlass/fwv_anlass.dart' show LadeAnsicht, LadeAnsichtState, fehlerText, meldung;
import 'package:material_ui/material_ui.dart';

import '../modelle.dart';
import '../zugang.dart';
import 'anlegen_screen.dart';
import 'artikel_screen.dart';
import 'lagerort_screen.dart';

class LagerScreen extends StatefulWidget {
  const LagerScreen({super.key, required this.lager});

  final Lager lager;

  @override
  State<LagerScreen> createState() => _LagerScreenState();
}

class _LagerScreenState extends State<LagerScreen> {
  final _artikel = GlobalKey<_ArtikelListeState>();
  final _nachbestellen = GlobalKey<LadeAnsichtState<List<Artikel>>>();
  final _lagerorte = GlobalKey<LadeAnsichtState<List<Lagerort>>>();
  bool _sucht = false;

  Lager get _lager => widget.lager;

  /// Nach einer Buchung oder einem neuen Artikel alles neu laden, was
  /// schon geladen ist.
  Future<void> _allesNeu() async {
    await Future.wait([
      ?_artikel.currentState?.neuLaden(),
      ?_nachbestellen.currentState?.neuLaden(),
      ?_lagerorte.currentState?.neuLaden(),
    ]);
  }

  Future<void> _scannen() async {
    final gelesen = await _lager.umgebung.scannen(context);
    if (gelesen == null || !mounted) return;
    await codeOeffnen(gelesen);
  }

  /// Gelesenen Code suchen: im Lager -> Artikel, sonst anlegen/zuordnen.
  Future<void> codeOeffnen(String gelesen) async {
    final code = codeAusScan(gelesen);
    if (code.isEmpty) return;
    setState(() => _sucht = true);
    final ScanTreffer treffer;
    try {
      treffer = await _lager.zugang.codeSuchen(code);
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
      return;
    } finally {
      if (mounted) setState(() => _sucht = false);
    }
    if (!mounted) return;
    final bool geaendert;
    switch (treffer) {
      case ImLager(:final artikel):
        geaendert = await artikelOeffnen(context, _lager, artikel.id);
      case final Unbekannt u:
        geaendert =
            await Navigator.of(context).push<bool>(
              MaterialPageRoute(
                builder: (_) => UnbekannterCodeScreen(lager: _lager, treffer: u),
              ),
            ) ??
            false;
    }
    if (geaendert) await _allesNeu();
  }

  Future<void> _anlegen() async {
    final neu = await Navigator.of(context)
        .push<bool>(MaterialPageRoute(builder: (_) => ArtikelAnlegenScreen(lager: _lager)));
    if (neu ?? false) await _allesNeu();
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Lager'),
          actions: [
            IconButton(
              onPressed: _anlegen,
              icon: const Icon(Icons.add_box_outlined),
              tooltip: 'Artikel anlegen',
            ),
          ],
          bottom: const TabBar(
            tabs: [
              Tab(text: 'Artikel'),
              Tab(text: 'Lagerorte'),
              Tab(text: 'Nachbestellen'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _ArtikelListe(key: _artikel, lager: _lager, geaendert: _allesNeu),
            LadeAnsicht<List<Lagerort>>(
              key: _lagerorte,
              laden: _lager.zugang.lagerorte,
              istLeer: (l) => l.isEmpty,
              leer: 'Noch keine Lagerorte erfasst.',
              bauen: (context, orte, _) => ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.only(bottom: 96),
                children: [
                  for (final o in orte)
                    ListTile(
                      leading: const Icon(Icons.inventory_2_outlined),
                      title: Text(o.name),
                      subtitle: o.beschreibung == null ? null : Text(o.beschreibung!),
                      trailing: Text(o.artikel == 1 ? '1 Artikel' : '${o.artikel} Artikel'),
                      onTap: () async {
                        final g = await Navigator.of(context).push<bool>(
                          MaterialPageRoute(
                            builder: (_) => LagerortScreen(lager: _lager, lagerort: o),
                          ),
                        );
                        if (g ?? false) await _allesNeu();
                      },
                    ),
                ],
              ),
            ),
            LadeAnsicht<List<Artikel>>(
              key: _nachbestellen,
              laden: _lager.zugang.nachbestellen,
              istLeer: (l) => l.isEmpty,
              leer: 'Alles genug an Lager.',
              bauen: (context, liste, _) => ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.only(bottom: 96),
                children: [
                  for (final a in liste)
                    ListTile(
                      title: Text(a.name),
                      subtitle: Text(
                        [
                          'Mindestbestand ${mengeMitEinheit(a.mindestbestand, a.einheit)}',
                          ?a.lieferant,
                          ?a.lagerort,
                        ].join(' · '),
                      ),
                      trailing: BestandChip(artikel: a),
                      onTap: () async {
                        if (await artikelOeffnen(context, _lager, a.id)) await _allesNeu();
                      },
                    ),
                ],
              ),
            ),
          ],
        ),
        floatingActionButton: FloatingActionButton.extended(
          key: const Key('scannen'),
          onPressed: _sucht ? null : _scannen,
          icon: _sucht
              ? const SizedBox.square(
                  dimension: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.qr_code_scanner),
          label: const Text('Scannen'),
        ),
      ),
    );
  }
}

/// Artikel mit Suche (Name, EAN, eigener Code).
class _ArtikelListe extends StatefulWidget {
  const _ArtikelListe({super.key, required this.lager, required this.geaendert});

  final Lager lager;
  final Future<void> Function() geaendert;

  @override
  State<_ArtikelListe> createState() => _ArtikelListeState();
}

class _ArtikelListeState extends State<_ArtikelListe> with AutomaticKeepAliveClientMixin {
  final _lader = GlobalKey<LadeAnsichtState<List<Artikel>>>();
  final _feld = TextEditingController();
  Timer? _warten;

  @override
  bool get wantKeepAlive => true;

  @override
  void dispose() {
    _warten?.cancel();
    _feld.dispose();
    super.dispose();
  }

  Future<void> neuLaden() async => _lader.currentState?.neuLaden();

  void _suchen(String _) {
    setState(() {});
    _warten?.cancel();
    _warten = Timer(const Duration(milliseconds: 350), neuLaden);
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
          child: TextField(
            key: const Key('artikel-suche'),
            controller: _feld,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: 'Name oder Code',
              prefixIcon: const Icon(Icons.search),
              isDense: true,
              border: const OutlineInputBorder(),
              suffixIcon: _feld.text.isEmpty
                  ? null
                  : IconButton(
                      onPressed: () {
                        _feld.clear();
                        _suchen('');
                      },
                      icon: const Icon(Icons.clear),
                      tooltip: 'Suche löschen',
                    ),
            ),
            onChanged: _suchen,
            onSubmitted: (_) {
              _warten?.cancel();
              neuLaden();
            },
          ),
        ),
        Expanded(
          child: LadeAnsicht<List<Artikel>>(
            key: _lader,
            laden: () => widget.lager.zugang.artikel(suche: _feld.text),
            istLeer: (l) => l.isEmpty,
            leer: 'Keine Artikel gefunden.',
            bauen: (context, liste, _) => ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.only(bottom: 96),
              children: [
                for (final a in liste)
                  ListTile(
                    key: Key('artikel-${a.id}'),
                    title: Text(a.name),
                    subtitle: Text(
                      [?a.kategorie, ?a.lagerort, ?a.code].join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    trailing: BestandChip(artikel: a),
                    onTap: () async {
                      if (await artikelOeffnen(context, widget.lager, a.id)) {
                        await widget.geaendert();
                      }
                    },
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
