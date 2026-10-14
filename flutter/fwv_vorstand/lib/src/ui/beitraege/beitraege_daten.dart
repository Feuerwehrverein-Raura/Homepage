// Mitgliederbeitraege: Modelle und Aufrufe an api-accounting
// (docker/backend-accounting/src/index.js, /membership-fees/...).
//
// Das Backend liefert Zahlen aus PostgreSQL teils als Text: COUNT als
// "12", DECIMAL als "50.00". DATE kommt als ISO-Zeitpunkt
// ("2026-03-15T00:00:00.000Z"). Alles wird hier tolerant gelesen.

import 'package:fwv_core/fwv_core.dart';

/// Zahl aus JSON - Zahl oder Text ("50.00"); sonst 0.
num _zahl(Object? wert) => switch (wert) {
  num n => n,
  String s => num.tryParse(s.trim()) ?? 0,
  _ => 0,
};

String? _text(Object? wert) {
  if (wert == null) return null;
  final s = wert.toString().trim();
  return s.isEmpty ? null : s;
}

/// Kalendertag aus einem DATE-Feld. "2026-03-15" bleibt der 15.; ein
/// Zeitpunkt wird in Ortszeit umgerechnet (pg schickt Mitternacht der
/// Server-Zeitzone als UTC - in der Schweiz ist das derselbe Tag).
DateTime? kalendertag(Object? wert) {
  final s = _text(wert);
  if (s == null) return null;
  final nurTag = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(s);
  if (nurTag != null) {
    return DateTime(
      int.parse(nurTag.group(1)!),
      int.parse(nurTag.group(2)!),
      int.parse(nurTag.group(3)!),
    );
  }
  final zeit = DateTime.tryParse(s)?.toLocal();
  return zeit == null ? null : DateTime(zeit.year, zeit.month, zeit.day);
}

/// "15.03.2026".
String datumText(DateTime tag) =>
    '${tag.day.toString().padLeft(2, '0')}.${tag.month.toString().padLeft(2, '0')}.${tag.year}';

/// Betrag in Franken: "CHF 1’234.50" (Tausender mit Hochkomma, wie in der
/// Schweiz ueblich).
String chf(num betrag) {
  final negativ = betrag < 0;
  final teile = betrag.abs().toStringAsFixed(2).split('.');
  final ganz = teile[0];
  final gruppen = StringBuffer();
  for (var i = 0; i < ganz.length; i++) {
    if (i > 0 && (ganz.length - i) % 3 == 0) gruppen.write('’');
    gruppen.write(ganz[i]);
  }
  return 'CHF ${negativ ? '-' : ''}$gruppen.${teile[1]}';
}

/// Status einer Zahlung, wie ihn das Backend speichert.
enum ZahlungsStatus { offen, bezahlt, anderer }

/// Ein Beitrag eines Mitglieds fuer ein Jahr (membership_fee_payments plus
/// Mitgliederdaten aus GET /membership-fees/payments).
class Beitragszahlung {
  const Beitragszahlung({
    required this.id,
    required this.jahr,
    required this.betrag,
    required this.statusRoh,
    this.mitgliedId,
    this.vorname,
    this.nachname,
    this.email,
    this.strasse,
    this.plz,
    this.ort,
    this.referenz,
    this.bezahltAm,
    this.zahlungsart,
    this.mitgliedStatus,
    this.letzteErinnerung,
  });

  factory Beitragszahlung.ausJson(Map<String, dynamic> j) => Beitragszahlung(
    id: j['id'].toString(),
    jahr: _zahl(j['year']).toInt(),
    betrag: _zahl(j['amount']),
    statusRoh: _text(j['status']) ?? 'offen',
    mitgliedId: _text(j['member_id']),
    vorname: _text(j['vorname']),
    nachname: _text(j['nachname']),
    email: _text(j['email']),
    strasse: _text(j['strasse']),
    plz: _text(j['plz']),
    ort: _text(j['ort']),
    referenz: _text(j['reference_nr']),
    bezahltAm: kalendertag(j['paid_date']),
    zahlungsart: _text(j['payment_method']),
    mitgliedStatus: _text(j['member_status']),
    letzteErinnerung: kalendertag(j['last_reminder_at']),
  );

