// Uebernahme der Anmeldung aus der alten nativen App (Entscheidung 3 in
// docs/flutter-mitglieder-app-plan.md).
//
// Die Flutter-App ersetzt die alte App als Update (gleiche App-ID). Damit
// niemand sich danach neu anmelden muss, liest sie beim ersten Start einmal die
// alten Anmeldedaten, speichert sie im eigenen Speicher und loescht die alten.
//
// Das Lesen und Loeschen macht die Plattform (Android: Kotlin,
// EncryptedSharedPreferences "fwv_members_prefs"; iOS: Swift, Schluesselbund
// Dienst "ch.fwvraura.members") ueber einen MethodChannel. Die Plattform
// liefert die Werte unter den Schluesselnamen der alten Android-App
// (auth_token, refresh_token, qr_token, account_type, event_id, user_name,
// user_email) — iOS uebersetzt sein "access_token" selbst.

import 'package:flutter/services.dart';

import 'sitzung.dart';

/// Liest und loescht die Anmeldedaten der alten App.
abstract interface class AltdatenQuelle {
  /// Die alten Werte; null, wenn es keine alten Daten gibt, leer, wenn zwar
  /// eine alte Datei da ist, aber nichts Brauchbares darin.
  Future<Map<String, String>?> lesen();

  /// Loescht die alten Werte endgueltig.
  Future<void> loeschen();
}

/// Die Plattform-Seite ueber einen MethodChannel (Methoden `lesen`,
/// `loeschen`). Gibt es den Kanal nicht (Desktop, Tests), gilt das als
/// "keine alten Daten".
class MethodChannelAltdatenQuelle implements AltdatenQuelle {
  const MethodChannelAltdatenQuelle([this.kanal = const MethodChannel(kanalName)]);

  static const kanalName = 'ch.fwvraura.members/altdaten';

  final MethodChannel kanal;

  @override
  Future<Map<String, String>?> lesen() async {
    try {
      final werte = await kanal.invokeMapMethod<String, String>('lesen');
      return werte;
    } on MissingPluginException {
      return null;
    }
  }

  @override
  Future<void> loeschen() async {
    try {
      await kanal.invokeMethod<void>('loeschen');
    } on MissingPluginException {
      // Ohne Plattform-Seite gibt es auch nichts zu loeschen.
    }
  }
}

/// Was die Uebernahme getan hat (fuer Tests und das Protokoll).
enum UebernahmeErgebnis {
  /// Schon frueher erledigt — nichts getan.
  bereitsErledigt,

  /// Es gab keine alte Anmeldung.
  nichtsVorhanden,

  /// Alte Anmeldung uebernommen und dort geloescht.
  uebernommen,

  /// In der neuen App war schon jemand angemeldet; die alten Daten wurden
  /// nur geloescht.
  verworfen,

  /// Lesen ging schief. Nichts geloescht, beim naechsten Start nochmals.
  fehlgeschlagen,
}

/// Fuehrt die Uebernahme hoechstens einmal erfolgreich aus.
class AltdatenUebernahme {
  AltdatenUebernahme({required this.quelle, required this.speicher});

  final AltdatenQuelle quelle;
  final SitzungsSpeicher speicher;

  /// Wirft nie: eine kaputte alte Anmeldung darf den Start nicht verhindern.
  Future<UebernahmeErgebnis> ausfuehren() async {
    try {
      if (await speicher.speicher.lesen(SitzungsSchluessel.altdatenUebernommen) == 'ja') {
        return UebernahmeErgebnis.bereitsErledigt;
      }

      final Map<String, String>? alt;
      try {
        alt = await quelle.lesen();
      } on PlatformException {
        return UebernahmeErgebnis.fehlgeschlagen;
      }

      final sitzung = sitzungAusAltdaten(alt);
      UebernahmeErgebnis ergebnis;
      if (sitzung == null) {
        ergebnis = UebernahmeErgebnis.nichtsVorhanden;
      } else if (await speicher.laden() != null) {
        ergebnis = UebernahmeErgebnis.verworfen;
      } else {
        await speicher.speichern(sitzung);
        ergebnis = UebernahmeErgebnis.uebernommen;
      }

      // Erst loeschen, wenn die neue Sitzung sicher gespeichert ist. Auch eine
      // leere Antwort heisst "da liegt eine alte Datei" (null: gar nichts).
      if (alt != null) {
        try {
          await quelle.loeschen();
        } on PlatformException {
          // Bleiben die alten Daten liegen, schadet das nicht: die Markierung
          // unten verhindert, dass sie je wieder gelesen werden.
        }
      }
      await speicher.speicher.schreiben(SitzungsSchluessel.altdatenUebernommen, 'ja');
      return ergebnis;
    } on Object {
      return UebernahmeErgebnis.fehlgeschlagen;
    }
  }
}

/// Baut aus den alten Werten eine Sitzung, oder null ohne Access-Token.
Sitzung? sitzungAusAltdaten(Map<String, String>? alt) {
  String? wert(String k) {
    final v = alt?[k]?.trim();
    return (v == null || v.isEmpty) ? null : v;
  }

  final token = wert(SitzungsSchluessel.accessToken);
  if (token == null) return null;
  return Sitzung(
    accessToken: token,
    refreshToken: wert(SitzungsSchluessel.refreshToken),
    qrToken: wert(SitzungsSchluessel.qrToken),
    kontotyp: Kontotyp.ausText(wert(SitzungsSchluessel.kontotyp)) ?? Kontotyp.mitglied,
    eventId: wert(SitzungsSchluessel.eventId),
    name: wert(SitzungsSchluessel.name),
    email: wert(SitzungsSchluessel.email),
  );
}
