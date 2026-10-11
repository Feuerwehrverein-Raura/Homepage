// Reiter "Anlässe" — Platzhalter. Liste, Kalender, Detail und Anmelden
// baut ein eigener Arbeitsschritt (Phase 1, docs/flutter-mitglieder-app-plan.md).

import 'package:material_ui/material_ui.dart';

import '../dienste.dart';

class AnlaesseTab extends StatelessWidget {
  const AnlaesseTab({super.key, required this.dienste});

  final Dienste dienste;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Anlässe')),
      body: const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text('Die Anlässe folgen in Kürze.', textAlign: TextAlign.center),
        ),
      ),
    );
  }
}
