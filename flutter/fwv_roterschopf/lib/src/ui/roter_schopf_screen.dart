// Reiter "Roter Schopf" mit zwei Unter-Reitern:
//
//   Lampen       die zwei Lichtgruppen, darunter jede Lampe einzeln
//   Temperaturen Tiefkuehler und Heizkoerper-Thermostat
//
// Vorbild: die Lichtseite des Kiosk-Laptops im Lokal (roterschopf-kiosk).
// Jeder Unter-Reiter laedt selbst (eigene LadeAnsicht), damit Herunterziehen
// zum Aktualisieren in beiden geht; das Backend teilt eine Messung 10 s.
//
// Temperaturen sind nur Anzeige — einen Tiefkuehler schaltet man nicht
// versehentlich vom Handy aus. Sein Skript auf dem Geraet schaltet den Strom
// ohnehin wieder ein, wenn es zu warm wird.

import 'dart:async';

import 'package:fwv_anlass/fwv_anlass.dart'
    show LadeAnsicht, LadeAnsichtState, fehlerText, meldung, reiterAufRot, mitSystemleiste;
import 'package:material_ui/material_ui.dart';

import '../modelle.dart';
import '../zugang.dart';

class RoterSchopfScreen extends StatefulWidget {
  const RoterSchopfScreen({super.key, required this.zugang, this.auffrischen, this.hinweis});

  final RoterSchopfZugang zugang;

  /// Zeile oben, z.B. "Fuer deine Schicht Bar bis 01:00" (Zugang nur wegen
  /// der Schicht).
  final String? hinweis;

  /// Wie oft die Anzeige von selbst nachliest, solange der Reiter offen
  /// ist; null = nie (Tests).
  final Duration? auffrischen;

  @override
  State<RoterSchopfScreen> createState() => _RoterSchopfScreenState();
}

class _RoterSchopfScreenState extends State<RoterSchopfScreen> {
  final _lampen = GlobalKey<LadeAnsichtState<RoterSchopfZustand>>();
  final _temperaturen = GlobalKey<LadeAnsichtState<RoterSchopfZustand>>();

  Future<void> _neuLaden() async {
    await Future.wait([?_lampen.currentState?.neuLaden(), ?_temperaturen.currentState?.neuLaden()]);
  }

  /// Kennungen, die gerade geschaltet werden (Knopf zeigt "laeuft").
  final _laeuft = <String>{};
  Timer? _takt;

  @override
  void initState() {
    super.initState();
    final d = widget.auffrischen;
    if (d != null) {
      _takt = Timer.periodic(d, (_) {
        // Nur nachlesen, wenn der Reiter sichtbar ist: Die Hauptseite haelt
        // unsichtbare Reiter am Leben, schaltet ihnen aber die Ticker ab.
        if (mounted && TickerMode.valuesOf(context).enabled) {
          unawaited(_neuLaden());
        }
      });
    }
  }

  @override
  void dispose() {
    _takt?.cancel();
    super.dispose();
  }

