// "Meine Anmeldungen" (`GET registrations/mine`) — Platzhalter. Wird mit den
// Anlässen gebaut; erreichbar aus dem Profil.

import 'package:material_ui/material_ui.dart';

import '../dienste.dart';

class MeineAnmeldungenScreen extends StatelessWidget {
  const MeineAnmeldungenScreen({super.key, required this.dienste});

  final Dienste dienste;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Meine Anmeldungen')),
      body: const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text('Deine Anmeldungen folgen in Kürze.', textAlign: TextAlign.center),
        ),
      ),
    );
  }
}
