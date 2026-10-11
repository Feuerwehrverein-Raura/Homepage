// Arbeitsplan eines Anlasses (`GET events/:id/arbeitsplan`) als Karten wie
// in den alten Apps: eine Karte pro Zeitfenster, darin nur die Bereiche mit
// einer Schicht, je mit Namen ("noch niemand") und "N Plätze frei".
// Oben rechts das PDF (`GET events/:id/pdf/arbeitsplan`) zum Oeffnen,
// Speichern oder Weiterschicken ueber das Teilen-Menue.

import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';
import '../gemeinsam.dart';
import 'bausteine.dart';

class ArbeitsplanScreen extends StatefulWidget {
  const ArbeitsplanScreen({
    super.key,
    required this.dienste,
    required this.anlassId,
    required this.titel,
  });

  final Dienste dienste;
  final String anlassId;
  final String titel;

  @override
  State<ArbeitsplanScreen> createState() => _ArbeitsplanScreenState();
}

class _ArbeitsplanScreenState extends State<ArbeitsplanScreen> {
  bool _pdfLaedt = false;

  Future<void> _pdf(Rect? ursprung) async {
    setState(() => _pdfLaedt = true);
    try {
      final bytes = await widget.dienste.anlaesse.arbeitsplanPdf(widget.anlassId);
      final name = widget.titel.replaceAll(RegExp(r'[^A-Za-z0-9ÄÖÜäöü ]'), '').trim();
      await widget.dienste.dateiTeilen(
        bytes,
        'Arbeitsplan_${name.isEmpty ? 'Anlass' : name.replaceAll(' ', '_')}.pdf',
        'application/pdf',
        ursprung: ursprung,
      );
    } on Object catch (f) {
      if (mounted) meldung(context, fehlerText(f));
    } finally {
      if (mounted) setState(() => _pdfLaedt = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Arbeitsplan'),
        actions: [
          Builder(
            builder: (context) => IconButton(
              onPressed: _pdfLaedt ? null : () => _pdf(stelleVon(context)),
              icon: _pdfLaedt
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.picture_as_pdf_outlined),
              tooltip: 'PDF',
            ),
          ),
        ],
      ),
      body: LadeAnsicht<Arbeitsplan>(
        laden: () => widget.dienste.anlaesse.arbeitsplan(widget.anlassId),
        istLeer: (p) => p.tage.isEmpty,
        leer: 'Für diesen Anlass gibt es noch keine Schichten.',
        bauen: (context, plan, _) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 24),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 12, 4, 0),
              child: Text(plan.anlass, style: Theme.of(context).textTheme.titleLarge),
            ),
            for (final tag in plan.tage) ...[
              Abschnitt(tag.bezeichnung),
              for (final zeile in tag.zeilen)
                if (zeile.karte(plan.bereiche) case final eintraege when eintraege.isNotEmpty)
                  ArbeitsplanKarte(zeit: zeile.zeitText, eintraege: eintraege),
            ],
          ],
        ),
      ),
    );
  }
}

class ArbeitsplanKarte extends StatelessWidget {
  const ArbeitsplanKarte({super.key, required this.zeit, required this.eintraege});

  final String zeit;
  final List<KartenEintrag> eintraege;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 6),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(zeit, style: t.textTheme.titleMedium),
            for (final e in eintraege) ...[
              const SizedBox(height: 10),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(e.bereich, style: t.textTheme.titleSmall),
                        Text(
                          e.namenText,
                          style: t.textTheme.bodyMedium?.copyWith(
                            color: e.besetzt.isEmpty ? t.colorScheme.outline : null,
                            fontStyle: e.besetzt.isEmpty ? FontStyle.italic : null,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (e.freiText case final frei?) ...[
                    const SizedBox(width: 8),
                    HinweisChip(frei, art: HinweisArt.gut),
                  ],
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
