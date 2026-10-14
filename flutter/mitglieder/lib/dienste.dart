// Alles, was die Oberflaeche von aussen braucht, an einer Stelle — damit
// Tests es durch Nachbauten ersetzen koennen (kein Netz, kein Browser, keine
// Kamera, kein echter Schluesselbund, kein Firebase).

import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart' show Rect;
import 'package:flutter/widgets.dart' show BuildContext;
import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:fwv_lager/fwv_lager.dart';
import 'package:fwv_roterschopf/fwv_roterschopf.dart';
import 'package:fwv_vorstand/fwv_vorstand.dart';
import 'package:file_picker/file_picker.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import 'anmeldung/authentik_anmeldung.dart';
import 'einstellungen/app_update.dart';
import 'einstellungen/kontakte_abgleich.dart';
import 'organisator/organisator_pruefung.dart';
import 'roterschopf/schopf_pruefung.dart';
import 'push/push_dienst.dart';
import 'web/browser.dart';

/// Datei teilen: Inhalt, Dateiname, MIME-Typ und (fuer iPad) die Stelle,
/// an der das Teilen-Menue erscheint.
typedef DateiTeilen = Future<void> Function(
  Uint8List bytes,
  String dateiname,
  String mimeTyp, {
  Rect? ursprung,
});

/// Auf welchem System die App laeuft (in Tests frei waehlbar).
enum Plattform { android, ios, andere }

/// Woher ein Profilfoto kommt.
enum FotoQuelle { kamera, galerie }

class Dienste {
  Dienste({
    required this.sitzung,
    required this.authentik,
    required this.uebernahme,
    this.qrScannen,
    GeheimSpeicher? speicher,
    this.push = const KeinPush(),
    this.kontakte = const KontakteAbgleich(),
    Future<Uint8List?> Function(FotoQuelle quelle)? fotoWaehlen,
    Future<String> Function()? appVersion,
    Future<bool> Function(Uri adresse)? linkOeffnen,
    DateiTeilen? dateiTeilen,
    DateTime Function()? jetzt,
    Plattform? plattform,
    Future<Uint8List> Function(Uint8List roh)? anhangVerkleinern,
    Future<Uint8List?> Function({required bool kamera})? dokumentFotoWaehlen,
    Future<GewaehlteDatei?> Function()? pdfWaehlen,
    Future<String?> Function(BuildContext context)? barcodeScannen,
    Uri? inventarBasis,
    this.update = const KeinAppUpdate(),
    this.roterSchopfTakt = const Duration(seconds: 20),
    // Nur die echte App fragt von selbst nach (Tests: kein Wecker).
    Duration? schopfPruefTakt,
  }) : speicher = speicher ?? SpeicherImArbeitsspeicher(),
       dokumentFotoWaehlen = dokumentFotoWaehlen ?? _dokumentFotoMitImagePicker,
       pdfWaehlen = pdfWaehlen ?? _pdfMitFilePicker,
       barcodeScannen = barcodeScannen ?? _barcodeMitKamera,
       inventarBasis = inventarBasis ?? inventarApiBasis,
       anhangVerkleinern = anhangVerkleinern ?? anhangBildVerkleinern,
       fotoWaehlen = fotoWaehlen ?? _fotoMitImagePicker,
       appVersion = appVersion ?? _appVersionAusPaket,
       linkOeffnen = linkOeffnen ?? _linkExtern,
       dateiTeilen = dateiTeilen ?? _teilenMitSharePlus,
       jetzt = jetzt ?? DateTime.now,
       plattform = plattform ?? _aktuellePlattform() {
    pushAnmeldung = PushAnmeldung(push: push, speicher: this.speicher);
    organisator = OrganisatorPruefung(sitzung);
    schopfPruefung = SchopfPruefung(
      sitzung,
      () => roterSchopf,
      jetzt: this.jetzt,
      takt: schopfPruefTakt,
    );
    sitzung.beiNeuemToken = _tokenAnKontakteGeben;
  }

