// Mitgliederverwaltung des Vorstands gegen api-members (und fuer die
// Benachrichtigung api-events, gleicher Host). Alle Routen nehmen das
// persoenliche Token mit Gruppe Vorstand/admin an (Phase 0).

import 'dart:typed_data';

import 'package:fwv_core/fwv_core.dart';

import 'modelle.dart';

/// Ergebnis von POST /push/to-members.
typedef Benachrichtigt = ({int perPush, int perEmail});

class MitgliederVerwaltung {
  const MitgliederVerwaltung(this.api, {this.fotoVerkleinern = fotoVerkleinernImHintergrund});

  final ApiClient api;

  /// Foto vor dem Hochladen verkleinern (1024 px, JPEG).
  final Future<Uint8List> Function(Uint8List roh) fotoVerkleinern;

  /// GET /members?search=&status= (sortiert nach Nachname, Vorname). Die
  /// Suche prueft Vorname, Nachname und E-Mail.
  Future<List<VorstandMitglied>> liste({String suche = '', String? status}) async {
    final abfrage = {
      if (suche.trim().isNotEmpty) 'search': suche.trim(),
      if (status != null && status.isNotEmpty) 'status': status,
    };
    final json = await api.get('members', abfrage: abfrage.isEmpty ? null : abfrage);
    return jsonListe(json, VorstandMitglied.ausJson);
  }

  Future<MitgliederKennzahlen> kennzahlen() async =>
      MitgliederKennzahlen.ausJson(await api.get('members/stats/overview'));

  Future<VorstandMitglied> laden(String id) async =>
      VorstandMitglied.ausJson(_map(await api.get('members/$id')));

  /// POST /members; das Backend legt bei einer E-Mail-Adresse gleich das
  /// Login an.
  Future<VorstandMitglied> anlegen(MitgliedEntwurf neu) async =>
      VorstandMitglied.ausJson(_map(await api.post('members', daten: neu.alsJson())));

  /// PUT /members/:id mit nur den geaenderten Feldern; null, wenn sich
  /// nichts geaendert hat (dann geht nichts raus).
  Future<VorstandMitglied?> aendern(
    String id,
    MitgliedEntwurf original,
    MitgliedEntwurf neu,
  ) async {
    final body = neu.aenderungen(original);
    if (body.isEmpty) return null;
    return VorstandMitglied.ausJson(_map(await api.put('members/$id', daten: body)));
  }

  /// DELETE /members/:id loescht nicht sofort: Aktuar und Kassier bekommen
  /// je einen Bestaetigungslink per Mail. Gibt die Meldung des Backends
  /// zurueck.
  Future<String> loeschenBeantragen(String id, {String? grund}) async {
    final g = grund?.trim();
    final json = await api.delete(
      'members/$id',
      daten: {if (g != null && g.isNotEmpty) 'reason': g},
    );
    return jsonText(json is Map ? json['message'] : null) ??
        'Löschanfrage erstellt. Aktuar und Kassier wurden per E-Mail benachrichtigt.';
  }

  /// POST /members/:id/photo (Feld `photo`); gibt den neuen Pfad zurueck.
  Future<String?> fotoHochladen(String id, Uint8List roh) async {
    final jpeg = await fotoVerkleinern(roh);
    final json = await api.hochladen(
      'members/$id/photo',
      feld: 'photo',
      bytes: jpeg,
      dateiname: 'foto.jpg',
      inhaltstyp: 'image/jpeg',
    );
    return jsonText(json is Map ? json['photo_url'] : null);
  }

  Future<void> fotoLoeschen(String id) => api.delete('members/$id/photo');

  /// Setzt ein temporaeres Passwort (`FWV-123456`) und gibt es zurueck.
  Future<TemporaeresPasswort> passwortZuruecksetzen(String id) async {
    final json = _map(await api.post('members/$id/reset-password'));
    final pw = jsonText(json['tempPassword']);
    if (pw == null) throw const ApiFehler('Der Server hat kein Passwort geliefert.');
    return TemporaeresPasswort(passwort: pw, meldung: jsonText(json['message']));
  }

  /// Mindestlaenge wie im Backend (POST /members/:id/set-password).
  static const passwortMinLaenge = 8;

  Future<String> passwortSetzen(String id, String passwort) async {
    final json = await api.post('members/$id/set-password', daten: {'password': passwort});
    return jsonText(json is Map ? json['message'] : null) ?? 'Passwort gesetzt';
  }

  /// Status der drei Cloud-Gruppen. Ohne Login-Konto antwortet das Backend
  /// mit `has_authentik: false`; dann fragen wir die anderen nicht.
  Future<CloudGruppen> cloudGruppen(String id) async {
    final nc = _map(await api.get('members/$id/nextcloud-admin'));
    if (jsonWahr(nc['has_authentik']) != true) return const CloudGruppen(hatKonto: false);
    final [vs, sm] = await Future.wait([
      api.get('members/$id/vorstand-group'),
      api.get('members/$id/social-media-group'),
    ]);
    return CloudGruppen(
      hatKonto: true,
      nextcloudAdmin: jsonWahr(nc['nextcloud_admin']) ?? false,
      vorstandGruppe: jsonWahr(_map(vs)['vorstand_group']) ?? false,
      socialMedia: jsonWahr(_map(sm)['social_media_group']) ?? false,
    );
  }

  /// Gruppen nach den Funktionen setzen (wie vorstand.html nach dem
  /// Speichern) und den neuen Stand zurueckgeben.
  Future<CloudGruppen> cloudGruppenAbgleichen(String id, List<String> funktionen) async {
    final soll = CloudGruppen.nachFunktion(funktionen);
    await api.post('members/$id/nextcloud-admin', daten: {'enabled': soll.nextcloudAdmin});
    await api.post('members/$id/vorstand-group', daten: {'enabled': soll.vorstandGruppe});
    await api.post('members/$id/social-media-group', daten: {'enabled': soll.socialMedia});
    return soll;
  }

  /// App-Push (Kanal "general") an die Mitglieder, auf Wunsch auch per Mail.
  Future<Benachrichtigt> benachrichtigen(
    List<String> ids, {
    required String titel,
    required String text,
    bool auchEmail = false,
  }) async {
    final json = _map(
      await api.post(
        'push/to-members',
        daten: {
          'memberIds': ids,
          'title': titel.trim(),
          'body': text.trim(),
          'alsoEmail': auchEmail,
        },
      ),
    );
    return (perPush: jsonZahl(json['pushed']) ?? 0, perEmail: jsonZahl(json['emailed']) ?? 0);
  }
}

Map<String, dynamic> _map(Object? json) =>
    json is Map ? Map<String, dynamic>.from(json) : <String, dynamic>{};
