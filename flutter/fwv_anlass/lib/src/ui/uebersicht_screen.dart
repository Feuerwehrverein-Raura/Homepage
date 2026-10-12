// Uebersicht der verwalteten Anlaesse (ein Aufruf mit Zahlen statt einer
// Abfrage pro Anlass): aktuelle zuerst, dann die eben vergangenen. Gleich
// fuer Organisator und Vorstand.

import 'package:material_ui/material_ui.dart';

import '../bausteine.dart';
import '../modelle.dart';
import '../zugang.dart';
import 'anlass_screen.dart';

class VerwaltungsUebersichtScreen extends StatefulWidget {
  const VerwaltungsUebersichtScreen({super.key, required this.verwaltung});

  final AnlassVerwaltung verwaltung;

  @override
  State<VerwaltungsUebersichtScreen> createState() => _VerwaltungsUebersichtScreenState();
}

class _VerwaltungsUebersichtScreenState extends State<VerwaltungsUebersichtScreen> {
  final _lader = GlobalKey<LadeAnsichtState<VerwaltungsUebersicht>>();

  Future<void> _oeffnen(VerwalteterAnlass a) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) =>
            VerwaltungsAnlassScreen(verwaltung: widget.verwaltung, anlassId: a.anlass.id),
      ),
    );
    await _lader.currentState?.neuLaden();
  }

  @override
  Widget build(BuildContext context) {
    final z = widget.verwaltung.zugang;
    return Scaffold(
      appBar: AppBar(title: Text(z.bezeichnung)),
      body: LadeAnsicht<VerwaltungsUebersicht>(
        key: _lader,
        laden: z.uebersicht,
        istLeer: (u) => u.anlaesse.isEmpty,
        leer: 'Du verwaltest zurzeit keine Anlässe.',
        bauen: (context, u, _) {
          final aktuell = [
            for (final a in u.anlaesse)
              if (a.aktuell) a,
          ];
          final vorbei = [
            for (final a in u.anlaesse)
              if (!a.aktuell) a,
          ];
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: mitSystemleiste(context, const EdgeInsets.fromLTRB(12, 8, 12, 24)),
            children: [
              for (final a in aktuell) AnlassKarte(anlass: a, oeffnen: () => _oeffnen(a)),
              if (vorbei.isNotEmpty) ...[
                const Abschnitt('Vorbei'),
                for (final a in vorbei) AnlassKarte(anlass: a, oeffnen: () => _oeffnen(a)),
              ],
            ],
          );
        },
      ),
    );
  }
}

/// Karte eines Anlasses: Titel, Datum, Zahlen, offene Anmeldungen.
class AnlassKarte extends StatelessWidget {
  const AnlassKarte({super.key, required this.anlass, required this.oeffnen});

  final VerwalteterAnlass anlass;
  final VoidCallback oeffnen;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final a = anlass.anlass;
    final wann = [?a.app.datumText, ?a.app.zeitText].join(' · ');
    final offen = anlass.zahlen.offen;
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 6),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: oeffnen,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: Text(a.titel, style: t.textTheme.titleMedium)),
                  const Icon(Icons.chevron_right),
                ],
              ),
              if (wann.isNotEmpty) Text(wann, style: t.textTheme.bodySmall),
              if (anlass.zahlen.text != null) ...[
                const SizedBox(height: 6),
                Text(anlass.zahlen.text!, style: t.textTheme.bodyMedium),
              ],
              if (offen > 0 || a.app.abgesagt) ...[
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    if (a.app.abgesagt) const HinweisChip('Abgesagt', art: HinweisArt.schlecht),
                    if (offen > 0)
                      HinweisChip(offen == 1 ? '1 offen' : '$offen offen', art: HinweisArt.warnung),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