  /// Die echte App: Geraete-Schluesselbund, echtes Backend, Firebase. Im
  /// Browser statt dessen localStorage und die Anmeldung der Website
  /// (web/browser.dart).
  factory Dienste.echt() {
    final geheim = kIsWeb ? browserSpeicher() : SichererSpeicher();
    final speicher = SitzungsSpeicher(geheim);
    final push = FirebasePush();
    const kontakte = KontakteAbgleich();
    late final Dienste dienste;
    final sitzung = SitzungsVerwaltung(
      speicher: speicher,
      // Im Browser erneuert das Backend (Client der Website).
      oidc: kIsWeb ? OidcKonfiguration.website : OidcKonfiguration.mitgliederApp,
      http: http.Client(),
      beimAbmelden: (api) => abmeldenAufraeumen(api, dienste),
    );
    dienste = Dienste(
      sitzung: sitzung,
      authentik: kIsWeb ? websiteAnmeldung() : AppAuthAnmeldung(),
      uebernahme: AltdatenUebernahme(
        quelle: const MethodChannelAltdatenQuelle(),
        speicher: speicher,
      ),
      speicher: geheim,
      push: push,
      kontakte: kontakte,
      update: !kIsWeb && Platform.isAndroid
          ? AndroidAppUpdate(appVersion: _appVersionAusPaket)
          : const KeinAppUpdate(),
      schopfPruefTakt: const Duration(minutes: 10),
    );
    push.beiAntippen = dienste.pushAngetippt;
    return dienste;
  }

  final SitzungsVerwaltung sitzung;
  final AuthentikAnmeldung authentik;
  final AltdatenUebernahme uebernahme;

  /// Ersetzt in Tests den Kamera-Screen; liefert den gelesenen Text.
  final Future<String?> Function()? qrScannen;

  /// Fuer kleine Dinge, die die App sich merkt (Newsletter-Stand,
  /// Geraete-Kennung). Nicht Teil der Sitzung, bleibt nach dem Abmelden.
  final GeheimSpeicher speicher;

  final PushDienst push;
  late final PushAnmeldung pushAnmeldung;

  /// Wohin eine angetippte Push-Mitteilung fuehrt (Reiter Vorstand und
  /// Bereich). Die Hauptseite wechselt dorthin, der Reiter Vorstand waehlt
  /// den Bereich und setzt es danach auf null zurueck.
  final pushZiel = ValueNotifier<PushZiel?>(null);

  /// Eine Push-Mitteilung wurde angetippt (FirebasePush.beiAntippen).
  void pushAngetippt(Map<String, Object?> daten) {
    final ziel = PushZiel.ausDaten(daten);
    if (ziel != null) pushZiel.value = ziel;
  }

  final KontakteAbgleich kontakte;

  /// Hinweis auf neue Versionen (Play bzw. GitHub-APK; in Tests keiner).
  final AppUpdate update;
  late final OrganisatorPruefung organisator;

  /// Reiter "Schopf" waehrend einer Schicht, auch ohne Gruppe.
  late final SchopfPruefung schopfPruefung;

  /// Foto aufnehmen oder auswaehlen; null bei Abbruch.
  final Future<Uint8List?> Function(FotoQuelle quelle) fotoWaehlen;

  /// "1.0.0 (1)".
  final Future<String> Function() appVersion;

  /// Oeffnet eine Adresse im Browser bzw. in der passenden App.
  final Future<bool> Function(Uri adresse) linkOeffnen;

  /// Gibt eine Datei (PDF, .ics) ueber das Teilen-Menue des Systems weiter
  /// — von dort laesst sie sich oeffnen, speichern oder verschicken.
  final DateiTeilen dateiTeilen;

  /// "Jetzt" (in Tests fest, z.B. fuer den Monat im Kalender).
  final DateTime Function() jetzt;

  final Plattform plattform;

  /// Bild fuer einen Notiz-Anhang verkleinern (1600 px, JPEG; in Tests
  /// ersetzt — das echte laeuft in einem eigenen Isolate).
  final Future<Uint8List> Function(Uint8List roh) anhangVerkleinern;

  /// Foto fuer Notizen und Belege (Rueckkamera bzw. Galerie); null bei
  /// Abbruch.
  final Future<Uint8List?> Function({required bool kamera}) dokumentFotoWaehlen;

  /// PDF vom Geraet waehlen (PDF-Aushang im Vorstand-Formular); null bei
  /// Abbruch. In Tests ersetzt.
  final Future<GewaehlteDatei?> Function() pdfWaehlen;

  /// Barcode lesen (Kamera-Screen aus fwv_lager; in Tests ersetzt).
  final Future<String?> Function(BuildContext context) barcodeScannen;

  /// Inventar-API (`https://inventar.fwv-raura.ch/api/`).
  final Uri inventarBasis;

  /// Darf diese Sitzung ins Lager? Authentik-Gruppe Lager, Vorstand oder
  /// admin — auch mit QR-Code angemeldet (die Gruppen stehen im Token);
  /// externe Organisatoren nie.
  bool get lagerSichtbar => hatLagerZugang(sitzung.sitzung);

