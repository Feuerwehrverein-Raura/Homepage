// Ein Mitgliedschaftsantrag im Detail: alle Angaben, wer ihn wann bearbeitet
// hat, und - solange er offen ist - Genehmigen oder Ablehnen. Gibt beim
// Schliessen true zurueck, wenn entschieden wurde (die Liste laedt dann neu).

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../antraege/antraege_dienst.dart';
import '../antraege/antrag.dart';
import '../audit/audit_eintrag.dart' show zeitText;
import '../dienste.dart';
import 'antraege_ansicht.dart' show antragArt;

class AntragScreen extends StatefulWidget {
  const AntragScreen({super.key, required this.dienste, required this.antragId, this.vorschau});

  final VorstandDienste dienste;
  final String antragId;

  /// Der Antrag aus der Liste - fuer den Titel, bis der frische da ist.
  final Antrag? vorschau;

  @override
  State<AntragScreen> createState() => _AntragScreenState();
}

class _AntragScreenState extends State<AntragScreen> {
  final _lader = GlobalKey<LadeAnsichtState<Antrag>>();
  Antrag? _antrag;
  bool _sendet = false;

  AntraegeDienst get _dienst => widget.dienste.antraege;

  Future<Antrag> _laden() async {
    final a = await _dienst.antrag(widget.antragId);
    if (mounted) setState(() => _antrag = a);
    return a;
  }

  Future<void> _genehmigen(Antrag a) async {
    final ok = await nachfragen(
      context,
      titel: '${a.name} aufnehmen?',
      text:
          'Das Mitglied wird angelegt. Den Status setzt das Backend nach der '
          'Feuerwehr-Angabe: Angehörige der Feuerwehr Raurica (aktiv) werden '
          'sofort Aktivmitglied und erhalten Login und Willkommensmail, alle '
          'anderen «Aufnahme pendent» bis zur Generalversammlung.\n\n'
          'Angabe im Antrag: ${a.feuerwehrText ?? 'keine'}',
      ja: 'Genehmigen',
      gefaehrlich: false,
    );
    if (!ok || !mounted) return;
    await _senden(() => _dienst.genehmigen(a.id), 'Antrag genehmigt – Mitglied angelegt.');
  }

  Future<void> _ablehnen(Antrag a) async {
    final grund = await showDialog<String>(
      context: context,
      builder: (_) => _AblehnenDialog(name: a.name),
    );
    if (grund == null || !mounted) return;
    await _senden(() => _dienst.ablehnen(a.id, grund: grund), 'Antrag abgelehnt.');
  }

  Future<void> _senden(Future<void> Function() aufruf, String erfolg) async {
    setState(() => _sendet = true);
    try {
      await aufruf();
      if (!mounted) return;
      meldung(context, erfolg);
      Navigator.of(context).pop(true);
    } on Object catch (f) {
      if (!mounted) return;
      setState(() => _sendet = false);
      meldung(context, fehlerText(f));
      // Vielleicht hat jemand anders schon entschieden: frisch zeigen.
      await _lader.currentState?.neuLaden();
    }
  }

  @override
  Widget build(BuildContext context) {
    final a = _antrag ?? widget.vorschau;
    return Scaffold(
      appBar: AppBar(title: Text(a?.name ?? 'Antrag')),
      body: LadeAnsicht<Antrag>(
        key: _lader,
        laden: _laden,
        bauen: (context, a, _) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: mitSystemleiste(context, const EdgeInsets.fromLTRB(16, 8, 16, 24)),
          children: [_Angaben(antrag: a, umgebung: widget.dienste.umgebung)],
        ),
      ),
      bottomNavigationBar: _antrag?.offen ?? false
          ? UntenLeiste(
              kinder: [
                OutlinedButton.icon(
                  onPressed: _sendet ? null : () => _ablehnen(_antrag!),
                  icon: const Icon(Icons.close),
                  label: const Text('Ablehnen'),
                ),
                FilledButton.icon(
                  onPressed: _sendet ? null : () => _genehmigen(_antrag!),
                  icon: _sendet
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.check),
                  label: const Text('Genehmigen'),
                ),
              ],
            )
          : null,
    );
  }
}

