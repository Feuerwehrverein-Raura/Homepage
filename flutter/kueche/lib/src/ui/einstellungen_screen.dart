// Einstellungen - nur ueber Logo 3 s + Ausgangs-Code erreichbar.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../dienste.dart';
import '../modelle.dart';
import 'farben.dart';

class EinstellungenScreen extends StatefulWidget {
  const EinstellungenScreen({super.key, required this.dienste, this.abmelden, this.stationGeaendert});

  final Dienste dienste;

  /// Token loeschen und zur Anmeldung (nur aus der Anzeige).
  final VoidCallback? abmelden;
  final void Function(Station)? stationGeaendert;

  @override
  State<EinstellungenScreen> createState() => _EinstellungenScreenState();
}

class _EinstellungenScreenState extends State<EinstellungenScreen> {
  void _meldung(String t) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t)));

  Future<String?> _text(String titel, String wert, {bool ziffern = false}) {
    final c = TextEditingController(text: ziffern ? '' : wert);
    return showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(titel),
        content: TextField(
          controller: c,
          autofocus: true,
          obscureText: ziffern,
          keyboardType: ziffern ? TextInputType.number : TextInputType.url,
          inputFormatters: [if (ziffern) FilteringTextInputFormatter.digitsOnly],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Abbrechen')),
          FilledButton(onPressed: () => Navigator.of(context).pop(c.text.trim()), child: const Text('OK')),
        ],
      ),
    );
  }

  Future<void> _sperreAufheben() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Gerätesperre aufheben?'),
        content: const Text(
          'Das Tablet ist danach wieder frei bedienbar. Wieder einrichten geht nur per adb am Computer.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Abbrechen')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Aufheben')),
        ],
      ),
    );
    if (ok != true) return;
    final d = widget.dienste;
    await d.geraet.sperreAufheben();
    await d.geraet.alsStartbildschirm(d.einstellungen.alsStart);
    setState(() {});
    _meldung('Gerätesperre aufgehoben');
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.dienste;
    final e = d.einstellungen;
    Widget kopf(String t) => Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 4),
      child: Text(
        t,
        style: const TextStyle(color: Farben.akzent, fontWeight: FontWeight.w600),
      ),
    );
    return Scaffold(
      appBar: AppBar(title: const Text('Einstellungen')),
      body: ListView(
        children: [
          kopf('Station'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: SegmentedButton<Station>(
              segments: [for (final s in Station.values) ButtonSegment(value: s, label: Text(s.text))],
              selected: {e.station ?? Station.kueche},
              showSelectedIcon: false,
              onSelectionChanged: (w) async {
                await e.stationSetzen(w.first);
                widget.stationGeaendert?.call(w.first);
                setState(() {});
              },
            ),
          ),
          kopf('Verbindung'),
          ListTile(
            title: const Text('Server'),
            subtitle: Text(e.serverUrl),
            onTap: () async {
              final u = await _text('Server', e.serverUrl);
              if (u != null && u.startsWith('http')) {
                await e.serverUrlSetzen(u);
                setState(() {});
              }
            },
          ),
          if (widget.abmelden != null)
            ListTile(
              title: const Text('Abmelden'),
              subtitle: const Text('Token löschen und Anmeldemaske zeigen'),
              onTap: () async {
                await e.tokenSetzen(null);
                if (!context.mounted) return;
                Navigator.of(context).pop();
                widget.abmelden!();
              },
            ),
          kopf('Benachrichtigungen'),
          SwitchListTile(
            title: const Text('Ton aktiviert'),
            subtitle: const Text('Benachrichtigungston bei neuer Bestellung'),
            value: e.ton,
            onChanged: (an) async {
              await e.tonSetzen(an);
              setState(() {});
            },
          ),
          kopf('Kiosk'),
          FutureBuilder(
            future: d.geraet.sperre(),
            builder: (context, s) => s.data?.besitzer ?? false
                ? const SizedBox.shrink() // die Sperre legt den Startbildschirm fest
                : SwitchListTile(
                    title: const Text('Als Startbildschirm verwenden'),
                    subtitle: const Text(
                      'Home-Taste führt zur Anzeige. Android fragt beim nächsten Druck auf «Home» einmal nach – «Immer» wählen.',
                    ),
                    value: e.alsStart,
                    onChanged: (an) async {
                      await e.alsStartSetzen(an);
                      await d.geraet.alsStartbildschirm(an);
                      setState(() {});
                    },
                  ),
          ),
          FutureBuilder(
            future: d.geraet.sperre(),
            builder: (context, s) {
              final besitzer = s.data?.besitzer ?? false;
              return ListTile(
                title: const Text('Gerätesperre'),
                subtitle: Text(
                  besitzer
                      ? 'Aktiv: nur diese App, keine Statusleiste, Updates ohne Rückfrage. Antippen zum Aufheben.'
                      : 'Nicht eingerichtet – per adb: dpm set-device-owner ch.fwvraura.kitchendisplay/.KioskAdmin',
                ),
                onTap: besitzer ? _sperreAufheben : null,
              );
            },
          ),
          ListTile(
            title: const Text('Ausgangs-Code für den Kioskmodus'),
            subtitle: const Text('Code zum Öffnen der Einstellungen (Logo 3 s gedrückt halten)'),
            onTap: () async {
              final c = await _text('Neuer Code (mindestens 4 Ziffern)', '', ziffern: true);
              if (c == null) return;
              if (c.length < 4) {
                _meldung('Mindestens 4 Ziffern');
                return;
              }
              await e.codeSetzen(c);
              _meldung('Code geändert');
            },
          ),
          ListTile(
            title: const Text('Nach Update suchen'),
            subtitle: Text('Version ${d.version ?? '?'}'),
            onTap: () async {
              final v = await d.updateSuche?.call();
              _meldung(
                v == null
                    ? 'Die App ist aktuell.'
                    : 'Neue Version ${v.version} – oben in der Anzeige antippen.',
              );
            },
          ),
          ListTile(
            title: const Text('App beenden'),
            subtitle: const Text(
              'Kioskmodus verlassen, z. B. für WLAN-Einstellungen. Startet beim nächsten Geräte-Neustart '
              'oder beim Öffnen der App wieder gesperrt.',
            ),
            onTap: d.geraet.beenden,
          ),
        ],
      ),
    );
  }
}
