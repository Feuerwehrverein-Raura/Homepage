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
/// Faelligkeit. Nur zur Anzeige - bearbeitet wird sie (noch) auf der Website.
class BeitragsEinstellung {
  const BeitragsEinstellung({required this.jahr, required this.betrag, this.gv, this.faellig});

  factory BeitragsEinstellung.ausJson(Map<String, dynamic> j) => BeitragsEinstellung(
    jahr: _zahl(j['year']).toInt(),
    betrag: _zahl(j['amount']),
    // gv_date ist freier Text (VARCHAR), kein Datum.
    gv: _text(j['gv_date']),
    faellig: kalendertag(j['due_date']),
  );

  final int jahr;
  final num betrag;
  final String? gv;
  final DateTime? faellig;
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
}
