// Verbindung des Vorstand-Bereichs zur Aussenwelt: Backend (ApiClient mit
// Erneuern) und Geraet (Teilen, Links, Fotos) - dieselbe Umgebung wie die
// Anlass-Verwaltung.

import 'dart:typed_data';

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:fwv_core/fwv_core.dart';

import 'antraege/antraege_dienst.dart';
import 'audit/audit_dienst.dart';
import 'email/mailcow_dienst.dart';
import 'geraete/app_geraete.dart';
import 'geraete/kassen_geraete.dart';
import 'geplant/geplante_auftraege.dart';
import 'mitglieder/export.dart';
import 'mitglieder/mitglieder_verwaltung.dart';
import 'mitglieder/zugangs_dokumente.dart';
import 'push_dienst.dart';
import 'ui/beitraege/beitraege_daten.dart';
import 'versand/versand_dienst.dart';

/// Gruppen, die den Vorstand-Bereich sehen (Gross/klein egal). Dieselbe Regel
/// prueft das Backend (requireRole('vorstand', 'admin')).
const vorstandGruppen = ['Vorstand', 'admin'];

/// Gehoert die Anmeldung zum Vorstand? Nur Mitglieder-Konten.
bool istVorstand(Sitzung? sitzung) =>
    sitzung?.kontotyp == Kontotyp.mitglied && sitzung!.hatGruppe(vorstandGruppen);

class VorstandDienste {
  const VorstandDienste({
    required this.api,
    required this.anlaesse,
    required this.umgebung,
    this.fotoVerkleinern = fotoVerkleinernImHintergrund,
  });

  /// api.fwv-raura.ch mit dem persoenlichen Token (erneuert sich selbst).
  final ApiClient api;

  /// Anlass-Verwaltung fuer alle Anlaesse mit dem [VorstandZugang] (Backend
  /// liefert dem Vorstand in events/organisator-uebersicht alles Aktuelle,
  /// auf Wunsch mit den vergangenen Anlaessen der letzten 24 Monate;
  /// dazu anlegen, loeschen, Vorschlaege, Organisator zuweisen).
  final AnlassVerwaltung anlaesse;

  /// Teilen, Links, Fotos - wie in der Anlass-Verwaltung.
  final VerwaltungsUmgebung umgebung;

  /// Mitgliedschaftsantraege (GET/POST member-registrations).
  AntraegeDienst get antraege => AntraegeDienst(api);

  /// Audit-Log (GET audit).
  AuditDienst get audit => AuditDienst(api);

  /// Profilfotos vor dem Hochladen verkleinern (1024 px, JPEG); in Tests
  /// ersetzbar.
  final Future<Uint8List> Function(Uint8List roh) fotoVerkleinern;

  /// Mitglieder, Kennzahlen, Passwoerter, Cloud-Gruppen, Benachrichtigen.
  MitgliederVerwaltung get mitglieder =>
      MitgliederVerwaltung(api, fotoVerkleinern: fotoVerkleinern);

  /// CSV-Export und Telefonliste (api-members).
  MitgliederExportDienst get export => MitgliederExportDienst(api);

  /// Mitgliederbeitraege (api-accounting).
  BeitraegeDienst get beitraege => BeitraegeDienst(api);

  /// App-Push an alle (api-events).
  PushAnAlleDienst get push => PushAnAlleDienst(api);

  /// E-Mail, Brief, Verlauf und Pingen (api-dispatch). Den PDF-Waehler fuer
  /// den Massen-PDF-Versand liefert [umgebung] (`pdfWaehlen`); ohne ihn
  /// zeigt die Pingen-Ansicht nur einen Hinweis.
  VersandDienst get versand => VersandDienst(api);

  /// Postfaecher, Aliase, Speicher (api-dispatch /mailcow) und Zustellliste
  /// (api-members).
  MailcowDienst get mailcow => MailcowDienst(api);

  /// Geplante Auftraege (api-dispatch /scheduled-jobs), z.B. Beitragsversand.
  GeplanteAuftraegeDienst get geplant => GeplanteAuftraegeDienst(api);

  /// Login-Datenblatt, Anmeldebon und App-QR eines Mitglieds (api-members).
  ZugangsDokumenteDienst get zugangsDokumente => ZugangsDokumenteDienst(api);

  /// Geraete und App-Versionen der Mitglieder (GET vorstand/app-geraete).
  AppGeraeteDienst get appGeraete => AppGeraeteDienst(api);

  /// Kassen-Geraete freigeben/sperren und Kassen-Anmeldebon (api-members,
  /// weitergeleitet ans order-backend).
  KassenGeraeteDienst get kassenGeraete => KassenGeraeteDienst(api);
}

/// Vorstand-Seite der Website - fuer alles, was die App noch nicht kann.
final vorstandWebseite = Uri.parse('https://www.fwv-raura.ch/vorstand.html');
