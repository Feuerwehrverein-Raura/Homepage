// Ein Eintrag im Audit-Log (GET /audit, Tabelle audit_log, SELECT *).
//
// Geschrieben wird er an mehreren Stellen:
// - api-members logAudit(): action, entity_type, email, ip_address und
//   new_values = { email, ...details }
// - Datenbank-Trigger auf members (Migration 016): MEMBER_CREATE/UPDATE/DELETE
//   mit old_values/new_values (ganze Zeile), email 'db-trigger'
// - api-events: EVENT_REGISTRATION (new_values), ARBEITSPLAN_REMINDER_SENT,
//   REMINDERS_SENT (details)
// Darum werden details, old_values und new_values alle gelesen.

import 'dart:convert';

import 'package:fwv_anlass/fwv_anlass.dart' show HinweisArt;
import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';
import '../zeit.dart';

class AuditEintrag {
  const AuditEintrag({
    required this.id,
    required this.aktion,
    this.objektTyp,
    this.objektId,
    this.email,
    this.ip,
    this.zeit,
    this.details,
    this.vorher,
    this.nachher,
  });

  factory AuditEintrag.ausJson(Map<String, dynamic> j) => AuditEintrag(
    id: jsonText(j['id']) ?? '',
    aktion: jsonText(j['action']) ?? '',
    objektTyp: jsonText(j['entity_type']),
    objektId: jsonText(j['entity_id']),
    email: jsonText(j['email']),
    ip: jsonText(j['ip_address']),
    zeit: utcZeitpunkt(j['created_at']),
    details: _objekt(j['details']),
    vorher: _objekt(j['old_values']),
    nachher: _objekt(j['new_values']),
  );

  final String id;

  /// Code wie LOGIN_SUCCESS; lesbar ueber [aktionInfo].
  final String aktion;
  final String? objektTyp;
  final String? objektId;

  /// Wer es war (E-Mail, 'system' oder 'db-trigger').
  final String? email;
  final String? ip;
  final DateTime? zeit;
  final Map<String, dynamic>? details;
  final Map<String, dynamic>? vorher;
  final Map<String, dynamic>? nachher;

  AuditAktion get aktionInfo => auditAktion(aktion);

  /// details und new_values zusammen (wie vorstand.html), ohne leere Werte.
  Map<String, dynamic> get angaben => {...?details, ...?nachher};

  /// Eine kurze Zeile zum Eintrag: wen oder was er betrifft.
  String? get kurztext {
    final a = angaben;
    String? t(String k) => jsonText(a[k]);
    final name = t('member_name') ?? t('name') ?? _name(a);
    final teile = <String>[
      ?name,
      ?t('eventTitle'),
      ?t('title'),
      ?t('gruppe'),
      ?t('target_email'),
      if (t('reason') case final r?) 'Grund: $r',
      if (t('error') case final e?) 'Fehler: $e',
      ?t('message'),
    ];
    return teile.isEmpty ? null : teile.join(' · ');
  }

  /// Bei Aenderungen mit Vorher und Nachher (Trigger auf members): nur die
  /// Felder, die sich geaendert haben, als (Feld, vorher, nachher).
  List<(String, Object?, Object?)> get aenderungen {
    final v = vorher;
    final n = nachher;
    if (v == null || n == null) return const [];
    return [
      for (final k in {...v.keys, ...n.keys})
        if (k != 'updated_at' && jsonEncode(v[k]) != jsonEncode(n[k])) (k, v[k], n[k]),
    ];
  }
}

String? _name(Map<String, dynamic> a) {
  final t = [?jsonText(a['vorname']), ?jsonText(a['nachname'])].join(' ');
  return t.isEmpty ? null : t;
}

/// JSONB kommt als Objekt; vorsichtshalber auch als Text.
Map<String, dynamic>? _objekt(Object? wert) {
  Object? w = wert;
  if (w is String) {
    try {
      w = jsonDecode(w);
    } on FormatException {
      return {'text': wert};
    }
  }
  return w is Map ? Map<String, dynamic>.from(w) : null;
}

/// Gruppe einer Aktion - fuer das Symbol und den Filter.
enum AuditGruppe {
  anmeldung('Anmeldung und Zugänge', Icons.login),
  mitglied('Mitglieder', Icons.person_outline),
  antrag('Anträge', Icons.how_to_reg_outlined),
  anlass('Anlässe und Versand', Icons.event_outlined),
  system('System', Icons.settings_outlined),
  frueher('Ältere Einträge', Icons.history);

  const AuditGruppe(this.titel, this.symbol);

  final String titel;
  final IconData symbol;
}

/// Lesbarer Name, Farbe und Gruppe zu einem Aktions-Code.
class AuditAktion {
  const AuditAktion(this.code, this.text, this.gruppe, [this.art = HinweisArt.neutral]);

