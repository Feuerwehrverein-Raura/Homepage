// Bausteine der Oberflaeche, die Mitglieder-App, Vorstand-App und die
// Anlass-Verwaltung gleich brauchen: Laden mit Fehler-/Leer-Zustand,
// Meldungen, Hinweis-Chips, Info-Zeilen, Schicht-Zeile, Knopfleiste unten,
// Rueckfrage, PDF teilen, Zahl mit Plus/Minus.

import 'dart:typed_data';

import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import 'thema.dart';
import 'zugang.dart';

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

/// Hintergrund und Schrift eines Hinweises, in den Statusfarben der alten
/// App (gruen, orange, rot, grau). Es gibt nur das helle Theme.
(Color, Color) hinweisFarben(BuildContext context, HinweisArt art) => switch (art) {
  HinweisArt.gut => (FwvFarben.gruenHell, FwvFarben.gruen),
  HinweisArt.warnung => (FwvFarben.orangeHell, FwvFarben.orange),
  HinweisArt.schlecht => (FwvFarben.rotFlaeche, FwvFarben.rot),
  HinweisArt.neutral => (FwvFarben.grauFlaeche, FwvFarben.textLeise),
};

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

/// Eine Schicht: Bereich, Tag und Zeit, Belegung als fertiger Text.
class SchichtZeile extends StatelessWidget {
  const SchichtZeile({super.key, required this.schicht});

  final Schicht schicht;

  @override
  Widget build(BuildContext context) {
    final app = schicht.app;
    final t = Theme.of(context);
    final wann = [?app.datumText, ?app.zeitText].join(' · ');
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(app.bereichText ?? schicht.name ?? '', style: t.textTheme.titleSmall),
                if (wann.isNotEmpty) Text(wann, style: t.textTheme.bodySmall),
              ],
            ),
          ),
          if (app.belegung.text != null) ...[
            const SizedBox(width: 8),
            HinweisChip(
              app.belegung.text!,
              art: app.belegung.offen > 0 ? HinweisArt.gut : HinweisArt.neutral,
            ),
          ],
        ],
      ),
    );
  }
}

class UntenLeiste extends StatelessWidget {
  const UntenLeiste({super.key, required this.kinder});

  final List<Widget> kinder;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Theme.of(context).colorScheme.surfaceContainer,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: EdgeInsets.fromLTRB(16, 10, 16, 10 + MediaQuery.viewInsetsOf(context).bottom),
          child: Row(
            children: [
              for (final (i, k) in kinder.indexed) ...[
                if (i > 0) const SizedBox(width: 8),
                Expanded(child: k),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Rueckfrage vor etwas, das sich nicht rueckgaengig machen laesst.
Future<bool> nachfragen(
  BuildContext context, {
  required String titel,
  required String text,
  required String ja,
  bool gefaehrlich = true,
}) async {
  final antwort = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(titel),
      content: Text(text),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: const Text('Abbrechen'),
        ),
        FilledButton(
          style: gefaehrlich
              ? FilledButton.styleFrom(
                  backgroundColor: Theme.of(context).colorScheme.error,
                  foregroundColor: Theme.of(context).colorScheme.onError,
                )
              : null,
          onPressed: () => Navigator.of(context).pop(true),
          child: Text(ja),
        ),
      ],
    ),
  );
  return antwort ?? false;
}

/// Laedt ein PDF und gibt es ueber das Teilen-Menue weiter.
Future<void> pdfTeilen(
  BuildContext context,
  VerwaltungsUmgebung umgebung,
  Future<Uint8List> Function() laden,
  String dateiname,
) async {
  final ursprung = stelleVon(context);
  try {
    final bytes = await laden();
    await umgebung.dateiTeilen(bytes, dateiname, 'application/pdf', ursprung: ursprung);
  } on Object catch (e) {
    if (context.mounted) meldung(context, fehlerText(e));
  }
}

/// Dateiname ohne Sonderzeichen: "Teilnehmerliste_Chilbi_2026.pdf".
String pdfName(String art, String titel) {
  final basis = titel
      .replaceAll(RegExp(r'[^A-Za-z0-9ÄÖÜäöüéèàç -]'), '')
      .trim()
      .replaceAll(RegExp(r'\s+'), '_');
  return basis.isEmpty ? '$art.pdf' : '${art}_$basis.pdf';
}

/// Zahl mit Minus/Plus (Personen, benoetigte Helfer).
class ZahlWaehler extends StatelessWidget {
  const ZahlWaehler({
    super.key,
    required this.titel,
    required this.wert,
    required this.aendern,
    this.min = 1,
    this.max = 50,
  });

  final String titel;
  final int wert;
  final ValueChanged<int> aendern;
  final int min;
  final int max;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: Text(titel, style: Theme.of(context).textTheme.bodyLarge)),
        IconButton.outlined(
          onPressed: wert > min ? () => aendern(wert - 1) : null,
          icon: const Icon(Icons.remove),
          tooltip: 'Weniger',
        ),
        SizedBox(
          width: 44,
          child: Text(
            '$wert',
            key: Key('zahl-$titel'),
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium,
          ),
        ),
        IconButton.outlined(
          onPressed: wert < max ? () => aendern(wert + 1) : null,
          icon: const Icon(Icons.add),
          tooltip: 'Mehr',
        ),
      ],
    );
  }
}

/// Status einer Anmeldung in der Farbe des Backends.
class StatusChip extends StatelessWidget {
  const StatusChip({super.key, required this.text, this.farbe});

  final String text;
  final String? farbe;

  @override
  Widget build(BuildContext context) => HinweisChip(
    text,
    art: switch (farbe) {
      'gruen' => HinweisArt.gut,
      'gelb' => HinweisArt.warnung,
      'rot' => HinweisArt.schlecht,
      _ => HinweisArt.neutral,
    },
  );
}
