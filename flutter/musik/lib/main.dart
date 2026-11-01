// FWV Musik - der Musik-Bereich der Mitglieder-App als eigenes
// Programm (macOS, Linux, Windows) und als Android-App ohne Play Store
// (Download auf www.fwv-raura.ch, aktualisiert sich selbst): Playlists bearbeiten,
// Radiosender pflegen, hoeren und - mit Gruppe Roter Schopf,
// Vorstand oder admin - den Laptop im Lokal fernbedienen. Die Bildschirme
// kommen unveraendert aus fwv_roterschopf; hier stehen nur Anmeldung und
// Start. Hintergrund: docs/flutter-musik-desktop.md.

import 'dart:io' show Platform;

import 'package:fwv_anlass/fwv_anlass.dart' show fwvThema, nachfragen;
import 'package:fwv_roterschopf/fwv_roterschopf.dart' show MusikScreen;
import 'package:just_audio_background/just_audio_background.dart';
import 'package:just_audio_media_kit/just_audio_media_kit.dart';
import 'package:material_ui/material_ui.dart';

import 'anmeldung.dart';
import 'dienste.dart';
import 'update.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (Platform.isAndroid) {
    // Weiterspielen bei gesperrtem Bildschirm, Steuerung in der Benachrichtigung.
    await JustAudioBackground.init(
      androidNotificationChannelId: 'ch.fwvraura.musik.wiedergabe',
      androidNotificationChannelName: 'Musik',
      androidNotificationOngoing: true,
      androidNotificationIcon: 'drawable/ic_benachrichtigung',
    );
  } else if (Platform.isMacOS) {
    // Medientasten und "Jetzt laeuft" in der Menueleiste.
    await JustAudioBackground.init();
  } else {
    // Linux und Windows: just_audio spielt ueber media_kit (libmpv).
    JustAudioMediaKit.title = 'FWV Musik';
    JustAudioMediaKit.ensureInitialized(linux: true, windows: true);
  }
  runApp(MusikApp(dienste: Dienste.echt()));
}

class MusikApp extends StatefulWidget {
  const MusikApp({super.key, required this.dienste});

  final Dienste dienste;

  @override
  State<MusikApp> createState() => _MusikAppState();
}

class _MusikAppState extends State<MusikApp> {
  final _navigator = GlobalKey<NavigatorState>();
  late final Future<void> _start = widget.dienste.sitzung.laden();
  NeueVersion? _update;

  @override
  void initState() {
    super.initState();
    widget.dienste.sitzung.addListener(_sitzungGeaendert);
    // Android (nicht im Play Store): neuere Fassung auf www.fwv-raura.ch?
    if (widget.dienste.handy) {
      updatePruefen().then((v) {
        if (mounted && v != null) setState(() => _update = v);
      });
    }
  }

  @override
  void dispose() {
    widget.dienste.sitzung.removeListener(_sitzungGeaendert);
    super.dispose();
  }

  /// Abgemeldet oder Sitzung abgelaufen: offene Unterseiten (Editor,
  /// Titelsuche) schliessen, sonst blieben sie ueber dem Login liegen.
  void _sitzungGeaendert() {
    if (!widget.dienste.sitzung.angemeldet) {
      _navigator.currentState?.popUntil((r) => r.isFirst);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dienste = widget.dienste;
    return MaterialApp(
      title: 'FWV Musik',
      navigatorKey: _navigator,
      debugShowCheckedModeBanner: false,
      locale: const Locale('de', 'CH'),
      supportedLocales: const [Locale('de', 'CH'), Locale('de')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      theme: fwvThema(),
      themeMode: ThemeMode.light,
      builder: (context, kind) {
        final update = _update;
        if (update == null || kind == null) return kind ?? const SizedBox();
        return Column(
          children: [
            SafeArea(bottom: false, child: UpdateHinweis(version: update)),
            Expanded(
              child: MediaQuery.removePadding(context: context, removeTop: true, child: kind),
            ),
          ],
        );
      },
      home: FutureBuilder<void>(
        future: _start,
        builder: (context, start) {
          if (start.connectionState != ConnectionState.done) {
            return const Scaffold(body: Center(child: CircularProgressIndicator()));
          }
          return ListenableBuilder(
            listenable: dienste.sitzung,
            builder: (context, _) => dienste.sitzung.angemeldet
                ? MusikScreen(
                    // Neu aufbauen, wenn jemand anderes sich anmeldet (Gruppen).
                    key: ValueKey(dienste.sitzung.sitzung?.accessToken.hashCode),
                    zugang: dienste.musik,
                    player: dienste.player,
                    ablage: dienste.ablage,
                    laptopSteuern: dienste.laptopSteuern,
                    // Dieselbe Regel: Gruppe Roter Schopf, Vorstand, admin.
                    ergaenzen: dienste.laptopSteuern,
                    aktionen: [_AbmeldenKnopf(dienste: dienste)],
                  )
                : AnmeldeSeite(dienste: dienste),
          );
        },
      ),
    );
  }
}

class _AbmeldenKnopf extends StatelessWidget {
  const _AbmeldenKnopf({required this.dienste});

  final Dienste dienste;

  @override
  Widget build(BuildContext context) {
    final name = dienste.sitzung.sitzung?.name;
    return IconButton(
      key: const Key('abmelden'),
      tooltip: name == null ? 'Abmelden' : 'Abmelden ($name)',
      icon: const Icon(Icons.logout),
      onPressed: () async {
        final ja = await nachfragen(
          context,
          titel: 'Abmelden?',
          text: dienste.handy
              ? 'Die Musik hört auf, und was auf diesem Handy gespeichert ist, wird gelöscht.'
              : 'Die Musik hier am Computer hört auf, und was auf diesem Computer '
                    'gespeichert ist, wird gelöscht.',
          ja: 'Abmelden',
        );
        if (ja) await dienste.abmelden();
      },
    );
  }
}
