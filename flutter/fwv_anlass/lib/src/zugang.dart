// Zugang zur Anlass-Verwaltung — die einzige Stelle, ueber die die
// Oberflaeche dieses Pakets mit dem Backend spricht. Die Screens kennen keine
// Routen, nur diese Schnittstelle.
//
// Organisator und Vorstand verwalten Anlaesse fast gleich (Anmeldungen,
// Anlass bearbeiten, Schichten, Notizen, Material, PDFs). Der Unterschied
// liegt nur im Zugang:
//  - [OrganisatorZugang] (jetzt): die eigenen Anlaesse, befristet bis der
//    Anlass vorbei ist; Routen `…-as-organizer`, fuer externe Organisatoren
//    `events/my-event/…`; Uebersicht `GET events/organisator-uebersicht`.
//  - VorstandZugang (spaeter, Vorstand-App): alle Anlaesse plus Anlass
//    anlegen und loeschen und den Organisator zuweisen. Er implementiert
//    diese Klasse mit den Vorstand-Routen (`PUT events/:id`,
//    `POST registrations/:id/approve`, `POST events/:id/notify-registrants`
//    usw.) und setzt [kannAnlegen]/[kannLoeschen]. Die zusaetzlichen
//    Aufrufe (anlegen, loeschen, Organisator zuweisen) kommen dann hier als
//    neue Methoden dazu — mit einer Standard-Umsetzung, die
//    [NichtErlaubt] wirft, damit [OrganisatorZugang] unveraendert bleibt.
//
// Langfristig soll das Backend pro Aktion EINE Route haben, die selbst
// prueft "Vorstand oder Organisator dieses Anlasses und noch nicht vorbei".
// Dann schrumpfen beide Zugaenge auf dieselben Routen; die Oberflaeche merkt
// davon nichts.

import 'dart:typed_data';
import 'dart:ui' show Rect;

import 'package:fwv_core/fwv_core.dart';

import 'daten.dart';
import 'modelle.dart';

/// Wird geworfen, wenn ein Zugang eine Aktion nicht kann (die Oberflaeche
/// zeigt sie dann gar nicht erst an — siehe [AnlassRechte]).
class NichtErlaubt extends ApiFehler {
  const NichtErlaubt([super.meldung = 'Das ist mit diesem Zugang nicht möglich.']);
}

abstract class AnlassVerwaltungZugang {
  const AnlassVerwaltungZugang();

  /// Titel des Bereichs ("Organisator", spaeter "Vorstand").
  String get bezeichnung;

  /// Neue Anlaesse anlegen (nur Vorstand).
  bool get kannAnlegen => false;

  /// Anlaesse loeschen (nur Vorstand).
  bool get kannLoeschen => false;

  /// Alle Anlaesse dieses Zugangs mit Anmeldungen und Zahlen.
  Future<VerwaltungsUebersicht> uebersicht();

  /// Ein Anlass (UUID oder Slug); ohne ID der erste (externer Organisator
  /// mit genau einem Anlass).
  Future<VerwalteterAnlass> anlass(String? id) async {
    final u = await uebersicht();
    final a = (id == null || id.isEmpty)
        ? (u.anlaesse.isEmpty ? null : u.anlaesse.first)
        : u.anlassMitId(id);
    if (a == null) throw const NichtErlaubt('Diesen Anlass kannst du hier nicht verwalten.');
    return a;
  }

  /// Was an diesem Anlass geht. Standard: was das Backend mitliefert.
  AnlassRechte rechte(VerwalteterAnlass anlass) => anlass.rechte;

  /// Auswahllisten (Kategorien, Bereiche, Status).
  Future<EventOptionen> optionen();

  // Anmeldungen
  Future<void> bestaetigen(String anlassId, String anmeldungId);
  Future<void> ablehnen(String anlassId, String anmeldungId);

