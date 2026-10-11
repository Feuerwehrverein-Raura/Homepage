// Ein Lagerort (Kiste, Regal): was drin ist und wie viel. Antippen oeffnet
// den Artikel.

import 'package:fwv_anlass/fwv_anlass.dart' show LadeAnsicht, LadeAnsichtState;
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
          istLeer: (l) => l.posten.isEmpty,
          leer: 'Hier ist nichts eingeräumt.',
          bauen: (context, inhalt, _) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.only(bottom: 24),
            children: [
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
