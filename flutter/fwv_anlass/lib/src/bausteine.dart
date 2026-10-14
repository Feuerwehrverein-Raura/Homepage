// Bausteine der Oberflaeche, die Mitglieder-App, Vorstand-App und die
// Anlass-Verwaltung gleich brauchen: Laden mit Fehler-/Leer-Zustand,
// Meldungen, Hinweis-Chips, Info-Zeilen, Schicht-Zeile, Knopfleiste unten,
// Rueckfrage, PDF teilen, Zahl mit Plus/Minus.

import 'dart:math' as math;
import 'dart:typed_data';

import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import 'thema.dart';
import 'zugang.dart';

/// Innenabstand einer scrollbaren Liste plus der Platz, den die
/// Bedienleiste des Systems unten belegt (Android-Gestenleiste,
/// iPhone-Home-Balken).
///
/// Gibt man einer Liste einen eigenen `padding`, rechnet Flutter diesen Platz
/// NICHT mehr selbst dazu - der letzte Eintrag rutschte dann unter die
/// Gestenleiste. Auf Seiten mit Reiterleiste ist der Wert 0 (die Leiste
/// belegt den Platz schon), dort aendert sich nichts.
///
/// Auf grossen Bildschirmen (Tablet, Browser) rueckt sie zudem seitlich ein,
/// damit der Inhalt hoechstens [maxBreite] breit ist und mittig steht - Zeilen
/// quer ueber 1300 Punkte liest niemand, und der Schalter klebte am rechten
/// Rand. Die Bildlaufleiste bleibt dabei aussen. Auf dem Handy aendert sich
/// nichts.
EdgeInsets mitSystemleiste(
  BuildContext context,
  EdgeInsets abstand, {
  double maxBreite = lesbareBreite,
}) {
  final rand = math.max(0.0, (MediaQuery.sizeOf(context).width - maxBreite) / 2);
  return abstand.copyWith(
    left: abstand.left + rand,
    right: abstand.right + rand,
    bottom: abstand.bottom + MediaQuery.paddingOf(context).bottom,
  );
}

/// Hoechstbreite fuer Listen und Formulare auf grossen Bildschirmen.
const lesbareBreite = 840.0;

/// Hoechstbreite fuer Kartenlisten, die in Spalten stehen ([KartenSpalten]).
const kartenBreite = 1240.0;

/// Karten untereinander - oder, wenn Platz ist, in Spalten nebeneinander
/// (je mindestens [minBreite]). Auf dem Handy eine Spalte wie bisher.
class KartenSpalten extends StatelessWidget {
  const KartenSpalten({super.key, required this.children, this.minBreite = 380, this.abstand = 12});

  final List<Widget> children;
  final double minBreite;
  final double abstand;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, grenzen) {
        final spalten = math.max(1, ((grenzen.maxWidth + abstand) / (minBreite + abstand)).floor());
        if (spalten == 1 || children.length < 2) {
          return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children);
        }
        final breite = (grenzen.maxWidth - abstand * (spalten - 1)) / spalten;
        return Wrap(
          spacing: abstand,
          children: [for (final k in children) SizedBox(width: breite, child: k)],
        );
      },
    );
  }
}

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

/// Rundes Logo eines Anlasses (`app.logo`), z.B. 48 px an der Karte und
/// groesser im Kopf der Detailansicht. Ohne Logo nichts; laesst sich das Bild
/// nicht laden, verschwindet es samt [abstand] — die Karte bleibt heil.
class AnlassLogo extends StatelessWidget {
  const AnlassLogo({
    super.key,
    required this.logo,
    this.groesse = 48,
    this.abstand = EdgeInsets.zero,
  });

  final Uri? logo;
  final double groesse;

  /// Abstand zum Nachbarn; faellt mit dem Bild weg, wenn es nicht laedt.
  final EdgeInsets abstand;

  @override
  Widget build(BuildContext context) {
    final adresse = logo;
    if (adresse == null) return const SizedBox.shrink();
    // Das Bild ist rein schmueckend (der Titel steht daneben).
    return Image.network(
      adresse.toString(),
      width: groesse,
      height: groesse,
      fit: BoxFit.contain,
      excludeFromSemantics: true,
      frameBuilder: (context, bild, frame, synchron) => Padding(
        padding: abstand,
        child: ClipOval(
          child: SizedBox.square(dimension: groesse, child: bild),
        ),
      ),
      errorBuilder: (context, fehler, stack) => const SizedBox.shrink(),
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

/// Belegung zum Ankreuzen: "2/3", voll mit "voll" ("3/3 voll").
String schichtBelegungText(Schicht s) {
  final b = s.app.belegung;
  final gebraucht = b.gebraucht > 0 ? b.gebraucht : (s.gebraucht ?? 0);
  final voll = gebraucht > 0 && b.besetzt >= gebraucht;
  return '${b.besetzt}/$gebraucht${voll ? ' voll' : ''}';
}

/// Schichten zum Ankreuzen (Person eintragen, Anmeldung aendern): Bereich,
/// Tag und Zeit, Belegung "besetzt/gebraucht". Volle Schichten lassen sich
/// trotzdem waehlen - das Backend traegt ein und meldet es.
class SchichtAuswahl extends StatelessWidget {
  const SchichtAuswahl({
    super.key,
    required this.schichten,
    required this.gewaehlt,
    required this.aendern,
  });

  final List<Schicht> schichten;
  final Set<String> gewaehlt;
  final void Function(String schichtId, bool gewaehlt) aendern;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final s in schichten)
          CheckboxListTile(
            key: Key('schicht-wahl-${s.id}'),
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: gewaehlt.contains(s.id),
            onChanged: (v) => aendern(s.id, v ?? false),
            title: Text(s.app.bereichText ?? s.name ?? '', style: t.textTheme.titleSmall),
            subtitle: switch ([?s.app.datumText, ?s.app.zeitText].join(' · ')) {
              '' => null,
              final wann => Text(wann),
            },
            secondary: HinweisChip(
              schichtBelegungText(s),
              art: s.app.belegung.offen > 0 ? HinweisArt.gut : HinweisArt.neutral,
            ),
          ),
      ],
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
