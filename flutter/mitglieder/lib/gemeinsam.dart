// Kleine Bausteine, die mehrere Screens brauchen.

export 'package:fwv_anlass/fwv_anlass.dart' show Abschnitt, FehlerAnsicht, fehlerText, meldung;

import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

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