  /// Lager (Paket fwv_lager, gemeinsam mit der spaeteren Vorstand-App):
  /// Inventar-API mit demselben Authentik-Token und demselben Erneuern.
  Lager get lager => Lager(
    zugang: ApiLagerZugang(sitzung.apiFuer(inventarBasis)),
    umgebung: LagerUmgebung(scannen: barcodeScannen),
    ausleihen: ausleihen,
  );

  /// Darf diese Sitzung in den Roten Schopf (Licht, Tiefkuehler, Musik)?
  /// Authentik-Gruppe Roter Schopf, Vorstand oder admin — auch mit QR-Code
  /// angemeldet; externe Organisatoren nie. Ohne Gruppe waehrend einer
  /// eigenen Schicht ([schopfPruefung]).
  bool get roterSchopfSichtbar =>
      hatRoterSchopfZugang(sitzung.sitzung) || schopfPruefung.schicht != null;

  /// Wie oft der Reiter "Schopf" von selbst nachliest, solange er offen ist
  /// (null in Tests: kein Takt).
  final Duration? roterSchopfTakt;

  /// Musik fuer den Laptop im Roten Schopf (Playlists, Radiosender) - fuer
  /// jedes Mitglied, wie im Mitgliederbereich der Webseite. Einer fuer die
  /// ganze App: er merkt sich die Hoer-Freigabe.
  late final MusikZugang musik = ApiMusikZugang(sitzung.api);

  MusikPlayer? _musikPlayer;

  /// Der eine Player der App - die Musik laeuft weiter, wenn man den
  /// Musik-Bereich verlaesst (und im Hintergrund).
  MusikPlayer get musikPlayer => _musikPlayer ??= MusikPlayer(zugang: musik);

  /// Roter Schopf (Paket fwv_roterschopf): api-members mit demselben Token.
  RoterSchopfZugang get roterSchopf => ApiRoterSchopfZugang(sitzung.api);

  /// Darf diese Sitzung ausleihen? Jedes angemeldete Mitglied, ob ueber
  /// Authentik oder per QR-Code (die Inventar-API prueft Mitglieder-Tokens
  /// bei api-members); externe Organisatoren sind keine Mitglieder.
  bool get ausleiheMoeglich => sitzung.sitzung?.mitgliedAngemeldet ?? false;

  /// Ausleihe (Paket fwv_lager): Inventar-API mit demselben Token; Fotos
  /// von Schaeden wie bei Belegen (Rueckkamera, 1600 px).
  Ausleihen get ausleihen => Ausleihen(
    zugang: ApiAusleiheZugang(sitzung.apiFuer(inventarBasis)),
    umgebung: AusleiheUmgebung(
      fotoWaehlen: dokumentFotoWaehlen,
      verkleinern: anhangVerkleinern,
      jetzt: jetzt,
    ),
  );

  /// Aufrufe rund ums eigene Mitglied.
  MitgliederDienst get mitglieder => MitgliederDienst(sitzung.api);

  /// Anlaesse, Kalender, Arbeitsplan, Anmeldungen.
  AnlaesseDienst get anlaesse => AnlaesseDienst(sitzung.api);

  /// Vorstand-Bereich (Paket fwv_vorstand): dieselbe Anlass-Verwaltung mit
  /// dem Vorstand-Zugang (alle aktuellen Anlaesse, anlegen, loeschen,
  /// Vorschlaege, Organisator zuweisen) plus Antraege, Mitglieder,
  /// Beitraege, Nachricht, Audit.
  VorstandDienste get vorstand {
    final umgebung = _verwaltungsUmgebung;
    return VorstandDienste(
      api: sitzung.api,
      anlaesse: AnlassVerwaltung(zugang: VorstandZugang(sitzung.api), umgebung: umgebung),
      umgebung: umgebung,
    );
  }

  /// Organisator-Bereich (Paket fwv_anlass, gemeinsam mit dem Reiter
  /// "Vorstand"): eigene Anlaesse; externe Organisatoren (Event-Login)
  /// ueber ihre eigenen Routen.
  AnlassVerwaltung get anlassVerwaltung => AnlassVerwaltung(
    zugang: OrganisatorZugang(
      sitzung.api,
      externerLogin: sitzung.sitzung?.kontotyp == Kontotyp.organisator,
    ),
    umgebung: _verwaltungsUmgebung,
  );

