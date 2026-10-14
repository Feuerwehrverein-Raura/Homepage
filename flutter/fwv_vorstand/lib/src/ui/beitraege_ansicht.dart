// Beiträge im Vorstand-Bereich. Platzhalter - Umfang siehe
// docs/vorstand-funktionen.md, Abschnitt 11.

import 'package:material_ui/material_ui.dart';

import '../dienste.dart';

class BeitraegeAnsicht extends StatelessWidget {
  const BeitraegeAnsicht({super.key, required this.dienste});

  final VorstandDienste dienste;

  @override
  Widget build(BuildContext context) => const Center(
    child: Padding(
      padding: EdgeInsets.all(24),
      child: Text('Beiträge: kommt mit Phase 1.', textAlign: TextAlign.center),
    ),
  );
}
