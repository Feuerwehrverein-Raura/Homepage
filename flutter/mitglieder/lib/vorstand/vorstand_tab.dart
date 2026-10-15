// Reiter "Vorstand" - fuer Vorstandsmitglieder an Stelle von "Organisator".
// Oben die Bereiche als Reiter (Anlaesse, Antraege, Mitglieder, Beitraege,
// Nachricht, E-Mail, Audit, Geraete; Paket fwv_vorstand), darunter der
// Bereich. Die Anlaesse sind die Organisator-Verwaltung fuer alle Anlaesse.
//
// Eine angetippte Vorstand-Mitteilung ([Dienste.pushZiel]) waehlt den
// passenden Bereich (z.B. Antraege bei einem neuen Mitgliedschaftsantrag).

import 'package:fwv_anlass/fwv_anlass.dart' show reiterAufRot;
import 'package:fwv_vorstand/fwv_vorstand.dart';
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';
import '../push/push_dienst.dart';

class VorstandTab extends StatefulWidget {
  const VorstandTab({super.key, required this.dienste});

  final Dienste dienste;

  @override
  State<VorstandTab> createState() => _VorstandTabState();
}

class _VorstandTabState extends State<VorstandTab> with SingleTickerProviderStateMixin {
  late final TabController _reiter;

  @override
  void initState() {
    super.initState();
    // Nur Vorstand-Mitteilungen; alles andere erledigt die Hauptseite.
    final ziel = switch (widget.dienste.pushZiel.value) {
      final VorstandZiel z => z,
      _ => null,
    };
    _reiter = TabController(
      length: vorstandBereiche.length,
      vsync: this,
      initialIndex: vorstandBereichIndex(ziel?.bereich) ?? 0,
    );
    if (ziel != null) _erledigt();
    widget.dienste.pushZiel.addListener(_pushZiel);
  }

  @override
  void dispose() {
    widget.dienste.pushZiel.removeListener(_pushZiel);
    _reiter.dispose();
    super.dispose();
  }

  void _pushZiel() {
    final ziel = widget.dienste.pushZiel.value;
    if (ziel is! VorstandZiel || !mounted) return;
    final i = vorstandBereichIndex(ziel.bereich);
    if (i != null) _reiter.animateTo(i);
    _erledigt();
  }

  /// Ziel abgearbeitet - nach diesem Bild zuruecksetzen, damit auch die
  /// Hauptseite es vorher noch gesehen hat.
  void _erledigt() => WidgetsBinding.instance.addPostFrameCallback((_) {
    widget.dienste.pushZiel.value = null;
  });

  @override
  Widget build(BuildContext context) {
    final d = widget.dienste.vorstand;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Vorstand'),
        bottom: reiterAufRot(
          controller: _reiter,
          tabs: [for (final b in vorstandBereiche) Tab(text: b.titel)],
        ),
      ),
      body: TabBarView(
        controller: _reiter,
        children: [for (final b in vorstandBereiche) b.bauen(d)],
      ),
    );
  }
}
