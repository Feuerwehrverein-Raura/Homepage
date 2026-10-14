/// Vorstand-Bereich der Mitglieder-App: was bisher vorstand.html,
/// vorstand-android und vorstand-desktop konnten (Checkliste
/// docs/vorstand-funktionen.md). Vorstandsmitglieder sehen den Reiter
/// "Vorstand" statt "Organisator"; die Anlaesse darin sind die
/// Anlass-Verwaltung aus fwv_anlass fuer alle Anlaesse.
///
/// Die Verbindung zum Backend steckt nur in [VorstandDienste]. Wer Vorstand
/// ist, entscheidet das Backend (Gruppe Vorstand/admin, Phase 0) - die App
/// blendet nur ein und aus ([istVorstand]).
library;

export 'src/antraege/antraege_dienst.dart';
export 'src/antraege/antrag.dart';
export 'src/audit/audit_dienst.dart';
export 'src/audit/audit_eintrag.dart';
export 'src/bereiche.dart';
export 'src/dienste.dart';
export 'src/ui/antraege_ansicht.dart';
export 'src/ui/antrag_screen.dart';
export 'src/ui/audit_ansicht.dart';
export 'src/ui/beitraege_ansicht.dart';
export 'src/ui/mitglieder_ansicht.dart';
export 'src/ui/nachricht_ansicht.dart';
