// Offene Mitgliederbeitraege: `GET members/me/beitraege` (backend-members,
// src/beitraege.js). Das Profil zeigt sie mit Einzahlungsschein an - Konto,
// Referenz, Betrag und Swiss QR Code (Inhalt kommt fertig vom Backend, gleich
// wie auf dem Beitragsbrief).

import 'json_lesen.dart';

class OffenerBeitrag {
  const OffenerBeitrag({
    required this.id,
    required this.jahr,
    required this.betrag,
    this.faellig,
    required this.iban,
    this.empfaenger = const [],
    this.referenz,
    this.mitteilung,
    this.qrInhalt,
  });

  factory OffenerBeitrag.ausJson(Map<String, dynamic> j) => OffenerBeitrag(
    id: jsonText(j['id']) ?? '',
    jahr: jsonZahl(j['jahr']) ?? 0,
    betrag: switch (j['betrag']) {
      final num n => n.toDouble(),
      final String s => double.tryParse(s) ?? 0,
      _ => 0,
    },
    faellig: jsonDatum(j['faellig']),
    iban: jsonText(j['iban']) ?? '',
    empfaenger: [
      if (j['empfaenger'] case final List l)
        for (final z in l) ?jsonText(z),
    ],
    referenz: jsonText(j['referenz']),
    mitteilung: jsonText(j['mitteilung']),
    qrInhalt: jsonText(j['qr_inhalt']),
  );

  final String id;
  final int jahr;
  final double betrag;
  final DateTime? faellig;
  final String iban;

  /// Name und Adresse des Vereins, zeilenweise.
  final List<String> empfaenger;

  /// Formatierte QR-Referenz; null, solange der Kassier keine eingetragen hat.
  final String? referenz;
  final String? mitteilung;

  /// Inhalt des Swiss QR Codes; null ohne Referenz.
  final String? qrInhalt;

  /// Faelligkeit vorbei (heute zaehlt noch nicht).
  bool ueberfaellig(DateTime heute) {
    final f = faellig;
    return f != null && DateTime(heute.year, heute.month, heute.day).isAfter(f);
  }
}
