// Reiter "Schopf" — duenne Huelle um den Roten Schopf aus dem Paket
// fwv_roterschopf (gemeinsam mit der spaeteren Vorstand-App): Licht
// schalten, Tiefkuehler sehen. Erscheint mit der Authentik-Gruppe Roter
// Schopf, Vorstand oder admin - oder waehrend der eigenen Schicht
// ([Dienste.roterSchopfSichtbar]); dann steht oben, bis wann.

import 'package:fwv_roterschopf/fwv_roterschopf.dart';
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';

class RoterSchopfTab extends StatelessWidget {
  const RoterSchopfTab({super.key, required this.dienste});

  final Dienste dienste;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: dienste.schopfPruefung,
    builder: (context, _) => RoterSchopfScreen(
      zugang: dienste.roterSchopf,
      auffrischen: dienste.roterSchopfTakt,
      hinweis: schichtHinweis(dienste.schopfPruefung.schicht),
    ),
  );
}

/// "Für deine Schicht «Bar» (Chilbi 2026) bis 01:00" - null ohne Schicht.
String? schichtHinweis(SchopfFreigabe? s) {
  if (s == null) return null;
  final bis = s.bis;
  final zeit = bis == null
      ? ''
      : ' bis ${bis.hour.toString().padLeft(2, '0')}:${bis.minute.toString().padLeft(2, '0')}';
  final was = [if (s.schicht != null) '«${s.schicht}»', if (s.anlass != null) '(${s.anlass})'];
  return 'Für deine Schicht${was.isEmpty ? '' : ' ${was.join(' ')}'}$zeit';
}
