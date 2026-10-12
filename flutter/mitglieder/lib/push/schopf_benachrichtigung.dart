// "Im Schopf laeuft ..." - Benachrichtigung fuer Schichtleute (Android).
//
// api-members (src/schopf-melder.js) schickt waehrend der Schicht bei jedem
// Titelwechsel eine stille Push-Nachricht (nur `data`, notificationType
// "schopf_musik"): art "zeigen" mit Titel, Interpret, laeuft, bis und einer
// Fernbedienungs-Freigabe t - oder art "weg".
//
// Bewusst eine normale Benachrichtigung und KEIN Medien-Player: Den einen
// Medien-Player, den Android pro App zeigt, belegt die eigene Wiedergabe
// (just_audio_background). So stehen beide nebeneinander.
//
// Die Knoepfe laufen ohne geoeffnete App in einem eigenen Isolate. Sie
// schicken die Freigabe aus der Nachricht an POST
// kiosk/t400/musik-push/<aktion> - ohne Anmelde-Token, damit im Hintergrund
// nichts erneuert werden muss (das stoerte die Sitzung der App).

import 'dart:convert';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:fwv_core/fwv_core.dart' show apiBasis;
import 'package:http/http.dart' as http;

const schopfMusikTyp = 'schopf_musik';

/// Immer dieselbe Nummer: jede Nachricht ersetzt die vorige.
const _nummer = 4242;

const schopfKanal = AndroidNotificationChannel(
  'schopf_musik',
  'Musik im Schopf',
  description: 'Was während deiner Schicht im Roten Schopf läuft',
  importance: Importance.low,
  playSound: false,
  enableVibration: false,
  showBadge: false,
);

const _einstellungen = InitializationSettings(
  android: AndroidInitializationSettings('ic_benachrichtigung'),
);

/// Zeigt, ersetzt oder entfernt die Schopf-Benachrichtigung.
Future<void> schopfAnzeigen(FlutterLocalNotificationsPlugin anzeige, Map<String, dynamic> d) async {
  if (d['art'] != 'zeigen') {
    await anzeige.cancel(id: _nummer);
    return;
  }
  final laeuft = d['laeuft'] == '1' || d['laeuft'] == true;
  final titel = '${d['titel'] ?? ''}';
  final interpret = '${d['interpret'] ?? ''}';
  final bis = DateTime.tryParse('${d['bis']}')?.toLocal();
  await anzeige.show(
    id: _nummer,
    title: '${laeuft ? 'Im Schopf läuft' : 'Im Schopf pausiert'}: $titel',
    body: interpret.isEmpty ? null : interpret,
    payload: jsonEncode({
      't': d['t'],
      'laeuft': laeuft,
      'titel': titel,
      'interpret': interpret,
      'bis': d['bis'],
    }),
    notificationDetails: NotificationDetails(
      android: AndroidNotificationDetails(
        schopfKanal.id,
        schopfKanal.name,
        channelDescription: schopfKanal.description,
        icon: 'ic_benachrichtigung',
        importance: Importance.low,
        priority: Priority.low,
        onlyAlertOnce: true,
        showWhen: false,
        category: AndroidNotificationCategory.status,
        // Nach Schichtende von selbst weg, auch wenn "weg" nie ankommt.
        timeoutAfter: bis?.difference(DateTime.now()).inMilliseconds.clamp(0, 1 << 31),
        actions: [
          AndroidNotificationAction(
            'umschalten',
            laeuft ? 'Pause' : 'Abspielen',
            cancelNotification: false,
          ),
          const AndroidNotificationAction('weiter', 'Weiter', cancelNotification: false),
        ],
      ),
    ),
  );
}

/// Knopf gedrueckt (Vordergrund oder Hintergrund-Isolate).
Future<void> schopfKnopf(FlutterLocalNotificationsPlugin anzeige, NotificationResponse r) async {
  final aktion = r.actionId;
  if (aktion != 'umschalten' && aktion != 'weiter') return;
  final p = jsonDecode(r.payload ?? '{}') as Map<String, dynamic>;
  final t = p['t'];
  if (t is! String || t.isEmpty) return;
  try {
    final antwort = await http
        .post(
          apiBasis.resolve('kiosk/t400/musik-push/$aktion'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({'t': t}),
        )
        .timeout(const Duration(seconds: 10));
    if (antwort.statusCode != 200) return;
    // Gleich den neuen Stand zeigen; die Push-Nachricht folgt ohnehin.
    final m = (jsonDecode(antwort.body) as Map<String, dynamic>)['musik'];
    if (m is Map && m['erreichbar'] == true) {
      await schopfAnzeigen(anzeige, {
        'art': 'zeigen',
        'titel': m['titel'] ?? p['titel'],
        'interpret': m['interpret'] ?? p['interpret'],
        'laeuft': m['laeuft'] == true ? '1' : '0',
        'bis': p['bis'],
        't': t,
      });
    }
  } on Object catch (e) {
    debugPrint('Schopf-Knopf: $e');
  }
}

/// Knopf bei geschlossener App - eigenes Isolate.
@pragma('vm:entry-point')
Future<void> schopfKnopfImHintergrund(NotificationResponse r) async {
  WidgetsFlutterBinding.ensureInitialized();
  final anzeige = FlutterLocalNotificationsPlugin();
  await anzeige.initialize(settings: _einstellungen);
  await schopfKnopf(anzeige, r);
}

/// Push-Nachricht bei geschlossener App - eigenes Isolate. Andere Nachrichten
/// (mit `notification`) zeigt Android selbst an.
@pragma('vm:entry-point')
Future<void> pushImHintergrund(RemoteMessage n) async {
  if (n.data['notificationType'] != schopfMusikTyp) return;
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  final anzeige = FlutterLocalNotificationsPlugin();
  await anzeige.initialize(
    settings: _einstellungen,
    onDidReceiveBackgroundNotificationResponse: schopfKnopfImHintergrund,
  );
  await anzeige
      .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
      ?.createNotificationChannel(schopfKanal);
  await schopfAnzeigen(anzeige, n.data);
}
