// Vorstand -> "Spesen": was Mitglieder eingereicht haben (und das
// Pingen-Porto des Aktuars). Der Kassier sieht Beleg und IBAN, markiert als
// bezahlt oder lehnt mit Begruendung ab; das Mitglied bekommt eine Mail
// (docker/backend-members/src/spesen.js).

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';

class SpesenAnsicht extends StatefulWidget {
  const SpesenAnsicht({super.key, required this.dienste});

  final VorstandDienste dienste;

  @override
  State<SpesenAnsicht> createState() => _SpesenAnsichtState();
}

class _SpesenAnsichtState extends State<SpesenAnsicht> {
  var _laden = GlobalKey<LadeAnsichtState<SpesenUebersicht>>();
  SpesenStatus? _filter = SpesenStatus.eingereicht;
  final _arbeitet = <String>{};

  SpesenDienst get _dienst => widget.dienste.spesen;

  void _filtern(SpesenStatus? f) => setState(() {
    _filter = f;
    _laden = GlobalKey();
  });

  Future<void> _beleg(BuildContext context, Spesen s) async {
    final ursprung = stelleVon(context);
    try {
      final bytes = await _dienst.beleg(s.id);
      await widget.dienste.umgebung.dateiTeilen(
        bytes,
        s.belegName ?? 'Beleg',
        s.belegTyp ?? 'application/octet-stream',
        ursprung: ursprung,
      );
    } on Object catch (e) {
      if (context.mounted) meldung(context, fehlerText(e));
    }
  }

