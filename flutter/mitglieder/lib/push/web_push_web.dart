// Web-Push fuer die App im Browser (mein.html, Flutter Web unter /mein/).
//
// - Service Worker web/push-sw.js (Bereich /mein/) zeigt die Mitteilung,
//   auch wenn kein Tab offen ist, und meldet das Antippen: an ein offenes
//   Fenster per postMessage, sonst oeffnet er /mein.html?push=<Daten>.
// - Das Abo (endpoint + Schluessel) meldet die App wie ein FCM-Token an
//   (POST members/me/fcm-token, platform web); das Backend schickt mit
//   seinem VAPID-Schluessel (GET push/web-schluessel,
//   docker/backend-members/src/push-versand.js).
// - Erlaubnis fragt der Browser nur nach einem Klick zuverlaessig: dafuer
//   Einstellungen -> Benachrichtigungen -> «Mitteilungen erlauben».
// Safari auf dem iPhone kann es nur, wenn mein.html zum Home-Bildschirm
// hinzugefuegt ist.

import 'dart:convert';
import 'dart:js_interop';
import 'dart:js_interop_unsafe';

import 'package:flutter/foundation.dart';
import 'package:web/web.dart' as web;

import 'push_dienst.dart';

class WebPush implements PushDienst {
  /// Oeffentlicher VAPID-Schluessel des Backends (Base64url); setzt Dienste.
  Future<String> Function()? schluesselHolen;

  void Function(Map<String, Object?> daten)? beiAntippen;

  web.ServiceWorkerRegistration? _sw;

  @override
  bool get verfuegbar =>
      globalContext.has('PushManager') &&
      globalContext.has('Notification') &&
      web.window.navigator.has('serviceWorker');

  @override
  String get plattform => 'web';

  @override
  set beiNeuemToken(void Function(String token)? rueckruf) {}

  @override
  Future<void> starten() async {
    // Mit einer angetippten Mitteilung geoeffnet (push-sw.js).
    final start = Uri.base.queryParameters['push'];
    if (start != null) _angetippt(start);
    if (!verfuegbar) return;
    try {
      final c = web.window.navigator.serviceWorker;
      c.addEventListener(
        'message',
        (web.MessageEvent e) {
          final d = e.data.dartify();
          if (d is Map && d['typ'] == 'fwv-push-angetippt') _angetippt(jsonEncode(d['daten']));
        }.toJS,
      );
      _sw = await c
          .register('/mein/push-sw.js'.toJS, web.RegistrationOptions(scope: '/mein/'))
          .toDart;
    } on Object catch (e) {
      debugPrint('Service Worker nicht registriert: $e');
    }
  }

  void _angetippt(String json) {
    try {
      final d = jsonDecode(json);
      if (d is Map) beiAntippen?.call(d.cast<String, Object?>());
    } on Object catch (e) {
      debugPrint('Antippen nicht verarbeitet: $e');
    }
  }

  @override
  Future<PushErlaubnis> erlaubnis() async {
    if (!verfuegbar || _sw == null) return PushErlaubnis.nichtVerfuegbar;
    return _umrechnen(web.Notification.permission);
  }

  @override
  Future<PushErlaubnis> erlaubnisAnfragen() async {
    if (!verfuegbar || _sw == null) return PushErlaubnis.nichtVerfuegbar;
    try {
      return _umrechnen((await web.Notification.requestPermission().toDart).toDart);
    } on Object {
      return PushErlaubnis.nichtGefragt;
    }
  }

  static PushErlaubnis _umrechnen(String p) => switch (p) {
    'granted' => PushErlaubnis.erlaubt,
    'denied' => PushErlaubnis.abgelehnt,
    _ => PushErlaubnis.nichtGefragt,
  };

  /// Das Abo als JSON; null ohne Erlaubnis.
  @override
  Future<String?> token() async {
    final sw = _sw;
    final holen = schluesselHolen;
    if (sw == null || holen == null || web.Notification.permission != 'granted') return null;
    try {
      var abo = await sw.pushManager.getSubscription().toDart;
      abo ??= await sw.pushManager
          .subscribe(
            web.PushSubscriptionOptionsInit(
              userVisibleOnly: true,
              applicationServerKey: base64UrlBytes(await holen()).toJS,
            ),
          )
          .toDart;
      return jsonEncode(abo.toJSON().dartify());
    } on Object catch (e) {
      debugPrint('Kein Web-Push-Abo: $e');
      return null;
    }
  }

  @override
  Future<void> tokenVerwerfen() async {
    try {
      final abo = await _sw?.pushManager.getSubscription().toDart;
      await abo?.unsubscribe().toDart;
    } on Object catch (e) {
      debugPrint('Web-Push-Abo nicht beendet: $e');
    }
  }
}

/// Base64url ohne Auffuellung (VAPID-Schluessel) -> Bytes.
Uint8List base64UrlBytes(String s) => base64Url.decode(s.padRight((s.length + 3) ~/ 4 * 4, '='));
