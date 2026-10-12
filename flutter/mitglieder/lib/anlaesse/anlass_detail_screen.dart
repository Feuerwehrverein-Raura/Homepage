// Detail eines Anlasses (`GET events/:id`). Unten stehen die Knoepfe immer
// sichtbar: "Anmelden"/"Helfen" nur, wenn das Backend `anmeldung.moeglich`
// sagt — sonst sein Grund; "Arbeitsplan ansehen" bei Anlaessen mit
// Schichten. Oben: "Zum Kalender" und (falls `kann_bearbeiten`)
// "Bearbeiten".

import 'dart:convert';

import 'package:fwv_anlass/fwv_anlass.dart' show mitSystemleiste;
import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';
import '../gemeinsam.dart';
import '../organisator/organisator_anlass_screen.dart';
import 'anmelden_screen.dart';
import 'arbeitsplan_screen.dart';
import 'bausteine.dart';

class AnlassDetailScreen extends StatefulWidget {
  const AnlassDetailScreen({super.key, required this.dienste, required this.anlassId});

  final Dienste dienste;

  /// UUID (oder Slug).
  final String anlassId;

  @override
  State<AnlassDetailScreen> createState() => _AnlassDetailScreenState();
}

class _AnlassDetailScreenState extends State<AnlassDetailScreen> {
  final _lader = GlobalKey<LadeAnsichtState<Anlass>>();
  Anlass? _anlass;

  Future<Anlass> _laden() async {
    final a = await widget.dienste.anlaesse.anlass(widget.anlassId);
    if (mounted) setState(() => _anlass = a);
    return a;
  }

  Future<void> _anmelden(Anlass a) async {
    final ok = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => AnmeldenScreen(dienste: widget.dienste, anlass: a),
      ),
    );
    // Belegung hat sich geaendert: neu laden.
    if (ok == true) await _lader.currentState?.neuLaden();
  }

  Future<void> _arbeitsplan(Anlass a) => Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) => ArbeitsplanScreen(dienste: widget.dienste, anlassId: a.id, titel: a.titel),
    ),
  );

  Future<void> _bearbeiten(Anlass a) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => OrganisatorAnlassScreen(dienste: widget.dienste, anlassId: a.id),
      ),
    );
    await _lader.currentState?.neuLaden();
  }

  Future<void> _zumKalender(Anlass a, Rect? ursprung) async {
    final ics = anlassAlsIcs(a);
    if (ics == null) {
      meldung(context, 'Für diesen Anlass ist kein Datum bekannt.');
      return;
    }
    try {
      await widget.dienste.dateiTeilen(
        utf8.encode(ics),
        icsDateiname(a),
        'text/calendar',
        ursprung: ursprung,
      );
    } on Object {
      if (mounted) meldung(context, 'Kalender-Eintrag konnte nicht geteilt werden.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final a = _anlass;
    return Scaffold(
      appBar: AppBar(
        title: Text(a?.titel ?? 'Anlass'),
        actions: [
          // Ideen ohne Datum: nichts fuer den Kalender.
          if (a != null && !a.app.datumOffen)
            Builder(
              builder: (context) => IconButton(
                onPressed: () => _zumKalender(a, stelleVon(context)),
                icon: const Icon(Icons.edit_calendar_outlined),
                tooltip: 'Zum Kalender',
              ),
            ),
          if (a != null && a.app.kannBearbeiten)
            IconButton(
              onPressed: () => _bearbeiten(a),
              icon: const Icon(Icons.edit_outlined),
              tooltip: 'Bearbeiten',
            ),
        ],
      ),
      body: LadeAnsicht<Anlass>(
        key: _lader,
        laden: _laden,
        bauen: (context, a, _) => _Inhalt(anlass: a),
      ),
      bottomNavigationBar: a == null
          ? null
          : _KnopfLeiste(
              anlass: a,
              anmelden: () => _anmelden(a),
              arbeitsplan: () => _arbeitsplan(a),
            ),
    );
  }
}

class _Inhalt extends StatelessWidget {
  const _Inhalt({required this.anlass});

  final Anlass anlass;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final app = anlass.app;
    final anm = app.anmeldung;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: mitSystemleiste(context, const EdgeInsets.fromLTRB(16, 16, 16, 24)),
      children: [
        if (app.abgesagt)
          const Padding(
            padding: EdgeInsets.only(bottom: 8),
            child: HinweisChip('Abgesagt', art: HinweisArt.schlecht),
          ),
        Text(anlass.titel, style: t.textTheme.headlineSmall),
        if (anlass.untertitel != null) ...[
          const SizedBox(height: 4),
          Text(
            anlass.untertitel!,
            style: t.textTheme.titleSmall?.copyWith(color: t.colorScheme.outline),
          ),
        ],
        const SizedBox(height: 12),
        if (app.datumText != null)
          InfoZeile(symbol: Icons.calendar_today_outlined, text: app.datumText!),
        if (app.zeitText != null) InfoZeile(symbol: Icons.schedule, text: app.zeitText!),
        if (anlass.ort != null) InfoZeile(symbol: Icons.place_outlined, text: anlass.ort!),
        if (anlass.kosten != null)
          InfoZeile(symbol: Icons.payments_outlined, titel: 'Kosten', text: anlass.kosten!),
        if (anlass.organisator != null)
          InfoZeile(symbol: Icons.person_outline, titel: 'Organisation', text: anlass.organisator!),
        if (anm.anmeldeschlussText != null)
          InfoZeile(
            symbol: Icons.event_busy_outlined,
            titel: 'Anmeldeschluss',
            text: anm.anmeldeschlussText!,
          ),
        if (anm.plaetzeText != null)
          InfoZeile(symbol: Icons.group_outlined, titel: 'Plätze', text: anm.plaetzeText!),
        if (anlass.beschreibung != null) ...[
          const SizedBox(height: 12),
          Text(anlass.beschreibung!, style: t.textTheme.bodyMedium),
        ],
        if (anlass.hatSchichten) ...[
          const SizedBox(height: 8),
          const Abschnitt('Schichten'),
          for (final s in anlass.schichten) SchichtZeile(schicht: s),
        ],
      ],
    );
  }
}

class _KnopfLeiste extends StatelessWidget {
  const _KnopfLeiste({required this.anlass, required this.anmelden, required this.arbeitsplan});

  final Anlass anlass;
  final VoidCallback anmelden;
  final VoidCallback arbeitsplan;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final anm = anlass.app.anmeldung;
    return Material(
      color: t.colorScheme.surfaceContainer,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (anm.moeglich)
                FilledButton.icon(
                  key: const Key('anlass-anmelden'),
                  onPressed: anmelden,
                  icon: Icon(
                    anm.art == AnmeldeArt.schicht ? Icons.volunteer_activism : Icons.how_to_reg,
                  ),
                  label: Text(anm.art == AnmeldeArt.schicht ? 'Helfen' : 'Anmelden'),
                )
              else if (anm.grund != null)
                Row(
                  key: const Key('anlass-grund'),
                  children: [
                    Icon(Icons.info_outline, size: 20, color: t.colorScheme.outline),
                    const SizedBox(width: 8),
                    Expanded(child: Text(anm.grund!, style: t.textTheme.bodyMedium)),
                  ],
                ),
              if (anlass.hatSchichten) ...[
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: arbeitsplan,
                  icon: const Icon(Icons.grid_view),
                  label: const Text('Arbeitsplan ansehen'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
