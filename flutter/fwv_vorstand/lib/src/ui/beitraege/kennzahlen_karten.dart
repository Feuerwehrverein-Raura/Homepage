// Kennzahlen eines Beitragsjahres: Gesamt, Bezahlt, Offen, Eingenommen.
// Auf dem Handy zwei mal zwei Karten, auf breiten Bildschirmen eine Reihe.

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:material_ui/material_ui.dart';

import 'beitraege_daten.dart';

class KennzahlenKarten extends StatelessWidget {
  const KennzahlenKarten({super.key, required this.kennzahlen});

  final BeitragsKennzahlen kennzahlen;

  @override
  Widget build(BuildContext context) {
    final k = kennzahlen;
    return KartenSpalten(
      // 2 Spalten ab ~360 Punkten (Handy), 4 nebeneinander ab ~740.
      minBreite: 170,
      abstand: 8,
      children: [
        _Kennzahl(titel: 'Gesamt', wert: '${k.gesamt}', zusatz: chf(k.betragGesamt)),
        _Kennzahl(
          titel: 'Bezahlt',
          wert: '${k.bezahlt}',
          zusatz: chf(k.betragBezahlt),
          art: HinweisArt.gut,
        ),
        _Kennzahl(
          titel: 'Offen',
          wert: '${k.offen}',
          zusatz: chf(k.betragOffen),
          art: k.offen > 0 ? HinweisArt.schlecht : HinweisArt.neutral,
        ),
        _Kennzahl(
          titel: 'Eingenommen',
          wert: chf(k.betragBezahlt),
          zusatz: 'von ${chf(k.betragGesamt)}',
        ),
      ],
    );
  }
}

class _Kennzahl extends StatelessWidget {
  const _Kennzahl({
    required this.titel,
    required this.wert,
    required this.zusatz,
    this.art = HinweisArt.neutral,
  });

  final String titel;
  final String wert;
  final String zusatz;
  final HinweisArt art;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final farbe = art == HinweisArt.neutral
        ? t.colorScheme.onSurface
        : hinweisFarben(context, art).$2;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Semantics(
        container: true,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(titel, style: t.textTheme.labelMedium?.copyWith(color: t.colorScheme.outline)),
              const SizedBox(height: 4),
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(
                  wert,
                  key: Key('kennzahl-$titel'),
                  style: t.textTheme.headlineSmall?.copyWith(color: farbe),
                ),
              ),
              Text(
                zusatz,
                style: t.textTheme.bodySmall,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