  VerwaltungsUmgebung get _verwaltungsUmgebung => VerwaltungsUmgebung(
    dateiTeilen: dateiTeilen,
    // Notizen und Belege: Rueckkamera (das Profilfoto nimmt die vordere).
    fotoWaehlen: dokumentFotoWaehlen,
    linkOeffnen: linkOeffnen,
    anhangVerkleinern: anhangVerkleinern,
    pdfWaehlen: pdfWaehlen,
  );

  /// Externe Organisatoren (Event-Login) haben kein Mitgliederkonto.
  bool get alsMitglied => _alsMitgliedAngemeldet;

  bool _warAngemeldet = false;

  /// Beim Start: alte Anmeldung uebernehmen (einmalig), dann Sitzung laden.
  /// Push wird daneben vorbereitet und haelt den Start nicht auf.
  Future<void> starten() async {
    await uebernahme.ausfuehren();
    await sitzung.laden();
    _warAngemeldet = sitzung.angemeldet;
    sitzung.addListener(_sitzungGeaendert);
    unawaited(_pushVorbereiten());
  }

  Future<void> _pushVorbereiten() async {
    await push.starten();
    push.beiNeuemToken = (token) {
      if (_alsMitgliedAngemeldet) unawaited(pushAnmeldung.anmelden(mitglieder, token: token));
    };
    // Wie MembersApp.kt: bei jedem Start erneut anmelden, damit ein einmal
    // gescheiterter Versuch nicht bis zum naechsten Login haengen bleibt.
    if (_alsMitgliedAngemeldet) await pushAnmeldung.anmelden(mitglieder);
  }

  bool get _alsMitgliedAngemeldet => sitzung.sitzung?.kontotyp == Kontotyp.mitglied;

  void _sitzungGeaendert() {
    final jetzt = sitzung.angemeldet;
    if (jetzt && !_warAngemeldet && _alsMitgliedAngemeldet) {
      // Frisch angemeldet: Erlaubnis fragen (Android 13+), Token anmelden.
      unawaited(() async {
        await push.erlaubnisAnfragen();
        await pushAnmeldung.anmelden(mitglieder);
      }());
    }
    _warAngemeldet = jetzt;
  }

  // ---------------------------------------------------------------------
  // Kontakt-Abgleich (nur Android)

  /// Der Abgleich laeuft im Hintergrund ohne Flutter und braucht ein
  /// gueltiges Token: beim Start, nach jedem Login und Erneuern das neue,
  /// beim Abmelden null. Externe Organisatoren haben kein Mitgliederkonto
  /// und duerfen die Mitgliederliste nicht abrufen — fuer sie null.
  void _tokenAnKontakteGeben(Sitzung? s) {
    if (plattform != Plattform.android) return;
    final token = s?.kontotyp == Kontotyp.mitglied ? s!.accessToken : null;
    unawaited(() async {
      try {
        await kontakte.tokenMitteilen(token);
      } on Object {
        // Ohne nativen Teil oder bei Fehlern: der Abgleich wartet aufs
        // naechste Token.
      }
    }());
  }

  /// Soll nach dem Login gefragt werden, ob die Mitglieder ins Adressbuch
  /// sollen? Nur auf Android, nur Mitglieder, nur einmal (die Antwort aus
  /// der alten App gilt mit, siehe [AltdatenUebernahme]).
  Future<bool> kontakteFrageOffen() async =>
      plattform == Plattform.android &&
      _alsMitgliedAngemeldet &&
      await speicher.lesen(SitzungsSchluessel.kontakteGefragt) != 'true';

  Future<void> kontakteGefragtMerken() =>
      speicher.schreiben(SitzungsSchluessel.kontakteGefragt, 'true');

  // ---------------------------------------------------------------------
  // Newsletter-Stand (nur lokal gemerkt — das Backend kennt keine Abfrage)

  static const _schluesselNewsletter = 'newsletter_abonniert';

  Future<bool> newsletterAbonniert() async => await speicher.lesen(_schluesselNewsletter) == 'true';

  Future<void> newsletterMerken(bool abonniert) =>
      speicher.schreiben(_schluesselNewsletter, abonniert.toString());
}

