// Alles, was die Oberflaeche von aussen braucht, an einer Stelle — damit
// Tests es durch Nachbauten ersetzen koennen (kein Netz, kein Browser, keine
// Kamera, kein echter Schluesselbund, kein Firebase).

import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import 'anmeldung/authentik_anmeldung.dart';
import 'einstellungen/kontakte_abgleich.dart';
import 'organisator/organisator_pruefung.dart';
import 'push/push_dienst.dart';

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
    Plattform? plattform,
  }) : speicher = speicher ?? SpeicherImArbeitsspeicher(),
       fotoWaehlen = fotoWaehlen ?? _fotoMitImagePicker,
       appVersion = appVersion ?? _appVersionAusPaket,
       linkOeffnen = linkOeffnen ?? _linkExtern,
       plattform = plattform ?? _aktuellePlattform() {
    pushAnmeldung = PushAnmeldung(push: push, speicher: this.speicher);
    organisator = OrganisatorPruefung(sitzung);
  }

  /// Die echte App: Geraete-Schluesselbund, echtes Backend, Firebase.
  factory Dienste.echt() {
    final geheim = SichererSpeicher();
    final speicher = SitzungsSpeicher(geheim);
    final push = FirebasePush();
    const kontakte = KontakteAbgleich();
    late final Dienste dienste;
    final sitzung = SitzungsVerwaltung(
      speicher: speicher,
      http: http.Client(),
      beimAbmelden: (api) => abmeldenAufraeumen(api, dienste),
    );
    return dienste = Dienste(
      sitzung: sitzung,
      authentik: AppAuthAnmeldung(),
      uebernahme: AltdatenUebernahme(
        quelle: const MethodChannelAltdatenQuelle(),
        speicher: speicher,
      ),
      speicher: geheim,
      push: push,
      kontakte: kontakte,
    );
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
  final KontakteAbgleich kontakte;
  late final OrganisatorPruefung organisator;

  /// Foto aufnehmen oder auswaehlen; null bei Abbruch.
  final Future<Uint8List?> Function(FotoQuelle quelle) fotoWaehlen;

  /// "1.0.0 (1)".
  final Future<String> Function() appVersion;

  /// Oeffnet eine Adresse im Browser bzw. in der passenden App.
  final Future<bool> Function(Uri adresse) linkOeffnen;

  final Plattform plattform;

  /// Aufrufe rund ums eigene Mitglied.
  MitgliederDienst get mitglieder => MitgliederDienst(sitzung.api);

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
Future<void> abmeldenAufraeumen(ApiClient api, Dienste dienste) async {
  try {
    if (dienste.sitzung.sitzung?.kontotyp == Kontotyp.mitglied) {
      await pushTokenAbmelden(api, dienste.pushAnmeldung);
    }
  } finally {
    if (dienste.plattform == Plattform.android) {
      try {
        await dienste.kontakte.deaktivieren();
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

Future<String> _appVersionAusPaket() async {
  final info = await PackageInfo.fromPlatform();
  return info.buildNumber.isEmpty ? info.version : '${info.version} (${info.buildNumber})';
}

Future<bool> _linkExtern(Uri adresse) => launchUrl(adresse, mode: LaunchMode.externalApplication);