  /// Schickt nur Geaendertes; false, wenn es nichts zu senden gab.
  Future<bool> anmeldungAendern(
    String anlassId,
    VerwalteteAnmeldung anmeldung,
    AnmeldungEntwurf neu,
  );
  Future<void> anmeldungLoeschen(String anlassId, String anmeldungId);
  Future<void> personHinzufuegen(String anlassId, NeuePerson person);
  Future<List<VerzeichnisMitglied>> mitgliederVerzeichnis();
  Future<String> alternativeVorschlagen(
    String anlassId,
    String anmeldungId, {
    required String schichtId,
    required String schichtText,
    required String email,
    String? kommentar,
  });
  Future<MitteilungErgebnis> mitteilen(
    String anlassId, {
    required String betreff,
    required String nachricht,
  });
  Future<String> arbeitsplanSenden(String anlassId);

  // Anlass und Schichten
  Future<bool> anlassAendern(String anlassId, AnlassEntwurf original, AnlassEntwurf neu);
  Future<void> schichtAnlegen(String anlassId, SchichtEntwurf schicht);
  Future<bool> schichtAendern(
    String anlassId,
    String schichtId,
    SchichtEntwurf original,
    SchichtEntwurf neu,
  );
  Future<void> schichtLoeschen(String anlassId, String schichtId);

  // Notizen
  Future<List<Notiz>> notizen(String anlassId);
  Future<void> notizAnlegen(
    String anlassId, {
    String? text,
    List<AnhangUpload> anhaenge = const [],
  });
  Future<void> notizLoeschen(String anlassId, String notizId);
  Future<void> anhangLoeschen(String anlassId, String notizId, String anhangId);
  Future<Uint8List> anhang(String anlassId, String notizId, String anhangId);

  // Rezepte und Material
  Future<List<VerknuepftesRezept>> rezepte(String anlassId);
  Future<Einkaufsliste> einkaufsliste(String anlassId);
  Future<List<AuswahlRezept>> verfuegbareRezepte(String anlassId);
  Future<List<AuswahlMaterial>> verfuegbaresMaterial(String anlassId);
  Future<void> rezeptVerknuepfen(String anlassId, int rezeptId, int portionen);
  Future<void> portionenAendern(String anlassId, int rezeptId, int portionen);
  Future<void> rezeptLoesen(String anlassId, int rezeptId);
  Future<void> materialErfassen(String anlassId, int materialId, double menge);
  Future<void> materialEntfernen(String anlassId, int materialId);

  // PDFs
  Future<Uint8List> teilnehmerlistePdf(String anlassId);
  Future<Uint8List> aushangPdf(String anlassId);
  Future<Uint8List> arbeitsplanPdf(String anlassId);
}

/// Was die Oberflaeche vom Geraet braucht (Teilen-Menue, Kamera, Links) —
/// von der App mitgegeben, damit das Paket ohne Plattform-Plugins auskommt
/// und sich testen laesst.
class VerwaltungsUmgebung {
  const VerwaltungsUmgebung({
    required this.dateiTeilen,
    required this.fotoWaehlen,
    required this.linkOeffnen,
    this.anhangVerkleinern = anhangBildVerkleinern,
  });

  /// Datei ueber das Teilen-Menue weitergeben; [ursprung] fuer das iPad.
  final Future<void> Function(Uint8List bytes, String dateiname, String mimeTyp, {Rect? ursprung})
  dateiTeilen;

  /// Foto aufnehmen ([kamera]) oder auswaehlen; null bei Abbruch.
  final Future<Uint8List?> Function({required bool kamera}) fotoWaehlen;

  /// tel:, mailto:, https: oeffnen.
  final Future<bool> Function(Uri adresse) linkOeffnen;

  /// Bild fuer einen Notiz-Anhang verkleinern (1600 px, JPEG).
  final Future<Uint8List> Function(Uint8List roh) anhangVerkleinern;
}

/// Zugang und Umgebung zusammen — das, was jeder Screen bekommt.
class AnlassVerwaltung {
  const AnlassVerwaltung({required this.zugang, required this.umgebung});

  final AnlassVerwaltungZugang zugang;
  final VerwaltungsUmgebung umgebung;
}
