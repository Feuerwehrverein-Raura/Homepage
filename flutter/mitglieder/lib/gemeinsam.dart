// Kleine Bausteine, die mehrere Screens brauchen.

import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

/// Kurze Meldung unten am Bildschirm.
void meldung(BuildContext context, String text) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(text)));
}

/// Text fuer Menschen aus einem Fehler.
String fehlerText(Object fehler) => switch (fehler) {
  ApiFehler(:final meldung) => meldung,
  FormatException(:final message) => message,
  _ => 'Etwas ist schiefgegangen. Bitte erneut versuchen.',
};

/// Fehler beim Laden, mit "Erneut versuchen".
class FehlerAnsicht extends StatelessWidget {
  const FehlerAnsicht({super.key, required this.meldung, required this.erneut});

  final String meldung;
  final VoidCallback erneut;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off, size: 48, color: Theme.of(context).colorScheme.outline),
            const SizedBox(height: 12),
            Text(meldung, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: erneut,
              icon: const Icon(Icons.refresh),
              label: const Text('Erneut versuchen'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Rundes Profilfoto; ohne Foto oder wenn es nicht laedt ein Symbol.
class ProfilFoto extends StatelessWidget {
  const ProfilFoto({super.key, required this.adresse, required this.api, this.groesse = 96});

  final Uri? adresse;
  final ApiClient api;
  final double groesse;

  @override
  Widget build(BuildContext context) {
    final farben = Theme.of(context).colorScheme;
    final ersatz = Icon(Icons.person, size: groesse * 0.6, color: farben.onPrimaryContainer);
    final a = adresse;
    return CircleAvatar(
      radius: groesse / 2,
      backgroundColor: farben.primaryContainer,
      child: a == null
          ? ersatz
          : ClipOval(
              child: Image.network(
                a.toString(),
                // Die Fotos liegen heute oeffentlich unter /uploads; das
                // Token geht trotzdem mit, falls das Backend sie schuetzt.
                headers: api.kopfzeilenFuer(a),
                width: groesse,
                height: groesse,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => ersatz,
              ),
            ),
    );
  }
}

/// Ueberschrift eines Abschnitts in Listen.
class Abschnitt extends StatelessWidget {
  const Abschnitt(this.titel, {super.key});

  final String titel;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 8),
      child: Text(
        titel,
        style: Theme.of(context).textTheme.titleSmall
            ?.copyWith(color: Theme.of(context).colorScheme.primary),
      ),
    );
  }
}
