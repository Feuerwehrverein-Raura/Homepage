// Zugang fuer den Vorstand (siehe zugang.dart): alle aktuellen Anlaesse.
//
// Das Backend liefert dem Vorstand in `GET events/organisator-uebersicht`
// alle aktuellen und undatierten Anlaesse (zugang 'vorstand'), und alle
// `…-as-organizer`-Routen lassen Vorstand/Admin zu (ensureOrganizerAccess).
// Darum erbt dieser Zugang alles Bestehende vom Organisator-Zugang und
// nimmt nur fuer das, was dem Vorstand vorbehalten ist, die
// Vorstand-Routen:
//  - Anlass anlegen, aendern (auch Organisator, "Termin noch offen",
//    PDF-Aushang), loeschen: `POST/PUT/DELETE events/:id`
//  - Vorschlaege: `GET events/proposals`, genehmigen = `PUT` mit Status
//    `planned`, ablehnen = `DELETE` (wie vorstand.html)
//  - Arbeitsplan an die Helfer senden: `POST events/:id/send-arbeitsplan`

import 'dart:convert';
import 'dart:typed_data';

import 'package:fwv_core/fwv_core.dart';

import 'modelle.dart';
import 'organisator_zugang.dart';

class VorstandZugang extends OrganisatorZugang {
  const VorstandZugang(super.api);

  @override
  String get bezeichnung => 'Anlässe';

  @override
  bool get kannAnlegen => true;

  @override
  bool get kannLoeschen => true;

  static String _e(String id) => Uri.encodeComponent(id);

  /// Wie das Backend sagt; dazu "Arbeitsplan senden" bei Anlaessen mit
  /// Schichten (das Backend bietet es nur dem externen Organisator an, der
  /// Vorstand hat seine eigene Route).
  @override
  AnlassRechte rechte(VerwalteterAnlass anlass) {
    final r = anlass.rechte;
    return AnlassRechte(
      bestaetigen: r.bestaetigen,
      hinzufuegen: r.hinzufuegen,
      bearbeiten: r.bearbeiten,
      loeschen: r.loeschen,
      alternative: r.alternative,
      mitteilen: r.mitteilen,
      anlassBearbeiten: r.anlassBearbeiten,
      schichten: r.schichten,
      notizen: r.notizen,
      material: r.material,
      einkauf: r.einkauf,
      arbeitsplanSenden: r.arbeitsplanSenden || anlass.anlass.hatSchichten,
      pdfTeilnehmerliste: r.pdfTeilnehmerliste,
      pdfArbeitsplan: r.pdfArbeitsplan,
      pdfAushang: r.pdfAushang,
    );
  }

  @override
  Future<String> arbeitsplanSenden(String anlassId) async {
    final antwort = await api.post('events/${_e(anlassId)}/send-arbeitsplan');
    return (antwort is Map ? jsonText(antwort['message']) : null) ?? 'Arbeitsplan versendet';
  }

  /// Vorstand-Route: kennt auch Organisator, "Termin noch offen" und den
  /// PDF-Aushang. Schickt nur Geaendertes.
  @override
  Future<bool> anlassAendern(String anlassId, AnlassEntwurf original, AnlassEntwurf neu) async {
    final body = neu.aenderungen(original);
    if (body.isEmpty) return false;
    await api.put('events/${_e(anlassId)}', daten: body);
    return true;
  }

  @override
  Future<String> anlassAnlegen(AnlassEntwurf entwurf) async {
    final o = await optionen();
    final antwort = await api.post(
      'events',
      daten: entwurf.alsNeuJson(anmeldepflichtig: o.anmeldepflichtigeKategorien),
    );
    final id = antwort is Map ? jsonText(antwort['id']) : null;
    if (id == null) throw const ApiFehler('Der Anlass wurde angelegt, aber ohne ID gemeldet.');
    return id;
  }

  @override
  Future<void> anlassLoeschen(String anlassId) => api.delete('events/${_e(anlassId)}');

  @override
  Future<List<OffenerVorschlag>> vorschlaege() async =>
      jsonListe(await api.get('events/proposals'), OffenerVorschlag.ausJson);

  @override
  Future<void> vorschlagFreigeben(String anlassId) =>
      api.put('events/${_e(anlassId)}', daten: const {'status': 'planned'});

  @override
  Future<void> vorschlagAblehnen(String anlassId) => api.delete('events/${_e(anlassId)}');

  @override
  Future<void> organisatorZuweisen(String anlassId, OrganisatorAngabe organisator) =>
      api.put('events/${_e(anlassId)}', daten: organisator.alsJson());

  @override
  Future<void> pdfAushangSetzen(String anlassId, GewaehlteDatei pdf) => api.put(
    'events/${_e(anlassId)}',
    daten: {'pdf_attachment': base64Encode(pdf.bytes), 'pdf_filename': pdf.dateiname},
  );

  @override
  Future<void> pdfAushangEntfernen(String anlassId) => api.put(
    'events/${_e(anlassId)}',
    daten: const {'pdf_attachment': null, 'pdf_filename': null},
  );
}

/// Groesster PDF-Aushang, den das Formular annimmt (wie vorstand.html).
const pdfHoechstGroesse = 10 * 1024 * 1024;

/// Beginnt die Datei wie ein PDF ("%PDF")?
bool istPdf(Uint8List bytes) =>
    bytes.length >= 4 &&
    bytes[0] == 0x25 &&
    bytes[1] == 0x50 &&
    bytes[2] == 0x44 &&
    bytes[3] == 0x46;
