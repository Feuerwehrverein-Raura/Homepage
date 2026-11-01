// Versand gegen api-dispatch (docker/backend-dispatch/src/index.js), alle
// Routen nur fuer den Vorstand:
//
// - GET  templates                      Vorlagen
// - POST email/bulk                     E-Mails; layout 'standard' -> das
//                                       Backend baut die HTML-Mail
// - POST dispatch/brief                 Brief-HTML (+ PDF-Vorschau) fuer EIN
//                                       Mitglied (nachricht-layout.js)
// - POST dispatch/send-post             diesen Brief an Pingen
// - GET  dispatch-log                   Versandverlauf
// - GET  pingen/account|stats|letters   Konto, Statistik, Briefe
// - GET  pingen/letters/:id/status      Status bei Pingen abfragen
// - POST pingen/send-bulk-pdf           ein PDF an ausgewaehlte Mitglieder
//
// Lange Laeufe werden in kleine Pakete geteilt: der ApiClient bricht nach
// 30 s ab, und ein abgebrochener Aufruf liefe auf dem Server weiter - ein
// zweiter Versuch schickte dann doppelt.

import 'dart:convert';
import 'dart:typed_data';

import 'package:fwv_core/fwv_core.dart';

import '../mitglieder/modelle.dart';
import '../zeit.dart';
import 'versand.dart';

/// Pakete fuer /email/bulk und /pingen/send-bulk-pdf (je ein Aufruf).
const versandPaket = 5;

/// Fortschritt: [fertig] von [gesamt].
typedef Fortschritt = void Function(int fertig, int gesamt);

/// Fehlgeschlagen: wer und warum.
typedef Fehlschlag = ({String name, String grund});

class VersandErgebnis {
  VersandErgebnis({required this.staging});

  final bool staging;
  var emails = 0;
  var emailsUebersprungen = 0;
  var briefe = 0;
  final fehler = <Fehlschlag>[];

  /// Versand abgebrochen (keine Verbindung) - der Rest ging nicht raus.
  var abgebrochen = false;
}

/// Brief fuer ein Mitglied, fertig fuer /dispatch/send-post.
class Brief {
  const Brief({
    required this.html,
    required this.rand,
    required this.empfaenger,
    required this.betreff,
    this.pdf,
  });

  factory Brief.ausJson(Map<String, dynamic> j) {
    final pdf = jsonText(j['pdf_base64']);
    return Brief(
      html: '${j['html'] ?? ''}',
      rand: j['pdf_margin'] is Map ? Map<String, dynamic>.from(j['pdf_margin'] as Map) : null,
      empfaenger: j['recipient'] is Map
          ? Map<String, dynamic>.from(j['recipient'] as Map)
          : const {},
      betreff: jsonText(j['subject']) ?? 'Brief',
      pdf: pdf == null ? null : base64Decode(pdf),
    );
  }

  final String html;
  final Map<String, dynamic>? rand;
  final Map<String, dynamic> empfaenger;
  final String betreff;
  final Uint8List? pdf;
}

class VersandDienst {
  const VersandDienst(this.api);

  final ApiClient api;

  Future<List<Vorlage>> vorlagen() async => jsonListe(await api.get('templates'), Vorlage.ausJson);

  /// Brief fuer [mitgliedId] als PDF (mit Pingen-Zonen) - fuer die Vorschau.
  Future<Uint8List> briefVorschau({
    required String mitgliedId,
    required String betreff,
    required String text,
    String? anlassId,
  }) async {
    final brief = await _brief(mitgliedId, betreff, text, vorschau: true, anlassId: anlassId);
    final pdf = brief.pdf;
    if (pdf == null) throw const ApiFehler('Der Server hat keine Vorschau geliefert.');
    return pdf;
  }

  Future<Brief> _brief(
    String id,
    String betreff,
    String text, {
    bool vorschau = false,
    String? anlassId,
  }) async {
    final j = await api.post(
      'dispatch/brief',
      daten: {
        'member_id': id,
        'subject': betreff.trim(),
        'body': text,
        if (anlassId != null) ...{'vorlage': 'einladung', 'event_id': anlassId},
        if (vorschau) ...{'vorschau': true, 'zonen': true},
      },
    );
    return Brief.ausJson(j is Map ? Map<String, dynamic>.from(j) : const {});
  }