/// Haken beim Abmelden ([SitzungsVerwaltung.beimAbmelden]), solange das
/// Token noch gilt: Push-Token abmelden und auf Android den Kontakt-Abgleich
/// ausschalten — sonst blieben die FWV-Kontakte auf dem Geraet, wenn sich
/// danach jemand anders anmeldet (wie members-android SettingsFragment).
/// Wie in der alten App (TokenManager.clear) wird nach dem naechsten Login
/// wieder nach dem Adressbuch gefragt — die Kontakte sind ja entfernt. Das
/// Token erhaelt der Abgleich danach als null ([SitzungsVerwaltung.beiNeuemToken]).
Future<void> abmeldenAufraeumen(ApiClient api, Dienste dienste) async {
  // Nach dem Abmelden spielt nichts mehr weiter.
  await dienste._musikPlayer?.beenden();
  try {
    if (dienste.sitzung.sitzung?.kontotyp == Kontotyp.mitglied) {
      await pushTokenAbmelden(api, dienste.pushAnmeldung);
    }
  } finally {
    if (dienste.plattform == Plattform.android) {
      try {
        await dienste.kontakte.deaktivieren();
        await dienste.speicher.loeschen(SitzungsSchluessel.kontakteGefragt);
      } on Object {
        // Abmelden geht trotzdem.
      }
    }
  }
}

/// Meldet beim Abmelden das Push-Token dieses Geraets beim Backend ab
/// (`DELETE members/me/fcm-token`) und verwirft es auf dem Geraet, damit
/// keine Benachrichtigungen mehr ankommen.
Future<void> pushTokenAbmelden(ApiClient api, PushAnmeldung push) => push.abmelden(api);

Plattform _aktuellePlattform() {
  if (kIsWeb) return Plattform.andere;
  if (Platform.isAndroid) return Plattform.android;
  if (Platform.isIOS) return Plattform.ios;
  return Plattform.andere;
}

/// Das Geraet liefert schon kleiner (2048) und als JPEG; das endgueltige
/// Verkleinern auf 1024 mit EXIF-Drehung macht [fotoVerkleinern].
Future<Uint8List?> _fotoMitImagePicker(FotoQuelle quelle) async {
  final datei = await ImagePicker().pickImage(
    source: quelle == FotoQuelle.kamera ? ImageSource.camera : ImageSource.gallery,
    maxWidth: 2048,
    maxHeight: 2048,
    imageQuality: 95,
    preferredCameraDevice: CameraDevice.front,
  );
  return datei?.readAsBytes();
}

/// Fuer Kassenzettel und Plaene die Rueckkamera; verkleinert wird danach
/// auf 1600 px ([anhangBildVerkleinern]).
Future<Uint8List?> _dokumentFotoMitImagePicker({required bool kamera}) async {
  final datei = await ImagePicker().pickImage(
    source: kamera ? ImageSource.camera : ImageSource.gallery,
    maxWidth: 2400,
    maxHeight: 2400,
    imageQuality: 95,
    preferredCameraDevice: CameraDevice.rear,
  );
  return datei?.readAsBytes();
}

/// PDF ueber den Dateiwaehler des Systems (file_picker: Android Dokumente,
/// iOS Dateien, Web Datei-Dialog). Zu grosse Dateien werden gar nicht erst
/// gelesen; ob es wirklich ein PDF ist, prueft das Formular ([istPdf]).
Future<GewaehlteDatei?> _pdfMitFilePicker() async {
  final datei = await FilePicker.pickFile(
    dialogTitle: 'PDF-Aushang wählen',
    type: FileType.custom,
    allowedExtensions: const ['pdf'],
  );
  if (datei == null) return null;
  final groesse = datei.lengthSync() ?? await datei.length();
  if (groesse != null && groesse > pdfHoechstGroesse) {
    throw const ApiFehler('Das PDF darf höchstens 10 MB gross sein.');
  }
  return (bytes: await datei.readAsBytes(), dateiname: datei.name);
}

Future<String?> _barcodeMitKamera(BuildContext context) => barcodeScannen(context);

Future<String> _appVersionAusPaket() async {
  final info = await PackageInfo.fromPlatform();
  return info.buildNumber.isEmpty ? info.version : '${info.version} (${info.buildNumber})';
}

Future<void> _teilenMitSharePlus(
  Uint8List bytes,
  String dateiname,
  String mimeTyp, {
  Rect? ursprung,
}) async {
  await SharePlus.instance.share(
    ShareParams(
      files: [XFile.fromData(bytes, mimeType: mimeTyp, name: dateiname)],
      fileNameOverrides: [dateiname],
      sharePositionOrigin: ursprung,
    ),
  );
}

Future<bool> _linkExtern(Uri adresse) => launchUrl(adresse, mode: LaunchMode.externalApplication);
