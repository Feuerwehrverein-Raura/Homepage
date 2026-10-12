// Das eigene Mitglieder-Profil: `GET members/me` liefert die ganze Zeile aus
// der Tabelle `members` (snake_case); `PUT members/me` nimmt die Felder an,
// die ein Mitglied selbst aendern darf.

import 'json_lesen.dart';

class MitgliedProfil {
  const MitgliedProfil({
    this.id,
    this.anrede,
    this.vorname,
    this.nachname,
    this.email,
    this.mobile,
    this.telefon,
    this.strasse,
    this.plz,
    this.ort,
    this.funktion,
    this.status,
    this.geburtstag,
    this.foto,
    this.iban,
  });

  factory MitgliedProfil.ausJson(Object? json) {
    final m = json is Map ? json : const {};
    return MitgliedProfil(
      id: jsonText(m['id']),
      anrede: jsonText(m['anrede']),
      vorname: jsonText(m['vorname']),
      nachname: jsonText(m['nachname']),
      email: jsonText(m['email']),
      mobile: jsonText(m['mobile']),
      telefon: jsonText(m['telefon']),
      strasse: jsonText(m['strasse']),
      plz: jsonText(m['plz']),
      ort: jsonText(m['ort']),
      funktion: jsonText(m['funktion']),
      status: jsonText(m['status']),
      geburtstag: jsonDatum(m['geburtstag']),
      foto: jsonText(m['foto']),
      iban: jsonText(m['iban']),
    );
  }

  final String? id;
  final String? anrede;
  final String? vorname;
  final String? nachname;
  final String? email;
  final String? mobile;
  final String? telefon;
  final String? strasse;
  final String? plz;
  final String? ort;

  /// Vereinsfunktion(en), mehrere durch Komma getrennt ("Kassier, Admin").
  final String? funktion;
  final String? status;
  final DateTime? geburtstag;

  /// Wie gespeichert: meist relativ (`/uploads/photo-123.jpg`).
  final String? foto;

  /// Bankverbindung fuer Rueckerstattungen, wie gespeichert.
  final String? iban;

  /// "Vorname Nachname", sonst die E-Mail, sonst null.
  String? get name {
    final n = [vorname, nachname].whereType<String>().join(' ').trim();
    return n.isNotEmpty ? n : email;
  }

  /// Adresse in Zeilen ("Strasse", "PLZ Ort"); leer, wenn nichts bekannt ist.
  List<String> get adresszeilen {
    final ortZeile = [plz, ort].whereType<String>().join(' ').trim();
    return [?strasse, if (ortZeile.isNotEmpty) ortZeile];
  }

  /// Volle Adresse des Fotos. Das Backend liefert einen Pfad relativ zur
  /// API (`/uploads/...`), aeltere Eintraege koennen schon absolut sein.
  Uri? fotoAdresse(Uri apiBasis) => profilFotoAdresse(foto, apiBasis);
}

/// Siehe [MitgliedProfil.fotoAdresse]; auch fuer `photo_url` aus dem Upload.
Uri? profilFotoAdresse(String? foto, Uri apiBasis) {
  final f = foto?.trim();
  if (f == null || f.isEmpty) return null;
  final u = Uri.tryParse(f);
  if (u == null) return null;
  if (u.hasScheme) return u;
  return apiBasis.resolve(f.startsWith('/') ? f.substring(1) : f);
}

/// Body fuer `PUT members/me`. Es werden immer alle Felder geschickt; leere
/// Felder als null, damit man einen Eintrag (z.B. Telefon) auch loeschen
/// kann — das Backend setzt die Felder direkt.
class ProfilAenderung {
  const ProfilAenderung({
    this.anrede,
    this.vorname,
    this.nachname,
    this.email,
    this.geburtstag,
    this.mobile,
    this.telefon,
    this.strasse,
    this.plz,
    this.ort,
    this.iban,
  });

  final String? anrede;
  final String? vorname;
  final String? nachname;
  final String? email;
  final DateTime? geburtstag;
  final String? mobile;
  final String? telefon;
  final String? strasse;
  final String? plz;
  final String? ort;

  /// Wird in Vierergruppen gespeichert ("CH93 0076 2011 6238 5295 7"),
  /// wie man sie von der Bankkarte abliest.
  final String? iban;

  Map<String, Object?> alsJson() => {
    'anrede': _leerAlsNull(anrede),
    'vorname': _leerAlsNull(vorname),
    'nachname': _leerAlsNull(nachname),
    'email': _leerAlsNull(email),
    'geburtstag': geburtstag == null ? null : isoDatum(geburtstag!),
    'mobile': _leerAlsNull(mobile),
    'telefon': _leerAlsNull(telefon),
    'strasse': _leerAlsNull(strasse),
    'plz': _leerAlsNull(plz),
    'ort': _leerAlsNull(ort),
    'iban': _leerAlsNull(iban) == null ? null : ibanFormatieren(iban!),
  };
}

/// IBAN ohne Leerzeichen, gross geschrieben.
String ibanKompakt(String iban) => iban.replaceAll(RegExp(r'\s'), '').toUpperCase();

/// IBAN in Vierergruppen: "CH93 0076 2011 6238 5295 7".
String ibanFormatieren(String iban) {
  final k = ibanKompakt(iban);
  final teile = <String>[];
  for (var i = 0; i < k.length; i += 4) {
    teile.add(k.substring(i, i + 4 > k.length ? k.length : i + 4));
  }
  return teile.join(' ');
}

/// Prueft Laenge, Aufbau und Pruefziffer (ISO 13616, mod 97). Fuer CH/LI
/// zusaetzlich die feste Laenge von 21 Zeichen.
bool ibanGueltig(String iban) {
  final k = ibanKompakt(iban);
  if (!RegExp(r'^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$').hasMatch(k)) return false;
  if ((k.startsWith('CH') || k.startsWith('LI')) && k.length != 21) return false;
  final umgestellt = k.substring(4) + k.substring(0, 4);
  var rest = 0;
  for (final c in umgestellt.codeUnits) {
    final ziffern = c >= 65 ? '${c - 55}' : String.fromCharCode(c);
    for (final z in ziffern.codeUnits) {
      rest = (rest * 10 + (z - 48)) % 97;
    }
  }
  return rest == 1;
}

String? _leerAlsNull(String? s) {
  final t = s?.trim();
  return (t == null || t.isEmpty) ? null : t;
}