  /// Schickt nach [plan]: erst die E-Mails (paketweise), dann die Briefe
  /// einzeln (Brief bauen, dann send-post). Fehler einzelner Empfaenger
  /// stehen im Ergebnis; ohne Verbindung bricht der Versand ab. Mit
  /// [anlassId] ist es eine Einladung: das Backend setzt sie ins
  /// Einladungs-Layout (einladung-layout.js, [text] ist die Einleitung) und
  /// haengt das PDF des Anlasses an (anlass-pdf.js).
  Future<VersandErgebnis> senden(
    Versandplan plan, {
    required String betreff,
    required String text,
    required bool staging,
    String? anlassId,
    Fortschritt? fortschritt,
  }) async {
    final ergebnis = VersandErgebnis(staging: staging);
    final gesamt = plan.email.length + plan.post.length;
    var fertig = 0;
    fortschritt?.call(0, gesamt);

    for (var i = 0; i < plan.email.length && !ergebnis.abgebrochen; i += versandPaket) {
      final paket = plan.email.skip(i).take(versandPaket).toList();
      try {
        final j = await api.post(
          'email/bulk',
          daten: {
            'member_ids': [for (final m in paket) m.id],
            'subject': betreff.trim(),
            'body': text,
            'layout': anlassId == null ? 'standard' : 'einladung',
            'event_id': ?anlassId,
            // Versandart E-Mail: auch an Mitglieder, die Post wuenschen.
            if (plan.art == Versandart.email) 'praeferenz_ignorieren': true,
          },
        );
        final antwort = j is Map ? j : const {};
        ergebnis.emails += jsonZahl(antwort['success']) ?? 0;
        ergebnis.emailsUebersprungen += jsonZahl(antwort['skipped']) ?? 0;
        final namen = {for (final m in paket) m.id: mitgliedName(m)};
        for (final r in antwort['results'] is List ? antwort['results'] as List : const []) {
          if (r is Map && r['success'] != true) {
            ergebnis.fehler.add((
              name: namen[jsonText(r['member_id'])] ?? 'E-Mail',
              grund: jsonText(r['error']) ?? 'unbekannt',
            ));
          }
        }
      } on Object catch (e) {
        _fehler(ergebnis, e, [for (final m in paket) mitgliedName(m)], 'E-Mail');
      }
      fertig += paket.length;
      fortschritt?.call(fertig, gesamt);
    }

    for (final m in plan.post) {
      if (ergebnis.abgebrochen) break;
      try {
        final brief = await _brief(m.id, betreff, text, anlassId: anlassId);
        await api.post(
          'dispatch/send-post',
          daten: {
            'html': brief.html,
            'recipient': brief.empfaenger,
            'member_id': m.id,
            'subject': brief.betreff,
            'staging': staging,
            'pdf_margin': ?brief.rand,
            'event_id': ?anlassId,
          },
        );
        ergebnis.briefe++;
      } on Object catch (e) {
        _fehler(ergebnis, e, [mitgliedName(m)], 'Brief');
      }
      fortschritt?.call(++fertig, gesamt);
    }
    return ergebnis;
  }

  void _fehler(VersandErgebnis e, Object f, List<String> namen, String kanal) {
    final grund = f is ApiFehler ? f.meldung : '$f';
    for (final n in namen) {
      e.fehler.add((name: n.isEmpty ? kanal : '$n ($kanal)', grund: grund));
    }
    if (f is ApiFehler && f.status == null) e.abgebrochen = true;
  }

  /// GET dispatch-log, neueste zuerst; [typ] email, pingen, ... oder null.
  Future<List<VersandEintrag>> verlauf({String? typ, int limit = 100}) async => jsonListe(
    await api.get('dispatch-log', abfrage: {'type': ?typ, 'limit': '$limit'}),
    VersandEintrag.ausJson,
  );

  Future<PingenKonto> pingenKonto({required bool staging}) async {
    final j = await api.get('pingen/account', abfrage: {'staging': '$staging'});
    return PingenKonto.ausJson(j is Map ? Map<String, dynamic>.from(j) : const {});
  }

  Future<PingenStatistik> pingenStatistik() async {
    final j = await api.get('pingen/stats');
    return PingenStatistik.ausJson(j is Map ? Map<String, dynamic>.from(j) : const {});
  }

