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
//  - [VorstandZugang] (Reiter "Vorstand" der Mitglieder-App): alle
//    aktuellen Anlaesse (auf Wunsch auch die vergangenen,
//    [kannVergangeneZeigen]) plus Anlass anlegen und loeschen, Vorschlaege,
//    Organisator zuweisen, PDF-Aushang. Fuer das Bestehende nimmt er die
//    `…-as-organizer`-Routen (die lassen Vorstand/Admin zu), fuer den Rest
//    die Vorstand-Routen (`POST/PUT/DELETE events/:id`,
//    `GET events/proposals`) und setzt [kannAnlegen]/[kannLoeschen]. Die
//    zusaetzlichen Aufrufe stehen unten mit einer Standard-Umsetzung, die
//    [NichtErlaubt] wirft - so bleibt [OrganisatorZugang] unveraendert.
//
// Langfristig soll das Backend pro Aktion EINE Route haben, die selbst
// prueft "Vorstand oder Organisator dieses Anlasses und noch nicht vorbei".
// Dann schrumpfen beide Zugaenge auf dieselben Routen; die Oberflaeche merkt
// davon nichts.

import 'dart:typed_data';
import 'dart:ui' show Rect;

import 'package:flutter/widgets.dart' show BuildContext;
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

  /// Kann die Uebersicht auch vergangene Anlaesse zeigen (nur Vorstand)?
  bool get kannVergangeneZeigen => false;

  /// Uebersicht mit den vergangenen Anlaessen dazu (Vorstand: letzte 24
  /// Monate, im Abschnitt "Vorbei"). Standard: wie [uebersicht].
  Future<VerwaltungsUebersicht> uebersichtMitVergangenen() => uebersicht();

  /// Ein Anlass (UUID oder Slug); ohne ID der erste (externer Organisator
  /// mit genau einem Anlass). Ein vergangener Anlass, den nur
  /// [uebersichtMitVergangenen] kennt, wird dort gesucht.
  Future<VerwalteterAnlass> anlass(String? id) async {
    final u = await uebersicht();
    var a = (id == null || id.isEmpty)
        ? (u.anlaesse.isEmpty ? null : u.anlaesse.first)
        : u.anlassMitId(id);
    if (a == null && id != null && id.isNotEmpty && kannVergangeneZeigen) {
      a = (await uebersichtMitVergangenen()).anlassMitId(id);
    }
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

  /// Person von Hand eintragen (gleich bestaetigt). Gibt den Hinweis des
  /// Backends zurueck (z.B. "Schicht bereits voll, trotzdem eingetragen …"),
  /// sonst null.
  Future<String?> personHinzufuegen(String anlassId, NeuePerson person);
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

  // Einkauf (nur mit [AnlassRechte.einkauf]): ueber das Events-Backend an
  // die Inventar-API — ersetzt die Einkaufs-PWA.

  /// Position der Einkaufsliste abhaken; [istMenge] = tatsaechlich gekauft
  /// (sonst bucht das Inventar "Bedarf minus Bestand" zurueck).
  Future<void> gekauftSetzen(String anlassId, int materialId, bool gekauft, {double? istMenge});
  Future<List<Beleg>> belege(String anlassId);

  /// Beleg-Foto (JPEG, schon verkleinert) hochladen.
  Future<void> belegHochladen(String anlassId, Uint8List jpeg);
  Future<Uint8List> belegBild(String anlassId, int belegId);
  Future<void> belegLoeschen(String anlassId, int belegId);

  /// Alles Abgehakte, noch nicht Eingebuchte ins Lager zurueckbuchen.
  Future<Zurueckbuchung> insLagerZurueckbuchen(String anlassId);

  // PDFs
  Future<Uint8List> teilnehmerlistePdf(String anlassId);
  Future<Uint8List> aushangPdf(String anlassId);
  Future<Uint8List> arbeitsplanPdf(String anlassId);

  // -------------------------------------------------------------------
  // Nur Vorstand ([kannAnlegen]/[kannLoeschen]). Standard: [NichtErlaubt],
  // damit der OrganisatorZugang unveraendert bleibt.

  /// Neuer Anlass ([AnlassEntwurf.alsNeuJson]); gibt die ID zurueck.
  /// Schichten legt die Oberflaeche danach mit [schichtAnlegen] an.
  Future<String> anlassAnlegen(AnlassEntwurf entwurf) async => throw const NichtErlaubt();

  /// Anlass mit Schichten und Anmeldungen loeschen.
  Future<void> anlassLoeschen(String anlassId) async => throw const NichtErlaubt();

  /// Offene Anlass-Vorschlaege von Mitgliedern.
  Future<List<OffenerVorschlag>> vorschlaege() async => throw const NichtErlaubt();

  /// Vorschlag genehmigen (Status `planned`; der Vorschlagende bleibt
  /// Organisator und bekommt eine Push-Nachricht).
  Future<void> vorschlagFreigeben(String anlassId) async => throw const NichtErlaubt();

  /// Vorschlag ablehnen (der vorgeschlagene Anlass wird geloescht).
  Future<void> vorschlagAblehnen(String anlassId) async => throw const NichtErlaubt();

  /// Organisator setzen: Mitglied oder extern (auf Wunsch mit Zugang).
  Future<void> organisatorZuweisen(String anlassId, OrganisatorAngabe organisator) async =>
      throw const NichtErlaubt();

  /// PDF-Aushang anhaengen (ersetzt einen bisherigen).
  Future<void> pdfAushangSetzen(String anlassId, GewaehlteDatei pdf) async =>
      throw const NichtErlaubt();

  /// PDF-Aushang entfernen.
  Future<void> pdfAushangEntfernen(String anlassId) async => throw const NichtErlaubt();

  // -------------------------------------------------------------------
  // TWINT-QR fuer die Kasse (Vorstand und Organisatoren). Die Kasse zeigt
  // bei TWINT den QR des laufenden Anlasses; ohne eigenen gilt der
  // Vereins-QR. Wird sofort gespeichert, nicht erst mit dem Formular.

  /// Bild hochladen (ersetzt ein bisheriges); gibt die neue Adresse
  /// (`twint_qr_url`) zurueck.
  Future<String?> twintQrSetzen(String anlassId, GewaehlteDatei bild) async =>
      throw const NichtErlaubt();

  /// Eigenen QR entfernen (danach gilt der Vereins-QR).
  Future<void> twintQrEntfernen(String anlassId) async => throw const NichtErlaubt();

  /// Das hochgeladene Bild (Vorschau).
  Future<Uint8List> twintQrBild(String anlassId) async => throw const NichtErlaubt();

  // -------------------------------------------------------------------
  // Mitorganisatoren (Vorstand und Haupt-Organisator verwalten, siehe
  // [AnlassRechte.organisatorenVerwalten]). Standard: [NichtErlaubt].

  /// Haupt-Organisator und Mitorganisatoren.
  Future<OrganisatorenListe> organisatoren(String anlassId) async => throw const NichtErlaubt();

  /// Mitglied oder extern (bekommt einen eigenen Login per E-Mail).
  Future<OrganisatorEintrag> mitorganisatorHinzufuegen(
    String anlassId,
    NeuerMitorganisator neu,
  ) async => throw const NichtErlaubt();

  /// Entfernen; ein Login des Externen gilt ab sofort nicht mehr.
  Future<void> mitorganisatorEntfernen(String anlassId, String eintragId) async =>
      throw const NichtErlaubt();
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
    this.pdfWaehlen,
    this.bildWaehlen,
  });

  /// Bild vom Geraet waehlen (TWINT-QR fuer die Kasse), unveraendert - ein
  /// verkleinerter QR liesse sich schlechter scannen. null bei Abbruch;
  /// ohne diese Funktion bietet das Formular nur das Entfernen an.
  final Future<GewaehlteDatei?> Function()? bildWaehlen;

  /// PDF vom Geraet waehlen (PDF-Aushang); null bei Abbruch. Ohne diese
  /// Funktion (die App hat noch keinen Dateiwaehler) bietet das Formular
  /// nur das Entfernen an.
  final Future<GewaehlteDatei?> Function()? pdfWaehlen;

  /// Datei ueber das Teilen-Menue weitergeben; [ursprung] fuer das iPad.
  final Future<void> Function(Uint8List bytes, String dateiname, String mimeTyp, {Rect? ursprung})
  dateiTeilen;

  /// Foto aufnehmen ([kamera]) oder auswaehlen; null bei Abbruch.
  final Future<Uint8List?> Function({required bool kamera}) fotoWaehlen;

  /// tel:, mailto:, https: oeffnen.
  final Future<bool> Function(Uri adresse) linkOeffnen;

  /// Bild fuer einen Notiz-Anhang oder Beleg verkleinern (1600 px, JPEG).
  final Future<Uint8List> Function(Uint8List roh) anhangVerkleinern;
}

