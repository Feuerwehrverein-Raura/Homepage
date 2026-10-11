// Zugang zum Lager — die einzige Stelle, ueber die die Oberflaeche dieses
// Pakets mit dem Backend spricht (wie AnlassVerwaltungZugang in fwv_anlass).
// Die Screens kennen keine Routen.
//
// Heute gibt es einen Zugang: [ApiLagerZugang] auf die Inventar-API mit dem
// Authentik-Token der App. Die Vorstand-App bindet dasselbe Paket ein.

import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import 'ausleihe/zugang.dart';
import 'modelle.dart';
import 'ui/scanner_screen.dart';

/// Authentik-Gruppen, die ins Lager duerfen (Gross-/Kleinschreibung egal).
/// Dieselbe Regel prueft die Inventar-API (src/zugang.ts) — die App
/// entscheidet damit nur, ob sie den Reiter zeigt.
const lagerGruppen = ['Lager', 'Vorstand', 'admin'];

/// Darf diese Sitzung ins Lager? (QR-Login und externe Organisatoren nie.)
bool hatLagerZugang(Sitzung? sitzung) => sitzung?.hatGruppe(lagerGruppen) ?? false;

abstract class LagerZugang {
  const LagerZugang();

  /// Aktive Artikel, nach Name; [suche] in Name, EAN und eigenem Code.
  Future<List<Artikel>> artikel({String? suche});

  /// Ein Artikel mit Bestand je Lagerort ([Artikel.orte]).
  Future<Artikel> artikelDetail(int id);

  /// Letzte Buchungen eines Artikels, neueste zuerst.
  Future<List<Buchung>> verlauf(int artikelId, {int anzahl = 10});

  /// Bucht [menge] (ganze Zahl > 0) ein oder aus; [notiz] erscheint als
  /// Grund im Verlauf. Gibt den neuen Bestand zurueck.
  Future<int> buchen(int artikelId, BuchungsArt art, int menge, {String? notiz});

  /// Was ist dieser Code? Im Lager, in einem fremden Verzeichnis, unbekannt.
  Future<ScanTreffer> codeSuchen(String code);

  /// Einen gescannten Code (EAN) einem bestehenden Artikel zuordnen.
  Future<Artikel> codeZuordnen(int artikelId, String code);

  Future<List<Lagerort>> lagerorte();
  Future<LagerortInhalt> lagerort(int id);

  /// Bestand auf oder unter dem Mindestbestand.
  Future<List<Artikel>> nachbestellen();

  Future<List<Kategorie>> kategorien();

  /// Der eigene Code, den der naechste Artikel ohne EAN bekommt.
  Future<String?> naechsterCode();

  Future<Artikel> anlegen(NeuerArtikel artikel);

  /// Artikel fuer die Ausleihe freigeben oder sperren.
  Future<void> artikelAusleihbar(int artikelId, bool ausleihbar);

  /// Lagerort als ganze Kiste fuer die Ausleihe freigeben oder sperren.
  Future<void> lagerortAusleihbar(int lagerortId, bool ausleihbar);

  /// Volle Adresse eines Artikelbilds, oder null.
  Uri? bildAdresse(String? pfad) => null;

  /// Kopfzeilen fuer das Laden des Bilds (z.B. das Token).
  Map<String, String> bildKopfzeilen(Uri adresse) => const {};
}

/// Was die Oberflaeche vom Geraet braucht — von der App mitgegeben, damit
/// sich das Paket ohne Kamera testen laesst.
class LagerUmgebung {
  const LagerUmgebung({this.scannen = barcodeScannen});

  /// Kamera oeffnen und einen Code lesen; null bei Abbruch.
  final Future<String?> Function(BuildContext context) scannen;
}

/// Zugang und Umgebung zusammen — das, was jeder Screen bekommt.
class Lager {
  const Lager({required this.zugang, this.umgebung = const LagerUmgebung(), this.ausleihen});

  final LagerZugang zugang;
  final LagerUmgebung umgebung;

  /// Ausleihe verwalten (Kommend/Ausgegeben/...). Ohne: kein Eintrag im
  /// Lager.
  final Ausleihen? ausleihen;
}

/// QR-Etiketten der Inventar-PWA enthalten die Adresse des Artikels
/// (`https://inventar.fwv-raura.ch/item/FWV000123`); gemeint ist der Code
/// am Ende. Alles andere (EAN, Code128) ist schon der Code.
String codeAusScan(String gelesen) {
  final t = gelesen.trim();
  final m = RegExp(r'^https?://inventar\.fwv-raura\.ch/item/([A-Za-z0-9]+)/?$').firstMatch(t);
  return m != null ? m.group(1)!.toUpperCase() : t;
}
