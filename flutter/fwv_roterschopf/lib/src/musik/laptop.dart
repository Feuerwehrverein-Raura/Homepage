// Reiter "Im Schopf": den Laptop im Lokal fernbedienen - was laeuft,
// Anhalten/Weiter, Lautstaerke, eine Playlist oder einen Sender starten.
//
// Der Weg: App -> api-members (prueft Gruppe Roter Schopf, Vorstand,
// admin) -> Kiosk-Dienst auf dem T400 (Port 8081, nur vom Server). Was
// hier geschieht, hoeren alle im Raum - deshalb wird vor dem Wechsel der
// Musik nachgefragt.

import 'dart:async';

import 'package:fwv_anlass/fwv_anlass.dart' show fehlerText, meldung, nachfragen, mitSystemleiste;
import 'package:material_ui/material_ui.dart';

import 'modelle.dart';
import 'player.dart' show zeitText;
import 'zugang.dart';

class LaptopSeite extends StatefulWidget {
  const LaptopSeite({super.key, required this.zugang, this.takt = const Duration(seconds: 3)});

  final MusikZugang zugang;

  /// Wie oft der Zustand neu geholt wird, solange der Reiter offen ist.
  final Duration takt;

  @override
  State<LaptopSeite> createState() => _LaptopSeiteState();
}

class _LaptopSeiteState extends State<LaptopSeite> {
  LaptopZustand? _zustand;
  String? _fehler;
  bool _schickt = false;
  double? _lautstaerke; // waehrend des Ziehens
  Timer? _takt;

  @override
  void initState() {
    super.initState();
    _holen();
    _takt = Timer.periodic(widget.takt, (_) => _holen());
  }

  @override
  void dispose() {
    _takt?.cancel();
    super.dispose();
  }

  Future<void> _holen() async {
    try {
      final z = await widget.zugang.laptop();
      if (mounted) {
        setState(() {
          _zustand = z;
          _fehler = null;
        });
      }
    } on Object catch (e) {
      if (mounted) setState(() => _fehler = fehlerText(e));
    }
  }

  Future<void> _befehl(String aktion, [Map<String, Object?> daten = const {}]) async {
    setState(() => _schickt = true);
    try {
      await widget.zugang.laptopBefehl(aktion, daten);
      await _holen();
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _schickt = false);
    }
  }

  Future<void> _wechseln(String was, String aktion, Map<String, Object?> daten) async {
    final ja = await nachfragen(
      context,
      titel: '$was im Schopf spielen?',
      text: 'Die laufende Musik im Lokal wird ersetzt – alle im Raum hören es.',
      ja: 'Abspielen',
    );
    if (ja) await _befehl(aktion, daten);
  }

  @override
  Widget build(BuildContext context) {
    final z = _zustand;
    if (z == null) {
      return Center(
        child: _fehler == null
            ? const CircularProgressIndicator()
            : Padding(
                padding: const EdgeInsets.all(24),
                child: Text(_fehler!, textAlign: TextAlign.center),
              ),
      );
    }
    final m = z.musik;
    final text = Theme.of(context).textTheme;
    final farben = Theme.of(context).colorScheme;
    return ListView(
      padding: mitSystemleiste(context, const EdgeInsets.fromLTRB(16, 16, 16, 24)),
      children: [
        if (_fehler != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(_fehler!, style: TextStyle(color: farben.error)),
          ),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: !m.erreichbar
                ? const Text('Die Musik auf dem Laptop antwortet nicht.')
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        m.laeuft ? 'Läuft im Schopf' : 'Angehalten',
                        style: text.labelLarge?.copyWith(color: farben.primary),
                      ),
                      const SizedBox(height: 4),
                      Text(m.titel ?? '—', style: text.titleLarge),
                      if (m.interpret != null) Text(m.interpret!, style: text.titleSmall),
                      if (m.dauer > Duration.zero) ...[
                        const SizedBox(height: 12),
                        LinearProgressIndicator(
                          value: m.position.inMilliseconds / m.dauer.inMilliseconds,
                        ),
                        const SizedBox(height: 4),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [Text(zeitText(m.position)), Text(zeitText(m.dauer))],
                        ),
                      ],
                      const SizedBox(height: 8),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          IconButton(
                            tooltip: 'Zurück',
                            iconSize: 32,
                            onPressed: _schickt ? null : () => _befehl('zurueck'),
                            icon: const Icon(Icons.skip_previous),
                          ),
                          const SizedBox(width: 8),
                          IconButton.filled(
                            tooltip: m.laeuft ? 'Pause im Schopf' : 'Abspielen im Schopf',
                            iconSize: 40,
                            onPressed: _schickt ? null : () => _befehl('umschalten'),
                            icon: Icon(m.laeuft ? Icons.pause : Icons.play_arrow),
                          ),
                          const SizedBox(width: 8),
                          IconButton(
                            tooltip: 'Nächster Titel im Schopf',
                            iconSize: 32,
                            onPressed: _schickt ? null : () => _befehl('weiter'),
                            icon: const Icon(Icons.skip_next),
                          ),
                        ],
                      ),
                      if (m.lautstaerke != null)
                        Row(
                          children: [
                            const Icon(Icons.volume_down),
                            Expanded(
                              child: Slider(
                                value: _lautstaerke ?? m.lautstaerke!.toDouble(),
                                max: 100,
                                divisions: 20,
                                label: '${(_lautstaerke ?? m.lautstaerke!).round()} %',
                                onChanged: (v) => setState(() => _lautstaerke = v),
                                onChangeEnd: (v) async {
                                  await _befehl('lautstaerke', {'wert': v.round()});
                                  if (mounted) setState(() => _lautstaerke = null);
                                },
                              ),
                            ),
                            const Icon(Icons.volume_up),
                          ],
                        ),
                    ],
                  ),
          ),
        ),
        if (m.naechste.isNotEmpty) ...[
          const SizedBox(height: 16),
          Text(
            m.zufall ? 'In der Warteschlange (Zufall)' : 'Als Nächstes',
            style: text.titleMedium,
          ),
          for (final n in m.naechste.take(5))
            ListTile(dense: true, contentPadding: EdgeInsets.zero, title: Text(n)),
        ],
        const SizedBox(height: 16),
        Text('Playlist starten', style: text.titleMedium),
        for (final p in z.playlists)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.queue_music),
            title: Text(p),
            trailing: const Icon(Icons.play_arrow),
            onTap: _schickt ? null : () => _wechseln('„$p“', 'playlist', {'name': p}),
          ),
        if (z.sender.isNotEmpty) ...[
          const SizedBox(height: 16),
          Text('Radio starten', style: text.titleMedium),
          for (final s in z.sender)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.radio),
              title: Text(s.name),
              trailing: const Icon(Icons.play_arrow),
              onTap: _schickt ? null : () => _wechseln(s.name, 'radio', {'url': s.url}),
            ),
        ],
      ],
    );
  }
}
