// Ersteinrichtung bzw. wenn das Token wirklich abgelaufen ist (Display > 30
// Tage offline): Station waehlen und einmal das Passwort «Kasse & Küche»
// oder den QR-Code (Datenblatt, Anmeldebon). Ist das Token noch gueltig und
// fehlt nur die Station, genuegt «Anzeige starten».

import 'package:flutter/material.dart';

import '../dienste.dart';
import '../modelle.dart';
import '../netz.dart';
import '../token.dart';
import 'einstellungen_screen.dart';
import 'farben.dart';
import 'kiosk.dart';
import 'scanner.dart';

class Anmeldung extends StatefulWidget {
  const Anmeldung({super.key, required this.dienste, required this.fertig, this.hinweis});

  final Dienste dienste;
  final VoidCallback fertig;
  final String? hinweis;

  @override
  State<Anmeldung> createState() => _AnmeldungState();
}

class _AnmeldungState extends State<Anmeldung> {
  final _passwort = TextEditingController();
  late Station _station = widget.dienste.einstellungen.station ?? Station.kueche;
  String? _fehler;
  bool _laeuft = false;

  /// Vom Server gemeldete Restversuche (null = noch kein Fehlversuch).
  int? _rest;

  bool get _tokenDa => tokenGueltig(widget.dienste.einstellungen.token, widget.dienste.jetzt());

  @override
  void dispose() {
    _passwort.dispose();
    super.dispose();
  }

  Future<void> _anmelden() async {
    final e = widget.dienste.einstellungen;
    await e.stationSetzen(_station);
    if (_tokenDa) {
      widget.fertig();
      return;
    }
    final pw = _passwort.text.trim();
    if (pw.isEmpty) {
      setState(() => _fehler = 'Bitte Passwort eingeben');
      return;
    }
    // Nach einem Fehlversuch deutlich warnen: das Backend sperrt nach 3
    // Fehlversuchen die oeffentliche IP fuer 24 h - im Schopf trifft das auch
    // die Kasse.
    final rest = _rest;
    if (rest != null) {
      if (!mounted) return;
      final trotzdem = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Achtung: IP-Sperre'),
          content: Text(
            'Noch $rest Versuch(e), danach ist der Schopf 24 h gesperrt – auch die Kasse '
            'kommt dann nicht mehr ins Bestellsystem.\n\nPasswort bitte genau prüfen '
            '(Mitgliederbereich › Zugänge › «Kasse & Küche»).',
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Abbrechen')),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Trotzdem senden'),
            ),
          ],
        ),
      );
      if (trotzdem != true) return;
    }
    await _senden((url) => widget.dienste.anmelden(url, pw));
  }

  Future<void> _qr() async {
    final code = await Navigator.of(context)
        .push<String>(MaterialPageRoute(builder: (_) => const QrScanner()));
    if (code == null || !mounted) return;
    await widget.dienste.einstellungen.stationSetzen(_station);
    await _senden((url) => widget.dienste.qrAnmelden(url, code));
  }

  Future<void> _senden(Future<AuthErgebnis> Function(String url) anfrage) async {
    setState(() {
      _laeuft = true;
      _fehler = null;
    });
    try {
      final url = await widget.dienste.server();
      switch (await anfrage(url)) {
        case AuthOk(:final token):
          await widget.dienste.einstellungen.tokenSetzen(token);
          widget.fertig();
        case AuthAbgelehnt(:final status, :final text):
          // Text des Servers woertlich (Restversuche, IP-Sperre, ...)
          final t = text ?? 'Anmeldung abgelehnt (HTTP $status)';
          _rest = restVersuche(t);
          setState(() {
            _fehler = _rest == null
                ? t
                : '$t\nNoch $_rest Versuch(e), danach ist der Schopf 24 h gesperrt (auch die Kasse).';
          });
        case AuthUnerreichbar(:final serverText):
          setState(() {
            _fehler =
                serverText ??
                'Keine Verbindung zum Bestellsystem – bitte Netzwerk prüfen und erneut versuchen.';
          });
      }
    } finally {
      if (mounted) setState(() => _laeuft = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final e = widget.dienste.einstellungen;
    return PopScope(
      canPop: false, // Kiosk: «Zurück» ignorieren
      child: Scaffold(
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 520),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Center(
                      child: GeheimHalten(
                        code: () => e.code,
                        offen: () => Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => EinstellungenScreen(dienste: widget.dienste),
                          ),
                        ),
                        child: const Logo(groesse: 120),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Küchendisplay',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    if (widget.hinweis != null) ...[
                      const SizedBox(height: 16),
                      Container(
                        key: const Key('hinweis'),
                        padding: const EdgeInsets.all(12),
                        color: Farben.warnung.withValues(alpha: 0.2),
                        child: Text(widget.hinweis!, style: const TextStyle(fontSize: 16)),
                      ),
                    ],
                    const SizedBox(height: 24),
                    const Text('Welche Bestellungen zeigt dieses Display?', style: TextStyle(fontSize: 16)),
                    const SizedBox(height: 8),
                    SegmentedButton<Station>(
                      segments: [
                        for (final s in Station.values) ButtonSegment(value: s, label: Text(s.text)),
                      ],
                      selected: {_station},
                      showSelectedIcon: false,
                      onSelectionChanged: (w) => setState(() => _station = w.first),
                    ),
                    const SizedBox(height: 24),
                    if (!_tokenDa) ...[
                      TextField(
                        key: const Key('passwort'),
                        controller: _passwort,
                        obscureText: true,
                        decoration: const InputDecoration(
                          labelText: 'Passwort',
                          border: OutlineInputBorder(),
                        ),
                        onSubmitted: (_) => _anmelden(),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Passwort «Kasse & Küche» – steht im Mitgliederbereich unter «Zugänge». '
                        'Nur einmal nötig, danach meldet sich die App selbst wieder an.',
                        style: TextStyle(color: Farben.textLeise),
                      ),
                      const SizedBox(height: 16),
                    ],
                    FilledButton(
                      key: const Key('anmelden'),
                      onPressed: _laeuft ? null : _anmelden,
                      child: _laeuft
                          ? const SizedBox.square(
                              dimension: 24,
                              child: CircularProgressIndicator(strokeWidth: 3),
                            )
                          : Text(_tokenDa ? 'Anzeige starten' : 'Anmelden'),
                    ),
                    if (!_tokenDa) ...[
                      const SizedBox(height: 12),
                      OutlinedButton.icon(
                        onPressed: _laeuft ? null : _qr,
                        icon: const Icon(Icons.qr_code_scanner),
                        label: const Text('Mit QR-Code anmelden'),
                      ),
                    ],
                    if (_fehler != null) ...[
                      const SizedBox(height: 16),
                      Text(
                        _fehler!,
                        key: const Key('fehler'),
                        style: const TextStyle(color: Farben.dringend, fontSize: 16),
                      ),
                    ],
                    const SizedBox(height: 24),
                    Text(
                      'Version ${widget.dienste.version ?? '?'}',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Farben.textGedaempft),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