  Future<void> _erledigen(Spesen s, {required bool bezahlt}) async {
    String? grund;
    if (bezahlt) {
      final ja = await nachfragen(
        context,
        titel: 'Als bezahlt markieren?',
        text:
            '${spesenFranken(s.betrag)} an ${s.name ?? 'das Mitglied'}'
            '${s.iban != null ? ' (${ibanFormatieren(s.iban!)})' : ''}.\n\n'
            'Erst markieren, wenn die Zahlung ausgelöst ist – das Mitglied bekommt eine Mail.',
        ja: 'Bezahlt',
        gefaehrlich: false,
      );
      if (!ja) return;
    } else {
      grund = await _begruendung(s);
      if (grund == null) return;
    }
    setState(() => _arbeitet.add(s.id));
    try {
      if (bezahlt) {
        await _dienst.bezahlt(s.id);
      } else {
        await _dienst.ablehnen(s.id, grund!);
      }
      if (mounted) meldung(context, bezahlt ? 'Als bezahlt markiert.' : 'Abgelehnt.');
      await _laden.currentState?.neuLaden();
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _arbeitet.remove(s.id));
    }
  }

  Future<String?> _begruendung(Spesen s) =>
      showDialog<String>(context: context, builder: (_) => const _AblehnenDialog());

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: mitSystemleiste(
            context,
            const EdgeInsets.fromLTRB(16, 8, 4, 4),
          ).copyWith(bottom: 4),
          child: Row(
            children: [
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: SegmentedButton<SpesenStatus?>(
                    key: const Key('spesen-filter'),
                    showSelectedIcon: false,
                    segments: const [
                      ButtonSegment(value: SpesenStatus.eingereicht, label: Text('Offen')),
                      ButtonSegment(value: SpesenStatus.bezahlt, label: Text('Bezahlt')),
                      ButtonSegment(value: SpesenStatus.abgelehnt, label: Text('Abgelehnt')),
                      ButtonSegment(value: null, label: Text('Alle')),
                    ],
                    selected: {_filter},
                    onSelectionChanged: (s) => _filtern(s.first),
                  ),
                ),
              ),
              IconButton(
                tooltip: 'Neu laden',
                icon: const Icon(Icons.refresh),
                onPressed: () => _laden.currentState?.neuLaden(),
              ),
            ],
          ),
        ),
        const Divider(height: 1),
        Expanded(
          child: LadeAnsicht<SpesenUebersicht>(
            key: _laden,
            laden: () => _dienst.alle(status: _filter),
            bauen: _liste,
          ),
        ),
      ],
    );
  }

  Widget _liste(BuildContext context, SpesenUebersicht d, Future<void> Function() neuLaden) {
    final t = Theme.of(context);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: mitSystemleiste(context, const EdgeInsets.fromLTRB(16, 12, 16, 24), maxBreite: 760),
      children: [
        Text(
          d.offenAnzahl == 0
              ? 'Keine offenen Spesen.'
              : '${d.offenAnzahl} offen · ${spesenFranken(d.offenSumme)} auszuzahlen',
          key: const Key('spesen-offen-summe'),
          style: t.textTheme.titleMedium,
        ),
        const SizedBox(height: 8),
        if (d.spesen.isEmpty)
          const Padding(padding: EdgeInsets.only(top: 24), child: Text('Nichts in dieser Ansicht.'))
        else
          for (final s in d.spesen) _karte(context, s),
      ],
    );
  }

  Widget _karte(BuildContext context, Spesen s) {
    final t = Theme.of(context);
    final arbeitet = _arbeitet.contains(s.id);
    return Card(
      key: Key('spesen-${s.id}'),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(s.zweck, style: t.textTheme.titleSmall),
                      Text(
                        [
                          if (s.name != null && s.name!.isNotEmpty) s.name!,
                          schweizerDatum(s.datum),
                          s.kategorie,
                          if (s.anlass != null) s.anlass!,
                          if (s.pingen) 'automatisch (Pingen)',
                        ].join(' · '),
                        style: t.textTheme.bodySmall,
                      ),
                      if (s.iban != null)
                        Text('IBAN ${ibanFormatieren(s.iban!)}', style: t.textTheme.bodySmall),
                      if (s.status != SpesenStatus.eingereicht)
                        Text(
                          [
                            spesenStatusText(s.status),
                            if (s.erledigt != null) schweizerDatum(s.erledigt!),
                            if (s.erledigtVon != null) s.erledigtVon!,
                            if (s.grund != null) s.grund!,
                          ].join(' · '),
                          style: t.textTheme.bodySmall?.copyWith(
                            color: s.status == SpesenStatus.abgelehnt ? t.colorScheme.error : null,
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Text(spesenFranken(s.betrag), style: t.textTheme.titleMedium),
              ],
            ),
            const SizedBox(height: 4),
            Wrap(
              spacing: 4,
              children: [
                Builder(
                  builder: (context) => TextButton.icon(
                    key: Key('spesen-beleg-${s.id}'),
                    onPressed: () => _beleg(context, s),
                    icon: const Icon(Icons.receipt_long_outlined, size: 18),
                    label: const Text('Beleg'),
                  ),
                ),
                if (s.status == SpesenStatus.eingereicht) ...[
                  TextButton.icon(
                    key: Key('spesen-ablehnen-${s.id}'),
                    onPressed: arbeitet ? null : () => _erledigen(s, bezahlt: false),
                    icon: const Icon(Icons.block, size: 18),
                    label: const Text('Ablehnen'),
                  ),
                  FilledButton.tonalIcon(
                    key: Key('spesen-bezahlt-${s.id}'),
                    onPressed: arbeitet ? null : () => _erledigen(s, bezahlt: true),
                    icon: const Icon(Icons.check, size: 18),
                    label: const Text('Bezahlt'),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Begruendung fuer das Ablehnen; der Dialog besitzt sein Textfeld (es lebt
/// bis nach der Ausblende-Animation).
class _AblehnenDialog extends StatefulWidget {
  const _AblehnenDialog();

  @override
  State<_AblehnenDialog> createState() => _AblehnenDialogState();
}

class _AblehnenDialogState extends State<_AblehnenDialog> {
  final _text = TextEditingController();

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final grund = _text.text.trim();
    return AlertDialog(
      title: const Text('Spesen ablehnen'),
      content: TextField(
        key: const Key('spesen-grund'),
        controller: _text,
        autofocus: true,
        maxLines: 3,
        onChanged: (_) => setState(() {}),
        decoration: const InputDecoration(
          labelText: 'Begründung (geht ans Mitglied)',
          border: OutlineInputBorder(),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Abbrechen')),
        FilledButton(
          onPressed: grund.length < 3 ? null : () => Navigator.of(context).pop(grund),
          child: const Text('Ablehnen'),
        ),
      ],
    );
  }
}
