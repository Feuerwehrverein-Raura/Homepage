// Mitglieder im Vorstand-Bereich (docs/vorstand-funktionen.md, Abschnitt 2
// und 3): Kennzahlen, Suche beim Server, Statusfilter, Liste; Tippen oeffnet
// das Detail, "Neues Mitglied" das Formular. Ohne eigene Titelleiste - der
// Reiter "Vorstand" zeigt sie.

import 'dart:async';

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:fwv_core/fwv_core.dart' show isoDatum;
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';
import '../mitglieder/export.dart';
import '../mitglieder/modelle.dart';
import 'mitglieder/bausteine.dart';
import 'mitglieder/mitglied_detail_screen.dart';
import 'mitglieder/mitglied_formular_screen.dart';

class MitgliederAnsicht extends StatefulWidget {
  const MitgliederAnsicht({super.key, required this.dienste});

  final VorstandDienste dienste;

  @override
  State<MitgliederAnsicht> createState() => _MitgliederAnsichtState();
}

/// Was die Liste auf einmal laedt. Ohne Kennzahlen (Fehler) geht die Liste
/// trotzdem.
typedef _Daten = ({List<VorstandMitglied> liste, MitgliederKennzahlen? zahlen});

class _MitgliederAnsichtState extends State<MitgliederAnsicht> with AutomaticKeepAliveClientMixin {
  final _lader = GlobalKey<LadeAnsichtState<_Daten>>();
  final _suche = TextEditingController();
  Timer? _warten;
  String? _status;

  @override
  bool get wantKeepAlive => true;

  @override
  void dispose() {
    _warten?.cancel();
    _suche.dispose();
    super.dispose();
  }

  Future<void> _neuLaden() async => _lader.currentState?.neuLaden();

  Future<_Daten> _laden() async {
    final v = widget.dienste.mitglieder;
    final zahlen = v.kennzahlen().then<MitgliederKennzahlen?>((z) => z, onError: (_) => null);
    final liste = await v.liste(suche: _suche.text, status: _status);
    return (liste: liste, zahlen: await zahlen);
  }

  void _suchen(String _) {
    setState(() {});
    _warten?.cancel();
    _warten = Timer(const Duration(milliseconds: 350), _neuLaden);
  }

  void _filtern(String? status) {
    if (status == _status) return;
    setState(() => _status = status);
    _neuLaden();
  }

  Future<void> _oeffnen(VorstandMitglied m) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => MitgliedDetailScreen(dienste: widget.dienste, mitglied: m),
      ),
    );
    // Bearbeitet, Foto, Loeschanfrage: einfach neu laden.
    await _neuLaden();
  }

  Future<void> _neu() async {
    final neu = await Navigator.of(context).push<VorstandMitglied>(
      MaterialPageRoute(builder: (_) => MitgliedFormularScreen(dienste: widget.dienste)),
    );
    if (neu == null || !mounted) return;
    await _neuLaden();
    if (mounted) await _oeffnen(neu);
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return Scaffold(
      body: Column(
        children: [
          Padding(
            padding: mitSystemleiste(
              context,
              const EdgeInsets.fromLTRB(12, 12, 12, 4),
            ).copyWith(bottom: 4),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    key: const Key('mitglieder-suche'),
                    controller: _suche,
                    textInputAction: TextInputAction.search,
                    decoration: InputDecoration(
                      hintText: 'Name oder E-Mail',
                      prefixIcon: const Icon(Icons.search),
                      isDense: true,
                      border: const OutlineInputBorder(),
                      suffixIcon: _suche.text.isEmpty
                          ? null
                          : IconButton(
                              onPressed: () {
                                _suche.clear();
                                _suchen('');
                              },
                              icon: const Icon(Icons.clear),
                              tooltip: 'Suche löschen',
                            ),
                    ),
                    onChanged: _suchen,
                    onSubmitted: (_) {
                      _warten?.cancel();
                      _neuLaden();
                    },
                  ),
                ),
                const SizedBox(width: 4),
                PopupMenuButton<String>(
                  key: const Key('status-filter'),
                  tooltip: 'Nach Status filtern',
                  icon: Badge(
                    isLabelVisible: _status != null,
                    smallSize: 8,
                    child: const Icon(Icons.filter_list),
                  ),
                  onSelected: (s) => _filtern(s.isEmpty ? null : s),
                  itemBuilder: (_) => [
                    CheckedPopupMenuItem(
                      value: '',
                      checked: _status == null,
                      child: const Text('Alle Status'),
                    ),
                    for (final s in mitgliedStatusFilter)
                      CheckedPopupMenuItem(value: s, checked: _status == s, child: Text(s)),
                  ],
                ),
                _ExportMenue(dienste: widget.dienste),
              ],
            ),
          ),
          if (_status != null)
            Padding(
              padding: mitSystemleiste(
                context,
                const EdgeInsets.symmetric(horizontal: 12),
              ).copyWith(bottom: 0),
              child: Align(
                alignment: Alignment.centerLeft,
                child: InputChip(
                  key: const Key('filter-chip'),
                  label: Text(_status!),
                  onDeleted: () => _filtern(null),
                  deleteButtonTooltipMessage: 'Filter entfernen',
                ),
              ),
            ),
          Expanded(
            child: LadeAnsicht<_Daten>(
              key: _lader,
              laden: _laden,
              bauen: (context, d, _) => _liste(context, d),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        key: const Key('mitglied-neu'),
        heroTag: 'mitglied-neu',
        onPressed: _neu,
        icon: const Icon(Icons.person_add_alt_1_outlined),
        label: const Text('Neues Mitglied'),
      ),
    );
  }

  Widget _liste(BuildContext context, _Daten d) {
    final api = widget.dienste.api;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: mitSystemleiste(context, const EdgeInsets.only(top: 4, bottom: 96)),
      children: [
        if (d.zahlen case final z?)
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
            child: _Kennzahlen(zahlen: z, status: _status, waehlen: _filtern),
          ),
        if (d.liste.isEmpty)
          const Padding(
            padding: EdgeInsets.all(24),
            child: Text('Keine Mitglieder gefunden.', textAlign: TextAlign.center),
          ),
        for (final m in d.liste)
          ListTile(
            key: Key('mitglied-${m.id}'),
            leading: MitgliedBild(mitglied: m, api: api),
            title: Text(m.name, maxLines: 1, overflow: TextOverflow.ellipsis),
            subtitle: Text(
              [if (m.funktion != null) m.funktionen.join(', '), ?m.nummer].join(' · '),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            trailing: MitgliedStatusChip(status: m.status),
            onTap: () => _oeffnen(m),
          ),
        if (d.liste.isNotEmpty)
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              d.liste.length == 1 ? '1 Mitglied' : '${d.liste.length} Mitglieder',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
      ],
    );
  }
}

