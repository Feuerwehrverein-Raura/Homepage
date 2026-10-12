// Ein Lagerort (Kiste, Regal): was drin ist und wie viel. Antippen oeffnet
// den Artikel.

import 'package:fwv_anlass/fwv_anlass.dart'
    show LadeAnsicht, LadeAnsichtState, fehlerText, meldung, mitSystemleiste;
import 'package:material_ui/material_ui.dart';

import '../modelle.dart';
import '../zugang.dart';
import 'artikel_screen.dart';

class LagerortScreen extends StatefulWidget {
  const LagerortScreen({super.key, required this.lager, required this.lagerort});

  final Lager lager;
  final Lagerort lagerort;

  @override
  State<LagerortScreen> createState() => _LagerortScreenState();
}

class _LagerortScreenState extends State<LagerortScreen> {
  final _lader = GlobalKey<LadeAnsichtState<LagerortInhalt>>();
  bool _gebucht = false;

  /// Stand des Schalters "ganze Kiste ausleihbar" (null: wie geladen).
  bool? _ausleihbar;
  bool _laeuft = false;

  Future<void> _ausleihbarSetzen(bool neu) async {
    final vorher = _ausleihbar;
    setState(() {
      _ausleihbar = neu;
      _laeuft = true;
    });
    try {
      await widget.lager.zugang.lagerortAusleihbar(widget.lagerort.id, neu);
      _gebucht = true;
      if (mounted) {
        meldung(context, neu ? 'Die Kiste kann jetzt ausgeliehen werden' : 'Nicht mehr ausleihbar');
      }
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _ausleihbar = vorher);
      meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _laeuft = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope<bool>(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).pop(_gebucht);
      },
      child: Scaffold(
        appBar: AppBar(title: Text(widget.lagerort.name)),
        body: LadeAnsicht<LagerortInhalt>(
          key: _lader,
          laden: () => widget.lager.zugang.lagerort(widget.lagerort.id),
          bauen: (context, inhalt, _) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: mitSystemleiste(context, const EdgeInsets.only(bottom: 24)),
            children: [
              SwitchListTile(
                key: const Key('kiste-ausleihbar'),
                secondary: const Icon(Icons.handshake_outlined),
                title: const Text('Ganze Kiste ausleihbar'),
                subtitle: const Text('Mitglieder können sie samt Inhalt ausleihen'),
                value: _ausleihbar ?? inhalt.ausleihbar,
                onChanged: _laeuft ? null : _ausleihbarSetzen,
              ),
              if (inhalt.posten.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(24),
                  child: Text('Hier ist nichts eingeräumt.', textAlign: TextAlign.center),
                ),
              if (inhalt.beschreibung != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                  child: Text(inhalt.beschreibung!),
                ),
              for (final p in inhalt.posten)
                ListTile(
                  title: Text(p.name),
                  subtitle: Text([?p.kategorie, ?p.code, ?p.notiz].join(' · ')),
                  trailing: Text(
                    mengeMitEinheit(p.menge, p.einheit),
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  onTap: () async {
                    if (await artikelOeffnen(context, widget.lager, p.artikelId)) {
                      _gebucht = true;
                      await _lader.currentState?.neuLaden();
                    }
                  },
                ),
            ],
          ),
        ),
      ),
    );
  }
}
