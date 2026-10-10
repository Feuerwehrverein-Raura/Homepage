// Startseite nach der Anmeldung. Vorerst nur ein Platzhalter: wer ist
// angemeldet, und Abmelden. Anlaesse, Profil usw. folgen (Phase 1).

import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import 'dienste.dart';

class StartScreen extends StatefulWidget {
  const StartScreen({super.key, required this.dienste});

  final Dienste dienste;

  @override
  State<StartScreen> createState() => _StartScreenState();
}

class _StartScreenState extends State<StartScreen> {
  bool _abmelden = false;

  Future<void> _abmeldenTippen() async {
    setState(() => _abmelden = true);
    await widget.dienste.sitzung.abmelden();
    if (mounted) setState(() => _abmelden = false);
  }

  @override
  Widget build(BuildContext context) {
    final sitzung = widget.dienste.sitzung.sitzung;
    final text = Theme.of(context).textTheme;
    final organisator = sitzung?.kontotyp == Kontotyp.organisator;

    return Scaffold(
      appBar: AppBar(title: const Text('FWV Raura')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            Text('Angemeldet als', style: text.labelLarge),
            const SizedBox(height: 4),
            Text(anzeigeName(sitzung), style: text.headlineSmall),
            if (organisator) ...[
              const SizedBox(height: 4),
              Text('Externer Organisator', style: text.bodyMedium),
            ],
            const SizedBox(height: 24),
            Text('Die weiteren Bereiche der App folgen in Kürze.', style: text.bodyMedium),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(24, 0, 24, 16),
        child: OutlinedButton.icon(
          onPressed: _abmelden ? null : _abmeldenTippen,
          icon: const Icon(Icons.logout),
          label: const Text('Abmelden'),
        ),
      ),
    );
  }
}

/// Name zur Anzeige: gespeicherter Name, sonst E-Mail, sonst was im Token
/// steht (z.B. nach der Uebernahme aus der alten App).
String anzeigeName(Sitzung? s) {
  if (s == null) return '';
  final angaben = jwtAngaben(s.accessToken);
  for (final kandidat in [
    s.name,
    s.email,
    angaben['name'],
    angaben['email'],
    angaben['event_title'],
  ]) {
    if (kandidat is String && kandidat.trim().isNotEmpty) return kandidat.trim();
  }
  return s.kontotyp == Kontotyp.organisator ? 'Organisator' : 'Mitglied';
}