  final String id;
  final int jahr;
  final num betrag;
  final String statusRoh;
  final String? mitgliedId;
  final String? vorname;
  final String? nachname;
  final String? email;
  final String? strasse;
  final String? plz;
  final String? ort;

  /// QR-Referenz der Bank (nur die Ziffern, die das Backend auf 27 Stellen
  /// auffuellt). Leer = noch keine.
  final String? referenz;
  final DateTime? bezahltAm;
  final String? zahlungsart;

  /// Status des Mitglieds (Aktivmitglied, Ehrenmitglied, ...).
  final String? mitgliedStatus;

  /// Letzte Zahlungserinnerung (das Backend erinnert hoechstens alle 30 Tage).
  final DateTime? letzteErinnerung;

  bool get ehrenmitglied => mitgliedStatus == 'Ehrenmitglied';

  ZahlungsStatus get status => switch (statusRoh) {
    'bezahlt' => ZahlungsStatus.bezahlt,
    'offen' => ZahlungsStatus.offen,
    _ => ZahlungsStatus.anderer,
  };

  bool get bezahlt => status == ZahlungsStatus.bezahlt;

  /// "Muster Erika" - wie die Liste sortiert ist (Nachname, Vorname).
  String get name {
    final n = [?nachname, ?vorname].join(' ');
    return n.isEmpty ? '(unbekannt)' : n;
  }

  /// "Erika Muster" - fuer Saetze in Rueckfragen.
  String get anzeigeName {
    final n = [?vorname, ?nachname].join(' ');
    return n.isEmpty ? 'dieses Mitglied' : n;
  }

  bool get hatReferenz => (referenz ?? '').replaceAll(RegExp(r'\D'), '').isNotEmpty;

  bool get hatAdresse => strasse != null && plz != null && ort != null;

  /// Passt die Zahlung zur Suche (Name in beiden Reihenfolgen, E-Mail,
  /// Referenz)? Gross/klein egal.
  bool passtZu(String suche) {
    final s = suche.trim().toLowerCase();
    if (s.isEmpty) return true;
    final felder = [
      '${vorname ?? ''} ${nachname ?? ''}',
      '${nachname ?? ''} ${vorname ?? ''}',
      email ?? '',
      referenz ?? '',
    ];
    return felder.any((f) => f.toLowerCase().contains(s));
  }
}

/// Kennzahlen eines Jahres (GET /membership-fees/summary).
class BeitragsKennzahlen {
  const BeitragsKennzahlen({
    this.gesamt = 0,
    this.bezahlt = 0,
    this.offen = 0,
    this.betragGesamt = 0,
    this.betragBezahlt = 0,
    this.betragOffen = 0,
  });

  factory BeitragsKennzahlen.ausJson(Object? json) {
    final j = json is Map ? json : const {};
    return BeitragsKennzahlen(
      gesamt: _zahl(j['total']).toInt(),
      bezahlt: _zahl(j['paid']).toInt(),
      offen: _zahl(j['open']).toInt(),
      betragGesamt: _zahl(j['total_amount']),
      betragBezahlt: _zahl(j['paid_amount']),
      betragOffen: _zahl(j['open_amount']),
    );
  }

  final int gesamt;
  final int bezahlt;
  final int offen;
  final num betragGesamt;
  final num betragBezahlt;
  final num betragOffen;
}

/// Jahreseinstellung (GET /membership-fees/settings/:year): Betrag, GV,
/// Faelligkeit, Beschreibung.
class BeitragsEinstellung {
  const BeitragsEinstellung({
    required this.jahr,
    required this.betrag,
    this.gv,
    this.faellig,
    this.beschreibung,
  });

  factory BeitragsEinstellung.ausJson(Map<String, dynamic> j) => BeitragsEinstellung(
    jahr: _zahl(j['year']).toInt(),
    betrag: _zahl(j['amount']),
    // gv_date ist freier Text (VARCHAR), kein Datum.
    gv: _text(j['gv_date']),
    faellig: kalendertag(j['due_date']),
    beschreibung: _text(j['description']),
  );

  final int jahr;
  final num betrag;
  final String? gv;
  final DateTime? faellig;

  /// Wird beim Speichern mitgeschickt - das Backend ueberschreibt sonst mit
  /// leer (Upsert aller Felder).
  final String? beschreibung;
}

