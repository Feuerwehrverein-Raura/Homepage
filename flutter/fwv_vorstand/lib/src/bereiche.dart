// Die Bereiche im Reiter "Vorstand", in dieser Reihenfolge. Jeder Bereich ist
// eine eigene Ansicht (lib/src/ui/*_ansicht.dart) ohne eigene Titelleiste -
// der Reiter zeigt sie unter seiner Leiste.

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:material_ui/material_ui.dart';

import 'dienste.dart';
import 'ui/antraege_ansicht.dart';
import 'ui/audit_ansicht.dart';
import 'ui/beitraege_ansicht.dart';
import 'ui/mitglieder_ansicht.dart';
import 'ui/nachricht_ansicht.dart';

class VorstandBereich {
  const VorstandBereich({required this.titel, required this.symbol, required this.bauen});

  final String titel;
  final IconData symbol;
  final Widget Function(VorstandDienste d) bauen;
}

final vorstandBereiche = <VorstandBereich>[
  VorstandBereich(
    titel: 'Anlässe',
    symbol: Icons.event_outlined,
    bauen: (d) => VerwaltungsUebersichtScreen(verwaltung: d.anlaesse, eingebettet: true),
  ),
  VorstandBereich(
    titel: 'Anträge',
    symbol: Icons.how_to_reg_outlined,
    bauen: (d) => AntraegeAnsicht(dienste: d),
  ),
  VorstandBereich(
    titel: 'Mitglieder',
    symbol: Icons.groups_outlined,
    bauen: (d) => MitgliederAnsicht(dienste: d),
  ),
  VorstandBereich(
    titel: 'Beiträge',
    symbol: Icons.payments_outlined,
    bauen: (d) => BeitraegeAnsicht(dienste: d),
  ),
  VorstandBereich(
    titel: 'Nachricht',
    symbol: Icons.campaign_outlined,
    bauen: (d) => NachrichtAnsicht(dienste: d),
  ),
  VorstandBereich(
    titel: 'Audit',
    symbol: Icons.history_outlined,
    bauen: (d) => AuditAnsicht(dienste: d),
  ),
];
