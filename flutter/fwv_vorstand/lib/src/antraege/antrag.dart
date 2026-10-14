// Ein Mitgliedschaftsantrag, so wie ihn api-members liefert
// (GET /member-registrations, Tabelle member_registrations, SELECT *).
// Eingereicht ueber das Formular auf der Website (backend-dispatch,
// /contact/confirm), bearbeitet vom Vorstand.

import 'package:fwv_core/fwv_core.dart';

/// Bearbeitungsstand eines Antrags; [code] ist der Wert in der Datenbank.
enum AntragStatus {
  ausstehend('pending', 'Ausstehend'),
  genehmigt('approved', 'Genehmigt'),
  abgelehnt('rejected', 'Abgelehnt');

  const AntragStatus(this.code, this.text);

  final String code;
  final String text;

  static AntragStatus? aus(Object? wert) {
    for (final s in values) {
      if (s.code == wert) return s;
    }
    return null;
  }
}

class Antrag {
  const Antrag({
    required this.id,
    required this.vorname,
    required this.nachname,
    this.anrede,
    this.geschlecht,
    this.geburtstag,
    this.strasse,
    this.plz,
    this.ort,
    this.telefon,
    this.mobile,
    this.email,
    this.feuerwehrStatus,
    this.korrespondenzMethode,
    this.korrespondenzAdresse,
    this.status,
    this.statusRoh,
    this.bearbeitetVon,
    this.bearbeitetAm,
    this.ablehnungsgrund,
    this.mitgliedId,
    this.eingegangen,
  });

  factory Antrag.ausJson(Map<String, dynamic> j) => Antrag(
    id: jsonText(j['id']) ?? '',
    vorname: jsonText(j['vorname']) ?? '',
    nachname: jsonText(j['nachname']) ?? '',
    anrede: jsonText(j['anrede']),
    geschlecht: jsonText(j['geschlecht']),
    geburtstag: jsonDatum(j['geburtstag']),
    strasse: jsonText(j['strasse']),
    plz: jsonText(j['plz']),
    ort: jsonText(j['ort']),
    telefon: jsonText(j['telefon']),
    mobile: jsonText(j['mobile']),
    email: jsonText(j['email']),
    feuerwehrStatus: jsonText(j['feuerwehr_status']),
    korrespondenzMethode: jsonText(j['korrespondenz_methode']),
    korrespondenzAdresse: jsonText(j['korrespondenz_adresse']),
    status: AntragStatus.aus(j['status']),
    statusRoh: jsonText(j['status']),
    bearbeitetVon: jsonText(j['processed_by']),
    bearbeitetAm: jsonZeitpunkt(j['processed_at']),
    ablehnungsgrund: jsonText(j['rejection_reason']),
    mitgliedId: jsonText(j['member_id']),
    eingegangen: jsonZeitpunkt(j['created_at']),
  );

  final String id;
  final String vorname;
  final String nachname;
  final String? anrede;
  final String? geschlecht;
  final DateTime? geburtstag;
  final String? strasse;
  final String? plz;
  final String? ort;
  final String? telefon;
  final String? mobile;
  final String? email;

  /// Antwort auf "Feuerwehr Raurica?": heute 'Ja (aktiv)', 'Ehemalige/r'
  /// oder 'Nein'; aeltere Antraege 'active', 'former', 'no'.
  final String? feuerwehrStatus;

  /// 'E-Mail' oder 'Post' (aeltere Antraege: 'email', 'post').
  final String? korrespondenzMethode;
  final String? korrespondenzAdresse;

  /// null, wenn das Backend einen unbekannten Wert liefert ([statusRoh]).
  final AntragStatus? status;
  final String? statusRoh;
  final String? bearbeitetVon;
  final DateTime? bearbeitetAm;
  final String? ablehnungsgrund;

  /// Das beim Genehmigen angelegte Mitglied.
  final String? mitgliedId;
  final DateTime? eingegangen;

  String get name => [vorname, nachname].where((t) => t.isNotEmpty).join(' ');

  bool get offen => status == AntragStatus.ausstehend;

  /// "4304 Giebenach"
  String? get plzOrt {
    final t = [?plz, ?ort].join(' ');
    return t.isEmpty ? null : t;
  }

  String? get adresse {
    final t = [?strasse, ?plzOrt].join(', ');
    return t.isEmpty ? null : t;
  }

  /// Die Feuerwehr-Angabe lesbar, alte und neue Werte.
  String? get feuerwehrText => switch (feuerwehrStatus) {
    null => null,
    'active' || 'Ja (aktiv)' => 'Ja, aktiv in der Feuerwehr Raurica',
    'former' || 'Ehemalige/r' => 'Ehemalige/r',
    'no' || 'Nein' => 'Nein',
    final s => s,
  };

  String? get korrespondenzText => switch (korrespondenzMethode) {
    'email' => 'E-Mail',
    'post' => 'Post',
    final s => s,
  };
}
