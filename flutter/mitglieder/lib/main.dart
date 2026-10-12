// FWV Raura — eine App fuer Mitglieder, Organisatoren und (spaeter) Vorstand.
// Ersetzt schrittweise members-android, members-ios, vorstand-android und
// vorstand-desktop. Hintergrund: docs/flutter-entscheidung.md.
//
// Material kommt aus dem eigenstaendigen Paket material_ui, nicht aus
// package:flutter/material.dart — die eingebauten Importe werden ab November
// 2026 abgekuendigt.

import 'package:flutter/services.dart' show SystemUiOverlayStyle;
import 'package:fwv_anlass/fwv_anlass.dart' show FwvFarben, fwvThema;
import 'package:just_audio_background/just_audio_background.dart';
import 'package:material_ui/material_ui.dart';

import 'anmeldung/login_screen.dart';
import 'dienste.dart';
import 'gemeinsam.dart' show logoMitglieder;
import 'hauptseite.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Musik aus dem Roten Schopf laeuft im Hintergrund weiter, mit Bedienung
  // in der Benachrichtigung und auf dem Sperrbildschirm (fwv_roterschopf,
  // musik/player.dart). Muss vor dem ersten Player stehen.
  await JustAudioBackground.init(
    androidNotificationChannelId: 'ch.fwvraura.fwv_app.musik',
    androidNotificationChannelName: 'Musik',
    androidNotificationOngoing: true,
    androidNotificationIcon: 'drawable/ic_benachrichtigung',
  );
  runApp(FwvApp(dienste: Dienste.echt()));
}

class FwvApp extends StatefulWidget {
  const FwvApp({super.key, required this.dienste});

  final Dienste dienste;

  @override
  State<FwvApp> createState() => _FwvAppState();
}

class _FwvAppState extends State<FwvApp> {
  final _navigator = GlobalKey<NavigatorState>();
  late final Future<void> _start = widget.dienste.starten();
  bool? _warAngemeldet;

  @override
  void initState() {
    super.initState();
    widget.dienste.sitzung.addListener(_sitzungGeaendert);
  }

  @override
  void dispose() {
    widget.dienste.sitzung.removeListener(_sitzungGeaendert);
    super.dispose();
  }

  /// Wechselt der Anmeldezustand (angemeldet, abgemeldet, Sitzung
  /// abgelaufen), werden alle geoeffneten Unterseiten geschlossen — sonst
  /// bliebe z.B. der Passwort-Reset ueber der Startseite liegen.
  void _sitzungGeaendert() {
    final jetzt = widget.dienste.sitzung.angemeldet;
    if (_warAngemeldet != null && _warAngemeldet != jetzt) {
      _navigator.currentState?.popUntil((r) => r.isFirst);
    }
    _warAngemeldet = jetzt;
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'FWV Raura',
      navigatorKey: _navigator,
      // Deutsch (Schweiz) fuer Datumswaehler, Knoepfe usw.
      locale: const Locale('de', 'CH'),
      supportedLocales: const [Locale('de', 'CH'), Locale('de')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      // Farben der alten Apps, kein dunkler Modus (gab es dort auch nicht).
      theme: fwvThema(),
      themeMode: ThemeMode.light,
      home: FutureBuilder<void>(
        future: _start,
        builder: (context, start) {
          if (start.connectionState != ConnectionState.done) {
            return const StartBild();
          }
          return ListenableBuilder(
            listenable: widget.dienste.sitzung,
            builder: (context, _) => widget.dienste.sitzung.angemeldet
                ? Hauptseite(dienste: widget.dienste)
                : LoginScreen(dienste: widget.dienste),
          );
        },
      ),
    );
  }
}

/// Startbild waehrend die App die Sitzung laedt — wie SplashActivity der
/// alten App: Logo (280) auf dunklem Vereinsrot. Passt zum nativen
/// Startbildschirm (Android launch_background, iOS LaunchScreen), damit
/// beim Uebergang nichts springt.
class StartBild extends StatelessWidget {
  const StartBild({super.key});

  @override
  Widget build(BuildContext context) {
    return const AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: FwvFarben.loginHintergrund,
        body: Center(
          child: Image(
            image: logoMitglieder,
            width: 280,
            height: 280,
            semanticLabel: 'FWV Raura',
          ),
        ),
      ),
    );
  }
}