/// Vier Kacheln; Tippen filtert nach dem Status (Gesamt = alle).
class _Kennzahlen extends StatelessWidget {
  const _Kennzahlen({required this.zahlen, required this.status, required this.waehlen});

  final MitgliederKennzahlen zahlen;
  final String? status;
  final ValueChanged<String?> waehlen;

  @override
  Widget build(BuildContext context) {
    final kacheln = [
      ('Gesamt', zahlen.gesamt, null),
      ('Aktiv', zahlen.aktiv, 'Aktivmitglied'),
      ('Pendent', zahlen.pendent, 'Aufnahme pendent'),
      ('Ehren', zahlen.ehren, 'Ehrenmitglied'),
    ];
    final t = Theme.of(context);
    return Row(
      children: [
        for (final (i, (titel, zahl, s)) in kacheln.indexed) ...[
          if (i > 0) const SizedBox(width: 8),
          Expanded(
            child: Card(
              key: Key('kennzahl-$titel'),
              margin: EdgeInsets.zero,
              color: status == s ? t.colorScheme.secondaryContainer : null,
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: () => waehlen(s),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
                  child: Column(
                    children: [
                      Text('$zahl', style: t.textTheme.titleLarge),
                      Text(
                        titel,
                        style: t.textTheme.labelMedium,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

/// Telefonliste (PDF) und CSV-Exporte wie in vorstand.html; die Datei geht
/// ueber das Teilen-Menue (Desktop: Downloads) weiter.
class _ExportMenue extends StatelessWidget {
  const _ExportMenue({required this.dienste});

  final VorstandDienste dienste;

  Future<void> _csv(BuildContext context, MitgliederExport art) async {
    final ursprung = stelleVon(context);
    try {
      final (:bytes, :anzahl) = await dienste.export.csv(art);
      await dienste.umgebung.dateiTeilen(
        bytes,
        exportDateiname(art, DateTime.now()),
        'text/csv',
        ursprung: ursprung,
      );
      if (context.mounted) {
        meldung(context, anzahl == 1 ? '1 Mitglied exportiert.' : '$anzahl Mitglieder exportiert.');
      }
    } on Object catch (e) {
      if (context.mounted) meldung(context, fehlerText(e));
    }
  }

  @override
  Widget build(BuildContext context) => PopupMenuButton<Object>(
    key: const Key('mitglieder-export'),
    tooltip: 'Exportieren',
    icon: const Icon(Icons.file_download_outlined),
    onSelected: (wahl) => wahl is MitgliederExport
        ? _csv(context, wahl)
        : pdfTeilen(
            context,
            dienste.umgebung,
            dienste.export.telefonliste,
            'Telefonliste_${isoDatum(DateTime.now())}.pdf',
          ),
    itemBuilder: (_) => [
      const PopupMenuItem(
        key: Key('export-telefonliste'),
        value: 'telefonliste',
        child: ListTile(
          leading: Icon(Icons.picture_as_pdf_outlined),
          title: Text('Telefonliste (PDF)'),
          contentPadding: EdgeInsets.zero,
        ),
      ),
      const PopupMenuDivider(),
      for (final art in MitgliederExport.values)
        PopupMenuItem(
          key: Key('export-${art.name}'),
          value: art,
          child: ListTile(
            leading: const Icon(Icons.table_chart_outlined),
            title: Text('CSV: ${art.titel}'),
            contentPadding: EdgeInsets.zero,
          ),
        ),
    ],
  );
}
