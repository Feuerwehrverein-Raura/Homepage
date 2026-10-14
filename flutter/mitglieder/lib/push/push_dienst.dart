// Push-Nachrichten ueber Firebase Cloud Messaging — dasselbe
// Firebase-Projekt wie die alte Android-App (android/app/google-services.json
// ist von members-android kopiert).
//
// Ablauf wie in members-android (MembersApp.kt, FwvFirebaseMessagingService):
//  - Beim Start, nach dem Login und bei jedem neuen Token meldet die App ihr
//    Token beim Backend an (`POST members/me/fcm-token`).
//  - Im Vordergrund zeigt Android eine Push-Nachricht nicht selbst an; die
//    App zeigt sie im Kanal "fwv_general" (flutter_local_notifications).
//    Im Hintergrund zeigt Android sie selbst an (Kanal und Symbol aus dem
//    Manifest). Antippen oeffnet die App.
//  - Mitteilungen an den Vorstand (`notificationType` vorstand_*, siehe
//    docker/backend-members/src/vorstand-melder.js) kommen im eigenen Kanal
//    "fwv_vorstand" (Vorstand) - so laesst er sich auf dem Telefon getrennt
//    stumm schalten. Antippen oeffnet den Reiter Vorstand im passenden
//    Bereich (`data.bereich`, [PushZiel]).
//  - Andere Mitteilungen fuehren zum Anlass (`data.eventId`), ins Profil
//    (`data.ziel`) oder zeigen sich ohne Ziel nochmals als Dialog
//    ([PushZiel.ausDaten]). Titel und Text gehen dafuer mit ([mitText]).
//  - Beim Abmelden wird das Token beim Backend abgemeldet
//    (`DELETE members/me/fcm-token`) und auf dem Geraet verworfen — so kommt
//    auch dann nichts mehr an, wenn das Abmelden beim Backend scheitert (das
//    Backend raeumt ungueltige Tokens beim naechsten Versand selbst weg).
//
// iOS: Push ist an, sobald ios/Runner/GoogleService-Info.plist im App-Bundle
// liegt (Firebase-Projekt fwv-raura-mitglieder, App ch.fwvraura.members).
// Das prueft die App beim Start ueber den Kanal "ch.fwvraura.members/firebase"
// (AppDelegate.swift); ohne die Datei wird Firebase gar nicht erst gestartet
// — FirebaseApp.configure() wuerde die App sonst abbrechen. Damit Nachrichten
// tatsaechlich ankommen, braucht es zusaetzlich den APNs-Schluessel in
// Firebase und die Push-Faehigkeit im Xcode-Projekt (siehe
// docs/flutter-mitglieder-app-plan.md).

import 'dart:async';
import 'dart:convert';
import 'dart:io' show Platform;
import 'dart:math';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show MethodChannel;
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:fwv_core/fwv_core.dart';

/// Wohin das Antippen einer Push-Mitteilung fuehrt ([PushZiel.ausDaten]).
/// Die Hauptseite fuehrt dorthin ([Dienste.pushZiel]).
///
/// Schluessel in den Daten der Nachricht (docker/backend-events/src/push-ziel.js,
/// docker/backend-members/src/push-daten.js):
///  - notificationType vorstand_*: Reiter Vorstand, Bereich `bereich`.
///  - ziel 'anlass' + eventId (event_update und shift_reminder auch ohne
///    ziel): der Anlass.
///  - ziel 'profil' bzw. 'beitraege': Reiter Profil.
///  - sonst (z.B. Push an alle ohne Ziel, aeltere Nachrichten): die
///    Mitteilung nochmals als Dialog (`title`, `body`).
@immutable
sealed class PushZiel {
  const PushZiel();

