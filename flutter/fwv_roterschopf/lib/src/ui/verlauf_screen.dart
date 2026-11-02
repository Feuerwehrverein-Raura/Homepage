// Temperaturkurve einer Messstelle im Roten Schopf (Tiefkuehler oder
// Heizkoerper): 24 h / 7 Tage / 30 Tage / 1 Jahr aus GET
// /kiosk/roter-schopf/verlauf (api-members src/schopf-verlauf.js).
//
//   Linie        Mittel je Abschnitt; schattiert Min bis Max
//   gestrichelt  Grenze "zu warm" (Tiefkuehler) bzw. Solltemperatur
//   rot hinterlegt  Relais aus (Strom des Tiefkuehlers aus)
//
// Luecken (Geraet nicht erreichbar, Server aus) bleiben Luecken - die Linie
// wird dort unterbrochen statt eine Verbindung zu erfinden.

import 'package:fl_chart/fl_chart.dart';
import 'package:fwv_anlass/fwv_anlass.dart' show fehlerText;
import 'package:material_ui/material_ui.dart';

import '../modelle.dart';
import '../zugang.dart';

class VerlaufScreen extends StatefulWidget {
  const VerlaufScreen({
    super.key,
    required this.zugang,
    required this.messstelle,
    required this.name,
  });

  final RoterSchopfZugang zugang;
  final String messstelle;
  final String name;

  @override
  State<VerlaufScreen> createState() => _VerlaufScreenState();
}

class _VerlaufScreenState extends State<VerlaufScreen> {
  var _zeitraum = VerlaufZeitraum.tag;
  Verlauf? _verlauf;
  String? _fehler;
  bool _laedt = true;

  @override
  void initState() {
    super.initState();
    _laden();
  }

  Future<void> _laden() async {
    setState(() {
      _laedt = true;
      _fehler = null;
    });
    final zeitraum = _zeitraum;
    try {
      final v = await widget.zugang.verlauf(widget.messstelle, zeitraum);
      if (mounted && zeitraum == _zeitraum) setState(() => _verlauf = v);
    } on Object catch (e) {
      if (mounted) setState(() => _fehler = fehlerText(e));
    } finally {
      if (mounted) setState(() => _laedt = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final v = _verlauf;
    return Scaffold(
      appBar: AppBar(title: Text(widget.name)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          SegmentedButton<VerlaufZeitraum>(
            segments: [
              for (final z in VerlaufZeitraum.values) ButtonSegment(value: z, label: Text(z.text)),
            ],
            selected: {_zeitraum},
            showSelectedIcon: false,
            onSelectionChanged: (w) {
              setState(() => _zeitraum = w.first);
              _laden();
            },
          ),
          const SizedBox(height: 16),
          if (_fehler != null)
            Padding(
              padding: const EdgeInsets.all(24),
              child: Text(_fehler!, textAlign: TextAlign.center),
            )
          else if (v == null)
            const SizedBox(height: 280, child: Center(child: CircularProgressIndicator()))
          else ...[
            _Kennzahlen(v),
            const SizedBox(height: 12),
            Opacity(
              opacity: _laedt ? 0.4 : 1,
              child: SizedBox(height: 300, child: _Kurve(v, zeitraum: _zeitraum)),
            ),
            const SizedBox(height: 12),
            _Legende(v),
          ],
        ],
      ),
    );
  }
}

String _grad(double w) => '${w.toStringAsFixed(1).replaceAll('.', ',')} °C';

String _zwei(int n) => n.toString().padLeft(2, '0');

/// Tiefstwert, Hoechstwert und Mittel im Zeitraum.
class _Kennzahlen extends StatelessWidget {
  const _Kennzahlen(this.v);

  final Verlauf v;

