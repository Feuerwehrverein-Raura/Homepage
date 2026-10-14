// Mitgliedschaftsantraege im Vorstand-Bereich (docs/vorstand-funktionen.md,
// Abschnitt 4): oben der Statusfilter mit der Zahl der offenen Antraege,
// darunter die Antraege als Karten; Antippen oeffnet den Antrag zum
// Genehmigen oder Ablehnen.

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:material_ui/material_ui.dart';

import '../antraege/antraege_dienst.dart';
import '../antraege/antrag.dart';
import '../audit/audit_eintrag.dart' show zeitText;
import '../dienste.dart';
import 'antrag_screen.dart';

class AntraegeAnsicht extends StatefulWidget {
  const AntraegeAnsicht({super.key, required this.dienste, this.zaehler});

  final VorstandDienste dienste;

  /// Zaehler der offenen Antraege, z.B. geteilt mit einem Badge am Reiter.
  /// Ohne Angabe fuehrt die Ansicht einen eigenen.
  final AntraegeZaehler? zaehler;

  @override
  State<AntraegeAnsicht> createState() => _AntraegeAnsichtState();
}

class _AntraegeAnsichtState extends State<AntraegeAnsicht> {
  final _lader = GlobalKey<LadeAnsichtState<List<Antrag>>>();

  /// null = alle.
  AntragStatus? _status = AntragStatus.ausstehend;

  late AntraegeZaehler _zaehler;
  bool _eigenerZaehler = false;

  AntraegeDienst get _dienst => widget.dienste.antraege;

  @override
  void initState() {
    super.initState();
    _zaehlerNehmen();
  }

  @override
  void didUpdateWidget(AntraegeAnsicht alt) {
    super.didUpdateWidget(alt);
    if (alt.zaehler != widget.zaehler) {
      if (_eigenerZaehler) _zaehler.dispose();
      _zaehlerNehmen();
    }
  }

  void _zaehlerNehmen() {
    _eigenerZaehler = widget.zaehler == null;
    _zaehler = widget.zaehler ?? AntraegeZaehler(_dienst);
  }

  @override
  void dispose() {
    if (_eigenerZaehler) _zaehler.dispose();
    super.dispose();
  }

  Future<List<Antrag>> _laden() async {
    final status = _status;
    // Zaehler mitladen, aber nicht darauf warten - er ist Beiwerk.
    _zaehler.aktualisieren();
    final liste = await _dienst.liste(status);
    if (status == AntragStatus.ausstehend) _zaehler.setzen(liste.length);
    return liste;
  }

  void _filtern(AntragStatus? s) {
    if (s == _status) return;
    setState(() => _status = s);
    _lader.currentState?.neuLaden();
  }

  Future<void> _oeffnen(Antrag a) async {
    final geaendert = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => AntragScreen(dienste: widget.dienste, antragId: a.id, vorschau: a),
      ),
    );
    if (geaendert ?? false) await _lader.currentState?.neuLaden();
  }

  String get _leerText => switch (_status) {
    AntragStatus.ausstehend => 'Keine offenen Anträge – alles erledigt.',
    AntragStatus.genehmigt => 'Noch keine genehmigten Anträge.',
    AntragStatus.abgelehnt => 'Keine abgelehnten Anträge.',
    null => 'Noch keine Anträge eingegangen.',
  };

  @override
  Widget build(BuildContext context) {
    final rand = mitSystemleiste(
      context,
      const EdgeInsets.fromLTRB(12, 12, 12, 0),
      maxBreite: kartenBreite,
    ).copyWith(bottom: 4);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: rand,
          child: ListenableBuilder(
            listenable: _zaehler,
            builder: (context, _) =>
                _Filter(status: _status, offen: _zaehler.anzahl, waehlen: _filtern),
          ),
        ),
        Expanded(
          child: LadeAnsicht<List<Antrag>>(
            key: _lader,
            laden: _laden,
            istLeer: (l) => l.isEmpty,
            leer: _leerText,
            bauen: (context, liste, _) => ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: mitSystemleiste(
                context,
                const EdgeInsets.fromLTRB(12, 4, 12, 24),
                maxBreite: kartenBreite,
              ),
              children: [
                KartenSpalten(
                  children: [
                    for (final a in liste) AntragKarte(antrag: a, oeffnen: () => _oeffnen(a)),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// Statusfilter als Chips; bricht auf schmalen Bildschirmen um statt seitlich
/// zu scrollen.
class _Filter extends StatelessWidget {
  const _Filter({required this.status, required this.offen, required this.waehlen});

  final AntragStatus? status;
  final int? offen;
  final ValueChanged<AntragStatus?> waehlen;

  @override
  Widget build(BuildContext context) {
    Widget chip(AntragStatus? s, String text) => ChoiceChip(
      key: Key('filter-${s?.code ?? 'all'}'),
      label: Text(text),
      selected: status == s,
      onSelected: (_) => waehlen(s),
    );
    final zahl = offen;
    return Wrap(
      spacing: 8,
      runSpacing: 4,
      children: [
        chip(
          AntragStatus.ausstehend,
          zahl == null || zahl == 0 ? 'Ausstehend' : 'Ausstehend ($zahl)',
        ),
        chip(AntragStatus.genehmigt, 'Genehmigt'),
        chip(AntragStatus.abgelehnt, 'Abgelehnt'),
        chip(null, 'Alle'),
      ],
    );
  }
}

/// Farbe des Status-Chips.
HinweisArt antragArt(AntragStatus? s) => switch (s) {
  AntragStatus.ausstehend => HinweisArt.warnung,
  AntragStatus.genehmigt => HinweisArt.gut,
  AntragStatus.abgelehnt => HinweisArt.schlecht,
  null => HinweisArt.neutral,
};

/// Karte eines Antrags: Name, E-Mail, Feuerwehr, Eingang, Status.
class AntragKarte extends StatelessWidget {
  const AntragKarte({super.key, required this.antrag, required this.oeffnen});

  final Antrag antrag;
  final VoidCallback oeffnen;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final a = antrag;
    final leise = t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant);
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 6),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: oeffnen,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(a.name.isEmpty ? '(ohne Namen)' : a.name, style: t.textTheme.titleMedium),
                    if (a.email != null)
                      Text(
                        a.email!,
                        style: t.textTheme.bodyMedium,
                        overflow: TextOverflow.ellipsis,
                      ),
                    if (a.feuerwehrText != null)
                      Text('Feuerwehr: ${a.feuerwehrText}', style: leise),
                    if (a.eingegangen != null)
                      Text('Eingegangen ${zeitText(a.eingegangen!)}', style: leise),
                    const SizedBox(height: 8),
                    HinweisChip(
                      a.status?.text ?? a.statusRoh ?? 'Unbekannt',
                      art: antragArt(a.status),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right),
            ],
          ),
        ),
      ),
    );
  }
}