/// Alles, was die Beitrags-Ansicht fuer ein Jahr braucht.
class BeitragsJahr {
  const BeitragsJahr({
    required this.jahr,
    required this.kennzahlen,
    required this.zahlungen,
    this.einstellung,
  });

  final int jahr;
  final BeitragsKennzahlen kennzahlen;
  final List<Beitragszahlung> zahlungen;

  /// null, wenn fuer das Jahr nichts hinterlegt ist.
  final BeitragsEinstellung? einstellung;
}

/// Filter der Zahlungsliste.
enum BeitragsFilter {
  alle('Alle'),
  offen('Offen'),
  bezahlt('Bezahlt');

  const BeitragsFilter(this.titel);

  final String titel;

  bool laesstDurch(Beitragszahlung z) => switch (this) {
    BeitragsFilter.alle => true,
    BeitragsFilter.offen => !z.bezahlt,
    BeitragsFilter.bezahlt => z.bezahlt,
  };
}

/// Zahlungen nach Filter und Suche.
List<Beitragszahlung> beitraegeFiltern(
  List<Beitragszahlung> zahlungen, {
  BeitragsFilter filter = BeitragsFilter.alle,
  String suche = '',
}) => [
  for (final z in zahlungen)
    if (filter.laesstDurch(z) && z.passtZu(suche)) z,
];

/// Laenge der Spalte reference_nr (VARCHAR(20)) im Backend.
const referenzMaxLaenge = 20;

/// Referenz aus einer Eingabe: nur Ziffern (Leerzeichen der Bank-Gruppen
/// fallen weg). Ist sie laenger als die Spalte, fallen fuehrende Nullen weg
/// (das Backend fuellt sie beim Brief wieder auf). null = ungueltig.
String? referenzAusEingabe(String eingabe) {
  final ohneLeer = eingabe.replaceAll(RegExp(r'\s'), '');
  if (ohneLeer.isEmpty) return '';
  if (!RegExp(r'^\d+$').hasMatch(ohneLeer)) return null;
  var r = ohneLeer;
  if (r.length > referenzMaxLaenge) r = r.replaceFirst(RegExp(r'^0+'), '');
  return r.length > referenzMaxLaenge ? null : r;
}

/// Versandweg fuer einen einzelnen Beitragsbrief.
enum BriefKanal {
  email('email', 'E-Mail'),
  post('post', 'Post');

  const BriefKanal(this.wert, this.titel);

  final String wert;
  final String titel;
}

/// Zustellwunsch eines Mitglieds (members.zustellung_email/_post).
typedef Zustellwunsch = ({bool email, bool post});

/// Wer beim Massenversand einen Beitragsbrief bekaeme - nach denselben Regeln
/// wie send-email-bulk/send-post-bulk in api-accounting: offen, Zustellung
/// per [kanal] gewuenscht, E-Mail bzw. ganze Adresse vorhanden, kein
/// Ehrenmitglied, Referenz vorhanden.
class VersandVorschau {
  const VersandVorschau({
    required this.kanal,
    required this.empfaenger,
    required this.ohneReferenz,
    required this.unbekannt,
  });

  final BriefKanal kanal;

  /// Bekommen den Brief (nach heutigem Stand).
  final List<Beitragszahlung> empfaenger;

  /// Offen und mit passendem Zustellwunsch, aber ohne Referenz - werden
  /// uebersprungen (QR-Rechnung waere unbrauchbar).
  final List<Beitragszahlung> ohneReferenz;

  /// Offen, aber Zustellwunsch unbekannt (Mitglied nicht geladen): ob sie
  /// etwas bekommen, entscheidet das Backend.
  final List<Beitragszahlung> unbekannt;

  int get hoechstens => empfaenger.length + unbekannt.length;
}

