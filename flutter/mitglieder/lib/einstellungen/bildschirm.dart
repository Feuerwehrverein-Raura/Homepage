// Mehr -> Roter Schopf -> "Bildschirm Roter Schopf": live auf den Bildschirm
// des Laptops im Lokal schauen (noVNC), wie im Mitgliederbereich der
// Webseite. Ob jemand nur zuschauen oder auch steuern darf, entscheidet
// das Backend (GET /members/me/bildschirm): Steuern gibt es nur fuer
// Vorstand und admin. Geoeffnet wird im Browser.

import 'package:fwv_anlass/fwv_anlass.dart' show fehlerText, meldung;
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';

/// noVNC haengt an der Website-Domain; das Backend liefert relative Pfade.
final Uri bildschirmBasis = Uri.parse('https://www.fwv-raura.ch/');

class BildschirmZugaenge {
  const BildschirmZugaenge({required this.schauen, this.steuern});

  factory BildschirmZugaenge.ausJson(Object? json) {
    final m = json is Map ? json : const {};
    Uri? adresse(Object? teil) {
      final url = teil is Map ? teil['url']?.toString() : null;
      if (url == null || url.isEmpty) return null;
      return bildschirmBasis.resolve(url.startsWith('/') ? url.substring(1) : url);
    }

    final schauen = adresse(m['schauen']);
    if (schauen == null) throw const FormatException('Bildschirmzugriff ist nicht eingerichtet.');
    return BildschirmZugaenge(schauen: schauen, steuern: adresse(m['steuern']));
  }

  final Uri schauen;

  /// Nur fuer Vorstand und admin.
  final Uri? steuern;
}

Future<void> bildschirmOeffnen(BuildContext context, Dienste dienste) async {
  final BildschirmZugaenge z;
  try {
    z = BildschirmZugaenge.ausJson(await dienste.sitzung.api.get('members/me/bildschirm'));
  } on Object catch (e) {
    if (context.mounted) meldung(context, fehlerText(e));
    return;
  }
  if (!context.mounted) return;
  if (z.steuern == null) {
    await dienste.linkOeffnen(z.schauen);
    return;
  }
  await showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (blatt) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            leading: const Icon(Icons.visibility_outlined),
            title: const Text('Bildschirm ansehen'),
            subtitle: const Text('Zuschauen, ohne eingreifen zu können'),
            onTap: () {
              Navigator.of(blatt).pop();
              dienste.linkOeffnen(z.schauen);
            },
          ),
          ListTile(
            leading: const Icon(Icons.mouse_outlined),
            title: const Text('Steuern'),
            subtitle: const Text(
              'Mit Tastatur und Maus – die Leute vor Ort sehen deine Mausbewegungen mit.',
            ),
            onTap: () {
              Navigator.of(blatt).pop();
              dienste.linkOeffnen(z.steuern!);
            },
          ),
        ],
      ),
    ),
  );
}
