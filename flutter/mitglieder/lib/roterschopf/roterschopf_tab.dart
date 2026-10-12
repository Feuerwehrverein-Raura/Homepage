// Reiter "Schopf" — duenne Huelle um den Roten Schopf aus dem Paket
// fwv_roterschopf (gemeinsam mit der spaeteren Vorstand-App): Licht
// schalten, Tiefkuehler sehen. Erscheint nur mit der Authentik-Gruppe Roter
// Schopf, Vorstand oder admin ([Dienste.roterSchopfSichtbar]).

import 'package:fwv_roterschopf/fwv_roterschopf.dart';
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';

class RoterSchopfTab extends StatelessWidget {
  const RoterSchopfTab({super.key, required this.dienste});

  final Dienste dienste;

  @override
  Widget build(BuildContext context) =>
      RoterSchopfScreen(zugang: dienste.roterSchopf, auffrischen: dienste.roterSchopfTakt);
}