/// Zugang und Umgebung zusammen — das, was jeder Screen bekommt.
class AnlassVerwaltung {
  const AnlassVerwaltung({required this.zugang, required this.umgebung, this.einladen});

  final AnlassVerwaltungZugang zugang;
  final VerwaltungsUmgebung umgebung;

  /// Einladung an die Mitglieder verfassen (nur Vorstand: oeffnet
  /// "Verfassen" aus fwv_vorstand). Ohne fehlt der Knopf "Einladung".
  final Future<void> Function(BuildContext context, Anlass anlass)? einladen;
}

/// Groesstes TWINT-QR-Bild (wie das Backend, src/kasse-anlass.js).
const twintQrHoechstGroesse = 2 * 1024 * 1024;

/// Bildtyp nach Inhalt (PNG, JPEG, WebP, GIF) - sonst null. Das Backend
/// prueft dasselbe; hier nur, damit die Meldung gleich beim Waehlen kommt.
String? bildTyp(Uint8List b) {
  bool beginnt(List<int> z, [int ab = 0]) {
    if (b.length < ab + z.length) return false;
    for (var i = 0; i < z.length; i++) {
      if (b[ab + i] != z[i]) return false;
    }
    return true;
  }

  if (beginnt(const [0x89, 0x50, 0x4e, 0x47])) return 'image/png';
  if (beginnt(const [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (beginnt(const [0x52, 0x49, 0x46, 0x46]) && beginnt(const [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp';
  }
  if (beginnt(const [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  return null;
}