  Future<void> _schalten(String kennung, bool an) async {
    setState(() => _laeuft.add(kennung));
    try {
      await widget.zugang.schalten(kennung, an: an);
      // Das Backend merkt sich den Befehl und zeigt ihn sofort; die Zentrale
      // schaltet eine Gruppe aber nacheinander durch. Gleich und nach ein
      // paar Sekunden nachlesen.
      await _lampen.currentState?.neuLaden();
      Timer(const Duration(seconds: 4), () {
        if (mounted) unawaited(_lampen.currentState?.neuLaden());
      });
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _laeuft.remove(kennung));
    }
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Roter Schopf'),
          bottom: reiterAufRot(
            tabs: const [
              Tab(text: 'Lampen'),
              Tab(text: 'Temperaturen'),
            ],
          ),
        ),
        body: Column(
          children: [
            if (widget.hinweis != null)
              Material(
                color: Theme.of(context).colorScheme.tertiaryContainer,
                child: ListTile(
                  dense: true,
                  leading: const Icon(Icons.schedule),
                  title: Text(widget.hinweis!),
                ),
              ),
            Expanded(child: _reiterInhalt()),
          ],
        ),
      ),
    );
  }

  Widget _reiterInhalt() => TabBarView(
    children: [
      LadeAnsicht<RoterSchopfZustand>(
        key: _lampen,
        laden: widget.zugang.zustand,
        bauen: (context, z, _) => _lampenSeite(context, z),
      ),
      LadeAnsicht<RoterSchopfZustand>(
        key: _temperaturen,
        laden: widget.zugang.zustand,
        bauen: (context, z, _) => _temperaturSeite(context, z),
      ),
    ],
  );

  Widget _lampenSeite(BuildContext context, RoterSchopfZustand z) {
    final farben = Theme.of(context).colorScheme;
    return ListView(
      padding: mitSystemleiste(context, const EdgeInsets.only(bottom: 24)),
      children: [
        if (!z.zentrale)
          Card(
            color: farben.errorContainer,
            margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: ListTile(
              leading: Icon(Icons.wifi_off, color: farben.onErrorContainer),
              title: Text(
                'Zentrale nicht erreichbar',
                style: TextStyle(color: farben.onErrorContainer),
              ),
              subtitle: Text(
                'Ohne sie lässt sich kein Licht schalten. Vielleicht ist das Netz im Lokal weg.',
                style: TextStyle(color: farben.onErrorContainer),
              ),
            ),
          ),
        const _Kopf('Gruppen'),
        for (final g in z.gruppen) _gruppe(g),
        if (z.lampen.isNotEmpty) ...[
          _Kopf(
            'Einzelne Lampen',
            zusatz:
                '${z.lampen.where((l) => l.erreichbar).length} von ${z.lampen.length} erreichbar',
          ),
          for (final l in z.lampen) _lampe(l),
        ],
        _Stand(z.stand),
      ],
    );
  }

  Widget _temperaturSeite(BuildContext context, RoterSchopfZustand z) {
    return ListView(
      padding: mitSystemleiste(context, const EdgeInsets.only(bottom: 24)),
      children: [
        if (z.kuehlung.isNotEmpty) ...[
          const _Kopf('Tiefkühler'),
          for (final k in z.kuehlung) _KuehlerKarte(k),
        ],
        if (z.thermostate.isNotEmpty) ...[
          const _Kopf('Heizung'),
          for (final t in z.thermostate) _ThermostatKarte(t),
        ],
        if (z.kuehlung.isEmpty && z.thermostate.isEmpty)
          const Padding(
            padding: EdgeInsets.all(24),
            child: Text('Keine Temperaturfühler eingerichtet.', textAlign: TextAlign.center),
          ),
        _Stand(z.stand),
      ],
    );
  }

  Widget _gruppe(LichtGruppe g) {
    final kennung = 'gruppe:${g.kennung}';
    final unterzeile = !g.erreichbar
        ? 'nicht erreichbar'
        : g.teilweise
        ? '${g.anzahlAn} von ${g.anzahl} an'
        : '${g.anzahl} Lampen · ${g.an ? 'an' : 'aus'}';
    return Card(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      child: ListTile(
        leading: Icon(
          g.an || g.teilweise ? Icons.lightbulb : Icons.lightbulb_outline,
          color: g.an || g.teilweise ? Colors.amber.shade700 : null,
        ),
        title: Text(g.name),
        subtitle: Text(unterzeile),
        // Nicht alles an? Dann einschalten. Sonst ausschalten — wie im Kiosk:
        // Ein Druck bringt die Gruppe immer in einen eindeutigen Zustand.
        trailing: _laeuft.contains(kennung)
            ? const _Laeuft()
            : Switch(
                value: g.an,
                onChanged: g.erreichbar ? (_) => _schalten(kennung, !g.an) : null,
              ),
        onTap: g.erreichbar && !_laeuft.contains(kennung) ? () => _schalten(kennung, !g.an) : null,
      ),
    );
  }

  Widget _lampe(Lampe l) {
    final unterzeile = !l.erreichbar
        ? 'nicht erreichbar'
        : l.an
        ? (l.watt != null && l.watt! > 0 ? '${l.watt} W' : 'an')
        : 'aus';
    return ListTile(
      leading: Icon(
        l.an ? Icons.lightbulb : Icons.lightbulb_outline,
        color: l.an ? Colors.amber.shade700 : null,
      ),
      title: Text(l.name),
      subtitle: Text(unterzeile),
      enabled: l.erreichbar,
      trailing: _laeuft.contains(l.kennung)
          ? const _Laeuft()
          : Switch(
              value: l.an,
              onChanged: l.erreichbar ? (_) => _schalten(l.kennung, !l.an) : null,
            ),
    );
  }
}

