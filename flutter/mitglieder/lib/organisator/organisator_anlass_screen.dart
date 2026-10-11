// Ein Anlass im Organisator-Bereich — duenne Huelle um
// VerwaltungsAnlassScreen aus fwv_anlass. Erreichbar ueber "Bearbeiten" in
// der Detailansicht (`kann_bearbeiten`).

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';

class OrganisatorAnlassScreen extends StatelessWidget {
  const OrganisatorAnlassScreen({super.key, required this.dienste, required this.anlassId});

  final Dienste dienste;
  final String anlassId;

  @override
  Widget build(BuildContext context) =>
      VerwaltungsAnlassScreen(verwaltung: dienste.anlassVerwaltung, anlassId: anlassId);
}