class _Angaben extends StatelessWidget {
  const _Angaben({required this.antrag, required this.umgebung});

  final Antrag antrag;
  final VerwaltungsUmgebung umgebung;

  @override
  Widget build(BuildContext context) {
    final a = antrag;
    Widget zeile(IconData symbol, String titel, String? text, {Uri? link}) {
      if (text == null) return const SizedBox.shrink();
      final z = InfoZeile(symbol: symbol, titel: titel, text: text);
      if (link == null) return z;
      return InkWell(onTap: () => umgebung.linkOeffnen(link), child: z);
    }

    final status = a.status?.text ?? a.statusRoh ?? 'Unbekannt';
    final person = [?a.anrede, ?a.geschlecht].join(' · ');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Row(
            children: [
              HinweisChip(status, art: antragArt(a.status)),
              if (a.eingegangen != null) ...[
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'eingegangen ${zeitText(a.eingegangen!)}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
              ],
            ],
          ),
        ),
        const Abschnitt('Person'),
        zeile(Icons.badge_outlined, 'Name', a.name.isEmpty ? null : a.name),
        zeile(Icons.wc_outlined, 'Anrede / Geschlecht', person.isEmpty ? null : person),
        zeile(
          Icons.cake_outlined,
          'Geburtstag',
          a.geburtstag == null ? null : schweizerDatum(a.geburtstag!),
        ),
        const Abschnitt('Kontakt'),
        zeile(
          Icons.mail_outline,
          'E-Mail',
          a.email,
          link: a.email == null ? null : Uri(scheme: 'mailto', path: a.email),
        ),
        zeile(
          Icons.phone_outlined,
          'Telefon',
          a.telefon,
          link: a.telefon == null ? null : Uri(scheme: 'tel', path: a.telefon),
        ),
        zeile(
          Icons.smartphone,
          'Mobile',
          a.mobile,
          link: a.mobile == null ? null : Uri(scheme: 'tel', path: a.mobile),
        ),
        zeile(Icons.home_outlined, 'Adresse', a.adresse),
        const Abschnitt('Mitgliedschaft'),
        zeile(Icons.local_fire_department_outlined, 'Feuerwehr Raurica', a.feuerwehrText ?? '–'),
        zeile(Icons.forward_to_inbox_outlined, 'Korrespondenz', a.korrespondenzText),
        zeile(Icons.alternate_email, 'Korrespondenz an', a.korrespondenzAdresse),
        if (!a.offen) ...[
          const Abschnitt('Bearbeitung'),
          zeile(Icons.person_outline, 'Bearbeitet von', a.bearbeitetVon ?? '–'),
          zeile(
            Icons.event_available_outlined,
            'Bearbeitet am',
            a.bearbeitetAm == null ? '–' : zeitText(a.bearbeitetAm!),
          ),
          if (a.status == AntragStatus.abgelehnt)
            zeile(Icons.comment_outlined, 'Grund', a.ablehnungsgrund ?? 'Kein Grund angegeben'),
        ],
      ],
    );
  }
}

/// Fragt nach dem (freiwilligen) Grund; null bei Abbruch.
class _AblehnenDialog extends StatefulWidget {
  const _AblehnenDialog({required this.name});

  final String name;

  @override
  State<_AblehnenDialog> createState() => _AblehnenDialogState();
}

class _AblehnenDialogState extends State<_AblehnenDialog> {
  final _grund = TextEditingController();

  @override
  void dispose() {
    _grund.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final f = Theme.of(context).colorScheme;
    return AlertDialog(
      title: Text('Antrag von ${widget.name} ablehnen?'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Die Person und der Aktuar erhalten eine E-Mail. Der Grund steht darin, '
            'falls angegeben.',
          ),
          const SizedBox(height: 16),
          TextField(
            key: const Key('ablehnungsgrund'),
            controller: _grund,
            minLines: 2,
            maxLines: 5,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              labelText: 'Grund (freiwillig)',
              border: OutlineInputBorder(),
            ),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Abbrechen')),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: f.error, foregroundColor: f.onError),
          onPressed: () => Navigator.of(context).pop(_grund.text.trim()),
          child: const Text('Ablehnen'),
        ),
      ],
    );
  }
}
