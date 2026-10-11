// Zugang fuer Organisatoren (siehe zugang.dart).
//
// Zwei Zugaenge mit verschiedenen Routen:
//  - Mitglied (oder Vorstand): `events/:id/…-as-organizer`, Notizen,
//    Rezepte und Material, Mitgliederverzeichnis `members/directory`.
//  - Externer Organisator (`events/login`): nur `events/my-event/…` —
//    bestaetigen, ablehnen, hinzufuegen, Arbeitsplan senden; Verzeichnis
//    `events/my-event/members`.
// Welche Aktionen gehen, sagt das Backend ([AnlassRechte]).

import 'dart:typed_data';

import 'package:fwv_core/fwv_core.dart';

import 'daten.dart';
import 'modelle.dart';
import 'zugang.dart';

class OrganisatorZugang extends AnlassVerwaltungZugang {
  const OrganisatorZugang(this.api, {this.externerLogin = false});

  @override
  String get bezeichnung => 'Organisator';

  @override
  Future<EventOptionen> optionen() => AnlaesseDienst(api).optionen();

  final ApiClient api;

  /// Angemeldet ueber `events/login` (eigene Routen `events/my-event/…`).
  final bool externerLogin;

  static String _e(String id) => Uri.encodeComponent(id);

  /// Alle eigenen Anlaesse mit Anmeldungen und Zahlen (ein Aufruf).
  @override
  Future<VerwaltungsUebersicht> uebersicht() async =>
      VerwaltungsUebersicht.ausJson(await api.get('events/organisator-uebersicht'));

  // -------------------------------------------------------------------
  // Anmeldungen

  @override
  Future<void> bestaetigen(String anlassId, String anmeldungId) => externerLogin
      ? api.post('events/my-event/registrations/${_e(anmeldungId)}/approve')
      : api.post('events/${_e(anlassId)}/registrations/${_e(anmeldungId)}/approve-as-organizer');

  @override
  Future<void> ablehnen(String anlassId, String anmeldungId) => externerLogin
      ? api.post('events/my-event/registrations/${_e(anmeldungId)}/reject', daten: const {})
      : api.post('events/${_e(anlassId)}/registrations/${_e(anmeldungId)}/reject-as-organizer');

  /// Schickt nur die geaenderten Felder ([AnmeldungEntwurf.aenderungen]).
  /// Gibt false zurueck, wenn es nichts zu senden gab.
  @override
  Future<bool> anmeldungAendern(
    String anlassId,
    VerwalteteAnmeldung anmeldung,
    AnmeldungEntwurf neu,
  ) async {
    final body = neu.aenderungen(AnmeldungEntwurf.aus(anmeldung), gast: !anmeldung.mitglied);
    if (body.isEmpty) return false;
    await api.put(
      'events/${_e(anlassId)}/registrations/${_e(anmeldung.id)}/as-organizer',
      daten: body,
    );
    return true;
  }

  @override
  Future<void> anmeldungLoeschen(String anlassId, String anmeldungId) =>
      api.delete('events/${_e(anlassId)}/registrations/${_e(anmeldungId)}/as-organizer');

  /// Person von Hand eintragen (gleich bestaetigt).
  @override
  Future<void> personHinzufuegen(String anlassId, NeuePerson person) => externerLogin
      ? api.post('events/my-event/registrations', daten: person.alsJson())
      : api.post('events/${_e(anlassId)}/registrations-as-organizer', daten: person.alsJson());

  /// Mitglieder zum Auswaehlen.
  @override
  Future<List<VerzeichnisMitglied>> mitgliederVerzeichnis() async => jsonListe(
    await api.get(externerLogin ? 'events/my-event/members' : 'members/directory'),
    VerzeichnisMitglied.ausJson,
  );

  /// Andere Schicht vorschlagen; das Backend schickt eine E-Mail mit Ja/Nein.
  @override
  Future<String> alternativeVorschlagen(
    String anlassId,
    String anmeldungId, {
    required String schichtId,
    required String schichtText,
    required String email,
    String? kommentar,
  }) async {
    final antwort = await api.post(
      'events/${_e(anlassId)}/registrations/${_e(anmeldungId)}/suggest-alternative-as-organizer',
      daten: {
        'newShiftId': schichtId,
        'shiftInfo': schichtText,
        'email': email,
        if (kommentar != null && kommentar.trim().isNotEmpty) 'comment': kommentar.trim(),
      },
    );
    return (antwort is Map ? jsonText(antwort['message']) : null) ?? 'Vorschlag gesendet';
  }

  /// Alle Angemeldeten informieren (E-Mail, Brief, Push).
  @override
  Future<MitteilungErgebnis> mitteilen(
    String anlassId, {
    required String betreff,
    required String nachricht,
  }) async => MitteilungErgebnis.ausJson(
    await api.post(
      'events/${_e(anlassId)}/notify-registrants-as-organizer',
      daten: {'subject': betreff.trim(), 'message': nachricht.trim()},
    ),
  );

  /// Nur externer Organisator: Arbeitsplan an alle Helfer schicken.
  @override
  Future<String> arbeitsplanSenden(String anlassId) async {
    final antwort = await api.post('events/my-event/send-arbeitsplan');
    return (antwort is Map ? jsonText(antwort['message']) : null) ?? 'Arbeitsplan versendet';
  }

