// Reiter "Roter Schopf" - alles, was das Lokal betrifft:
//
//   Lampen       die zwei Lichtgruppen, darunter jede Lampe einzeln
//   Messwerte    Strom im Lokal (Zentrale), Tiefkuehler, Heizkoerper
//   Musik        den Laptop im Lokal fernbedienen (mit [musik])
//
// Oben rechts der Bildschirm des Laptops (mit [bildschirm]). Hoeren auf dem
// Handy und Playlists zusammenstellen bleiben unter "Mehr" (fuer alle
// Mitglieder).
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
import '../musik/laptop.dart';
import '../musik/zugang.dart';
import '../zugang.dart';
import 'verlauf_screen.dart';

class RoterSchopfScreen extends StatefulWidget {
  const RoterSchopfScreen({
    super.key,
    required this.zugang,
    this.auffrischen,
    this.hinweis,
    this.musik,
    this.bildschirm,
    this.alarmSchalten = false,
    this.qrScannen,
  });

  final RoterSchopfZugang zugang;

  /// Unter-Reiter "Musik": Fernbedienung des Laptops im Lokal.
  final MusikZugang? musik;

  /// Knopf oben rechts: Bildschirm des Laptops oeffnen.
  final VoidCallback? bildschirm;

  /// SMS-Alarm der Tiefkuehler scharf stellen und entschaerfen (Gruppe
  /// Roter Schopf, Vorstand, admin - nicht mit blossem Schicht-Zugang).
  final bool alarmSchalten;

  /// Kamera fuer den Vor-Ort-Sticker am Tiefkuehler: liefert den Inhalt des
  /// QR-Codes (null: abgebrochen). Ohne: kein Knopf "Vor Ort".
  final Future<String?> Function()? qrScannen;

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
    final musik = widget.musik;
    return DefaultTabController(
      length: musik == null ? 2 : 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Roter Schopf'),
          actions: [
            if (widget.bildschirm != null)
              IconButton(
                tooltip: 'Bildschirm Roter Schopf',
                icon: const Icon(Icons.desktop_windows_outlined),
                onPressed: widget.bildschirm,
              ),
          ],
          bottom: reiterAufRot(
            tabs: [
              const Tab(text: 'Lampen'),
              const Tab(text: 'Messwerte'),
              if (musik != null) const Tab(text: 'Musik'),
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
      if (widget.musik != null) LaptopSeite(zugang: widget.musik!),
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

  /// Antippen einer Karte: Temperaturkurve ([VerlaufScreen]).
  VoidCallback? _verlaufOeffner(String? messstelle, String name) => messstelle == null
      ? null
      : () => Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) =>
                VerlaufScreen(zugang: widget.zugang, messstelle: messstelle, name: name),
          ),
        );

