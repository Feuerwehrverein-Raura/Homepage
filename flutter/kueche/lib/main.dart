// Kuechendisplay FWV Raura (Flutter, November 2026). Ersetzt die native App
// kds-v3.x mit gleicher Paket-ID und Signatur - die Tablets aktualisieren
// sich ueber den eingebauten Updater und behalten Anmeldung und Station
// (lib/src/geraet.dart, Einstellungen.laden).
//
// Kiosk: Vollbild, quer, Bildschirm bleibt an, startet nach dem Neustart
// selbst (android/.../BootReceiver.kt), Einstellungen nur mit Code.

import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import 'src/dienste.dart';
import 'src/token.dart';
import 'src/ui/anmeldung.dart';
import 'src/ui/anzeige.dart';
import 'src/ui/farben.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]);
  await WakelockPlus.enable().catchError((_) {});
  // Ein Fehler in Dart soll die Anzeige nie beenden.
  FlutterError.onError = FlutterError.presentError;
  PlatformDispatcher.instance.onError = (e, st) {
    debugPrint('Fehler: $e\n$st');
    return true;
  };
  runApp(KuechenApp(dienste: await Dienste.echt()));
}

class KuechenApp extends StatefulWidget {
  const KuechenApp({super.key, required this.dienste});

  final Dienste dienste;

  @override
  State<KuechenApp> createState() => _KuechenAppState();
}

class _KuechenAppState extends State<KuechenApp> {
  final _navigator = GlobalKey<NavigatorState>();
  late bool _angemeldet = _bereit;
  String? _hinweis;

  bool get _bereit {
    final e = widget.dienste.einstellungen;
    return e.station != null && tokenGueltig(e.token, widget.dienste.jetzt());
  }

  void _abgemeldet(String? hinweis) {
    _navigator.currentState?.popUntil((r) => r.isFirst);
    setState(() {
      _angemeldet = false;
      _hinweis = hinweis;
    });
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Küche',
    navigatorKey: _navigator,
    debugShowCheckedModeBanner: false,
    theme: kuechenThema(),
    home: _angemeldet
        ? Anzeige(key: const ValueKey('anzeige'), dienste: widget.dienste, abgemeldet: _abgemeldet)
        : Anmeldung(
            key: ValueKey('anmeldung-$_hinweis'),
            dienste: widget.dienste,
            hinweis: _hinweis,
            fertig: () => setState(() {
              _angemeldet = true;
              _hinweis = null;
            }),
          ),
  );
}
