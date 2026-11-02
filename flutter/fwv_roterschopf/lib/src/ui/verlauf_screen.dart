// Kurven einer Messstelle im Roten Schopf: 24 h / 7 Tage / 30 Tage / 1 Jahr
// aus GET /kiosk/roter-schopf/verlauf (api-members src/schopf-verlauf.js).
//
//   Tiefkuehler   Temperatur (Grenze gestrichelt, Relais aus rot
//                 hinterlegt), darunter die Leistung des Geraets
//   Heizkoerper   Temperatur, Solltemperatur gestrichelt
//   Strom         Leistung des ganzen Lokals, darunter der Verbrauch in kWh
//                 als Balken (Stunde / Tag / Monat)
//
// Linie = Mittel je Abschnitt, schattiert Tiefst bis Hoechst (bei der
// Leistung sieht man so auch kurze Spitzen). Luecken (Geraet nicht
// erreichbar, Server aus) bleiben Luecken - die Linie wird dort
// unterbrochen statt eine Verbindung zu erfinden.

import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:fwv_anlass/fwv_anlass.dart' show fehlerText;
import 'package:material_ui/material_ui.dart';

import '../modelle.dart';
import '../zugang.dart';

/// Was die Seite zeigt: Temperatur (Tiefkuehler, Heizkoerper) oder Strom
/// (Hauptanschluss).
enum VerlaufArt { temperatur, strom }

class VerlaufScreen extends StatefulWidget {
  const VerlaufScreen({
    super.key,
    required this.zugang,
    required this.messstelle,
    required this.name,
    this.art = VerlaufArt.temperatur,
  });

  final RoterSchopfZugang zugang;
  final String messstelle;
  final String name;
  final VerlaufArt art;

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

  List<Widget> _inhalt(Verlauf v) {
    Widget abschnitt(_Groesse g, {double hoehe = 300}) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Kennzahlen(v, g),
        const SizedBox(height: 12),
        Opacity(
          opacity: _laedt ? 0.4 : 1,
          child: SizedBox(
            height: hoehe,
            child: _Kurve(v, g, zeitraum: _stufe(v)),
          ),
        ),
        const SizedBox(height: 12),
        _Legende(v, g),
      ],
    );
    switch (widget.art) {
      case VerlaufArt.temperatur:
        final watt = _Groesse.leistung('watt', relais: true);
        return [
          abschnitt(_Groesse.temperatur(v)),
          if (_hatWerte(v, watt.reihe)) ...[const _Titel('Leistung'), abschnitt(watt, hoehe: 200)],
        ];
      case VerlaufArt.strom:
        return [
          abschnitt(_Groesse.leistung('leistung_w')),
          const _Titel('Verbrauch'),
          Opacity(
            opacity: _laedt ? 0.4 : 1,
            child: _Verbrauch(v, zeitraum: _stufe(v)),
          ),
        ];
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
          else
            ..._inhalt(v),
        ],
      ),
    );
  }
}

bool _hatWerte(Verlauf v, String reihe) => v.reihe(reihe).any((p) => p.mittel != null);

String _komma(double w, int stellen) => w.toStringAsFixed(stellen).replaceAll('.', ',');

String _grad(double w) => '${_komma(w, 1)} °C';

/// 850 W, 1,2 kW, 12 kW.
String _watt(double w) =>
    w.abs() < 1000 ? '${w.round()} W' : '${_komma(w / 1000, w.abs() < 10000 ? 1 : 0)} kW';

String _kwh(double w) => '${_komma(w, w < 10 ? 2 : (w < 100 ? 1 : 0))} kWh';

String _zwei(int n) => n.toString().padLeft(2, '0');

/// Eine Messgroesse: welche Reihe, wie beschriftet, was dazugehoert.
class _Groesse {
  const _Groesse({
    required this.reihe,
    required this.name,
    required this.text,
    required this.achse,
    required this.titel,
    this.grenze,
    this.soll,
    this.relais = false,
    this.abNull = false,
  });

  factory _Groesse.temperatur(Verlauf v) => _Groesse(
    reihe: 'temperatur',
    name: 'Temperatur',
    text: _grad,
    achse: (w) => '${w.round()}°',
    titel: const ('Tiefst', 'Mittel', 'Höchst'),
    grenze: v.grenze,
    soll: _hatWerte(v, 'soll') ? 'soll' : null,
    relais: true,
  );

  factory _Groesse.leistung(String reihe, {bool relais = false}) => _Groesse(
    reihe: reihe,
    name: 'Leistung',
    text: _watt,
    achse: (w) => w >= 1000 ? '${_komma(w / 1000, w % 1000 == 0 ? 0 : 1)}k' : '${w.round()}',
    titel: const ('Grundlast', 'Mittel', 'Spitze'),
    relais: relais,
    abNull: true,
  );