  /// Aus den Daten der Nachricht; null, wenn sie nirgends hinfuehrt.
  static PushZiel? ausDaten(Map<String, Object?> daten) {
    String? wert(String schluessel) {
      final w = daten[schluessel];
      return w is String && w.trim().isNotEmpty ? w.trim() : null;
    }

    final art = wert('notificationType');
    // "Im Schopf laeuft ..." - nur die App oeffnen.
    if (art == 'schopf_musik') return null;
    if (art != null && art.startsWith('vorstand_')) {
      return VorstandZiel(
        // Ohne Bereich (aeltere Backends): wenigstens der Reiter Vorstand.
        bereich: wert('bereich') ?? 'antraege',
        id: wert('id'),
      );
    }
    final ziel = wert('ziel');
    final anlass = wert('eventId');
    final zumAnlass =
        ziel == 'anlass' || (ziel == null && (art == 'event_update' || art == 'shift_reminder'));
    if (zumAnlass && anlass != null) return AnlassZiel(anlass);
    final titel = wert('title');
    final text = wert('body');
    if (ziel == 'profil') return const ProfilZiel();
    if (ziel == 'beitraege') return ProfilZiel(beitraege: true, titel: titel, text: text);
    if (titel == null && text == null) return null;
    return MitteilungZiel(titel: titel ?? 'FWV Raura', text: text ?? '');
  }
}

/// Mitteilung an den Vorstand: Reiter Vorstand, Bereich [bereich]
/// (Schluessel aus fwv_vorstand `vorstandBereiche`, z.B. "antraege"),
/// optional mit [id].
final class VorstandZiel extends PushZiel {
  const VorstandZiel({required this.bereich, this.id});

  final String bereich;
  final String? id;

  @override
  bool operator ==(Object other) =>
      other is VorstandZiel && other.bereich == bereich && other.id == id;

  @override
  int get hashCode => Object.hash(bereich, id);

  @override
  String toString() => 'VorstandZiel($bereich, $id)';
}

/// Ein Anlass (UUID): Reiter Anlaesse und die Detailseite.
final class AnlassZiel extends PushZiel {
  const AnlassZiel(this.anlassId);

  final String anlassId;

  @override
  bool operator ==(Object other) => other is AnlassZiel && other.anlassId == anlassId;

  @override
  int get hashCode => anlassId.hashCode;

  @override
  String toString() => 'AnlassZiel($anlassId)';
}

/// Reiter Profil. Bei [beitraege] (Zahlung verbucht, Beitrag offen) zeigt
/// die App die Mitteilung zusaetzlich als Dialog - eine eigene Beitrags-
/// Ansicht fuer Mitglieder gibt es (noch) nicht.
final class ProfilZiel extends PushZiel {
  const ProfilZiel({this.beitraege = false, this.titel, this.text});

  final bool beitraege;
  final String? titel;
  final String? text;

  @override
  bool operator ==(Object other) =>
      other is ProfilZiel &&
      other.beitraege == beitraege &&
      other.titel == titel &&
      other.text == text;

  @override
  int get hashCode => Object.hash(beitraege, titel, text);

  @override
  String toString() => 'ProfilZiel(beitraege: $beitraege, $titel)';
}

/// Ohne Ziel: die Mitteilung nach dem Oeffnen nochmals als Dialog, damit
/// sie nicht verloren geht.
final class MitteilungZiel extends PushZiel {
  const MitteilungZiel({required this.titel, required this.text});

  final String titel;
  final String text;

  @override
  bool operator ==(Object other) =>
      other is MitteilungZiel && other.titel == titel && other.text == text;

  @override
  int get hashCode => Object.hash(titel, text);

  @override
  String toString() => 'MitteilungZiel($titel)';
}

/// Ist das eine Mitteilung an den Vorstand (eigener Android-Kanal)?
bool istVorstandMitteilung(Map<String, Object?> daten) {
  final art = daten['notificationType'];
  return art is String && art.startsWith('vorstand_');
}

/// Die Daten einer Nachricht mit `title` und `body` (aus `notification`),
/// soweit sie dort fehlen.
Map<String, Object?> mitText(Map<String, Object?> daten, {String? titel, String? text}) => {
  ...daten,
  if (titel != null && daten['title'] == null) 'title': titel,
  if (text != null && daten['body'] == null) 'body': text,
};

/// Ob dieses Geraet Mitteilungen anzeigen darf.
enum PushErlaubnis { erlaubt, abgelehnt, nichtGefragt, nichtVerfuegbar }

