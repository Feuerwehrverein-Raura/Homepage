// Reiter "Roter Schopf": oben die zwei Lichtgruppen, darunter die
// Tiefkuehler, ganz unten die einzelnen Lampen (zugeklappt). Vorbild: die
// Lichtseite des Kiosk-Laptops im Lokal (roterschopf-kiosk/dienst).
//
// Die Tiefkuehler sind nur Anzeige — einen Tiefkuehler schaltet man nicht
// versehentlich vom Handy aus. Ihr Skript auf dem Geraet schaltet den Strom
// ohnehin wieder ein, wenn es zu warm wird.

import 'dart:async';

import 'package:fwv_anlass/fwv_anlass.dart' show LadeAnsicht, LadeAnsichtState, fehlerText, meldung;
import 'package:material_ui/material_ui.dart';

import '../modelle.dart';
import '../zugang.dart';

class RoterSchopfScreen extends StatefulWidget {
  const RoterSchopfScreen({super.key, required this.zugang, this.auffrischen});

  final RoterSchopfZugang zugang;

  /// Wie oft die Anzeige von selbst nachliest, solange der Reiter offen
  /// ist; null = nie (Tests).
  final Duration? auffrischen;

  @override
  State<RoterSchopfScreen> createState() => _RoterSchopfScreenState();
}

class _RoterSchopfScreenState extends State<RoterSchopfScreen> {
  final _ansicht = GlobalKey<LadeAnsichtState<RoterSchopfZustand>>();

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
          unawaited(_ansicht.currentState?.neuLaden());
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
      await _ansicht.currentState?.neuLaden();
      Timer(const Duration(seconds: 4), () {
        if (mounted) unawaited(_ansicht.currentState?.neuLaden());
      });
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _laeuft.remove(kennung));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Roter Schopf')),
      body: LadeAnsicht<RoterSchopfZustand>(
        key: _ansicht,
        laden: widget.zugang.zustand,
        bauen: (context, z, _) => _inhalt(context, z),
      ),
    );
  }

  Widget _inhalt(BuildContext context, RoterSchopfZustand z) {
    final farben = Theme.of(context).colorScheme;
    return ListView(
      padding: const EdgeInsets.only(bottom: 24),
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
        const _Kopf('Licht'),
        for (final g in z.gruppen) _gruppe(g),
        if (z.kuehlung.isNotEmpty) ...[
          const _Kopf('Tiefkühler'),
          for (final k in z.kuehlung) _KuehlerKarte(k),
        ],
        if (z.lampen.isNotEmpty) ...[
          const SizedBox(height: 8),
          ExpansionTile(
            title: const Text('Einzelne Lampen'),
            subtitle: Text(
              '${z.lampen.where((l) => l.erreichbar).length} von ${z.lampen.length} erreichbar',
            ),
            children: [for (final l in z.lampen) _lampe(l)],
          ),
        ],
        if (z.stand != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Text(
              'Stand ${_uhrzeit(z.stand!)} · zum Aktualisieren herunterziehen',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: farben.outline),
            ),
          ),
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
  const _Kopf(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
    child: Text(text, style: Theme.of(context).textTheme.titleMedium),
  );
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
