// Reiter "Organisator" — duenne Huelle um die Anlass-Verwaltung aus dem
// Paket fwv_anlass (gemeinsam mit der spaeteren Vorstand-App). Erscheint nur,
// wenn [OrganisatorPruefung] es sagt.
//
// Externe Organisatoren (`events/login`) haben genau einen Anlass und sehen
// ihn direkt.

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';

class OrganisatorTab extends StatelessWidget {
  const OrganisatorTab({super.key, required this.dienste});

  final Dienste dienste;

  @override
  Widget build(BuildContext context) {
    final sitzung = dienste.sitzung.sitzung;
    if (sitzung?.kontotyp == Kontotyp.organisator) {
      return VerwaltungsAnlassScreen(
        verwaltung: dienste.anlassVerwaltung,
        anlassId: sitzung?.eventId,
        eingebettet: true,
      );
    }
    return VerwaltungsUebersichtScreen(verwaltung: dienste.anlassVerwaltung);
  }
}