abstract interface class PushDienst {
  /// Einmal beim App-Start. Darf nie werfen — ohne Push laeuft die App
  /// trotzdem.
  Future<void> starten();

  /// Gibt es auf dieser Plattform Push?
  bool get verfuegbar;

  /// Wird bei einem neuen Token aufgerufen (die App meldet es dann an).
  set beiNeuemToken(void Function(String token)? rueckruf);

  /// Das aktuelle FCM-Token, oder null.
  Future<String?> token();

  Future<PushErlaubnis> erlaubnis();

  /// Fragt nach der Erlaubnis (Android 13+, iOS).
  Future<PushErlaubnis> erlaubnisAnfragen();

  /// Verwirft das Token auf dem Geraet (nach dem Abmelden).
  Future<void> tokenVerwerfen();

  /// "android" oder "ios" fuer das Backend.
  String get plattform;
}

/// Fuer Tests und Plattformen ohne Push.
class KeinPush implements PushDienst {
  const KeinPush();

  @override
  Future<void> starten() async {}

  @override
  bool get verfuegbar => false;

  @override
  set beiNeuemToken(void Function(String token)? rueckruf) {}

  @override
  Future<String?> token() async => null;

  @override
  Future<PushErlaubnis> erlaubnis() async => PushErlaubnis.nichtVerfuegbar;

  @override
  Future<PushErlaubnis> erlaubnisAnfragen() async => PushErlaubnis.nichtVerfuegbar;

  @override
  Future<void> tokenVerwerfen() async {}

  @override
  String get plattform => 'android';
}

class FirebasePush implements PushDienst {
  FirebasePush();

  /// Fragt die iOS-App, ob sie eine GoogleService-Info.plist mitbringt.
  static const _firebaseKanal = MethodChannel('ch.fwvraura.members/firebase');

  /// Auf iOS erst nach [starten] bekannt: Ist Firebase eingerichtet?
  bool _iosKonfiguriert = false;

  /// Kanal wie in der alten App, damit die Einstellungen der Nutzer bleiben.
  static const kanal = AndroidNotificationChannel(
    'fwv_general',
    'FWV-Mitteilungen',
    description: 'Anlässe, Anmeldungen, Schicht-Erinnerungen und Newsletter',
  );

  /// Eigener Kanal fuer Mitteilungen an den Vorstand (Wichtigkeit normal).
  static const vorstandKanal = AndroidNotificationChannel(
    'fwv_vorstand',
    'Vorstand',
    description: 'Neue Anträge, Austritte, Löschungen und Anmeldungen',
    importance: Importance.defaultImportance,
  );

  /// Wird aufgerufen, wenn eine Mitteilung angetippt wurde (auch die, mit
  /// der die App gestartet wurde) - mit den Daten der Nachricht.
  void Function(Map<String, Object?> daten)? beiAntippen;

  final _anzeige = FlutterLocalNotificationsPlugin();
  bool _bereit = false;
  void Function(String token)? _beiNeuemToken;
  StreamSubscription<String>? _tokenAbo;
  StreamSubscription<RemoteMessage>? _nachrichtAbo;
  StreamSubscription<RemoteMessage>? _geoeffnetAbo;

  @override
  bool get verfuegbar => !kIsWeb && (Platform.isAndroid || (Platform.isIOS && _iosKonfiguriert));

  @override
  String get plattform => Platform.isIOS ? 'ios' : 'android';

  @override
  set beiNeuemToken(void Function(String token)? rueckruf) => _beiNeuemToken = rueckruf;