  final String reihe;
  final String name;
  final String Function(double) text;
  final String Function(double) achse;

  /// Ueberschriften fuer Tiefst-, Mittel- und Hoechstwert.
  final (String, String, String) titel;
  final double? grenze;

  /// Reihe der Solltemperatur (Heizkoerper).
  final String? soll;

  /// Relais aus (Reihe "an") rot hinterlegen.
  final bool relais;

  /// y-Achse ab 0 (Leistung).
  final bool abNull;
}

class _Titel extends StatelessWidget {
  const _Titel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(0, 28, 0, 12),
    child: Text(text, style: Theme.of(context).textTheme.titleMedium),
  );
}

/// Tiefstwert, Mittel und Hoechstwert im Zeitraum.
class _Kennzahlen extends StatelessWidget {
  const _Kennzahlen(this.v, this.g);

  final Verlauf v;
  final _Groesse g;

  @override
  Widget build(BuildContext context) {
    final punkte = v.reihe(g.reihe).where((p) => p.mittel != null).toList();
    if (punkte.isEmpty) {
      return const Text('Für diesen Zeitraum gibt es keine Messwerte.');
    }
    final tief = punkte.map((p) => p.min ?? p.mittel!).reduce(math.min);
    final hoch = punkte.map((p) => p.max ?? p.mittel!).reduce(math.max);
    final mittel = punkte.map((p) => p.mittel!).reduce((a, b) => a + b) / punkte.length;
    return _Zahlen([
      (g.titel.$1, g.text(tief)),
      (g.titel.$2, g.text(mittel)),
      (g.titel.$3, g.text(hoch)),
    ]);
  }
}

class _Zahlen extends StatelessWidget {
  const _Zahlen(this.zahlen);

  final List<(String, String)> zahlen;

