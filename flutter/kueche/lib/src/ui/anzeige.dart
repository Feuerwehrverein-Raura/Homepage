// Die eigentliche Anzeige: oben Station, Verbindung und «Putzen», darunter
// die offenen Bestellungen als Karten (mehrere Spalten auf breiten
// Bildschirmen). Position antippen = erledigt, «Erledigt (N)» = alle
// offenen Positionen dieser Station (bei «Alle» die ganze Bestellung).

import 'dart:async';

import 'package:flutter/material.dart';

import '../dienste.dart';
import '../geraet.dart';
import '../modelle.dart';
import '../netz.dart';
import '../steuerung.dart';
import 'einstellungen_screen.dart';
import 'farben.dart';
import 'kiosk.dart';

class Anzeige extends StatefulWidget {
  const Anzeige({super.key, required this.dienste, required this.abgemeldet});

  final Dienste dienste;
  final void Function(String? hinweis) abgemeldet;

  @override
  State<Anzeige> createState() => _AnzeigeState();
}

class _AnzeigeState extends State<Anzeige> with WidgetsBindingObserver {
  late final AnzeigeSteuerung _s;
  Timer? _putzen;
  int _putzenRest = 0;
  String? _updateText;
  bool _laedt = false;

  /// Geraetebesitzer (Sperre): Updates still und von selbst, sobald nichts offen ist.
  bool _still = false;
  DateTime? _letzterVersuch;

