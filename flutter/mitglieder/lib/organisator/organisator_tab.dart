// Reiter "Organisator" — Platzhalter fuer Phase 2 (eigene Anlaesse,
// Anmeldungen bestaetigen, Schichten, Notizen, PDFs). Erscheint nur, wenn
// [OrganisatorPruefung] es sagt.

import 'package:material_ui/material_ui.dart';

import '../dienste.dart';

class OrganisatorTab extends StatelessWidget {
  const OrganisatorTab({super.key, required this.dienste});

  final Dienste dienste;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Organisator')),
      body: const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'Hier erscheinen bald die Anlässe, die du organisierst.',
            textAlign: TextAlign.center,
          ),
        ),
      ),
    );
  }
}
