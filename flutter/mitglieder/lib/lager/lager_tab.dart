// Reiter "Lager" — duenne Huelle um das Lager aus dem Paket fwv_lager
// (gemeinsam mit der spaeteren Vorstand-App). Erscheint nur mit der
// Authentik-Gruppe Lager, Vorstand oder admin ([Dienste.lagerSichtbar]).
// Oben rechts "Ausleihen verwalten"; ausleihen kann jedes Mitglied im Profil.

import 'package:fwv_lager/fwv_lager.dart';
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';

class LagerTab extends StatelessWidget {
  const LagerTab({super.key, required this.dienste});

  final Dienste dienste;

  @override
  Widget build(BuildContext context) => LagerScreen(lager: dienste.lager);
}