  @override
  void initState() {
    super.initState();
    final d = widget.dienste;
    _s = AnzeigeSteuerung(
      einstellungen: d.einstellungen,
      system: d.system,
      live: d.live,
      vorOrt: d.vorOrt,
      erneuern: d.erneuern,
      abgemeldet: widget.abgemeldet,
      ton: d.geraet.ton,
      updateSuche: d.updateSuche,
      jetzt: d.jetzt,
    )..starten();
    _s.addListener(_vonSelbstAktualisieren);
    d.geraet.sperre().then((s) => _still = s.besitzer);
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState zustand) {
    // Wie onResume/onPause der frueheren App: im Hintergrund nichts halten,
    // zurueck im Vordergrund frisch verbinden.
    if (zustand == AppLifecycleState.resumed) {
      _s.starten();
    } else if (zustand == AppLifecycleState.paused) {
      _s.stoppen();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _putzen?.cancel();
    _s.removeListener(_vonSelbstAktualisieren);
    _s.dispose();
    super.dispose();
  }

  void _putzenStarten() {
    _putzen?.cancel();
    setState(() => _putzenRest = 30);
    _putzen = Timer.periodic(const Duration(seconds: 1), (t) {
      setState(() => _putzenRest--);
      if (_putzenRest <= 0) t.cancel();
    });
  }

  Future<void> _ausfuehren(Future<void> Function() aktion) async {
    try {
      await aktion();
    } on AnmeldungAbgelehnt {
      // Steuerung erneuert das Token oder meldet ab
    } on Object catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Nicht gespeichert – keine Verbindung ($e)'),
          backgroundColor: Farben.dringend,
        ),
      );
    }
  }

  /// Nie mitten im Betrieb: nur ohne offene Bestellungen, hoechstens einmal pro Stunde
  /// (ein misslungener Versuch wiederholt sich sonst laufend).
  void _vonSelbstAktualisieren() {
    final v = _s.update;
    if (!_still || v == null || _laedt || _s.sichtbar.isNotEmpty) return;
    final jetzt = DateTime.now();
    if (_letzterVersuch != null && jetzt.difference(_letzterVersuch!) < const Duration(hours: 1)) return;
    _letzterVersuch = jetzt;
    _updateInstallieren(v);
  }

  Future<void> _updateInstallieren(NeueVersion v) async {
    final g = widget.dienste.geraet;
    if (_laedt) return;
    if (!await g.darfInstallieren()) {
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Installation erlauben'),
          content: const Text(
            'Damit sich die App selbst aktualisieren kann, muss die Installation aus «Unbekannten Quellen» '
            'erlaubt sein.\n\nAndroid 7: Einstellungen › Sicherheit › Unbekannte Herkunft einschalten.\n'
            'Android 8+: Einstellungen › Apps › Küche › Unbekannte Apps installieren.',
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Später')),
            FilledButton(
              onPressed: () {
                Navigator.of(context).pop();
                g.erlaubnisOeffnen();
              },
              child: const Text('Einstellungen öffnen'),
            ),
          ],
        ),
      );
      return;
    }
    setState(() {
      _laedt = true;
      _updateText = 'Update wird geladen … 0 %';
    });
    try {
      await g.installieren(v, fortschritt: (p) => setState(() => _updateText = 'Update wird geladen … $p %'));
      // still: Android beendet die App gleich und startet die neue Fassung
      setState(
        () => _updateText = _still ? 'Update wird installiert – die Anzeige startet gleich neu' : null,
      );
    } on Object {
      setState(() => _updateText = 'Update konnte nicht geladen werden – hier tippen für neuen Versuch');
    } finally {
      if (mounted) setState(() => _laedt = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false, // Kiosk: «Zurück» beendet die Anzeige nicht
      child: ListenableBuilder(
        listenable: _s,
        builder: (context, _) {
          final liste = _s.sichtbar;
          final jetzt = widget.dienste.jetzt();
          return Stack(
            children: [
              Scaffold(
                backgroundColor: _s.blitz ? Farben.warnung : Farben.hintergrund,
                body: SafeArea(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _kopf(context),
                      if (_s.warnung != null)
                        _leiste(_s.warnung!, Farben.dringend, key: const Key('warnung')),
                      if (_s.update != null)
                        _leiste(
                          _updateText ??
                              'Neue Version ${_s.update!.version} verfügbar – hier tippen zum Installieren',
                          Farben.putzen,
                          tippen: () => _updateInstallieren(_s.update!),
                        ),
                      if (_s.druckfehler.isNotEmpty) _druckfehler(),
                      Expanded(
                        child: liste.isEmpty
                            ? const Center(
                                child: Text(
                                  'Keine offenen Bestellungen',
                                  style: TextStyle(fontSize: 24, color: Farben.textLeise),
                                ),
                              )
                            : _karten(liste, jetzt),
                      ),
                    ],
                  ),
                ),
              ),
              if (_putzenRest > 0) _putzenSchicht(),
            ],
          );
        },
      ),
    );
  }

  Widget _kopf(BuildContext context) {
    final verbunden = _s.verbunden;
    // rot wie in der frueheren App
    return Container(
      color: Farben.rot,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          GeheimHalten(
            code: () => widget.dienste.einstellungen.code,
            offen: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => EinstellungenScreen(
                  dienste: widget.dienste,
                  abmelden: () => widget.abgemeldet(null),
                  stationGeaendert: _s.stationWaehlen,
                ),
              ),
            ),
            child: const Logo(groesse: 54),
          ),
          const SizedBox(width: 12),
          Text(_s.station.text, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.bold)),
          const SizedBox(width: 20),
          SegmentedButton<Station>(
            segments: [for (final s in Station.values) ButtonSegment(value: s, label: Text(s.text))],
            selected: {_s.station},
            showSelectedIcon: false,
            onSelectionChanged: (w) => _s.stationWaehlen(w.first),
          ),
          const Spacer(),
          Text(
            '${verbunden ? 'Verbunden' : 'Verbinde …'} · ${_s.vorOrtVerbunden ? 'Schopf' : 'Cloud'}',
            key: const Key('verbindung'),
            style: TextStyle(
              color: verbunden ? Farben.akzent : Colors.white,
              fontSize: 16,
              fontWeight: verbunden ? FontWeight.normal : FontWeight.bold,
            ),
          ),
          const SizedBox(width: 16),
          FilledButton.icon(
            style: FilledButton.styleFrom(backgroundColor: Farben.putzen, foregroundColor: Colors.white),
            onPressed: _putzenStarten,
            icon: const Icon(Icons.cleaning_services),
            label: const Text('Putzen'),
          ),
          const SizedBox(width: 16),
          Uhr(jetzt: widget.dienste.jetzt),
        ],
      ),
    );
  }

  Widget _leiste(String text, Color farbe, {VoidCallback? tippen, Key? key}) => Material(
    key: key,
    color: farbe,
    child: InkWell(
      onTap: tippen,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Text(text, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
      ),
    ),
  );

  Widget _druckfehler() => Material(
    key: const Key('druckfehler'),
    color: Farben.warnung,
    child: Padding(
      padding: const EdgeInsets.fromLTRB(16, 6, 4, 6),
      child: Row(
        children: [
          const Icon(Icons.print_disabled, color: Colors.black),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              [
                for (final f in _s.druckfehler)
                  'Bon ${f.stationText} für Bestellung #${f.bestellung} nicht gedruckt: ${f.meldung}',
              ].join('\n'),
              style: const TextStyle(color: Colors.black, fontSize: 17, fontWeight: FontWeight.w600),
            ),
          ),
          IconButton(
            tooltip: 'Gesehen',
            onPressed: _s.druckfehlerWeg,
            icon: const Icon(Icons.close, color: Colors.black),
          ),
        ],
      ),
    ),
  );

  Widget _karten(List<Bestellung> liste, DateTime jetzt) => LayoutBuilder(
    builder: (context, c) {
      final spalten = (c.maxWidth / 520).floor().clamp(1, 4);
      final verteilt = List.generate(spalten, (_) => <Bestellung>[]);
      for (final (i, b) in liste.indexed) {
        verteilt[i % spalten].add(b);
      }
      return SingleChildScrollView(
        padding: const EdgeInsets.all(8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final spalte in verteilt)
              Expanded(
                child: Column(
                  children: [
                    for (final b in spalte)
                      BestellKarte(
                        key: ValueKey(b.id),
                        bestellung: b,
                        station: _s.station,
                        jetzt: jetzt,
                        erledigt: () => _ausfuehren(() => _s.bestellungErledigen(b)),
                        position: (p) => _ausfuehren(() => _s.positionErledigen(b, p)),
                      ),
                  ],
                ),
              ),
          ],
        ),
      );
    },
  );

  Widget _putzenSchicht() => Positioned.fill(
    child: GestureDetector(
      key: const Key('putzen'),
      behavior: HitTestBehavior.opaque,
      onTap: () {}, // alle Beruehrungen schlucken
      child: Container(
        color: Farben.putzen,
        alignment: Alignment.center,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cleaning_services, size: 96, color: Colors.white),
            const SizedBox(height: 16),
            const Text(
              'Bildschirm putzen',
              style: TextStyle(fontSize: 40, color: Colors.white, decoration: TextDecoration.none),
            ),
            const Text(
              'Touch-Eingaben deaktiviert',
              style: TextStyle(fontSize: 22, color: Colors.white70, decoration: TextDecoration.none),
            ),
            const SizedBox(height: 24),
            Text(
              '$_putzenRest',
              style: const TextStyle(
                fontSize: 120,
                fontWeight: FontWeight.bold,
                color: Colors.white,
                decoration: TextDecoration.none,
              ),
            ),
            const Text(
              'Sekunden verbleibend',
              style: TextStyle(fontSize: 20, color: Colors.white70, decoration: TextDecoration.none),
            ),
          ],
        ),
      ),
    ),
  );
}