  @override
  Widget build(BuildContext context) {
    final stil = Theme.of(context).textTheme;
    return Row(
      children: [
        for (final (titel, wert) in zahlen)
          Expanded(
            child: Column(
              children: [
                Text(titel, style: stil.labelMedium),
                Text(
                  wert,
                  style: stil.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _Legende extends StatelessWidget {
  const _Legende(this.v, this.g);

  final Verlauf v;
  final _Groesse g;

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
        eintrag(strich(farben.primary), '${g.name}, schattiert ${g.titel.$1} bis ${g.titel.$3}'),
        if (g.grenze != null) eintrag(strich(farben.error), 'Grenze ${g.text(g.grenze!)}'),
        if (g.soll != null) eintrag(strich(farben.tertiary), 'Solltemperatur'),
        if (g.relais && _ausBereiche(v).isNotEmpty)
          eintrag(
            Container(width: 18, height: 12, color: farben.error.withValues(alpha: 0.15)),
            'Strom aus',
          ),
      ],
    );
  }
}

/// Stufe der Beschriftung aus der Spanne der Daten selbst - nicht aus dem
/// gewaehlten Reiter, damit Achse und Balken immer zu den Werten passen.
VerlaufZeitraum _stufe(Verlauf v) {
  final stunden = v.bis.difference(v.von).inHours;
  if (stunden <= 36) return VerlaufZeitraum.tag;
  if (stunden <= 8 * 24) return VerlaufZeitraum.woche;
  if (stunden <= 40 * 24) return VerlaufZeitraum.monat;
  return VerlaufZeitraum.jahr;
}

/// x-Achse: Stunden seit [Verlauf.von].
double _x(Verlauf v, DateTime t) => t.difference(v.von).inSeconds / 3600;

DateTime _zeitBei(Verlauf v, double x) => v.von.add(Duration(seconds: (x * 3600).round()));

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

/// Runder Abstand der y-Beschriftung fuer etwa [teile] Abschnitte
/// (1, 2, 5, 10, 20, 50, ...).
double _runderAbstand(double spanne, {int teile = 5}) {
  if (spanne <= 0) return 1;
  final roh = spanne / teile;
  final zehner = math.pow(10, (math.log(roh) / math.ln10).floor()).toDouble();
  for (final f in const [1, 2, 5, 10]) {
    if (roh <= f * zehner) return f * zehner;
  }
  return 10 * zehner;
}

String _beschriftung(VerlaufZeitraum zeitraum, DateTime t) => switch (zeitraum) {
  VerlaufZeitraum.tag => '${_zwei(t.hour)}:${_zwei(t.minute)}',
  VerlaufZeitraum.woche => const ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][t.weekday - 1],
  VerlaufZeitraum.monat || VerlaufZeitraum.jahr => '${t.day}.${t.month}.',
};

/// Abstand der Beschriftungen unten in Stunden.
double _xAbstand(VerlaufZeitraum zeitraum) => switch (zeitraum) {
  VerlaufZeitraum.tag => 6,
  VerlaufZeitraum.woche => 24,
  VerlaufZeitraum.monat => 24 * 7,
  VerlaufZeitraum.jahr => 24 * 61,
};

String _zeitpunkt(DateTime t) => '${t.day}.${t.month}. ${_zwei(t.hour)}:${_zwei(t.minute)}';

FlGridData _raster(ColorScheme farben, double yAbstand, double xAbstand) => FlGridData(
  horizontalInterval: yAbstand,
  verticalInterval: xAbstand,
  getDrawingHorizontalLine: (_) =>
      FlLine(color: farben.outlineVariant.withValues(alpha: 0.5), strokeWidth: 0.5),
  getDrawingVerticalLine: (_) =>
      FlLine(color: farben.outlineVariant.withValues(alpha: 0.5), strokeWidth: 0.5),
);

class _Kurve extends StatelessWidget {
  const _Kurve(this.v, this.g, {required this.zeitraum});

  final Verlauf v;
  final _Groesse g;
  final VerlaufZeitraum zeitraum;

  @override
  Widget build(BuildContext context) {
    final farben = Theme.of(context).colorScheme;
    final klein = Theme.of(context).textTheme.bodySmall;
    final reihe = v.reihe(g.reihe);
    final linie = _punkte(v, reihe, (p) => p.mittel);
    final unten = _punkte(v, reihe, (p) => p.mittel == null ? null : p.min ?? p.mittel);
    final oben = _punkte(v, reihe, (p) => p.mittel == null ? null : p.max ?? p.mittel);
    final sollLinie = g.soll == null
        ? const <FlSpot>[]
        : _punkte(v, v.reihe(g.soll!), (p) => p.mittel);

    final werte = [
      for (final s in [...unten, ...oben, ...sollLinie])
        if (s != FlSpot.nullSpot) s.y,
      ?g.grenze,
      if (g.abNull) 0.0,
    ];
    if (werte.isEmpty) return const SizedBox.shrink();
    var minY = werte.reduce(math.min);
    var maxY = werte.reduce(math.max);
    final double yAbstand;
    if (g.abNull) {
      yAbstand = _runderAbstand(math.max(maxY, 10), teile: 4);
      minY = 0;
      maxY = (maxY / yAbstand).ceil() * yAbstand;
      if (maxY == 0) maxY = yAbstand;
    } else {
      final rand = ((maxY - minY) * 0.1).clamp(0.5, 5.0);
      minY = (minY - rand).floorToDouble();
      maxY = (maxY + rand).ceilToDouble();
      final spanne = maxY - minY;
      yAbstand = spanne <= 6 ? 1.0 : (spanne <= 15 ? 2.0 : 5.0);
    }

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
            if (g.grenze != null)
              HorizontalLine(
                y: g.grenze!,
                color: farben.error,
                strokeWidth: 1.5,
                dashArray: const [6, 4],
              ),
          ],
        ),
        rangeAnnotations: RangeAnnotations(
          verticalRangeAnnotations: [
            if (g.relais)
              for (final (a, b) in _ausBereiche(v))
                VerticalRangeAnnotation(x1: a, x2: b, color: farben.error.withValues(alpha: 0.15)),
          ],
        ),
        gridData: _raster(farben, yAbstand, _xAbstand(zeitraum)),
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
                child: Text(g.achse(w), style: klein),
              ),
            ),
          ),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 28,
              interval: _xAbstand(zeitraum),
              getTitlesWidget: (w, meta) {
                if (w == meta.max) return const SizedBox.shrink();
                return SideTitleWidget(
                  meta: meta,
                  child: Text(_beschriftung(zeitraum, _zeitBei(v, w)), style: klein),
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
                    p.barIndex == 3
                        ? 'Soll ${g.text(p.y)}'
                        : '${g.text(p.y)}\n${_zeitpunkt(_zeitBei(v, p.x))}',
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
}

/// Verbrauch in kWh als Balken: je Stunde (24 h), je Tag (7 / 30 Tage),
/// je Monat (1 Jahr) - aus "verbrauch_kwh" (Zaehlerstand-Differenzen).
class _Verbrauch extends StatelessWidget {
  const _Verbrauch(this.v, {required this.zeitraum});

  final Verlauf v;
  final VerlaufZeitraum zeitraum;

  DateTime _fach(DateTime t) => switch (zeitraum) {
    VerlaufZeitraum.tag => DateTime(t.year, t.month, t.day, t.hour),
    VerlaufZeitraum.woche || VerlaufZeitraum.monat => DateTime(t.year, t.month, t.day),
    VerlaufZeitraum.jahr => DateTime(t.year, t.month),
  };

  String _fachText(DateTime t) => switch (zeitraum) {
    VerlaufZeitraum.tag => '${_zwei(t.hour)}:00',
    VerlaufZeitraum.woche =>
      '${const ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][t.weekday - 1]} ${t.day}.${t.month}.',
    VerlaufZeitraum.monat => '${t.day}.${t.month}.',
    VerlaufZeitraum.jahr => const [
      'Jan',
      'Feb',
      'Mär',
      'Apr',
      'Mai',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Okt',
      'Nov',
      'Dez',
    ][t.month - 1],
  };

  /// Jede wievielte Saeule beschriftet wird.
  int get _jede => switch (zeitraum) {
    VerlaufZeitraum.tag => 6,
    VerlaufZeitraum.woche => 1,
    VerlaufZeitraum.monat => 7,
    VerlaufZeitraum.jahr => 2,
  };

  @override
  Widget build(BuildContext context) {
    final farben = Theme.of(context).colorScheme;
    final klein = Theme.of(context).textTheme.bodySmall;
    final faecher = <DateTime, double>{};
    for (final p in v.reihe('verbrauch_kwh')) {
      if (p.mittel == null) continue;
      final f = _fach(p.t);
      faecher[f] = (faecher[f] ?? 0) + p.mittel!;
    }
    if (faecher.isEmpty) {
      return const Text('Für diesen Zeitraum gibt es keine Zählerstände.');
    }
    final liste = faecher.entries.toList()..sort((a, b) => a.key.compareTo(b.key));
    final summe = liste.fold(0.0, (s, e) => s + e.value);
    final groesste = liste.map((e) => e.value).reduce(math.max);
    final abstand = _runderAbstand(math.max(groesste, 0.1), teile: 4);
    final maxY = math.max((groesste / abstand).ceil() * abstand, abstand);
    final einheit = switch (zeitraum) {
      VerlaufZeitraum.tag => 'Stunde',
      VerlaufZeitraum.woche || VerlaufZeitraum.monat => 'Tag',
      VerlaufZeitraum.jahr => 'Monat',
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Zahlen([
          ('Gesamt', _kwh(summe)),
          ('Ø pro $einheit', _kwh(summe / liste.length)),
          ('Höchst', _kwh(groesste)),
        ]),
        const SizedBox(height: 12),
        SizedBox(
          height: 200,
          child: BarChart(
            BarChartData(
              maxY: maxY,
              minY: 0,
              barGroups: [
                for (final (i, e) in liste.indexed)
                  BarChartGroupData(
                    x: i,
                    barRods: [
                      BarChartRodData(
                        toY: e.value,
                        color: farben.primary,
                        width: math.max(2, math.min(18, 260 / liste.length)),
                        borderRadius: const BorderRadius.vertical(top: Radius.circular(2)),
                      ),
                    ],
                  ),
              ],
              gridData: FlGridData(
                drawVerticalLine: false,
                horizontalInterval: abstand,
                getDrawingHorizontalLine: (_) =>
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
                    interval: abstand,
                    getTitlesWidget: (w, meta) => SideTitleWidget(
                      meta: meta,
                      child: Text(_komma(w, abstand < 1 ? 1 : 0), style: klein),
                    ),
                  ),
                ),
                bottomTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    reservedSize: 28,
                    getTitlesWidget: (w, meta) {
                      final i = w.toInt();
                      if (i < 0 || i >= liste.length || i % _jede != 0) {
                        return const SizedBox.shrink();
                      }
                      final t = liste[i].key;
                      final text = zeitraum == VerlaufZeitraum.woche
                          ? const ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][t.weekday - 1]
                          : _fachText(t);
                      return SideTitleWidget(
                        meta: meta,
                        child: Text(text, style: klein),
                      );
                    },
                  ),
                ),
              ),
              barTouchData: BarTouchData(
                touchTooltipData: BarTouchTooltipData(
                  getTooltipColor: (_) => farben.inverseSurface,
                  getTooltipItem: (gruppe, _, stab, _) => BarTooltipItem(
                    '${_fachText(liste[gruppe.x].key)}\n${_kwh(stab.toY)}',
                    TextStyle(color: farben.onInverseSurface),
                  ),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text('Verbrauch in kWh pro $einheit (aus dem Zählerstand)', style: klein),
      ],
    );
  }
}
