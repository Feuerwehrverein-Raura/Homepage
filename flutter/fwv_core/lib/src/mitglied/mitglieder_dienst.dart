// Aufrufe rund um das eigene Mitglied (Profil, Foto, Austritt, Zugaenge,
// Benachrichtigungen, Push-Token, Newsletter) — ohne Oberflaeche, damit die
// Vorstand-App dieselben verwenden kann.

import '../api/api_client.dart';
import 'benachrichtigungen.dart';
import 'json_lesen.dart';
import 'profil.dart';
import 'zugaenge.dart';

class MitgliederDienst {
  const MitgliederDienst(this.api);

  final ApiClient api;

  // ---------------------------------------------------------------------
  // Profil

  Future<MitgliedProfil> profil() async => MitgliedProfil.ausJson(await api.get('members/me'));

  /// Speichert und gibt das Profil zurueck, wie es jetzt in der Datenbank
  /// steht.
  Future<MitgliedProfil> profilSpeichern(ProfilAenderung aenderung) async =>
      MitgliedProfil.ausJson(await api.put('members/me', daten: aenderung.alsJson()));

  /// Laedt ein (schon verkleinertes) JPEG als Profilfoto hoch und gibt den
  /// neuen Pfad (`photo_url`) zurueck.
  Future<String?> fotoHochladen(List<int> jpeg) async {
    final antwort = await api.hochladen(
      'members/me/photo',
      feld: 'photo',
      bytes: jpeg,
      dateiname: 'profil.jpg',
      inhaltstyp: 'image/jpeg',
    );
    return antwort is Map ? jsonText(antwort['photo_url']) : null;
  }

  Future<void> fotoLoeschen() => api.delete('members/me/photo');

  /// Stellt einen Austritts-Antrag. Der Vorstand entscheidet; geloescht wird
  /// nichts. Gibt die Meldung des Backends zurueck.
  Future<String> austrittBeantragen({String? grund, DateTime? wunschdatum}) async {
    final antwort = await api.post(
      'members/me/austritt',
      daten: {
        'reason': ?_leerAlsNull(grund),
        if (wunschdatum != null) 'austrittsdatum': isoDatum(wunschdatum),
      },
    );
    if (antwort is Map && antwort['success'] == false) {
      throw ApiFehler(jsonText(antwort['message']) ?? 'Der Antrag wurde nicht angenommen.');
    }
    return (antwort is Map ? jsonText(antwort['message']) : null) ??
        'Austritts-Antrag wurde an den Vorstand gesendet.';
  }

  // ---------------------------------------------------------------------
  // Zugaenge

  Future<Zugaenge> zugaenge() async => Zugaenge.ausJson(await api.get('members/me/accesses'));

  /// Kassen-Anmeldebon am Bar-Drucker im Schopf drucken (geht ueber die
  /// Cloud an den T400). Liefert die Meldung fuer die Anzeige.
  Future<String> kassenbonDrucken() async {
    final antwort = await api.post('members/me/kassenbon');
    final bis = antwort is Map ? DateTime.tryParse('${antwort['gilt_bis']}')?.toLocal() : null;
    final zeit = bis == null ? '' : ' – gilt einmal bis ${bis.hour.toString().padLeft(2, '0')}:${bis.minute.toString().padLeft(2, '0')} Uhr';
    return 'Bon geht an den Bar-Drucker im Schopf$zeit.';
  }

  Future<String> funktionsMailPasswortAendern({
    required String email,
    required String passwort,
  }) async {
    final antwort = await api.put(
      'members/me/function-email-password',
      daten: {'email': email, 'password': passwort},
    );
    return (antwort is Map ? jsonText(antwort['message']) : null) ?? 'Passwort geändert.';
  }

  // ---------------------------------------------------------------------
  // Benachrichtigungen und Push

  Future<BenachrichtigungsEinstellungen> benachrichtigungen() async =>
      BenachrichtigungsEinstellungen.ausJson(await api.get('members/me/notifications'));

  Future<BenachrichtigungsEinstellungen> benachrichtigungenSpeichern(
    BenachrichtigungsEinstellungen e,
  ) async => BenachrichtigungsEinstellungen.ausJson(
    await api.put('members/me/notifications', daten: e.alsJson()),
  );

  /// Meldet das FCM-Token dieses Geraets an (mehrfach aufrufen ist harmlos).
  /// [plattform]: "android" oder "ios". [geraet]: dieselben Angaben wie bei
  /// [geraetMelden] (app_version, quelle, ...) - das Backend aktualisiert
  /// damit auch die Geraete-Zeile; aeltere Backends ignorieren sie.
  Future<void> pushTokenRegistrieren({
    required String token,
    String? geraeteId,
    required String plattform,
    Map<String, Object?> geraet = const {},
  }) => api.post(
    'members/me/fcm-token',
    daten: {...geraet, 'token': token, 'device_id': ?geraeteId, 'platform': plattform},
  );

  /// Meldet dieses Geraet (`POST members/me/geraet`): welche App-Version auf
  /// welcher Plattform. [geraeteId] ist die Zufallskennung der App, keine
  /// Hardware-ID; [angaben] z.B. plattform, quelle, app_version,
  /// build_nummer, os_version, geraet_modell.
  Future<void> geraetMelden({required String geraeteId, required Map<String, Object?> angaben}) =>
      api.post('members/me/geraet', daten: {...angaben, 'geraet_id': geraeteId});

  /// Meldet das FCM-Token ab (beim Abmelden). Idempotent.
  Future<void> pushTokenAbmelden(String token) =>
      api.delete('members/me/fcm-token', daten: {'token': token});

  // ---------------------------------------------------------------------
  // Newsletter (api-dispatch, oeffentlich)

  /// An- oder abmelden. Das Backend kennt keine Abfrage, ob man angemeldet
  /// ist — die App merkt sich den Stand selbst. Beim Anmelden kommt eine
  /// Bestaetigungs-E-Mail.
  Future<String> newsletter({required bool anmelden, required String email}) async {
    final antwort = await api.post(
      anmelden ? 'newsletter/subscribe' : 'newsletter/unsubscribe',
      daten: {'email': email.trim()},
    );
    final meldung = antwort is Map ? jsonText(antwort['message']) : null;
    if (antwort is Map && antwort['success'] == false) {
      throw ApiFehler(meldung ?? 'Hat nicht geklappt.');
    }
    return meldung ?? (anmelden ? 'Bestätigungs-E-Mail ist unterwegs.' : 'Abgemeldet.');
  }

  // ---------------------------------------------------------------------
  // Organisator

  /// Ob das angemeldete Mitglied Anlaesse organisiert
  /// (`GET events/organized-by-me` liefert mindestens einen).
  Future<bool> organisiertAnlaesse() async {
    final antwort = await api.get('events/organized-by-me');
    return antwort is List && antwort.isNotEmpty;
  }
}

String? _leerAlsNull(String? s) {
  final t = s?.trim();
  return (t == null || t.isEmpty) ? null : t;
}