  // -------------------------------------------------------------------
  // Anlass und Schichten

  /// Schickt nur die geaenderten Felder ([AnlassEntwurf.aenderungen]);
  /// false, wenn nichts geaendert wurde.
  @override
  Future<bool> anlassAendern(String anlassId, AnlassEntwurf original, AnlassEntwurf neu) async {
    final body = neu.aenderungen(original);
    if (body.isEmpty) return false;
    await api.put('events/${_e(anlassId)}/as-organizer', daten: body);
    return true;
  }

  @override
  Future<void> schichtAnlegen(String anlassId, SchichtEntwurf schicht) =>
      api.post('events/${_e(anlassId)}/shifts-as-organizer', daten: schicht.alsJson());

  @override
  Future<bool> schichtAendern(
    String anlassId,
    String schichtId,
    SchichtEntwurf original,
    SchichtEntwurf neu,
  ) async {
    final body = neu.aenderungen(original);
    if (body.isEmpty) return false;
    await api.put('events/${_e(anlassId)}/shifts/${_e(schichtId)}/as-organizer', daten: body);
    return true;
  }

  @override
  Future<void> schichtLoeschen(String anlassId, String schichtId) =>
      api.delete('events/${_e(anlassId)}/shifts/${_e(schichtId)}/as-organizer');

  // -------------------------------------------------------------------
  // Notizen

  @override
  Future<List<Notiz>> notizen(String anlassId) async =>
      jsonListe(await api.get('events/${_e(anlassId)}/organizer-notes'), Notiz.ausJson);

  /// Text und/oder Anhaenge (als Base64 im JSON, wie das Backend es will).
  @override
  Future<void> notizAnlegen(
    String anlassId, {
    String? text,
    List<AnhangUpload> anhaenge = const [],
  }) => api.post(
    'events/${_e(anlassId)}/organizer-notes',
    daten: {
      if (text != null && text.trim().isNotEmpty) 'content': text.trim(),
      if (anhaenge.isNotEmpty) 'attachments': [for (final a in anhaenge) a.alsJson()],
    },
  );

  @override
  Future<void> notizLoeschen(String anlassId, String notizId) =>
      api.delete('events/${_e(anlassId)}/organizer-notes/${_e(notizId)}');

  @override
  Future<void> anhangLoeschen(String anlassId, String notizId, String anhangId) => api.delete(
    'events/${_e(anlassId)}/organizer-notes/${_e(notizId)}/attachments/${_e(anhangId)}',
  );

  @override
  Future<Uint8List> anhang(String anlassId, String notizId, String anhangId) => api.datei(
    'events/${_e(anlassId)}/organizer-notes/${_e(notizId)}/attachments/${_e(anhangId)}',
  );

  // -------------------------------------------------------------------
  // Rezepte und Material (Inventar, ueber das Events-Backend)

  @override
  Future<List<VerknuepftesRezept>> rezepte(String anlassId) async =>
      jsonListe(await api.get('events/${_e(anlassId)}/recipes'), VerknuepftesRezept.ausJson);

  @override
  Future<Einkaufsliste> einkaufsliste(String anlassId) async =>
      Einkaufsliste.ausJson(await api.get('events/${_e(anlassId)}/shopping-list'));

  @override
  Future<List<AuswahlRezept>> verfuegbareRezepte(String anlassId) async =>
      jsonListe(await api.get('events/${_e(anlassId)}/available-recipes'), AuswahlRezept.ausJson);

  @override
  Future<List<AuswahlMaterial>> verfuegbaresMaterial(String anlassId) async =>
      jsonListe(await api.get('events/${_e(anlassId)}/available-items'), AuswahlMaterial.ausJson);

  @override
  Future<void> rezeptVerknuepfen(String anlassId, int rezeptId, int portionen) => api.post(
    'events/${_e(anlassId)}/recipes',
    daten: {'recipe_id': rezeptId, 'servings': portionen},
  );

  @override
  Future<void> portionenAendern(String anlassId, int rezeptId, int portionen) =>
      api.put('events/${_e(anlassId)}/recipes/$rezeptId', daten: {'servings': portionen});

  @override
  Future<void> rezeptLoesen(String anlassId, int rezeptId) =>
      api.delete('events/${_e(anlassId)}/recipes/$rezeptId');

  @override
  Future<void> materialErfassen(String anlassId, int materialId, double menge) => api.post(
    'events/${_e(anlassId)}/manual-items',
    daten: {'item_id': materialId, 'quantity': menge},
  );

  @override
  Future<void> materialEntfernen(String anlassId, int materialId) =>
      api.delete('events/${_e(anlassId)}/manual-items/$materialId');

  // -------------------------------------------------------------------
  // PDFs

  @override
  Future<Uint8List> teilnehmerlistePdf(String anlassId) =>
      api.datei('events/${_e(anlassId)}/pdf/teilnehmerliste');

  /// Der an den Anlass gehaengte Aushang.
  @override
  Future<Uint8List> aushangPdf(String anlassId) => api.datei('events/${_e(anlassId)}/pdf');

  @override
  Future<Uint8List> arbeitsplanPdf(String anlassId) =>
      api.datei('events/${_e(anlassId)}/pdf/arbeitsplan');
}
