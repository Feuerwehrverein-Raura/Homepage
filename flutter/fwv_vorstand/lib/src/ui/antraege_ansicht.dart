// Mitgliedschaftsanträge im Vorstand-Bereich. Platzhalter - Umfang siehe
// docs/vorstand-funktionen.md, Abschnitt 4.

import 'package:material_ui/material_ui.dart';

import '../dienste.dart';

class AntraegeAnsicht extends StatelessWidget {
  const AntraegeAnsicht({super.key, required this.dienste});

  final VorstandDienste dienste;

  @override
  Widget build(BuildContext context) => const Center(
    child: Padding(
      padding: EdgeInsets.all(24),
      child: Text('Mitgliedschaftsanträge: kommt mit Phase 1.', textAlign: TextAlign.center),
    ),
  );
}
