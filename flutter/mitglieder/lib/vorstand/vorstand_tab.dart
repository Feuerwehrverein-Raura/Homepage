// Reiter "Vorstand" - fuer Vorstandsmitglieder an Stelle von "Organisator".
// Oben die Bereiche als Reiter (Anlaesse, Antraege, Mitglieder, Beitraege,
// Nachricht, Audit; Paket fwv_vorstand), darunter der Bereich. Die
// Anlaesse sind die Organisator-Verwaltung fuer alle Anlaesse.

import 'package:fwv_anlass/fwv_anlass.dart' show reiterAufRot;
import 'package:fwv_vorstand/fwv_vorstand.dart';
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';

class VorstandTab extends StatelessWidget {
  const VorstandTab({super.key, required this.dienste});

  final Dienste dienste;

  @override
  Widget build(BuildContext context) {
    final d = dienste.vorstand;
    return DefaultTabController(
      length: vorstandBereiche.length,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Vorstand'),
          bottom: reiterAufRot(tabs: [for (final b in vorstandBereiche) Tab(text: b.titel)]),
        ),
        body: TabBarView(
          children: [for (final b in vorstandBereiche) b.bauen(d)],
        ),
      ),
    );
  }
}
