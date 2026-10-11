// Zugang zur Ausleihe — die einzige Stelle, ueber die die Ausleihe-Screens
// mit dem Backend sprechen. Eigene Schnittstelle neben [LagerZugang], weil
// JEDES Mitglied ausleihen darf, ins Lager aber nur die Gruppe Lager.
//
// Heute: [ApiAusleiheZugang] auf die Inventar-API mit dem Authentik-Token
// der App (QR-/Passwort-Reset-Tokens nimmt das Inventar nicht an).

import 'dart:typed_data';

import 'package:fwv_core/fwv_core.dart';

import 'modelle.dart';

abstract class AusleiheZugang {
  const AusleiheZugang();

  /// Ausleihbare Artikel und Kisten mit freier Menge fuer den Zeitraum.
  Future<AusleiheAngebot> angebot(DateTime von, DateTime bis);

  /// Neue Ausleihe. Passt sie nicht mehr (inzwischen vergeben), meldet das
  /// Backend 409 mit einem deutschen Text ([ApiFehler]).
  Future<Ausleihe> anlegen(NeueAusleihe neu);

  /// Eigene Ausleihen: offene zuerst.
  Future<List<Ausleihe>> meine();

  /// Lager: Ausleihen nach [filter].
  Future<List<Ausleihe>> liste(AusleiheFilter filter);

  Future<Ausleihe> ausleihe(int id);

  /// Eigene (solange reserviert) oder als Lager.
  Future<Ausleihe> absagen(int id);

  /// Lager: bucht aus.
  Future<Ausleihe> ausgeben(int id);

  /// Lager: bucht Zurueckgekommenes wieder ein.
  Future<Ausleihe> zuruecknehmen(int id, Rueckgabe rueckgabe);

  /// Lager: Foto eines Schadens (JPEG), optional zu einer Position.
  Future<AusleiheFoto> fotoHochladen(int id, Uint8List jpeg, {int? positionId});

  Future<void> fotoLoeschen(int id, int fotoId);

  /// Volle Adresse eines Bilds, oder null.
  Uri? bildAdresse(String? pfad) => null;

  /// Kopfzeilen fuer das Laden des Bilds.
  Map<String, String> bildKopfzeilen(Uri adresse) => const {};
}

/// Was die Ausleihe vom Geraet braucht (Fotos, "heute").
class AusleiheUmgebung {
  const AusleiheUmgebung({this.fotoWaehlen, this.verkleinern, this.jetzt = DateTime.now});

  /// Foto aufnehmen ([kamera]) oder auswaehlen; null bei Abbruch. Ohne:
  /// keine Fotos.
  final Future<Uint8List?> Function({required bool kamera})? fotoWaehlen;

  /// Bild verkleinern (1600 px, JPEG) — in der App [anhangBildVerkleinern].
  final Future<Uint8List> Function(Uint8List roh)? verkleinern;

  final DateTime Function() jetzt;
}

/// Zugang und Umgebung zusammen — das, was jeder Ausleihe-Screen bekommt.
class Ausleihen {
  const Ausleihen({required this.zugang, this.umgebung = const AusleiheUmgebung()});

  final AusleiheZugang zugang;
  final AusleiheUmgebung umgebung;
}

/// Routen der Inventar-API (simple-inventory-system/backend/src/ausleihe-routen.ts):
///   GET  ausleihe/angebot?von=&bis=
///   POST ausleihe                       {von, bis, positionen, notizen, extern}
///   GET  ausleihe/meine, ausleihe?filter=, ausleihe/:id
///   POST ausleihe/:id/absagen|ausgeben|zuruecknehmen
///   POST ausleihe/:id/fotos (multipart image, position_id)
///   DELETE ausleihe/:id/fotos/:fotoId
class ApiAusleiheZugang extends AusleiheZugang {
  const ApiAusleiheZugang(this.api);

  /// Am besten `SitzungsVerwaltung.apiFuer(inventarApiBasis)`.
  final ApiClient api;

  @override
  Future<AusleiheAngebot> angebot(DateTime von, DateTime bis) async => AusleiheAngebot.ausJson(
    await api.get('ausleihe/angebot', abfrage: {'von': isoDatum(von), 'bis': isoDatum(bis)}),
  );

  @override
  Future<Ausleihe> anlegen(NeueAusleihe neu) async =>
      Ausleihe.ausAntwort(await api.post('ausleihe', daten: neu.alsJson()));

  @override
  Future<List<Ausleihe>> meine() async =>
      jsonListe(await api.get('ausleihe/meine'), Ausleihe.ausJson);

  @override
  Future<List<Ausleihe>> liste(AusleiheFilter filter) async =>
      jsonListe(await api.get('ausleihe', abfrage: {'filter': filter.wert}), Ausleihe.ausJson);

  @override
  Future<Ausleihe> ausleihe(int id) async => Ausleihe.ausAntwort(await api.get('ausleihe/$id'));

  @override
  Future<Ausleihe> absagen(int id) async =>
      Ausleihe.ausAntwort(await api.post('ausleihe/$id/absagen'));

  @override
  Future<Ausleihe> ausgeben(int id) async =>
      Ausleihe.ausAntwort(await api.post('ausleihe/$id/ausgeben'));

  @override
  Future<Ausleihe> zuruecknehmen(int id, Rueckgabe rueckgabe) async =>
      Ausleihe.ausAntwort(await api.post('ausleihe/$id/zuruecknehmen', daten: rueckgabe.alsJson()));

  @override
  Future<AusleiheFoto> fotoHochladen(int id, Uint8List jpeg, {int? positionId}) async {
    final json = await api.hochladen(
      'ausleihe/$id/fotos',
      feld: 'image',
      bytes: jpeg,
      dateiname: 'schaden.jpg',
      inhaltstyp: 'image/jpeg',
      felder: {if (positionId != null) 'position_id': '$positionId'},
    );
    if (json is! Map) throw const FormatException('Das Foto wurde nicht gespeichert.');
    return AusleiheFoto.ausJson(Map<String, dynamic>.from(json));
  }

  @override
  Future<void> fotoLoeschen(int id, int fotoId) async {
    await api.delete('ausleihe/$id/fotos/$fotoId');
  }

  @override
  Uri? bildAdresse(String? pfad) {
    if (pfad == null || pfad.isEmpty) return null;
    final ziel = api.basis.resolve(pfad);
    return ziel.scheme == 'https' || ziel.host == api.basis.host ? ziel : null;
  }

  @override
  Map<String, String> bildKopfzeilen(Uri adresse) => api.kopfzeilenFuer(adresse);
}