  Widget _temperaturSeite(BuildContext context, RoterSchopfZustand z) {
    return ListView(
      padding: mitSystemleiste(context, const EdgeInsets.only(bottom: 24)),
      children: [
        if (z.hauptmessung != null) ...[const _Kopf('Strom'), _StromKarte(z.hauptmessung!)],
        if (z.kuehlung.isNotEmpty) ...[
          const _Kopf('Tiefkühler'),
          if (widget.alarmSchalten) _AlarmKarte(zugang: widget.zugang, qrScannen: widget.qrScannen),
          for (final k in z.kuehlung)
            _KuehlerKarte(k, verlauf: _verlaufOeffner(k.messstelle, k.name)),
        ],
        if (z.thermostate.isNotEmpty) ...[
          const _Kopf('Heizung'),
          for (final t in z.thermostate)
            _ThermostatKarte(t, verlauf: _verlaufOeffner(t.messstelle, t.name)),
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
    final zustand = g.teilweise
        ? '${g.anzahlAn} von ${g.anzahl} an'
        : '${g.anzahl} ${g.anzahl == 1 ? 'Lampe' : 'Lampen'} · ${g.an ? 'an' : 'aus'}';
    final unterzeile = !g.erreichbar
        ? 'nicht erreichbar'
        : g.ausgesteckt > 0
        ? '$zustand · ${g.ausgesteckt} ausgesteckt'
        : zustand;
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
  const _ThermostatKarte(this.t, {this.verlauf});

  final Thermostat t;
  final VoidCallback? verlauf;

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
        onTap: verlauf,
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

String _zahl(double v, int stellen) => v.toStringAsFixed(stellen).replaceAll('.', ',');

/// Hauptmessung: Leistung gross, darunter je Phase und der Zaehlerstand.
class _StromKarte extends StatelessWidget {
  const _StromKarte(this.m);

  final Hauptmessung m;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final ziffern = const [FontFeature.tabularFigures()];
    if (!m.erreichbar) {
      return const Card(
        margin: EdgeInsets.fromLTRB(16, 0, 16, 8),
        child: ListTile(leading: Icon(Icons.bolt), title: Text('Zentrale antwortet nicht')),
      );
    }
    return Card(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Icon(Icons.bolt),
                const SizedBox(width: 12),
                const Expanded(child: Text('Leistung jetzt')),
                Text(
                  m.leistungW == null ? '—' : '${m.leistungW} W',
                  style: text.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                    fontFeatures: ziffern,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            for (final p in m.phasen)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  children: [
                    SizedBox(width: 36, child: Text(p.name, style: text.labelLarge)),
                    Expanded(
                      child: Text(
                        [
                          if (p.spannungV != null) '${_zahl(p.spannungV!, 0)} V',
                          if (p.stromA != null) '${_zahl(p.stromA!, 2)} A',
                        ].join(' · '),
                        style: text.bodySmall?.copyWith(fontFeatures: ziffern),
                      ),
                    ),
                    Text(
                      p.leistungW == null ? '—' : '${p.leistungW} W',
                      style: text.bodyMedium?.copyWith(fontFeatures: ziffern),
                    ),
                  ],
                ),
              ),
            if (m.zaehlerKwh != null) ...[
              const Divider(height: 20),
              Row(
                children: [
                  const Expanded(child: Text('Zählerstand')),
                  Text(
                    '${_zahl(m.zaehlerKwh!, 1)} kWh',
                    style: text.bodyMedium?.copyWith(fontFeatures: ziffern),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// SMS-Alarm: scharf oder entschaerft. Entschaerfen immer mit Dauer, damit
/// niemand das Wiedereinschalten vergisst (etwa nach dem Abtauen).
class _AlarmKarte extends StatefulWidget {
  const _AlarmKarte({required this.zugang, this.qrScannen});

  final RoterSchopfZugang zugang;
  final Future<String?> Function()? qrScannen;

  @override
  State<_AlarmKarte> createState() => _AlarmKarteState();
}

class _AlarmKarteState extends State<_AlarmKarte> {
  KuehlerAlarm? _alarm;
  bool _schaltet = false;
  String? _fehler;

  @override
  void initState() {
    super.initState();
    _laden();
  }

  Future<void> _laden() async {
    try {
      final a = await widget.zugang.kuehlerAlarm();
      if (mounted) setState(() => _alarm = a);
    } on Object catch (e) {
      if (mounted) setState(() => _fehler = fehlerText(e));
    }
  }

  Future<void> _umschalten(bool scharf) async {
    int? stunden;
    if (!scharf) {
      final wahl = await showDialog<int>(
        context: context,
        builder: (context) => SimpleDialog(
          title: const Text('SMS-Alarm entschärfen'),
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(24, 0, 24, 8),
              child: Text(
                'Solange der Alarm entschärft ist, geht keine SMS an Vorstand und Roter Schopf.',
              ),
            ),
            for (final (h, text) in const [
              (1, 'Für 1 Stunde'),
              (4, 'Für 4 Stunden'),
              (24, 'Für 24 Stunden'),
              (0, 'Bis ich ihn wieder scharf stelle'),
            ])
              SimpleDialogOption(
                key: Key('entschaerfen-$h'),
                onPressed: () => Navigator.of(context).pop(h),
                child: Text(text),
              ),
          ],
        ),
      );
      if (wahl == null) return;
      stunden = wahl == 0 ? null : wahl;
    }
    setState(() => _schaltet = true);
    try {
      final a = await widget.zugang.kuehlerAlarmSetzen(scharf: scharf, stunden: stunden);
      if (mounted) setState(() => _alarm = a);
      if (mounted) {
        meldung(
          context,
          scharf ? 'Alarm wieder scharf gestellt' : 'Alarm entschärft – vorerst keine SMS',
        );
      }
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _schaltet = false);
    }
  }

  /// Mit [vorOrt]: zuerst den Sticker am Geraet scannen.
  Future<void> _schauen(OffenerAlarm f, {bool vorOrt = false}) async {
    String? sticker;
    if (vorOrt) {
      sticker = await widget.qrScannen?.call();
      if (sticker == null || !mounted) return;
    }
    setState(() => _schaltet = true);
    try {
      final a = await widget.zugang.kuehlerAlarmSchauen(f.schluessel, sticker);
      if (mounted) setState(() => _alarm = a);
      if (mounted) {
        meldung(
          context,
          vorOrt
              ? 'Vor Ort bestätigt – nächste Erinnerung erst in 12 Stunden'
              : 'Die anderen wissen jetzt, dass du schauen gehst',
        );
      }
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _schaltet = false);
    }
  }

  static String _zeit(DateTime t) {
    final heute = DateTime.now();
    final uhr = '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
    final gleicherTag = t.year == heute.year && t.month == heute.month && t.day == heute.day;
    return gleicherTag ? uhr : '${t.day}.${t.month}. $uhr';
  }

  @override
  Widget build(BuildContext context) {
    final a = _alarm;
    final farben = Theme.of(context).colorScheme;
    if (a == null) {
      return ListTile(
        leading: const Icon(Icons.sms_outlined),
        title: const Text('SMS-Alarm'),
        subtitle: Text(_fehler ?? 'Wird geladen …'),
      );
    }
    final titel = !a.aktiv
        ? 'SMS-Alarm auf dem Server ausgeschaltet'
        : a.scharf
        ? 'SMS-Alarm scharf'
        : a.bis == null
        ? 'SMS-Alarm entschärft'
        : 'SMS-Alarm entschärft bis ${_zeit(a.bis!)}';
    final schalter = Card(
      key: const Key('kuehler-alarm'),
      color: a.scharf || !a.aktiv ? null : farben.errorContainer,
      child: SwitchListTile(
        secondary: Icon(
          a.scharf ? Icons.notifications_active_outlined : Icons.notifications_off_outlined,
        ),
        title: Text(titel),
        subtitle: Text(
          [
            if (a.scharf)
              'SMS an Vorstand und Roter Schopf, wenn ein Tiefkühler zu warm wird oder ausfällt',
            if (!a.scharf && a.bis == null) 'Bis ihn jemand wieder scharf stellt',
            if (a.von != null && a.geaendert != null) 'Zuletzt: ${a.von}, ${_zeit(a.geaendert!)}',
          ].join(' · '),
        ),
        value: a.scharf,
        onChanged: _schaltet || !a.aktiv ? null : _umschalten,
      ),
    );
    if (a.offen.isEmpty) return schalter;
    return Column(
      children: [
        for (final f in a.offen)
          Card(
            key: Key('alarm-offen-${f.schluessel}'),
            color: farben.errorContainer,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.warning_amber_rounded, color: farben.onErrorContainer),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          f.text,
                          style: Theme.of(context).textTheme.titleSmall
                              ?.copyWith(color: farben.onErrorContainer),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    f.schaut == null
                        ? 'Noch niemand schaut nach'
                        : '${f.schaut} ${f.vorOrt ? 'war vor Ort' : 'schaut nach'}${f.schautSeit == null ? '' : ' (seit ${_zeit(f.schautSeit!)})'}',
                    style: TextStyle(color: farben.onErrorContainer),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    alignment: WrapAlignment.end,
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      if (!f.vorOrt)
                        OutlinedButton.icon(
                          key: Key('schauen-${f.schluessel}'),
                          onPressed: _schaltet ? null : () => _schauen(f),
                          icon: const Icon(Icons.directions_walk),
                          label: Text(f.schaut == null ? 'Ich gehe schauen' : 'Ich gehe auch'),
                        ),
                      if (widget.qrScannen != null)
                        FilledButton.icon(
                          key: Key('vor-ort-${f.schluessel}'),
                          onPressed: _schaltet ? null : () => _schauen(f, vorOrt: true),
                          icon: const Icon(Icons.qr_code_scanner),
                          label: const Text('Vor Ort: Sticker scannen'),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        schalter,
      ],
    );
  }
}

class _KuehlerKarte extends StatelessWidget {
  const _KuehlerKarte(this.k, {this.verlauf});

  final Kuehler k;
  final VoidCallback? verlauf;

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
        onTap: verlauf,
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