String _uhrzeit(DateTime t) =>
    '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

class _Kopf extends StatelessWidget {
  const _Kopf(this.text, {this.zusatz});

  final String text;
  final String? zusatz;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.baseline,
      textBaseline: TextBaseline.alphabetic,
      children: [
        Expanded(child: Text(text, style: Theme.of(context).textTheme.titleMedium)),
        if (zusatz != null)
          Text(
            zusatz!,
            style: Theme.of(context).textTheme.bodySmall
                ?.copyWith(color: Theme.of(context).colorScheme.outline),
          ),
      ],
    ),
  );
}

class _Stand extends StatelessWidget {
  const _Stand(this.stand);

  final DateTime? stand;

  @override
  Widget build(BuildContext context) {
    if (stand == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Text(
        'Stand ${_uhrzeit(stand!)} · zum Aktualisieren herunterziehen',
        style: Theme.of(context).textTheme.bodySmall
            ?.copyWith(color: Theme.of(context).colorScheme.outline),
      ),
    );
  }
}

String _grad(double t) => '${t.toStringAsFixed(1).replaceAll('.', ',')} °C';

class _ThermostatKarte extends StatelessWidget {
  const _ThermostatKarte(this.t);

  final Thermostat t;

  @override
  Widget build(BuildContext context) {
    final teile = <String>[
      if (!t.erreichbar) 'nicht erreichbar',
      if (t.erreichbar && t.soll != null) 'Soll ${_grad(t.soll!)}',
      if (t.erreichbar && t.ventil != null) 'Ventil ${t.ventil} %',
      if (t.erreichbar && t.batterie != null) 'Batterie ${t.batterie} %',
      // Uebersetzt, was das Thermostat meldet; Unbekanntes so, wie es kommt.
      for (final f in t.fehler) f == 'not_calibrated' ? 'nicht kalibriert' : f,
    ];
    final temp = t.temperatur;
    return Card(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      child: ListTile(
        leading: const Icon(Icons.thermostat),
        title: Text(t.name),
        subtitle: Text(teile.join(' · ')),
        trailing: Text(
          !t.erreichbar || temp == null ? '—' : _grad(temp),
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
            fontWeight: FontWeight.w600,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
      ),
    );
  }
}

class _Laeuft extends StatelessWidget {
  const _Laeuft();

  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.all(12),
    child: SizedBox.square(dimension: 24, child: CircularProgressIndicator(strokeWidth: 2.5)),
  );
}

class _KuehlerKarte extends StatelessWidget {
  const _KuehlerKarte(this.k);

  final Kuehler k;

  @override
  Widget build(BuildContext context) {
    final farben = Theme.of(context).colorScheme;
    final t = k.temperatur;
    final String zeile;
    if (!k.erreichbar) {
      zeile = 'nicht erreichbar';
    } else if (t == null) {
      zeile = 'Fühler liefert keinen Wert';
    } else {
      final strom = k.stromAn == null
          ? ''
          : k.stromAn!
          ? 'Strom an · ${k.watt ?? 0} W'
          : 'Strom aus';
      zeile = [if (k.zuWarm) 'zu warm', if (strom.isNotEmpty) strom].join(' · ');
    }
    final warn = k.erreichbar && k.zuWarm;
    return Card(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      color: warn ? farben.errorContainer : null,
      child: ListTile(
        leading: Icon(Icons.ac_unit, color: warn ? farben.onErrorContainer : null),
        title: Text(k.name, style: TextStyle(color: warn ? farben.onErrorContainer : null)),
        subtitle: Text(zeile, style: TextStyle(color: warn ? farben.onErrorContainer : null)),
        trailing: Text(
          !k.erreichbar || t == null ? '—' : '${t.toStringAsFixed(1).replaceAll('.', ',')} °C',
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
            fontWeight: FontWeight.w600,
            color: warn ? farben.onErrorContainer : null,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
      ),
    );
  }
}
