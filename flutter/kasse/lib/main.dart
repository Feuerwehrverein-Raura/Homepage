// Kasse FWV Raura - native App (Oktober 2026). Ersetzt die Huelle um die
// Web-Kasse (kasse-v1.0) mit gleicher Paket-ID und Signatur.
// Kiosk-tauglich: Vollbild, Bildschirm bleibt an, eine einzige App.
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import 'src/kasse_api.dart';
import 'src/protokoll.dart';
import 'src/updater.dart' show eigeneVersion;
import 'src/ui/anmeldung.dart';
import 'src/ui/kasse_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  await WakelockPlus.enable();
  final api = await KasseApi.laden();
  // Abstuerze und unbehandelte Fehler ins Protokoll (src/protokoll.dart)
  FlutterError.onError = (d) {
    FlutterError.presentError(d);
    protokoll('absturz_ui', meldung: d.exceptionAsString(), daten: {'stack': d.stack.toString().split('\n').take(12).join('\n')});
  };
  PlatformDispatcher.instance.onError = (e, st) {
    protokoll('absturz', meldung: e.toString(), daten: {'stack': st.toString().split('\n').take(12).join('\n')});
    return true;
  };
  Protokoll.ich.version = await eigeneVersion() ?? '?';
  protokoll('app_start', daten: {'angemeldet': api.angemeldet, 'name': api.name});
  runApp(KasseApp(api: api));
}

class KasseApp extends StatefulWidget {
  const KasseApp({super.key, required this.api});
  final KasseApi api;
  @override
  State<KasseApp> createState() => _KasseAppState();
}

class _KasseAppState extends State<KasseApp> {
  late bool _angemeldet = widget.api.angemeldet;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Kasse',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorSchemeSeed: const Color(0xFFDC2626), useMaterial3: true),
      home: _angemeldet
          ? KasseScreen(api: widget.api, abgemeldet: () => setState(() => _angemeldet = false))
          : Anmeldung(api: widget.api, angemeldet: () => setState(() => _angemeldet = true)),
    );
  }
}
