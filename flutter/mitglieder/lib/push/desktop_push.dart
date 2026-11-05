// Mitteilungen im Desktop-Programm (macOS, Windows, Linux). Dort gibt es
// kein Firebase: Das Programm meldet sich mit einer eigenen Geraete-Kennung
// als "Token" an (platform desktop), das Backend legt jede Mitteilung fuer
// dieses Geraet ins Postfach (docker/backend-members/src/push-versand.js),
// und das Programm holt sie jede Minute ab und zeigt sie als
// Systemmitteilung (flutter_local_notifications).
//
// Nur solange das Programm laeuft (auch minimiert). Was niemand abholt,
// verfaellt nach zwei Tagen.

import 'dart:async';
import 'dart:convert';
import 'dart:io' show Platform;
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:fwv_core/fwv_core.dart';

import 'push_dienst.dart';

/// Eine abgeholte Mitteilung (GET members/me/push-postfach).
typedef PostfachMitteilung = ({int id, String titel, String text, Map<String, Object?> daten});

class DesktopPush implements PushDienst {
  DesktopPush({required this.speicher, this.takt = const Duration(minutes: 1)});

  final GeheimSpeicher speicher;
  final Duration takt;

  /// Holt neue Mitteilungen fuer [token]; setzt die App (Dienste), sobald
  /// angemeldet. Ohne: nichts abholen.
  Future<List<PostfachMitteilung>> Function(String token)? abholen;

  /// Angetippt: Daten wie bei FCM (notificationType, ziel, title, body ...).
  void Function(Map<String, Object?> daten)? beiAntippen;

  static const _schluessel = 'desktop_push_token';

  // Feste Kennung fuer Windows-Mitteilungen (nie aendern).
  static const _windowsGuid = '6f1f2c0e-7b0a-4f53-9a43-2d6a6c1f8b51';

  final _anzeige = FlutterLocalNotificationsPlugin();
  Timer? _timer;
  bool _bereit = false;
  bool _holt = false;

  @override
  bool get verfuegbar => !kIsWeb && (Platform.isMacOS || Platform.isWindows || Platform.isLinux);

  @override
  String get plattform => 'desktop';

  @override
  set beiNeuemToken(void Function(String token)? rueckruf) {}

  @override
  Future<void> starten() async {
    if (_bereit || !verfuegbar) return;
    try {
      await _anzeige.initialize(
        settings: const InitializationSettings(
          macOS: DarwinInitializationSettings(
            requestAlertPermission: false,
            requestBadgePermission: false,
            requestSoundPermission: false,
          ),
          linux: LinuxInitializationSettings(defaultActionName: 'Öffnen'),
          windows: WindowsInitializationSettings(
            appName: 'FWV Raura',
            appUserModelId: 'ch.fwvraura.members',
            guid: _windowsGuid,
          ),
        ),
        onDidReceiveNotificationResponse: (a) => _angetippt(a.payload),
      );
      _bereit = true;
      final start = await _anzeige.getNotificationAppLaunchDetails();
      if (start?.didNotificationLaunchApp ?? false) {
        _angetippt(start!.notificationResponse?.payload);
      }
    } on Object catch (e) {
      debugPrint('Desktop-Mitteilungen nicht verfuegbar: $e');
      return;
    }
    _timer = Timer.periodic(takt, (_) => unawaited(jetztAbholen()));
    unawaited(jetztAbholen());
  }

  /// Einmal abholen und zeigen (auch nach dem Anmelden aufrufen).
  Future<void> jetztAbholen() async {
    final holen = abholen;
    if (!_bereit || holen == null || _holt) return;
    _holt = true;
    try {
      final t = await token();
      if (t == null) return;
      for (final m in await holen(t)) {
        await _anzeige.show(
          id: m.id & 0x7fffffff,
          title: m.titel,
          body: m.text,
          notificationDetails: const NotificationDetails(
            macOS: DarwinNotificationDetails(),
            linux: LinuxNotificationDetails(),
            windows: WindowsNotificationDetails(),
          ),
          payload: jsonEncode(mitText(m.daten, titel: m.titel, text: m.text)),
        );
      }
    } on Object catch (e) {
      // Offline, abgemeldet, Server weg: beim naechsten Takt wieder.
      debugPrint('Postfach nicht abgeholt: $e');
    } finally {
      _holt = false;
    }
  }

  void _angetippt(String? payload) {
    if (payload == null || payload.isEmpty) return;
    try {
      final d = jsonDecode(payload);
      if (d is Map) beiAntippen?.call(d.cast<String, Object?>());
    } on Object catch (e) {
      debugPrint('Antippen nicht verarbeitet: $e');
    }
  }

  /// Die Geraete-Kennung; beim ersten Mal erzeugt.
  @override
  Future<String?> token() async {
    final vorhanden = await speicher.lesen(_schluessel);
    if (vorhanden != null && vorhanden.isNotEmpty) return vorhanden;
    final z = Random.secure();
    final neu =
        'desktop-${List.generate(16, (_) => z.nextInt(256).toRadixString(16).padLeft(2, '0')).join()}';
    await speicher.schreiben(_schluessel, neu);
    return neu;
  }

  MacOSFlutterLocalNotificationsPlugin? get _mac =>
      _anzeige.resolvePlatformSpecificImplementation<MacOSFlutterLocalNotificationsPlugin>();

  @override
  Future<PushErlaubnis> erlaubnis() async {
    if (!_bereit) return PushErlaubnis.nichtVerfuegbar;
    if (!Platform.isMacOS) return PushErlaubnis.erlaubt;
    try {
      final s = await _mac?.checkPermissions();
      if (s == null) return PushErlaubnis.nichtGefragt;
      return s.isEnabled ? PushErlaubnis.erlaubt : PushErlaubnis.nichtGefragt;
    } on Object {
      return PushErlaubnis.nichtGefragt;
    }
  }

  @override
  Future<PushErlaubnis> erlaubnisAnfragen() async {
    if (!_bereit) return PushErlaubnis.nichtVerfuegbar;
    if (!Platform.isMacOS) return PushErlaubnis.erlaubt;
    try {
      final ok = await _mac?.requestPermissions(alert: true, badge: true, sound: true);
      return ok ?? false ? PushErlaubnis.erlaubt : PushErlaubnis.abgelehnt;
    } on Object {
      return PushErlaubnis.abgelehnt;
    }
  }

  @override
  Future<void> tokenVerwerfen() async {
    await speicher.loeschen(_schluessel);
  }

  void beenden() => _timer?.cancel();
}

/// Antwort von GET members/me/push-postfach lesen.
List<PostfachMitteilung> postfachLesen(Object? json) {
  final liste = json is Map ? json['mitteilungen'] : null;
  if (liste is! List) return const [];
  return [
    for (final e in liste.whereType<Map>())
      (
        id: switch (e['id']) {
          final int i => i,
          final String s => int.tryParse(s) ?? 0,
          _ => 0,
        },
        titel: '${e['titel'] ?? ''}',
        text: '${e['text'] ?? ''}',
        daten: e['daten'] is Map ? (e['daten'] as Map).cast<String, Object?>() : const {},
      ),
  ];
}
