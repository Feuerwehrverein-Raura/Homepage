// Anlass bearbeiten als Organisator — Platzhalter. Erreichbar aus der
// Detailansicht, wenn das Backend `kann_bearbeiten` meldet. Gefuellt wird er
// im Arbeitsschritt "Organisator" (Phase 2, docs/flutter-mitglieder-app-plan.md).

import 'package:material_ui/material_ui.dart';

import '../dienste.dart';

class OrganisatorAnlassScreen extends StatelessWidget {
  const OrganisatorAnlassScreen({super.key, required this.dienste, required this.anlassId});

  final Dienste dienste;
  final String anlassId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Anlass bearbeiten')),
      body: const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text('Das Bearbeiten folgt in Kürze.', textAlign: TextAlign.center),
        ),
      ),
    );
  }
}
