// Listen der Ausleihe:
//  - MeineAusleihenScreen (jedes Mitglied): eigene Ausleihen, unten
//    "Ausleihen"
//  - AusleihenVerwaltenScreen (Lager): Kommend · Ausgegeben · Ueberfaellig ·
//    Erledigt, unten "Fuer Externe"

import 'package:fwv_anlass/fwv_anlass.dart' show LadeAnsicht, LadeAnsichtState, meldung;
import 'package:material_ui/material_ui.dart';

import '../modelle.dart';
import '../zugang.dart';
import 'ausleihe_neu_screen.dart';
import 'ausleihe_screen.dart';
import 'bausteine.dart';

class MeineAusleihenScreen extends StatefulWidget {
  const MeineAusleihenScreen({super.key, required this.ausleihen});

  final Ausleihen ausleihen;

  @override
  State<MeineAusleihenScreen> createState() => _MeineAusleihenScreenState();
}

class _MeineAusleihenScreenState extends State<MeineAusleihenScreen> {
  final _lader = GlobalKey<LadeAnsichtState<List<Ausleihe>>>();

  Future<void> _neu() async {
    final a = await ausleiheNeuOeffnen(context, widget.ausleihen);
    if (a == null || !mounted) return;
    meldung(context, 'Reserviert — das Lager ist informiert.');
    await _lader.currentState?.neuLaden();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Meine Ausleihen')),
      body: LadeAnsicht<List<Ausleihe>>(
        key: _lader,
        laden: widget.ausleihen.zugang.meine,
        istLeer: (l) => l.isEmpty,
        leer:
            'Du hast noch nichts ausgeliehen.\n\nFestbänke, Geschirr oder ganze Kisten '
            'aus dem Vereinslager kannst du hier selbst reservieren.',
        bauen: (context, liste, _) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(top: 6, bottom: 96),
          children: [
            for (final a in liste)
              AusleiheKarte(
                ausleihe: a,
                onTap: () async {
                  if (await ausleiheOeffnen(context, widget.ausleihen, a.id)) {
                    await _lader.currentState?.neuLaden();
                  }
                },
              ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        key: const Key('ausleihen-neu'),
        onPressed: _neu,
        icon: const Icon(Icons.add),
        label: const Text('Ausleihen'),
      ),
    );
  }
}

class AusleihenVerwaltenScreen extends StatefulWidget {
  const AusleihenVerwaltenScreen({super.key, required this.ausleihen});

  final Ausleihen ausleihen;

  @override
  State<AusleihenVerwaltenScreen> createState() => _AusleihenVerwaltenScreenState();
}

class _AusleihenVerwaltenScreenState extends State<AusleihenVerwaltenScreen> {
  final _lader = {
    for (final f in AusleiheFilter.values) f: GlobalKey<LadeAnsichtState<List<Ausleihe>>>(),
  };

  Future<void> _allesNeu() async {
    await Future.wait([for (final k in _lader.values) ?k.currentState?.neuLaden()]);
  }

  Future<void> _extern() async {
    final a = await ausleiheNeuOeffnen(context, widget.ausleihen, fuerExterne: true);
    if (a == null || !mounted) return;
    meldung(context, 'Ausleihe #${a.id} erfasst');
    await _allesNeu();
  }

  static const _leer = {
    AusleiheFilter.kommend: 'Keine Reservierungen.',
    AusleiheFilter.ausgegeben: 'Nichts ausgegeben.',
    AusleiheFilter.ueberfaellig: 'Nichts überfällig.',
    AusleiheFilter.erledigt: 'Noch nichts erledigt.',
  };

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: AusleiheFilter.values.length,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Ausleihen'),
          bottom: TabBar(
            labelPadding: const EdgeInsets.symmetric(horizontal: 4),
            tabs: [for (final f in AusleiheFilter.values) Tab(text: f.text)],
          ),
        ),
        body: TabBarView(
          children: [
            for (final f in AusleiheFilter.values)
              LadeAnsicht<List<Ausleihe>>(
                key: _lader[f],
                laden: () => widget.ausleihen.zugang.liste(f),
                istLeer: (l) => l.isEmpty,
                leer: _leer[f],
                bauen: (context, liste, _) => ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.only(top: 6, bottom: 96),
                  children: [
                    for (final a in liste)
                      AusleiheKarte(
                        ausleihe: a,
                        zeigeAusleiher: true,
                        onTap: () async {
                          if (await ausleiheOeffnen(context, widget.ausleihen, a.id)) {
                            await _allesNeu();
                          }
                        },
                      ),
                  ],
                ),
              ),
          ],
        ),
        floatingActionButton: FloatingActionButton.extended(
          key: const Key('ausleihe-extern'),
          onPressed: _extern,
          icon: const Icon(Icons.add),
          label: const Text('Für Externe'),
        ),
      ),
    );
  }
}
