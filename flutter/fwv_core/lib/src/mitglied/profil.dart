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
  };
}

String? _leerAlsNull(String? s) {
  final t = s?.trim();
  return (t == null || t.isEmpty) ? null : t;
}