  @override
  Future<void> starten() async {
    if (_bereit || kIsWeb) return;
    if (Platform.isIOS) _iosKonfiguriert = await _iosFirebaseKonfiguriert();
    if (!verfuegbar) return;
    try {
      // Android liest die Einstellungen aus google-services.json (Gradle-
      // Plugin), iOS spaeter aus GoogleService-Info.plist.
      await Firebase.initializeApp();
      await _anzeige.initialize(
        settings: const InitializationSettings(
          android: AndroidInitializationSettings('ic_benachrichtigung'),
          iOS: DarwinInitializationSettings(
            requestAlertPermission: false,
            requestBadgePermission: false,
            requestSoundPermission: false,
          ),
        ),
        // Angetippt, waehrend die App lief (selbst gezeigt, siehe
        // _imVordergrund): die Daten stecken im payload.
        onDidReceiveNotificationResponse: (antwort) => _angetipptPayload(antwort.payload),
      );
      final android = _anzeige
          .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
      await android?.createNotificationChannel(kanal);
      await android?.createNotificationChannel(vorstandKanal);
      // iOS zeigt Nachrichten im Vordergrund selbst an, wenn man es sagt.
      await FirebaseMessaging.instance.setForegroundNotificationPresentationOptions(
        alert: true,
        badge: true,
        sound: true,
      );
      final m = FirebaseMessaging.instance;
      _tokenAbo = m.onTokenRefresh.listen((t) => _beiNeuemToken?.call(t));
      _nachrichtAbo = FirebaseMessaging.onMessage.listen(_imVordergrund);
      // Angetippt im Hintergrund (Android zeigte sie selbst an, bzw. iOS).
      _geoeffnetAbo = FirebaseMessaging.onMessageOpenedApp.listen((n) => _angetippt(_daten(n)));
      _bereit = true;
      // Die App wurde durch Antippen gestartet: von Firebase (Hintergrund)
      // oder von der selbst gezeigten Mitteilung.
      final start = await m.getInitialMessage();
      if (start != null) {
        _angetippt(_daten(start));
      } else if (Platform.isAndroid) {
        final details = await _anzeige.getNotificationAppLaunchDetails();
        if (details?.didNotificationLaunchApp ?? false) {
          _angetipptPayload(details!.notificationResponse?.payload);
        }
      }
    } on Object catch (e) {
      debugPrint('Push nicht verfuegbar: $e');
    }
  }

  /// Liegt GoogleService-Info.plist im App-Bundle? Im Zweifel nein.
  static Future<bool> _iosFirebaseKonfiguriert() async {
    try {
      return await _firebaseKanal.invokeMethod<bool>('konfiguriert') ?? false;
    } on Object catch (e) {
      debugPrint('Firebase-Einrichtung unbekannt: $e');
      return false;
    }
  }

