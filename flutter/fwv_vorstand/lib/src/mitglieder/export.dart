// Mitglieder-Exporte wie in vorstand.html: CSV (Alle, Nur Aktive,
// Post-Zustellung, E-Mail-Zustellung) und die Telefonliste als PDF.
//
// Die CSV baut die App selbst aus GET /members (ganze Zeilen, auch Felder,
// die [VorstandMitglied] nicht kennt, z.B. IBAN). Spalten und Reihenfolge
// wie exportCSV() in vorstand.html: Semikolon als Trenner, UTF-8 mit BOM,
// damit Excel die Umlaute richtig zeigt. Ausgetretene und Verstorbene
// fehlen immer. Die Telefonliste erzeugt api-members
// (GET /members/pdf/telefonliste).

import 'dart:convert';
import 'dart:typed_data';

import 'package:fwv_core/fwv_core.dart';

enum MitgliederExport {
  alle('Alle', 'mitglieder'),
  aktive('Nur Aktive', 'aktivmitglieder'),
  post('Post-Zustellung', 'post-zustellung'),
  email('E-Mail-Zustellung', 'email-zustellung');

  const MitgliederExport(this.titel, this.dateiname);

  final String titel;
  final String dateiname;

  bool gehoertDazu(Map<String, dynamic> m) {
    final status = jsonText(m['status']);
    if (status == 'Ausgetreten' || status == 'Verstorben') return false;
    return switch (this) {
      alle => true,
      aktive => status == 'Aktivmitglied',
      post => jsonWahr(m['zustellung_post']) == true,
      email => jsonWahr(m['zustellung_email']) == true,
    };
  }
}

/// Spalten: Ueberschrift und Feld in `members`.
const _spalten = <(String, String)>[
  ('Anrede', 'anrede'),
  ('Vorname', 'vorname'),
  ('Nachname', 'nachname'),
  ('Geschlecht', 'geschlecht'),
  ('Geburtstag', 'geburtstag'),
  ('Eintrittsdatum', 'eintrittsdatum'),
  ('Austrittsdatum', 'austrittsdatum'),
  ('Strasse', 'strasse'),
  ('Adresszusatz', 'adresszusatz'),
  ('PLZ', 'plz'),
  ('Ort', 'ort'),
  ('E-Mail', 'email'),
  ('Versand-E-Mail', 'versand_email'),
  ('Telefon', 'telefon'),
  ('Mobile', 'mobile'),
  ('Status', 'status'),
  ('Funktion', 'funktion'),
  ('Feuerwehr-Zugehoerigkeit', 'feuerwehr_zugehoerigkeit'),
  ('T-Shirt-Groesse', 'tshirt_groesse'),
  ('IBAN', 'iban'),
  ('Zustellung E-Mail', 'zustellung_email'),
  ('Zustellung Post', 'zustellung_post'),
  ('Bemerkungen', 'bemerkungen'),
];

const _datumsFelder = {'geburtstag', 'eintrittsdatum', 'austrittsdatum'};

String _wert(Map<String, dynamic> m, String feld) {
  final roh = m[feld];
  if (roh is bool) return roh ? 'ja' : 'nein';
  if (_datumsFelder.contains(feld)) {
    final d = jsonDatum(roh);
    return d == null ? '' : schweizerDatum(d);
  }
  return jsonText(roh) ?? '';
}

/// Feld fuer die CSV: in Anfuehrungszeichen, wenn es den Trenner, ein
/// Anfuehrungszeichen oder einen Zeilenumbruch enthaelt.
String _feld(String s) => s.contains(RegExp('[;"\n\r]')) ? '"${s.replaceAll('"', '""')}"' : s;

/// CSV-Text (ohne BOM) fuer [art] aus den Zeilen von GET /members.
String mitgliederCsv(List<Map<String, dynamic>> zeilen, MitgliederExport art) {
  final kopf = [for (final (titel, _) in _spalten) titel].join(';');
  final daten = [
    for (final m in zeilen)
      if (art.gehoertDazu(m)) [for (final (_, feld) in _spalten) _feld(_wert(m, feld))].join(';'),
  ];
  return [kopf, ...daten].join('\r\n');
}

/// Dateiname mit Datum: "aktivmitglieder-2026-10-20.csv".
String exportDateiname(MitgliederExport art, DateTime heute) =>
    '${art.dateiname}-${isoDatum(heute)}.csv';

class MitgliederExportDienst {
  const MitgliederExportDienst(this.api);

  final ApiClient api;

  /// Laedt alle Mitglieder und gibt die CSV als Bytes (UTF-8 mit BOM)
  /// zurueck, dazu die Anzahl Zeilen.
  Future<({Uint8List bytes, int anzahl})> csv(MitgliederExport art) async {
    final json = await api.get('members');
    final zeilen = [
      if (json is List)
        for (final z in json)
          if (z is Map) Map<String, dynamic>.from(z),
    ];
    final text = mitgliederCsv(zeilen, art);
    return (
      bytes: Uint8List.fromList([0xEF, 0xBB, 0xBF, ...utf8.encode(text)]),
      anzahl: zeilen.where(art.gehoertDazu).length,
    );
  }

  /// Telefonliste aller Mitglieder als PDF (api-members).
  Future<Uint8List> telefonliste() => api.datei('members/pdf/telefonliste');
}
