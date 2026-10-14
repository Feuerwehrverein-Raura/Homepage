// Mitglieder im Vorstand-Bereich. Platzhalter - Umfang siehe
// docs/vorstand-funktionen.md, Abschnitt 2 und 3.

import 'package:material_ui/material_ui.dart';

import '../dienste.dart';

class MitgliederAnsicht extends StatelessWidget {
  const MitgliederAnsicht({super.key, required this.dienste});

  final VorstandDienste dienste;

  @override
  Widget build(BuildContext context) => const Center(
    child: Padding(
      padding: EdgeInsets.all(24),
      child: Text('Mitglieder: kommt mit Phase 1.', textAlign: TextAlign.center),
    ),
  );
}