  /// Nachricht, waehrend die App offen ist: Android zeigt sie nicht selbst
  /// an. Beide Formate wie in der alten App: `notification` oder nur `data`.
  void _imVordergrund(RemoteMessage n) {
    if (!Platform.isAndroid) return;
    // "Im Schopf laeuft ..." zeigt Android selbst als Mini-Player oben
    // (android/.../schopf/SchopfPlayer.kt) - hier nichts tun.
    if (n.data['notificationType'] == 'schopf_musik') return;
    final titel = n.notification?.title ?? n.data['title'] ?? 'FWV Raura';
    final text = n.notification?.body ?? n.data['body'] ?? '';
    final k = istVorstandMitteilung(n.data) ? vorstandKanal : kanal;
    _anzeige.show(
      id: Random().nextInt(1 << 31),
      title: titel,
      body: text,
      // Titel und Text mit: ohne Ziel zeigt die App sie nach dem Antippen
      // nochmals ([MitteilungZiel]).
      payload: jsonEncode(mitText(n.data, titel: titel, text: text)),
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          k.id,
          k.name,
          channelDescription: k.description,
          importance: k.importance,
          icon: 'ic_benachrichtigung',
          styleInformation: BigTextStyleInformation(text),
        ),
      ),
    );
  }

  /// Daten einer angetippten Nachricht, mit Titel und Text aus
  /// `notification` (die FCM-Daten selbst haben sie nicht).
  static Map<String, Object?> _daten(RemoteMessage n) =>
      mitText(n.data, titel: n.notification?.title, text: n.notification?.body);

  void _angetippt(Map<String, Object?> daten) {
    try {
      beiAntippen?.call(daten);
    } on Object catch (e) {
      debugPrint('Antippen nicht verarbeitet: $e');
    }
  }

  void _angetipptPayload(String? payload) {
    if (payload == null || payload.isEmpty) return;
    try {
      final daten = jsonDecode(payload);
      if (daten is Map) _angetippt(daten.cast<String, Object?>());
    } on FormatException {
      // Aeltere Mitteilungen ohne Daten: nur die App oeffnen.
    }
  }

  @override
  Future<String?> token() async {
    if (!_bereit) return null;
    try {
      return await FirebaseMessaging.instance.getToken();
    } on Object catch (e) {
      debugPrint('Kein Push-Token: $e');
      return null;
    }
  }

  @override
  Future<PushErlaubnis> erlaubnis() async {
    if (!_bereit) return PushErlaubnis.nichtVerfuegbar;
    try {
      return _umrechnen((await FirebaseMessaging.instance.getNotificationSettings()));
    } on Object {
      return PushErlaubnis.nichtVerfuegbar;
    }
  }

  @override
  Future<PushErlaubnis> erlaubnisAnfragen() async {
    if (!_bereit) return PushErlaubnis.nichtVerfuegbar;
    try {
      return _umrechnen(await FirebaseMessaging.instance.requestPermission());
    } on Object {
      return PushErlaubnis.nichtVerfuegbar;
    }
  }

  PushErlaubnis _umrechnen(NotificationSettings s) => switch (s.authorizationStatus) {
    AuthorizationStatus.authorized || AuthorizationStatus.provisional => PushErlaubnis.erlaubt,
    AuthorizationStatus.denied || AuthorizationStatus.deniedPermanently => PushErlaubnis.abgelehnt,
    AuthorizationStatus.notDetermined => PushErlaubnis.nichtGefragt,
  };

  @override
  Future<void> tokenVerwerfen() async {
    if (!_bereit) return;
    try {
      await FirebaseMessaging.instance.deleteToken();
    } on Object catch (e) {
      debugPrint('Push-Token nicht verworfen: $e');
    }
  }

  /// Nur fuer Aufraeumen in Tests/Hot-Restart.
  Future<void> beenden() async {
    await _tokenAbo?.cancel();
    await _nachrichtAbo?.cancel();
    await _geoeffnetAbo?.cancel();
  }
}

/// Meldet das Push-Token beim Backend an und haelt die Geraete-Kennung
/// (eine Zufallszahl, die beim ersten Mal entsteht und auch das Abmelden
/// ueberdauert).
class PushAnmeldung {
  PushAnmeldung({required this.push, required this.speicher});

  final PushDienst push;
  final GeheimSpeicher speicher;

  static const _schluesselGeraet = 'geraete_id';

  /// Zuletzt beim Backend angemeldetes Token (nur im Arbeitsspeicher).
  String? _angemeldet;

  Future<String> geraeteId() async {
    final vorhanden = await speicher.lesen(_schluesselGeraet);
    if (vorhanden != null && vorhanden.isNotEmpty) return vorhanden;
    final zufall = Random.secure();
    final neu = List.generate(
      16,
      (_) => zufall.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
    await speicher.schreiben(_schluesselGeraet, neu);
    return neu;
  }

  /// Token beim Backend anmelden. Fehler werden geschluckt — beim naechsten
  /// Start versucht es die App erneut.
  Future<void> anmelden(MitgliederDienst dienst, {String? token}) async {
    if (!push.verfuegbar) return;
    try {
      final t = token ?? await push.token();
      if (t == null || t.isEmpty) return;
      await dienst.pushTokenRegistrieren(
        token: t,
        geraeteId: await geraeteId(),
        plattform: push.plattform,
      );
      _angemeldet = t;
    } on Object catch (e) {
      debugPrint('Push-Token nicht angemeldet: $e');
    }
  }

  /// Beim Abmelden: Token beim Backend abmelden und auf dem Geraet verwerfen.
  Future<void> abmelden(ApiClient api) async {
    if (!push.verfuegbar) return;
    try {
      final t = _angemeldet ?? await push.token();
      if (t != null && t.isNotEmpty) await MitgliederDienst(api).pushTokenAbmelden(t);
    } finally {
      _angemeldet = null;
      await push.tokenVerwerfen();
    }
  }
}
