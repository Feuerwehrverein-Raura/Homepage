// Verbindung des Vorstand-Bereichs zur Aussenwelt: Backend (ApiClient mit
// Erneuern) und Geraet (Teilen, Links, Fotos) - dieselbe Umgebung wie die
// Anlass-Verwaltung.

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:fwv_core/fwv_core.dart';

import 'antraege/antraege_dienst.dart';
import 'audit/audit_dienst.dart';

/// Gruppen, die den Vorstand-Bereich sehen (Gross/klein egal). Dieselbe Regel
/// prueft das Backend (requireRole('vorstand', 'admin')).
const vorstandGruppen = ['Vorstand', 'admin'];

/// Gehoert die Anmeldung zum Vorstand? Nur Mitglieder-Konten.
bool istVorstand(Sitzung? sitzung) =>
    sitzung?.kontotyp == Kontotyp.mitglied && sitzung!.hatGruppe(vorstandGruppen);

class VorstandDienste {
  const VorstandDienste({required this.api, required this.anlaesse, required this.umgebung});

  /// api.fwv-raura.ch mit dem persoenlichen Token (erneuert sich selbst).
  final ApiClient api;

  /// Anlass-Verwaltung fuer alle Anlaesse (Backend liefert dem Vorstand
  /// in events/organisator-uebersicht alles Aktuelle).
  final AnlassVerwaltung anlaesse;

  /// Teilen, Links, Fotos - wie in der Anlass-Verwaltung.
  final VerwaltungsUmgebung umgebung;

  /// Mitgliedschaftsantraege (GET/POST member-registrations).
  AntraegeDienst get antraege => AntraegeDienst(api);

  /// Audit-Log (GET audit).
  AuditDienst get audit => AuditDienst(api);
}
