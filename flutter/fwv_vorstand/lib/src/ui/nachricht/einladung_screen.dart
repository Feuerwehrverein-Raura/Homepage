// Einladung zu einem Anlass verfassen: "Verfassen" als eigene Seite ueber
// dem Anlass, schon gefuellt mit Betreff und Text aus [einladungsEntwurf].
// Empfaenger, Versandart, Vorschau und Senden wie bei jeder Nachricht.

import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../../dienste.dart';
import '../../versand/einladung.dart';
import 'verfassen_ansicht.dart';

Future<void> einladungVerfassen(BuildContext context, VorstandDienste dienste, Anlass anlass) =>
    Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => Scaffold(
          appBar: AppBar(title: const Text('Einladung')),
          body: VerfassenAnsicht(dienste: dienste, entwurf: einladungsEntwurf(anlass)),
        ),
      ),
    );