  final String code;
  final String text;
  final AuditGruppe gruppe;
  final HinweisArt art;
}

/// Alle Aktionen, die das Backend heute schreibt (gesucht in
/// docker/backend-*/src und den Migrationen), plus die aelteren Namen, die
/// vorstand.html noch kennt und die in alten Eintraegen stehen koennen.
/// Reihenfolge = Reihenfolge im Filter.
const auditAktionen = <AuditAktion>[
  // Anmeldung und Zugaenge
  AuditAktion('LOGIN_SUCCESS', 'Anmeldung', AuditGruppe.anmeldung, HinweisArt.gut),
  AuditAktion(
    'LOGIN_FAILED',
    'Anmeldung fehlgeschlagen',
    AuditGruppe.anmeldung,
    HinweisArt.schlecht,
  ),
  AuditAktion('LOGIN_ERROR', 'Anmeldefehler', AuditGruppe.anmeldung, HinweisArt.schlecht),
  AuditAktion('VORSTAND_REFRESH_SUCCESS', 'Sitzung erneuert', AuditGruppe.anmeldung),
  AuditAktion(
    'VORSTAND_REFRESH_FAILED',
    'Erneuern fehlgeschlagen',
    AuditGruppe.anmeldung,
    HinweisArt.schlecht,
  ),
  AuditAktion('QR_LOGIN_SUCCESS', 'QR-Anmeldung Vorstand', AuditGruppe.anmeldung, HinweisArt.gut),
  AuditAktion(
    'QR_LOGIN_FAILED',
    'QR-Anmeldung Vorstand fehlgeschlagen',
    AuditGruppe.anmeldung,
    HinweisArt.schlecht,
  ),
  AuditAktion('APP_TOKEN_CREATED', 'App-Zugang erstellt', AuditGruppe.anmeldung),
  AuditAktion(
    'APP_TOKEN_REVOKED',
    'App-Zugang widerrufen',
    AuditGruppe.anmeldung,
    HinweisArt.warnung,
  ),
  AuditAktion(
    'MEMBER_QR_LOGIN_SUCCESS',
    'QR-Anmeldung Mitglied',
    AuditGruppe.anmeldung,
    HinweisArt.gut,
  ),
  AuditAktion(
    'MEMBER_QR_LOGIN_FAILED',
    'QR-Anmeldung Mitglied fehlgeschlagen',
    AuditGruppe.anmeldung,
    HinweisArt.schlecht,
  ),
  AuditAktion('MEMBER_CODE_LOGIN_SUCCESS', 'Code-Anmeldung', AuditGruppe.anmeldung, HinweisArt.gut),
  AuditAktion(
    'MEMBER_CODE_LOGIN_FAILED',
    'Code-Anmeldung fehlgeschlagen',
    AuditGruppe.anmeldung,
    HinweisArt.schlecht,
  ),
  AuditAktion('MEMBER_APP_TOKEN_CREATED', 'App-QR-Code erstellt', AuditGruppe.anmeldung),
  AuditAktion(
    'MEMBER_APP_TOKEN_REVOKED',
    'App-QR-Code widerrufen',
    AuditGruppe.anmeldung,
    HinweisArt.warnung,
  ),
  AuditAktion('MEMBER_RESET_REQUESTED', 'Passwort vergessen', AuditGruppe.anmeldung),
  AuditAktion(
    'MEMBER_RESET_SUCCESS',
    'Passwort neu gesetzt',
    AuditGruppe.anmeldung,
    HinweisArt.gut,
  ),
  AuditAktion('MEMBER_PASSWORD_SET', 'Passwort gesetzt', AuditGruppe.anmeldung),
  AuditAktion(
    'MEMBER_PASSWORD_RESET',
    'Temporäres Passwort',
    AuditGruppe.anmeldung,
    HinweisArt.warnung,
  ),
  AuditAktion(
    'FUNCTION_EMAIL_PASSWORD_CHANGED',
    'Postfach-Passwort geändert',
    AuditGruppe.anmeldung,
    HinweisArt.warnung,
  ),
  // Mitglieder
  AuditAktion('MEMBER_CREATE', 'Mitglied erstellt', AuditGruppe.mitglied, HinweisArt.gut),
  AuditAktion('MEMBER_UPDATE', 'Mitglied geändert', AuditGruppe.mitglied),
  AuditAktion('member_self_update', 'Eigene Daten geändert', AuditGruppe.mitglied),
  AuditAktion(
    'member_austritt_request',
    'Austritt beantragt',
    AuditGruppe.mitglied,
    HinweisArt.warnung,
  ),
  AuditAktion(
    'MEMBER_DELETE_REQUESTED',
    'Löschung beantragt',
    AuditGruppe.mitglied,
    HinweisArt.warnung,
  ),
  AuditAktion(
    'MEMBER_DELETE_EXECUTED',
    'Löschung ausgeführt',
    AuditGruppe.mitglied,
    HinweisArt.schlecht,
  ),
  AuditAktion('MEMBER_DELETE', 'Mitglied gelöscht', AuditGruppe.mitglied, HinweisArt.schlecht),
  AuditAktion('MEMBER_PHOTO_UPDATE', 'Foto geändert', AuditGruppe.mitglied),
  AuditAktion('MEMBER_PHOTO_DELETE', 'Foto gelöscht', AuditGruppe.mitglied, HinweisArt.warnung),
  AuditAktion('MEMBER_DATENBLATT_GENERATED', 'Datenblatt erstellt', AuditGruppe.mitglied),
  AuditAktion('MEMBER_ANMELDEBON_GEDRUCKT', 'Anmeldebon gedruckt', AuditGruppe.mitglied),
  AuditAktion(
    'MEMBER_GRUPPE_AUFGENOMMEN',
    'In Gruppe aufgenommen',
    AuditGruppe.mitglied,
    HinweisArt.gut,
  ),
  AuditAktion(
    'MEMBER_GRUPPE_ENTFERNT',
    'Aus Gruppe entfernt',
    AuditGruppe.mitglied,
    HinweisArt.warnung,
  ),
  AuditAktion('MEMBER_VORSTAND_GROUP', 'Vorstandsgruppe geändert', AuditGruppe.mitglied),
  AuditAktion('MEMBER_SOCIAL_MEDIA_GROUP', 'Social-Media-Gruppe geändert', AuditGruppe.mitglied),
  AuditAktion('MEMBER_NEXTCLOUD_ADMIN', 'Nextcloud-Admin geändert', AuditGruppe.mitglied),
  // Antraege
  AuditAktion('REGISTRATION_APPROVED', 'Antrag genehmigt', AuditGruppe.antrag, HinweisArt.gut),
  AuditAktion('REGISTRATION_REJECTED', 'Antrag abgelehnt', AuditGruppe.antrag, HinweisArt.schlecht),
  // Anlaesse und Versand
  AuditAktion('EVENT_REGISTRATION', 'Anlass-Anmeldung', AuditGruppe.anlass, HinweisArt.gut),
  AuditAktion('ARBEITSPLAN_REMINDER_SENT', 'Arbeitsplan versandt', AuditGruppe.anlass),
  AuditAktion('REMINDERS_SENT', 'Schicht-Erinnerungen versandt', AuditGruppe.anlass),
  // System
  AuditAktion('AUDIT_VIEW', 'Audit angesehen', AuditGruppe.system),
  AuditAktion('SYSTEM_START', 'System', AuditGruppe.system),
  // Aeltere Namen (schreibt das Backend heute nicht mehr)
  AuditAktion('EVENT_CREATE', 'Anlass erstellt', AuditGruppe.frueher, HinweisArt.gut),
  AuditAktion('EVENT_UPDATE', 'Anlass geändert', AuditGruppe.frueher),
  AuditAktion('EVENT_DELETE', 'Anlass gelöscht', AuditGruppe.frueher, HinweisArt.schlecht),
  AuditAktion('DISPATCH_EMAIL', 'E-Mail-Versand', AuditGruppe.frueher),
  AuditAktion('DISPATCH_LETTER', 'Briefversand', AuditGruppe.frueher),
  AuditAktion('PINGEN_SEND', 'Brief über Pingen', AuditGruppe.frueher),
  AuditAktion(
    'REGISTRATION_APPROVE',
    'Antrag genehmigt (alt)',
    AuditGruppe.frueher,
    HinweisArt.gut,
  ),
  AuditAktion(
    'REGISTRATION_REJECT',
    'Antrag abgelehnt (alt)',
    AuditGruppe.frueher,
    HinweisArt.schlecht,
  ),
];

final _nachCode = {for (final a in auditAktionen) a.code: a};

/// Info zu einem Code; Unbekanntes zeigt den Code selbst, Fehlschlaege rot.
AuditAktion auditAktion(String code) =>
    _nachCode[code] ??
    AuditAktion(
      code,
      code,
      AuditGruppe.system,
      code.contains('FAILED') || code.contains('ERROR') ? HinweisArt.schlecht : HinweisArt.neutral,
    );

/// "14.10.2026 09:05"
String zeitText(DateTime z) =>
    '${schweizerDatum(z)} ${z.hour.toString().padLeft(2, '0')}:${z.minute.toString().padLeft(2, '0')}';

/// JSON eingerueckt fuer die Anzeige.
String schoenesJson(Object? wert) => const JsonEncoder.withIndent('  ').convert(wert);
