// Reiter "Anlässe": oben umschalten zwischen Liste und Kalender, "+" schlaegt
// einen Anlass vor (nur Mitglieder).
//
// Alles, was angezeigt wird, kommt fertig vom Backend (`app`-Bloecke,
// `datum_text`): die App filtert, zaehlt und formatiert nichts selbst.

import 'package:fwv_anlass/fwv_anlass.dart' show mitSystemleiste;
import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';
import '../gemeinsam.dart';
import 'anlass_detail_screen.dart';
import 'anlass_kalender.dart';
import 'anlass_vorschlagen_screen.dart';
import 'bausteine.dart';
import 'kalender_abo.dart';

enum _Ansicht { liste, kalender }

class AnlaesseTab extends StatefulWidget {
  const AnlaesseTab({super.key, required this.dienste});

  final Dienste dienste;

  @override
  State<AnlaesseTab> createState() => _AnlaesseTabState();
}

class _AnlaesseTabState extends State<AnlaesseTab> {
  var _ansicht = _Ansicht.liste;
  var _kalenderGeoeffnet = false;

  Future<void> _vorschlagen() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => AnlassVorschlagenScreen(dienste: widget.dienste)),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_ansicht == _Ansicht.kalender) _kalenderGeoeffnet = true;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Anlässe'),
        actions: [
          IconButton(
            onPressed: () => kalenderAboZeigen(context, widget.dienste),
            icon: const Icon(Icons.event_repeat_outlined),
            tooltip: 'Kalender abonnieren',
          ),
          if (widget.dienste.alsMitglied)
            IconButton(
              onPressed: _vorschlagen,
              icon: const Icon(Icons.add),
              tooltip: 'Anlass vorschlagen',
            ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: SizedBox(
              width: double.infinity,
              child: SegmentedButton<_Ansicht>(
                segments: const [
                  ButtonSegment(
                    value: _Ansicht.liste,
                    icon: Icon(Icons.view_agenda_outlined),
                    label: Text('Liste'),
                  ),
                  ButtonSegment(
                    value: _Ansicht.kalender,
                    icon: Icon(Icons.calendar_month_outlined),
                    label: Text('Kalender'),
                  ),
                ],
                selected: {_ansicht},
                onSelectionChanged: (s) => setState(() => _ansicht = s.first),
              ),
            ),
          ),
          Expanded(
            child: IndexedStack(
              index: _ansicht.index,
              children: [
                AnlassListe(dienste: widget.dienste),
                _kalenderGeoeffnet
                    ? AnlassKalender(dienste: widget.dienste)
                    : const SizedBox.shrink(),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Kommende und laufende Anlaesse (`GET events?aktuell=true`).
class AnlassListe extends StatelessWidget {
  const AnlassListe({super.key, required this.dienste});

  final Dienste dienste;

  @override
  Widget build(BuildContext context) {
    return LadeAnsicht<List<Anlass>>(
      laden: dienste.anlaesse.aktuelle,
      istLeer: (l) => l.isEmpty,
      leer: 'Zurzeit sind keine Anlässe geplant.',
      bauen: (context, anlaesse, neuLaden) {
        // Reihenfolge und Gruppe kommen vom Backend: erst die kommenden,
        // dann die Ideen ohne Datum.
        final kommend = [
          for (final a in anlaesse)
            if (a.app.gruppe == AnlassGruppe.kommend) a,
        ];
        final ideen = [
          for (final a in anlaesse)
            if (a.app.gruppe == AnlassGruppe.datumOffen) a,
        ];
        Widget karte(Anlass a) => AnlassKarte(
          anlass: a,
          oeffnen: () async {
            await anlassOeffnen(context, dienste, a.id);
            await neuLaden();
          },
        );
        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: mitSystemleiste(context, const EdgeInsets.fromLTRB(12, 4, 12, 16)),
          children: [
            ...kommend.map(karte),
            if (ideen.isNotEmpty) ...[
              const Padding(
                padding: EdgeInsets.only(left: 4),
                child: Abschnitt('Ideen – Datum noch offen'),
              ),
              ...ideen.map(karte),
            ],
          ],
        );
      },
    );
  }
}

/// Oeffnet die Detailansicht eines Anlasses.
Future<void> anlassOeffnen(BuildContext context, Dienste dienste, String id) =>
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => AnlassDetailScreen(dienste: dienste, anlassId: id),
      ),
    );

/// Hinweis auf der Karte: was man tun kann, sonst der Grund vom Backend.
(String, HinweisArt)? anmeldeHinweis(AnlassAnmeldung a) {
  if (a.moeglich) {
    return switch (a.art) {
      AnmeldeArt.schicht => ('Helfer gesucht', HinweisArt.gut),
      AnmeldeArt.teilnahme => ('Anmeldung offen', HinweisArt.gut),
      null => null,
    };
  }
  final grund = a.grund;
  if (grund == null) return null;
  return (grund, a.art == null ? HinweisArt.neutral : HinweisArt.warnung);
}

class AnlassKarte extends StatelessWidget {
  const AnlassKarte({super.key, required this.anlass, required this.oeffnen});

  final Anlass anlass;
  final VoidCallback oeffnen;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final app = anlass.app;
    // Ideen ohne Datum: schlichte Karte, nur Titel, "Datum noch offen", Ort.
    final hinweis = app.datumOffen ? null : anmeldeHinweis(app.anmeldung);
    final wann = [?app.datumText, ?app.zeitText].join(' · ');
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 6),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: oeffnen,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(anlass.titel, style: t.textTheme.titleMedium),
              if (wann.isNotEmpty) ...[
                const SizedBox(height: 4),
                Row(
                  children: [
                    Icon(Icons.schedule, size: 16, color: t.colorScheme.outline),
                    const SizedBox(width: 6),
                    Expanded(child: Text(wann, style: t.textTheme.bodyMedium)),
                  ],
                ),
              ],
              if (anlass.ort != null) ...[
                const SizedBox(height: 2),
                Row(
                  children: [
                    Icon(Icons.place_outlined, size: 16, color: t.colorScheme.outline),
                    const SizedBox(width: 6),
                    Expanded(child: Text(anlass.ort!, style: t.textTheme.bodyMedium)),
                  ],
                ),
              ],
              if (hinweis != null || app.abgesagt) ...[
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    if (app.abgesagt) const HinweisChip('Abgesagt', art: HinweisArt.schlecht),
                    if (hinweis != null) HinweisChip(hinweis.$1, art: hinweis.$2),
                    if (app.anmeldung.plaetzeText case final p?
                        when app.anmeldung.moeglich && !app.datumOffen)
                      HinweisChip(p),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
