// Bausteine fuer die Anlass-Screens: Laden mit Fehler-/Leer-Zustand und
// Pull-to-refresh, Hinweis-Chips, Info-Zeilen.

import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../gemeinsam.dart';

/// Laedt Daten und zeigt sie an; waehrenddessen ein Kreisel, bei Fehlern
/// [FehlerAnsicht]. Herunterziehen laedt neu — auch im Fehler- und
/// Leer-Zustand.
class LadeAnsicht<T> extends StatefulWidget {
  const LadeAnsicht({super.key, required this.laden, required this.bauen, this.leer, this.istLeer});

  final Future<T> Function() laden;

  /// Inhalt; muss scrollbar sein (fuer Pull-to-refresh).
  final Widget Function(BuildContext context, T daten, Future<void> Function() neuLaden) bauen;

  /// Text, wenn [istLeer] zutrifft.
  final String? leer;
  final bool Function(T daten)? istLeer;

  @override
  State<LadeAnsicht<T>> createState() => LadeAnsichtState<T>();
}

class LadeAnsichtState<T> extends State<LadeAnsicht<T>> {
  T? _daten;
  Object? _fehler;
  bool _laedt = true;

  @override
  void initState() {
    super.initState();
    neuLaden();
  }

  Future<void> neuLaden() async {
    setState(() => _laedt = _daten == null);
    try {
      final d = await widget.laden();
      if (!mounted) return;
      setState(() {
        _daten = d;
        _fehler = null;
        _laedt = false;
      });
    } on Object catch (f) {
      if (!mounted) return;
      setState(() {
        _fehler = f;
        _laedt = false;
      });
    }
  }

  /// Fuellt den Platz und bleibt scrollbar, damit Herunterziehen geht.
  Widget _vollflaechig(Widget kind) => LayoutBuilder(
    builder: (context, b) => ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        ConstrainedBox(
          constraints: BoxConstraints(minHeight: b.maxHeight),
          child: Center(child: kind),
        ),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) {
    final daten = _daten;
    if (_laedt && daten == null) return const Center(child: CircularProgressIndicator());
    final Widget inhalt;
    if (_fehler != null && daten == null) {
      inhalt = _vollflaechig(FehlerAnsicht(meldung: fehlerText(_fehler!), erneut: neuLaden));
    } else if (daten is T && (widget.istLeer?.call(daten) ?? false)) {
      inhalt = _vollflaechig(
        Padding(
          padding: const EdgeInsets.all(24),
          child: Text(widget.leer ?? 'Nichts gefunden.', textAlign: TextAlign.center),
        ),
      );
    } else {
      inhalt = widget.bauen(context, daten as T, neuLaden);
    }
    return RefreshIndicator(
      onRefresh: () async {
        await neuLaden();
        // Fehler beim Neuladen mit vorhandenen Daten: kurz melden, die alten
        // Daten bleiben stehen.
        if (!mounted) return;
        if (_fehler != null && _daten != null) meldung(this.context, fehlerText(_fehler!));
      },
      child: inhalt,
    );
  }
}

/// Kleiner farbiger Hinweis ("Helfer gesucht", "Ausgebucht", Status).
class HinweisChip extends StatelessWidget {
  const HinweisChip(this.text, {super.key, this.art = HinweisArt.neutral});

  final String text;
  final HinweisArt art;

  @override
  Widget build(BuildContext context) {
    final (hinten, vorne) = hinweisFarben(context, art);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: hinten, borderRadius: BorderRadius.circular(12)),
      child: Text(text, style: Theme.of(context).textTheme.labelMedium?.copyWith(color: vorne)),
    );
  }
}

enum HinweisArt { gut, warnung, schlecht, neutral }

HinweisArt hinweisArtFuer(StatusFarbe f) => switch (f) {
  StatusFarbe.gruen => HinweisArt.gut,
  StatusFarbe.gelb => HinweisArt.warnung,
  StatusFarbe.rot => HinweisArt.schlecht,
  StatusFarbe.grau => HinweisArt.neutral,
};

/// Hintergrund und Schrift, im hellen und dunklen Modus gut lesbar.
(Color, Color) hinweisFarben(BuildContext context, HinweisArt art) {
  final dunkel = Theme.of(context).brightness == Brightness.dark;
  final farben = Theme.of(context).colorScheme;
  return switch ((art, dunkel)) {
    (HinweisArt.gut, false) => (const Color(0xFFD7F0DA), const Color(0xFF1B5E20)),
    (HinweisArt.gut, true) => (const Color(0xFF1E3B22), const Color(0xFFA5D6A7)),
    (HinweisArt.warnung, false) => (const Color(0xFFFFF0C2), const Color(0xFF6D4C00)),
    (HinweisArt.warnung, true) => (const Color(0xFF3D3214), const Color(0xFFFFD873)),
    (HinweisArt.schlecht, _) => (farben.errorContainer, farben.onErrorContainer),
    (HinweisArt.neutral, _) => (farben.surfaceContainerHighest, farben.onSurfaceVariant),
  };
}

/// Zeile mit Symbol und Text (Datum, Ort, Kosten ...).
class InfoZeile extends StatelessWidget {
  const InfoZeile({super.key, required this.symbol, required this.text, this.titel});

  final IconData symbol;
  final String text;

  /// Kleine Beschriftung ueber dem Text ("Organisation").
  final String? titel;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(symbol, size: 20, color: t.colorScheme.primary),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (titel != null)
                  Text(
                    titel!,
                    style: t.textTheme.labelSmall?.copyWith(color: t.colorScheme.outline),
                  ),
                Text(text, style: t.textTheme.bodyMedium),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Stelle eines Widgets auf dem Bildschirm (fuer das Teilen-Menue auf dem
/// iPad).
Rect? stelleVon(BuildContext context) {
  final box = context.findRenderObject();
  if (box is! RenderBox || !box.hasSize) return null;
  return box.localToGlobal(Offset.zero) & box.size;
}
