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
import 'dart:io' show Platform;
import 'dart:math';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show MethodChannel;
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:fwv_core/fwv_core.dart';

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

  final _anzeige = FlutterLocalNotificationsPlugin();
  bool _bereit = false;
  void Function(String token)? _beiNeuemToken;
  StreamSubscription<String>? _tokenAbo;
  StreamSubscription<RemoteMessage>? _nachrichtAbo;

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
      );
      await _anzeige
          .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(kanal);
      // iOS zeigt Nachrichten im Vordergrund selbst an, wenn man es sagt.
      await FirebaseMessaging.instance.setForegroundNotificationPresentationOptions(
        alert: true,
        badge: true,
        sound: true,
      );
      final m = FirebaseMessaging.instance;
      _tokenAbo = m.onTokenRefresh.listen((t) => _beiNeuemToken?.call(t));
      _nachrichtAbo = FirebaseMessaging.onMessage.listen(_imVordergrund);
      _bereit = true;
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
    final titel = n.notification?.title ?? n.data['title'] ?? 'FWV Raura';
    final text = n.notification?.body ?? n.data['body'] ?? '';
    _anzeige.show(
      id: Random().nextInt(1 << 31),
      title: titel,
      body: text,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          kanal.id,
          kanal.name,
          channelDescription: kanal.description,
          icon: 'ic_benachrichtigung',
          styleInformation: BigTextStyleInformation(text),
        ),
      ),
    );
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