/// [zustellung]: Mitglied-ID -> Zustellwunsch; null = nicht geladen.
VersandVorschau versandVorschau(
  List<Beitragszahlung> zahlungen,
  BriefKanal kanal,
  Map<String, Zustellwunsch>? zustellung,
) {
  final empfaenger = <Beitragszahlung>[];
  final ohneReferenz = <Beitragszahlung>[];
  final unbekannt = <Beitragszahlung>[];
  for (final z in zahlungen) {
    if (z.statusRoh != 'offen' || z.ehrenmitglied) continue;
    final erreichbar = switch (kanal) {
      BriefKanal.email => (z.email ?? '').isNotEmpty,
      BriefKanal.post => z.hatAdresse,
    };
    if (!erreichbar) continue;
    final wunsch = zustellung?[z.mitgliedId];
    if (wunsch == null) {
      if (z.hatReferenz) unbekannt.add(z);
      continue;
    }
    final gewuenscht = kanal == BriefKanal.email ? wunsch.email : wunsch.post;
    if (!gewuenscht) continue;
    (z.hatReferenz ? empfaenger : ohneReferenz).add(z);
  }
  return VersandVorschau(
    kanal: kanal,
    empfaenger: empfaenger,
    ohneReferenz: ohneReferenz,
    unbekannt: unbekannt,
  );
}

/// Wie viele Zahlungen [jahr] die Zahlungserinnerung heute erfassen wuerde
/// (runFeeReminders in api-accounting): nicht bezahlt, Faelligkeit vorbei,
/// letzte Erinnerung mindestens 30 Tage her, Mitglied nicht ausgetreten.
/// Das Backend erinnert fuer ALLE Jahre - hier zaehlt nur [zahlungen].
List<Beitragszahlung> erinnerungFaellig(
  List<Beitragszahlung> zahlungen,
  BeitragsEinstellung? einstellung,
  DateTime heute,
) {
  final faellig = einstellung?.faellig;
  final tag = DateTime(heute.year, heute.month, heute.day);
  if (faellig == null || faellig.isAfter(tag)) return const [];
  final grenze = tag.subtract(const Duration(days: 30));
  return [
    for (final z in zahlungen)
      if (z.statusRoh != 'bezahlt' &&
          !const ['Ausgetreten', 'Austritt_beantragt'].contains(z.mitgliedStatus) &&
          (z.letzteErinnerung == null || !z.letzteErinnerung!.isAfter(grenze)))
        z,
  ];
}

/// Antwort von send-email-bulk / send-post-bulk.
class MassenversandErgebnis {
  const MassenversandErgebnis({
    required this.empfaenger,
    required this.gesendet,
    required this.fehlgeschlagen,
    this.uebersprungen = 0,
    this.fehler = const [],
  });

  factory MassenversandErgebnis.ausJson(Object? json) {
    final j = json is Map ? json : const {};
    return MassenversandErgebnis(
      empfaenger: _zahl(j['candidates']).toInt(),
      gesendet: _zahl(j['success']).toInt(),
      fehlgeschlagen: _zahl(j['failed']).toInt(),
      uebersprungen: _zahl(j['skipped']).toInt(),
      fehler: [
        if (j['failures'] is List)
          for (final f in j['failures'] as List)
            if (f is Map) '${_text(f['name']) ?? '?'}: ${_text(f['error']) ?? '?'}',
      ],
    );
  }

  final int empfaenger;
  final int gesendet;
  final int fehlgeschlagen;
  final int uebersprungen;

  /// "Name: Grund", hoechstens 20 (so viele schickt das Backend).
  final List<String> fehler;
}

/// Ergebnis von POST /membership-fees/send-reminders.
typedef Erinnerungen = ({int push, int email, int faellig});

/// Ergebnis von POST /membership-fees/payments/generate. Achtung: das
/// Backend zaehlt auch bestehende Eintraege als "created" (ON CONFLICT DO
/// NOTHING) - die echte Zahl neuer Beitraege ergibt der Vergleich vorher/
/// nachher.
typedef Erzeugt = ({int mitglieder});

/// Massenversand darf lange laufen: das Backend schickt Brief um Brief.
const massenversandZeitlimit = Duration(minutes: 10);

/// Aufrufe rund um die Mitgliederbeitraege (api-accounting, nur Vorstand).
class BeitraegeDienst {
  const BeitraegeDienst(this.api);

  final ApiClient api;

  static String _e(String id) => Uri.encodeComponent(id);

  /// Kennzahlen, Zahlungen und Einstellung eines Jahres - parallel.
  Future<BeitragsJahr> jahr(int jahr) async {
    final abfrage = {'year': '$jahr'};
    final (zahlungen, kennzahlen, einstellung) = await (
      api.get('membership-fees/payments', abfrage: abfrage),
      api.get('membership-fees/summary', abfrage: abfrage),
      _einstellung(jahr),
    ).wait;
    return BeitragsJahr(
      jahr: jahr,
      kennzahlen: BeitragsKennzahlen.ausJson(kennzahlen),
      zahlungen: [
        for (final z in (zahlungen as List? ?? const []))
          Beitragszahlung.ausJson(Map<String, dynamic>.from(z as Map)),
      ],
      einstellung: einstellung,
    );
  }

