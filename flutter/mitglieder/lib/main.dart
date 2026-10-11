// FWV Raura — eine App fuer Mitglieder, Organisatoren und (spaeter) Vorstand.
// Ersetzt schrittweise members-android, members-ios, vorstand-android und
// vorstand-desktop. Hintergrund: docs/flutter-entscheidung.md.
//
// Material kommt aus dem eigenstaendigen Paket material_ui, nicht aus
// package:flutter/material.dart — die eingebauten Importe werden ab November
// 2026 abgekuendigt.

import 'package:material_ui/material_ui.dart';

import 'anmeldung/login_screen.dart';
import 'dienste.dart';
import 'hauptseite.dart';

/// Vereinsrot der bisherigen Apps (members-android colors.xml: primary).
const vereinsRot = Color(0xFFB91C1C);

void main() {
  WidgetsFlutterBinding.ensureInitialized();
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
      theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: vereinsRot)),
      darkTheme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: vereinsRot, brightness: Brightness.dark),
      ),
      home: FutureBuilder<void>(
        future: _start,
        builder: (context, start) {
          if (start.connectionState != ConnectionState.done) {
            return const Scaffold(body: Center(child: CircularProgressIndicator()));
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