  Future<List<VersandEintrag>> pingenBriefe({int limit = 50}) async => jsonListe(
    await api.get('pingen/letters', abfrage: {'limit': '$limit'}),
    VersandEintrag.ausJson,
  );

  /// Status bei Pingen abfragen (aktualisiert auch das Protokoll). Braucht
  /// die Pingen-ID (external_id), nicht die Protokoll-ID.
  Future<String?> briefStatus(String pingenId, {required bool staging}) async {
    final j = await api.get(
      'pingen/letters/${Uri.encodeComponent(pingenId)}/status',
      abfrage: {'staging': '$staging'},
    );
    return j is Map ? jsonText(j['status']) : null;
  }

  /// Ein PDF per Post an [mitglieder] (Adresse wird je Brief eingesetzt).
  /// Nie ohne Auswahl - ohne member_ids schickte das Backend an ALLE mit
  /// Post-Zustellung.
  Future<VersandErgebnis> pdfAnAuswahl({
    required Uint8List pdf,
    required String betreff,
    required List<VorstandMitglied> mitglieder,
    required bool staging,
    Fortschritt? fortschritt,
  }) async {
    final ergebnis = VersandErgebnis(staging: staging);
    if (mitglieder.isEmpty) return ergebnis;
    final pdfText = base64Encode(pdf);
    fortschritt?.call(0, mitglieder.length);
    for (var i = 0; i < mitglieder.length && !ergebnis.abgebrochen; i += versandPaket) {
      final paket = mitglieder.skip(i).take(versandPaket).toList();
      try {
        final j = await api.post(
          'pingen/send-bulk-pdf',
          daten: {
            'pdf_base64': pdfText,
            'subject': betreff.trim(),
            'member_ids': [for (final m in paket) m.id],
            'staging': staging,
          },
        );
        final antwort = j is Map ? j : const {};
        ergebnis.briefe += jsonZahl(antwort['successCount']) ?? 0;
        for (final f in antwort['failed'] is List ? antwort['failed'] as List : const []) {
          if (f is Map) {
            ergebnis.fehler.add((
              name: jsonText(f['name']) ?? 'Brief',
              grund: jsonText(f['error']) ?? 'unbekannt',
            ));
          }
        }
      } on Object catch (e) {
        _fehler(ergebnis, e, [for (final m in paket) mitgliedName(m)], 'Brief');
      }
      fortschritt?.call(i + paket.length, mitglieder.length);
    }
    return ergebnis;
  }
}

/// Zeile aus dispatch_log (GET dispatch-log, GET pingen/letters).
class VersandEintrag {
  const VersandEintrag({
    required this.id,
    required this.typ,
    this.status,
    this.betreff,
    this.text,
    this.empfaengerEmail,
    this.empfaengerName,
    this.empfaengerAdresse,
    this.mitgliedId,
    this.externeId,
    this.fehler,
    this.anlass,
    this.erstellt,
    this.gesendet,
  });

  factory VersandEintrag.ausJson(Map<String, dynamic> j) {
    // recipient_address ist JSON als Text ({name, street, zip, city}).
    Map<String, dynamic> adresse = const {};
    final roh = j['recipient_address'];
    if (roh is Map) {
      adresse = Map<String, dynamic>.from(roh);
    } else if (roh is String && roh.trim().startsWith('{')) {
      try {
        final d = jsonDecode(roh);
        if (d is Map) adresse = Map<String, dynamic>.from(d);
      } on FormatException {
        // bleibt leer
      }
    }
    final name = [jsonText(j['vorname']), jsonText(j['nachname'])].whereType<String>().join(' ');
    final ortZeile = [jsonText(adresse['zip']), jsonText(adresse['city'])].whereType<String>();
    return VersandEintrag(
      id: jsonText(j['id']) ?? '',
      typ: jsonText(j['type']) ?? '?',
      status: jsonText(j['status']),
      betreff: jsonText(j['subject']),
      text: jsonText(j['body']),
      empfaengerEmail: jsonText(j['recipient_email']),
      empfaengerName: name.isNotEmpty ? name : jsonText(adresse['name']),
      empfaengerAdresse: [
        jsonText(adresse['street']),
        if (ortZeile.isNotEmpty) ortZeile.join(' '),
      ].whereType<String>().join(', '),
      mitgliedId: jsonText(j['member_id']),
      externeId: jsonText(j['external_id']),
      fehler: jsonText(j['error_message']),
      anlass: jsonText(j['event_title']),
      erstellt: utcZeitpunkt(j['created_at']),
      gesendet: utcZeitpunkt(j['sent_at']),
    );
  }