  @override
  Widget build(BuildContext context) {
    final punkte = v.reihe('temperatur').where((p) => p.mittel != null).toList();
    if (punkte.isEmpty) {
      return const Text('Für diesen Zeitraum gibt es keine Messwerte.');
    }
    final tief = punkte.map((p) => p.min ?? p.mittel!).reduce((a, b) => a < b ? a : b);
    final hoch = punkte.map((p) => p.max ?? p.mittel!).reduce((a, b) => a > b ? a : b);
    final mittel = punkte.map((p) => p.mittel!).reduce((a, b) => a + b) / punkte.length;
    final stil = Theme.of(context).textTheme;
    Widget zahl(String titel, double w) => Expanded(
      child: Column(
        children: [
          Text(titel, style: stil.labelMedium),
          Text(
            _grad(w),
            style: stil.titleMedium?.copyWith(
              fontWeight: FontWeight.w600,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
    return Row(children: [zahl('Tiefst', tief), zahl('Mittel', mittel), zahl('Höchst', hoch)]);
  }
}

class _Legende extends StatelessWidget {
  const _Legende(this.v);

  final Verlauf v;

  @override
  Widget build(BuildContext context) {
    final farben = Theme.of(context).colorScheme;
    final stil = Theme.of(context).textTheme.bodySmall;
    Widget eintrag(Widget zeichen, String text) => Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        zeichen,
        const SizedBox(width: 6),
        Flexible(child: Text(text, style: stil)),
      ],
    );
    Widget strich(Color c) => Container(width: 18, height: 3, color: c);
    return Wrap(
      spacing: 16,
      runSpacing: 6,
      children: [
        eintrag(strich(farben.primary), 'Temperatur, schattiert Tiefst bis Höchst'),
        if (v.grenze != null) eintrag(strich(farben.error), 'Grenze ${_grad(v.grenze!)}'),
        if (v.reihe('soll').any((p) => p.mittel != null))
          eintrag(strich(farben.tertiary), 'Solltemperatur'),
        if (_ausBereiche(v).isNotEmpty)
          eintrag(
            Container(width: 18, height: 12, color: farben.error.withValues(alpha: 0.15)),
            'Strom aus',
          ),
      ],
    );
  }
}

/// x-Achse: Stunden seit [Verlauf.von].
double _x(Verlauf v, DateTime t) => t.difference(v.von).inSeconds / 3600;

/// Punkte einer Reihe; Luecken (kein Wert oder fehlende Abschnitte) als
/// [FlSpot.nullSpot], damit die Linie dort abbricht.
List<FlSpot> _punkte(Verlauf v, List<VerlaufPunkt> reihe, double? Function(VerlaufPunkt) wert) {
  final aus = <FlSpot>[];
  DateTime? vorher;
  for (final p in reihe) {
    if (vorher != null && p.t.difference(vorher).inSeconds > v.rasterS * 1.5) {
      aus.add(FlSpot.nullSpot);
    }
    final w = wert(p);
    aus.add(w == null ? FlSpot.nullSpot : FlSpot(_x(v, p.t), w));
    vorher = p.t;
  }
  return aus;
}

/// Abschnitte, in denen das Relais aus war (Reihe "an" unter 0,5).
List<(double, double)> _ausBereiche(Verlauf v) {
  final bereiche = <(double, double)>[];
  double? start;
  for (final p in v.reihe('an')) {
    final x = _x(v, p.t);
    final aus = p.mittel != null && p.mittel! < 0.5;
    if (aus) {
      start ??= x;
    } else if (start != null) {
      bereiche.add((start, x));
      start = null;
    }
  }
  if (start != null) bereiche.add((start, _x(v, v.bis)));
  return bereiche;
}

class _Kurve extends StatelessWidget {
  const _Kurve(this.v, {required this.zeitraum});

  final Verlauf v;
  final VerlaufZeitraum zeitraum;

  String _beschriftung(DateTime t) => switch (zeitraum) {
    VerlaufZeitraum.tag => '${_zwei(t.hour)}:${_zwei(t.minute)}',
    VerlaufZeitraum.woche => const ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][t.weekday - 1],
    VerlaufZeitraum.monat || VerlaufZeitraum.jahr => '${t.day}.${t.month}.',
  };

  /// Abstand der Beschriftungen unten in Stunden.
  double get _abstand => switch (zeitraum) {
    VerlaufZeitraum.tag => 6,
    VerlaufZeitraum.woche => 24,
    VerlaufZeitraum.monat => 24 * 7,
    VerlaufZeitraum.jahr => 24 * 61,
  };

  @override
  Widget build(BuildContext context) {
    final farben = Theme.of(context).colorScheme;
    final temp = v.reihe('temperatur');
    final soll = v.reihe('soll');
    final linie = _punkte(v, temp, (p) => p.mittel);
    final unten = _punkte(v, temp, (p) => p.mittel == null ? null : p.min ?? p.mittel);
    final oben = _punkte(v, temp, (p) => p.mittel == null ? null : p.max ?? p.mittel);
    final sollLinie = _punkte(v, soll, (p) => p.mittel);

    final werte = [
      for (final s in [...unten, ...oben, ...sollLinie])
        if (s != FlSpot.nullSpot) s.y,
      ?v.grenze,
    ];
    if (werte.isEmpty) return const SizedBox.shrink();
    var minY = werte.reduce((a, b) => a < b ? a : b);
    var maxY = werte.reduce((a, b) => a > b ? a : b);
    final rand = ((maxY - minY) * 0.1).clamp(0.5, 5.0);
    minY = (minY - rand).floorToDouble();
    maxY = (maxY + rand).ceilToDouble();
    final spanne = maxY - minY;
    final yAbstand = spanne <= 6 ? 1.0 : (spanne <= 15 ? 2.0 : 5.0);

    LineChartBarData unsichtbar(List<FlSpot> s) => LineChartBarData(
      spots: s,
      color: Colors.transparent,
      barWidth: 0,
      dotData: const FlDotData(show: false),
    );

    return LineChart(
      LineChartData(
        minX: 0,
        maxX: _x(v, v.bis),
        minY: minY,
        maxY: maxY,
        clipData: const FlClipData.all(),
        lineBarsData: [
          LineChartBarData(
            spots: linie,
            color: farben.primary,
            barWidth: 2,
            dotData: const FlDotData(show: false),
          ),
          unsichtbar(unten),
          unsichtbar(oben),
          if (sollLinie.any((s) => s != FlSpot.nullSpot))
            LineChartBarData(
              spots: sollLinie,
              color: farben.tertiary,
              barWidth: 1.5,
              dashArray: const [4, 4],
              dotData: const FlDotData(show: false),
            ),
        ],
        betweenBarsData: [
          BetweenBarsData(fromIndex: 1, toIndex: 2, color: farben.primary.withValues(alpha: 0.18)),
        ],
        extraLinesData: ExtraLinesData(
          horizontalLines: [
            if (v.grenze != null)
              HorizontalLine(
                y: v.grenze!,
                color: farben.error,
                strokeWidth: 1.5,
                dashArray: const [6, 4],
              ),
          ],
        ),
        rangeAnnotations: RangeAnnotations(
          verticalRangeAnnotations: [
            for (final (a, b) in _ausBereiche(v))
              VerticalRangeAnnotation(x1: a, x2: b, color: farben.error.withValues(alpha: 0.15)),
          ],
        ),
        gridData: FlGridData(
          horizontalInterval: yAbstand,
          verticalInterval: _abstand,
          getDrawingHorizontalLine: (_) =>
              FlLine(color: farben.outlineVariant.withValues(alpha: 0.5), strokeWidth: 0.5),
          getDrawingVerticalLine: (_) =>
              FlLine(color: farben.outlineVariant.withValues(alpha: 0.5), strokeWidth: 0.5),
        ),
        borderData: FlBorderData(show: false),
        titlesData: FlTitlesData(
          topTitles: const AxisTitles(),
          rightTitles: const AxisTitles(),
          leftTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 40,
              interval: yAbstand,
              getTitlesWidget: (w, meta) => SideTitleWidget(
                meta: meta,
                child: Text('${w.round()}°', style: Theme.of(context).textTheme.bodySmall),
              ),
            ),
          ),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 28,
              interval: _abstand,
              getTitlesWidget: (w, meta) {
                if (w == meta.max) return const SizedBox.shrink();
                final t = v.von.add(Duration(seconds: (w * 3600).round()));
                return SideTitleWidget(
                  meta: meta,
                  child: Text(_beschriftung(t), style: Theme.of(context).textTheme.bodySmall),
                );
              },
            ),
          ),
        ),
        lineTouchData: LineTouchData(
          touchTooltipData: LineTouchTooltipData(
            getTooltipColor: (_) => farben.inverseSurface,
            getTooltipItems: (punkte) => [
              for (final p in punkte)
                if (p.barIndex == 0 || p.barIndex == 3)
                  LineTooltipItem(
                    '${p.barIndex == 3 ? 'Soll ' : ''}${_grad(p.y)}'
                    '${p.barIndex == 0 ? '\n${_zeitpunkt(v.von.add(Duration(seconds: (p.x * 3600).round())))}' : ''}',
                    TextStyle(color: farben.onInverseSurface),
                  )
                else
                  null,
            ],
          ),
        ),
      ),
    );
  }

  String _zeitpunkt(DateTime t) => '${t.day}.${t.month}. ${_zwei(t.hour)}:${_zwei(t.minute)}';
}
