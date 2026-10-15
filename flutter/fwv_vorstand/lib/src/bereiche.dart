// Die Bereiche im Reiter "Vorstand", in dieser Reihenfolge. Jeder Bereich ist
// eine eigene Ansicht (lib/src/ui/*_ansicht.dart) ohne eigene Titelleiste -
// der Reiter zeigt sie unter seiner Leiste.

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:material_ui/material_ui.dart';

import 'dienste.dart';
import 'ui/antraege_ansicht.dart';
import 'ui/audit_ansicht.dart';
import 'ui/beitraege_ansicht.dart';
import 'ui/email_ansicht.dart';
import 'ui/geraete_ansicht.dart';
import 'ui/mitglieder_ansicht.dart';
import 'ui/nachricht_ansicht.dart';

class VorstandBereich {
  const VorstandBereich({
    required this.schluessel,
    required this.titel,
    required this.symbol,
    required this.bauen,
  });

  /// Kennung fuer Push-Mitteilungen (`data.bereich`, siehe
  /// docker/backend-members/src/vorstand-melder.js).
  final String schluessel;
  final String titel;
  final IconData symbol;
  final Widget Function(VorstandDienste d) bauen;
}

final vorstandBereiche = <VorstandBereich>[
  VorstandBereich(
    schluessel: 'anlaesse',
    titel: 'Anlässe',
    symbol: Icons.event_outlined,
    bauen: (d) => VerwaltungsUebersichtScreen(verwaltung: d.anlaesse, eingebettet: true),
  ),
  VorstandBereich(
    schluessel: 'antraege',
    titel: 'Anträge',
    symbol: Icons.how_to_reg_outlined,
    bauen: (d) => AntraegeAnsicht(dienste: d),
  ),
  VorstandBereich(
    schluessel: 'mitglieder',
    titel: 'Mitglieder',
    symbol: Icons.groups_outlined,
    bauen: (d) => MitgliederAnsicht(dienste: d),
  ),
  VorstandBereich(
    schluessel: 'beitraege',
    titel: 'Beiträge',
    symbol: Icons.payments_outlined,
    bauen: (d) => BeitraegeAnsicht(dienste: d),
  ),
  VorstandBereich(
    schluessel: 'nachricht',
    titel: 'Nachricht',
    symbol: Icons.campaign_outlined,
    bauen: (d) => NachrichtAnsicht(dienste: d),
  ),
  VorstandBereich(
    schluessel: 'email',
    titel: 'E-Mail',
    symbol: Icons.mail_outline,
    bauen: (d) => EmailAnsicht(dienste: d),
  ),
  VorstandBereich(
    schluessel: 'audit',
    titel: 'Audit',
    symbol: Icons.history_outlined,
    bauen: (d) => AuditAnsicht(dienste: d),
  ),
  // Welche App-Version auf welchem Geraet (Support, Update-Hinweise).
  VorstandBereich(
    schluessel: 'geraete',
    titel: 'Geräte',
    symbol: Icons.devices_outlined,
    bauen: (d) => GeraeteAnsicht(dienste: d),
  ),
];

/// Stelle des Bereichs mit [schluessel] in [vorstandBereiche], oder null.
int? vorstandBereichIndex(String? schluessel) {
  if (schluessel == null) return null;
  final i = vorstandBereiche.indexWhere((b) => b.schluessel == schluessel);
  return i < 0 ? null : i;
}