  /// Einstellung des Jahres; ohne Eintrag (404) null.
  Future<BeitragsEinstellung?> _einstellung(int jahr) async {
    try {
      final j = await api.get('membership-fees/settings/$jahr');
      return j is Map ? BeitragsEinstellung.ausJson(Map<String, dynamic>.from(j)) : null;
    } on ApiFehler catch (f) {
      if (f.status == 404) return null;
      rethrow;
    }
  }

  /// Als bezahlt verbuchen. Ohne Datum setzt das Backend heute; es schickt
  /// dem Mitglied eine App-Mitteilung.
  Future<void> bezahlt(String id) =>
      api.patch('membership-fees/payments/${_e(id)}/pay', daten: const <String, Object?>{});

  /// Zurueck auf offen (Zahlungsdatum wird geloescht).
  Future<void> offen(String id) => api.patch('membership-fees/payments/${_e(id)}/unpay');

  /// QR-Referenz setzen; leer loescht sie.
  Future<void> referenzSetzen(String id, String referenz) =>
      api.patch('membership-fees/payments/${_e(id)}/reference', daten: {'reference_nr': referenz});

  /// Beitragsbrief fuer eine Zahlung sofort versenden (echte E-Mail bzw.
  /// echter Brief ueber Pingen).
  Future<void> briefSenden(String id, BriefKanal kanal) =>
      api.post('membership-fees/payments/${_e(id)}/send', daten: {'channel': kanal.wert});

  /// Jahreseinstellung anlegen oder ersetzen (alle Felder).
  Future<BeitragsEinstellung> einstellungSpeichern({
    required int jahr,
    required num betrag,
    String? gv,
    DateTime? faellig,
    String? beschreibung,
  }) async {
    final j = await api.post(
      'membership-fees/settings',
      daten: {
        'year': jahr,
        'amount': betrag,
        'gv_date': gv?.trim().isEmpty ?? true ? null : gv!.trim(),
        'due_date': faellig == null ? null : isoDatum(faellig),
        'description': beschreibung?.trim().isEmpty ?? true ? null : beschreibung!.trim(),
      },
    );
    return j is Map
        ? BeitragsEinstellung.ausJson(Map<String, dynamic>.from(j))
        : BeitragsEinstellung(jahr: jahr, betrag: betrag);
  }

  /// Offene Beitraege [jahr] ueber [betrag] fuer alle Aktiv- und
  /// Passivmitglieder ohne Eintrag; bestehende bleiben.
  Future<Erzeugt> erzeugen(int jahr, num betrag) async {
    final j = await api.post(
      'membership-fees/payments/generate',
      daten: {'year': jahr, 'amount': betrag},
    );
    return (mitglieder: _zahl(j is Map ? j['total'] : null).toInt());
  }

  /// Beitragsbriefe [jahr] an alle (Regeln siehe [versandVorschau]).
  /// SENDET SOFORT.
  Future<MassenversandErgebnis> anAlleSenden(int jahr, BriefKanal kanal) async =>
      MassenversandErgebnis.ausJson(
        await api.post(
          kanal == BriefKanal.email
              ? 'membership-fees/send-email-bulk'
              : 'membership-fees/send-post-bulk',
          daten: {'year': jahr},
          zeitlimit: massenversandZeitlimit,
        ),
      );

  /// Zahlungserinnerungen (Push, und E-Mail bei Zustellung E-Mail) fuer
  /// alle faelligen offenen Beitraege aller Jahre. SENDET SOFORT.
  Future<Erinnerungen> erinnerungenSenden() async {
    final j = await api.post(
      'membership-fees/send-reminders',
      daten: const <String, Object?>{},
      zeitlimit: massenversandZeitlimit,
    );
    final m = j is Map ? j : const {};
    return (
      push: _zahl(m['pushed']).toInt(),
      email: _zahl(m['emailed']).toInt(),
      faellig: _zahl(m['candidates']).toInt(),
    );
  }
}
