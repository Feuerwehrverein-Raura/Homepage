// Nachricht (App-Push) im Vorstand-Bereich. Platzhalter - Umfang siehe
// docs/vorstand-funktionen.md, Abschnitt 7.

import 'package:material_ui/material_ui.dart';

import '../dienste.dart';

class NachrichtAnsicht extends StatelessWidget {
  const NachrichtAnsicht({super.key, required this.dienste});

  final VorstandDienste dienste;

  @override
  Widget build(BuildContext context) => const Center(
    child: Padding(
      padding: EdgeInsets.all(24),
      child: Text('Nachricht (App-Push): kommt mit Phase 1.', textAlign: TextAlign.center),
    ),
  );
}
