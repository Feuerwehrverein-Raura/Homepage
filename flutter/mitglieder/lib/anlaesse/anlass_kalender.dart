// Kalender (`GET calendar/items`): Monatsraster (Montag zuerst) mit Punkten
// an Tagen mit Eintraegen, darunter die Eintraege des gewaehlten Tags bzw.
// des ganzen Monats. Welche Eintraege ein Mitglied sieht und wie das Datum
// lautet (`datum_text`), bestimmt das Backend; die App ordnet sie nur nach
// `date` ins Raster ein.

import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';
import 'anlaesse_tab.dart';
import 'bausteine.dart';

class AnlassKalender extends StatefulWidget {
  const AnlassKalender({super.key, required this.dienste});

  final Dienste dienste;

  @override
  State<AnlassKalender> createState() => _AnlassKalenderState();
}

class _AnlassKalenderState extends State<AnlassKalender> {
  late DateTime _monat;
  DateTime? _tag;

  @override
  void initState() {
    super.initState();
    final heute = widget.dienste.jetzt();
    _monat = DateTime(heute.year, heute.month);
  }

  void _blaettern(int um) => setState(() {
    _monat = DateTime(_monat.year, _monat.month + um);
    _tag = null;
  });

  @override
  Widget build(BuildContext context) {
    return LadeAnsicht<List<KalenderEintrag>>(
      laden: widget.dienste.anlaesse.kalender,
      bauen: (context, eintraege, neuLaden) {
        final imMonat = [
          for (final e in eintraege)
            if (e.datum case final d? when d.year == _monat.year && d.month == _monat.month) e,
        ];
        final tag = _tag;
        final gezeigt = tag == null
            ? imMonat
            : [
                for (final e in imMonat)
                  if (DateUtils.isSameDay(e.datum, tag)) e,
              ];
        final lokal = MaterialLocalizations.of(context);
        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(bottom: 16),
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => _blaettern(-1),
                    icon: const Icon(Icons.chevron_left),
                    tooltip: 'Voriger Monat',
                  ),
                  Expanded(
                    child: Text(
                      lokal.formatMonthYear(_monat),
                      key: const Key('kalender-monat'),
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  IconButton(
                    onPressed: () => _blaettern(1),
                    icon: const Icon(Icons.chevron_right),
                    tooltip: 'Nächster Monat',
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: _MonatsRaster(
                monat: _monat,
                heute: widget.dienste.jetzt(),
                gewaehlt: tag,
                eintraege: imMonat,
                waehlen: (d) => setState(() => _tag = DateUtils.isSameDay(d, _tag) ? null : d),
              ),
            ),
            const Divider(height: 24),
            if (gezeigt.isEmpty)
              Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  tag == null ? 'Keine Einträge in diesem Monat.' : 'Keine Einträge an diesem Tag.',
                  textAlign: TextAlign.center,
                ),
              )
            else
              for (final e in gezeigt)
                ListTile(
                  leading: Icon(e.istAnlass ? Icons.event : Icons.payments_outlined),
                  title: Text(e.titel),
                  subtitle: Text([?e.datumText, ?e.untertitel].join('\n')),
                  isThreeLine: e.datumText != null && e.untertitel != null,
                  trailing: e.istAnlass ? const Icon(Icons.chevron_right) : null,
                  onTap: e.istAnlass
                      ? () => anlassOeffnen(context, widget.dienste, e.refId!)
                      : null,
                ),
          ],
        );
      },
    );
  }
}

class _MonatsRaster extends StatelessWidget {
  const _MonatsRaster({
    required this.monat,
    required this.heute,
    required this.gewaehlt,
    required this.eintraege,
    required this.waehlen,
  });

  final DateTime monat;
  final DateTime heute;
  final DateTime? gewaehlt;
  final List<KalenderEintrag> eintraege;
  final ValueChanged<DateTime> waehlen;

  static const _wochentage = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final tage = DateUtils.getDaysInMonth(monat.year, monat.month);
    // Montag = 1 ... Sonntag = 7: so viele leere Felder vor dem 1.
    final luecke = DateTime(monat.year, monat.month).weekday - 1;
    final wochen = ((luecke + tage) / 7).ceil();

    final proTag = <int, List<KalenderEintrag>>{};
    for (final e in eintraege) {
      proTag.putIfAbsent(e.datum!.day, () => []).add(e);
    }

    Widget feld(int index) {
      final tag = index - luecke + 1;
      if (tag < 1 || tag > tage) return const SizedBox(height: 48);
      final datum = DateTime(monat.year, monat.month, tag);
      final istGewaehlt = DateUtils.isSameDay(datum, gewaehlt);
      final istHeute = DateUtils.isSameDay(datum, heute);
      final punkte = proTag[tag] ?? const [];
      return InkWell(
        key: Key('tag-${isoDatum(datum)}'),
        borderRadius: BorderRadius.circular(24),
        onTap: () => waehlen(datum),
        child: SizedBox(
          height: 48,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 30,
                height: 30,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: istGewaehlt ? t.colorScheme.primary : null,
                  border: istHeute && !istGewaehlt
                      ? Border.all(color: t.colorScheme.primary)
                      : null,
                ),
                child: Text(
                  '$tag',
                  style: t.textTheme.bodyMedium?.copyWith(
                    color: istGewaehlt ? t.colorScheme.onPrimary : null,
                  ),
                ),
              ),
              const SizedBox(height: 3),
              SizedBox(
                height: 6,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    for (final e in punkte.take(3))
                      Container(
                        width: 5,
                        height: 5,
                        margin: const EdgeInsets.symmetric(horizontal: 1),
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: e.istAnlass ? t.colorScheme.primary : t.colorScheme.tertiary,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Column(
      children: [
        Row(
          children: [
            for (final w in _wochentage)
              Expanded(
                child: Center(
                  child: Text(
                    w,
                    style: t.textTheme.labelSmall?.copyWith(color: t.colorScheme.outline),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 4),
        for (var w = 0; w < wochen; w++)
          Row(children: [for (var d = 0; d < 7; d++) Expanded(child: feld(w * 7 + d))]),
      ],
    );
  }
}