  final String id;

  /// email, pingen, contact, ...
  final String typ;
  final String? status;
  final String? betreff;
  final String? text;
  final String? empfaengerEmail;
  final String? empfaengerName;
  final String? empfaengerAdresse;
  final String? mitgliedId;

  /// Pingen-Brief-ID bzw. Message-ID der E-Mail.
  final String? externeId;
  final String? fehler;
  final String? anlass;
  final DateTime? erstellt;
  final DateTime? gesendet;

  /// Ueber die App im Staging verschickt (Betreff beginnt mit "[Staging]").
  bool get staging => betreff?.startsWith('[Staging]') ?? false;

  String get empfaenger =>
      empfaengerName ??
      empfaengerEmail ??
      (empfaengerAdresse?.isNotEmpty ?? false ? empfaengerAdresse! : '–');

  VersandEintrag mitStatus(String? neu) => VersandEintrag(
    id: id,
    typ: typ,
    status: neu ?? status,
    betreff: betreff,
    text: text,
    empfaengerEmail: empfaengerEmail,
    empfaengerName: empfaengerName,
    empfaengerAdresse: empfaengerAdresse,
    mitgliedId: mitgliedId,
    externeId: externeId,
    fehler: fehler,
    anlass: anlass,
    erstellt: erstellt,
    gesendet: gesendet,
  );
}

/// Typen im Verlauf (Filter) mit Text.
const versandTypen = <(String?, String)>[
  (null, 'Alle'),
  ('email', 'E-Mail'),
  ('pingen', 'Brief'),
  ('contact', 'Kontakt'),
];

String typText(String typ) => switch (typ) {
  'email' => 'E-Mail',
  'pingen' || 'letter' => 'Brief',
  'contact' => 'Kontakt',
  'sms' => 'SMS',
  _ => typ,
};

/// Status (Protokoll bzw. Pingen) fuer Menschen.
String statusText(String? status) => switch (status) {
  null => '–',
  'sent' => 'Versendet',
  'delivered' => 'Zugestellt',
  'pending' => 'Ausstehend',
  'processing' || 'validating' => 'In Prüfung',
  'ready' || 'valid' => 'Bereit',
  'sending' || 'in_progress' => 'Wird versendet',
  'action_required' => 'Aktion nötig',
  'cancelled' || 'canceled' => 'Storniert',
  'failed' || 'error' => 'Fehlgeschlagen',
  _ => status,
};

/// Endstatus: nicht mehr bei Pingen nachfragen.
bool istEndstatus(String? status) =>
    const {'sent', 'delivered', 'cancelled', 'canceled', 'failed'}.contains(status);

class PingenKonto {
  const PingenKonto({this.name, this.guthaben, this.waehrung = 'CHF', this.staging = false});

  factory PingenKonto.ausJson(Map<String, dynamic> j) => PingenKonto(
    name: jsonText(j['name']),
    guthaben: switch (j['balance']) {
      num n => n.toDouble(),
      String s => double.tryParse(s),
      _ => null,
    },
    waehrung: jsonText(j['currency']) ?? 'CHF',
    staging: jsonWahr(j['isStaging']) ?? false,
  );

  final String? name;
  final double? guthaben;
  final String waehrung;
  final bool staging;
}

/// GET pingen/stats - COUNT(*) kommt aus pg als Text.
class PingenStatistik {
  const PingenStatistik({
    this.total = 0,
    this.gesendet = 0,
    this.ausstehend = 0,
    this.fehlgeschlagen = 0,
    this.tage7 = 0,
    this.tage30 = 0,
  });

  factory PingenStatistik.ausJson(Map<String, dynamic> j) => PingenStatistik(
    total: jsonZahl(j['total']) ?? 0,
    gesendet: jsonZahl(j['sent']) ?? 0,
    ausstehend: jsonZahl(j['pending']) ?? 0,
    fehlgeschlagen: jsonZahl(j['failed']) ?? 0,
    tage7: jsonZahl(j['last_7_days']) ?? 0,
    tage30: jsonZahl(j['last_30_days']) ?? 0,
  );

  final int total;
  final int gesendet;
  final int ausstehend;
  final int fehlgeschlagen;
  final int tage7;
  final int tage30;
}