class BestellKarte extends StatelessWidget {
  const BestellKarte({
    super.key,
    required this.bestellung,
    required this.station,
    required this.jetzt,
    required this.erledigt,
    required this.position,
  });

  final Bestellung bestellung;
  final Station station;
  final DateTime jetzt;
  final VoidCallback erledigt;
  final void Function(Position) position;

  @override
  Widget build(BuildContext context) {
    final b = bestellung;
    final positionen = b.fuer(station);
    final offen = positionen.where((p) => !p.erledigt).length;
    final dringend = b.dringend(jetzt);
    return Card(
      color: Farben.flaeche,
      margin: const EdgeInsets.all(8),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        // Feuerwehrrot wie die fruehere App; dringend dicker und mit rotem Kopf
        side: BorderSide(color: Farben.rot, width: dringend ? 4 : 2),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            key: dringend ? const Key('dringend') : null,
            color: dringend ? Farben.rot : null,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Row(
              children: [
                Text(b.ort, style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
                const Spacer(),
                Icon(Icons.schedule, color: dringend ? Colors.white : Farben.textLeise),
                const SizedBox(width: 4),
                Text(
                  '${b.minuten(jetzt)} min',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w600,
                    color: dringend ? Colors.white : Farben.textLeise,
                  ),
                ),
              ],
            ),
          ),
          for (final p in positionen) _Zeile(p, tippen: p.erledigt ? null : () => position(p)),
          Padding(
            padding: const EdgeInsets.all(12),
            child: FilledButton(
              style: FilledButton.styleFrom(backgroundColor: Farben.erledigt, foregroundColor: Colors.white),
              onPressed: erledigt,
              child: Text(offen > 0 ? 'Erledigt ($offen)' : 'Erledigt'),
            ),
          ),
        ],
      ),
    );
  }
}

class _Zeile extends StatelessWidget {
  const _Zeile(this.p, {this.tippen});

  final Position p;
  final VoidCallback? tippen;

  @override
  Widget build(BuildContext context) {
    final fertig = p.erledigt;
    return Material(
      color: fertig ? Farben.erledigtHinten : Farben.flaecheHoch,
      child: InkWell(
        onTap: tippen,
        child: Container(
          decoration: const BoxDecoration(
            border: Border(top: BorderSide(color: Farben.flaeche, width: 2)),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 56,
                child: fertig
                    ? const Icon(Icons.check, size: 28, color: Farben.erledigt)
                    : Text(
                        '${p.menge}x',
                        style: const TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                          color: Farben.akzent,
                        ),
                      ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      p.name,
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w600,
                        color: fertig ? Farben.textGedaempft : Farben.text,
                        decoration: fertig ? TextDecoration.lineThrough : null,
                      ),
                    ),
                    if (!fertig && p.notiz != null)
                      Text(
                        p.notiz!,
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w600,
                          color: p.allergie ? Farben.dringend : Farben.warnung,
                        ),
                      ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: p.istBar ? Farben.bar : Farben.kueche,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(p.istBar ? 'Bar' : 'Küche', style: const TextStyle(fontSize: 14)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Uhrzeit oben rechts wie in der frueheren App; baut nur sich selbst jede Sekunde neu.
class Uhr extends StatefulWidget {
  const Uhr({super.key, required this.jetzt});

  final DateTime Function() jetzt;

  @override
  State<Uhr> createState() => _UhrState();
}

class _UhrState extends State<Uhr> {
  late final Timer _takt;

  @override
  void initState() {
    super.initState();
    _takt = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _takt.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.jetzt().toLocal();
    String z(int n) => n.toString().padLeft(2, '0');
    return Text(
      '${z(t.hour)}:${z(t.minute)}:${z(t.second)}',
      key: const Key('uhr'),
      style: const TextStyle(
        fontSize: 24,
        fontWeight: FontWeight.bold,
        fontFeatures: [FontFeature.tabularFigures()],
      ),
    );
  }
}
