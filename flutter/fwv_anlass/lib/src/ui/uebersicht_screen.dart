// Uebersicht der verwalteten Anlaesse (ein Aufruf mit Zahlen statt einer
// Abfrage pro Anlass): aktuelle zuerst, dann die eben vergangenen. Gleich
// fuer Organisator und Vorstand; der Vorstand ([kannAnlegen]) sieht oben
// zudem die offenen Vorschlaege (genehmigen, bearbeiten, ablehnen) und hat
// unten "Neuer Anlass". Mit [AnlassVerwaltungZugang.kannVergangeneZeigen]
// (Vorstand) schaltet "Vergangene anzeigen" die vergangenen Anlaesse der
// letzten 24 Monate in den Abschnitt "Vorbei" (Standard: aus).

import 'package:material_ui/material_ui.dart';

import '../bausteine.dart';
import '../modelle.dart';
import '../zugang.dart';
import 'anlass_bearbeiten_screen.dart';
import 'anlass_screen.dart';

class VerwaltungsUebersichtScreen extends StatefulWidget {
  const VerwaltungsUebersichtScreen({
    super.key,
    required this.verwaltung,
    this.eingebettet = false,
  });

  final AnlassVerwaltung verwaltung;

  /// Ohne eigene Titelleiste - z.B. als Bereich im Reiter "Vorstand", der
  /// seine Leiste selbst zeigt.
  final bool eingebettet;

  @override
  State<VerwaltungsUebersichtScreen> createState() => _VerwaltungsUebersichtScreenState();
}

class _VerwaltungsUebersichtScreenState extends State<VerwaltungsUebersichtScreen> {
  final _lader = GlobalKey<LadeAnsichtState<VerwaltungsUebersicht>>();

  /// Offene Vorschlaege (nur Vorstand); werden mit der Uebersicht geladen.
  var _vorschlaege = const <OffenerVorschlag>[];
  final _laeuft = <String>{};

  /// Auch vergangene Anlaesse zeigen (nur mit [kannVergangeneZeigen]).
  var _vergangene = false;

  AnlassVerwaltungZugang get _z => widget.verwaltung.zugang;

  Future<VerwaltungsUebersicht> _uebersicht() =>
      _vergangene && _z.kannVergangeneZeigen ? _z.uebersichtMitVergangenen() : _z.uebersicht();

  Future<VerwaltungsUebersicht> _laden() async {
    if (!_z.kannAnlegen) return _uebersicht();
    // Vorschlaege duerfen fehlen - die Anlaesse sind wichtiger.
    final vorschlaege = _z.vorschlaege().then<List<OffenerVorschlag>?>(
      (v) => v,
      onError: (_) => null,
    );
    final u = await _uebersicht();
    final v = await vorschlaege;
    if (mounted && v != null) setState(() => _vorschlaege = v);
    return u;
  }

  Future<void> _neuLaden() async => _lader.currentState?.neuLaden();

  void _vergangeneUmschalten(bool an) {
    setState(() => _vergangene = an);
    _neuLaden();
  }

  Future<void> _oeffnen(VerwalteterAnlass a) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) =>
            VerwaltungsAnlassScreen(verwaltung: widget.verwaltung, anlassId: a.anlass.id),
      ),
    );
    await _neuLaden();
  }

  /// Formular fuer einen neuen Anlass oder einen Vorschlag.
  Future<void> _formular({OffenerVorschlag? vorschlag}) async {
    final ok = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => AnlassBearbeitenScreen(
          verwaltung: widget.verwaltung,
          anlass: vorschlag?.anlass,
          organisator: vorschlag?.organisator,
          datumOffen: vorschlag?.datumOffen,
        ),
      ),
    );
    if (ok == true) await _neuLaden();
  }

  Future<void> _aktion(String id, Future<void> Function() aufruf, String erfolg) async {
    setState(() => _laeuft.add(id));
    try {
      await aufruf();
      if (mounted) meldung(context, erfolg);
      await _neuLaden();
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _laeuft.remove(id));
    }
  }

  Future<void> _genehmigen(OffenerVorschlag v) => _aktion(
    v.anlass.id,
    () => _z.vorschlagFreigeben(v.anlass.id),
    '«${v.anlass.titel}» genehmigt',
  );

  Future<void> _ablehnen(OffenerVorschlag v) async {
    final ok = await nachfragen(
      context,
      titel: 'Vorschlag ablehnen?',
      text: '«${v.anlass.titel}» wird gelöscht.',
      ja: 'Ablehnen',
    );
    if (!ok || !mounted) return;
    await _aktion(
      v.anlass.id,
      () => _z.vorschlagAblehnen(v.anlass.id),
      '«${v.anlass.titel}» abgelehnt',
    );
  }

  String get _leerText => _z.kannAnlegen
      ? 'Zurzeit keine aktuellen Anlässe. Mit «Neuer Anlass» legst du einen an.'
      : 'Du verwaltest zurzeit keine Anlässe.';

  @override
  Widget build(BuildContext context) {
    final z = _z;
    return Scaffold(
      appBar: widget.eingebettet ? null : AppBar(title: Text(z.bezeichnung)),
      floatingActionButton: z.kannAnlegen
          ? FloatingActionButton.extended(
              key: const Key('anlass-neu'),
              heroTag: 'anlass-neu',
              onPressed: () => _formular(),
              icon: const Icon(Icons.add),
              label: const Text('Neuer Anlass'),
            )
          : null,
      body: LadeAnsicht<VerwaltungsUebersicht>(
        key: _lader,
        laden: _laden,
        // Mit dem Schalter "Vergangene anzeigen" nie leer - sonst liesse er
        // sich ohne aktuelle Anlaesse nicht einschalten.
        istLeer: (u) => u.anlaesse.isEmpty && _vorschlaege.isEmpty && !z.kannVergangeneZeigen,
        leer: _leerText,
        bauen: (context, u, _) {
          final aktuell = [
            for (final a in u.anlaesse)
              if (a.aktuell) a,
          ];
          final vorbei = [
            for (final a in u.anlaesse)
              if (!a.aktuell) a,
          ];
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: mitSystemleiste(
              context,
              // Mit "Neuer Anlass" unten Platz fuer den Knopf.
              EdgeInsets.fromLTRB(12, 8, 12, z.kannAnlegen ? 96 : 24),
              maxBreite: kartenBreite,
            ),
            children: [
              if (_vorschlaege.isNotEmpty) ...[
                Abschnitt('Vorschläge (${_vorschlaege.length})'),
                KartenSpalten(
                  children: [
                    for (final v in _vorschlaege)
                      VorschlagKarte(
                        vorschlag: v,
                        laeuft: _laeuft.contains(v.anlass.id),
                        genehmigen: () => _genehmigen(v),
                        bearbeiten: () => _formular(vorschlag: v),
                        ablehnen: () => _ablehnen(v),
                      ),
                  ],
                ),
                if (aktuell.isNotEmpty) const Abschnitt('Aktuell'),
              ],
              KartenSpalten(
                children: [
                  for (final a in aktuell) AnlassKarte(anlass: a, oeffnen: () => _oeffnen(a)),
                ],
              ),
              // Unter den aktuellen: eingeschaltet folgt gleich "Vorbei".
              if (z.kannVergangeneZeigen) ...[
                if (u.anlaesse.isEmpty && _vorschlaege.isEmpty)
                  Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      _vergangene ? 'Keine Anlässe in den letzten 24 Monaten.' : _leerText,
                      textAlign: TextAlign.center,
                    ),
                  ),
                SwitchListTile(
                  key: const Key('vergangene-anzeigen'),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                  title: const Text('Vergangene anzeigen'),
                  subtitle: const Text('Anlässe der letzten 24 Monate'),
                  value: _vergangene,
                  onChanged: _vergangeneUmschalten,
                ),
              ],
              if (vorbei.isNotEmpty) ...[
                const Abschnitt('Vorbei'),
                KartenSpalten(
                  children: [
                    for (final a in vorbei) AnlassKarte(anlass: a, oeffnen: () => _oeffnen(a)),
                  ],
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}

/// Karte eines Anlasses: Titel, Datum, Zahlen, offene Anmeldungen.
class AnlassKarte extends StatelessWidget {
  const AnlassKarte({super.key, required this.anlass, required this.oeffnen});

  final VerwalteterAnlass anlass;
  final VoidCallback oeffnen;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final a = anlass.anlass;
    final wann = [?a.app.datumText, ?a.app.zeitText].join(' · ');
    final offen = anlass.zahlen.offen;
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 6),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: oeffnen,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: _mitLogo(
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: Text(a.titel, style: t.textTheme.titleMedium)),
                    if (a.app.logo == null) const Icon(Icons.chevron_right),
                  ],
                ),
                if (wann.isNotEmpty) Text(wann, style: t.textTheme.bodySmall),
                if (anlass.zahlen.text != null) ...[
                  const SizedBox(height: 6),
                  Text(anlass.zahlen.text!, style: t.textTheme.bodyMedium),
                ],
                if (offen > 0 || a.app.abgesagt) ...[
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: [
                      if (a.app.abgesagt) const HinweisChip('Abgesagt', art: HinweisArt.schlecht),
                      if (offen > 0)
                        HinweisChip(
                          offen == 1 ? '1 offen' : '$offen offen',
                          art: HinweisArt.warnung,
                        ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// Mit Logo: Logo und Pfeil rechts neben dem Inhalt. Ohne Logo bleibt die
  /// Karte wie sie war (Pfeil in der Titelzeile).
  Widget _mitLogo(Widget inhalt) {
    final logo = anlass.anlass.app.logo;
    if (logo == null) return inhalt;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(child: inhalt),
        AnlassLogo(
          key: const Key('anlass-logo'),
          logo: logo,
          abstand: const EdgeInsets.only(left: 12),
        ),
        const Icon(Icons.chevron_right),
      ],
    );
  }
}

/// Vorschlag eines Mitglieds: was, wann, wo, von wem - und die drei Knoepfe.
class VorschlagKarte extends StatelessWidget {
  const VorschlagKarte({
    super.key,
    required this.vorschlag,
    required this.genehmigen,
    required this.bearbeiten,
    required this.ablehnen,
    this.laeuft = false,
  });

  final OffenerVorschlag vorschlag;
  final VoidCallback genehmigen;
  final VoidCallback bearbeiten;
  final VoidCallback ablehnen;
  final bool laeuft;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final a = vorschlag.anlass;
    final wo = [?vorschlag.wannText, ?a.ort].join(' · ');
    final text = (a.beschreibung ?? '').trim();
    return Card(
      key: Key('vorschlag-${a.id}'),
      margin: const EdgeInsets.symmetric(vertical: 6),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: Text(a.titel, style: t.textTheme.titleMedium)),
                const SizedBox(width: 8),
                const HinweisChip('Vorschlag', art: HinweisArt.warnung),
              ],
            ),
            if (wo.isNotEmpty) Text(wo, style: t.textTheme.bodySmall),
            if (vorschlag.vorgeschlagenVon != null)
              Text(
                'Vorschlag von ${vorschlag.vorgeschlagenVon}',
                style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.outline),
              ),
            if (text.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(text, maxLines: 3, overflow: TextOverflow.ellipsis),
            ],
            const SizedBox(height: 4),
            if (laeuft)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: LinearProgressIndicator(),
              )
            else
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  FilledButton(onPressed: genehmigen, child: const Text('Genehmigen')),
                  OutlinedButton(onPressed: bearbeiten, child: const Text('Bearbeiten')),
                  TextButton(
                    onPressed: ablehnen,
                    style: TextButton.styleFrom(foregroundColor: t.colorScheme.error),
                    child: const Text('Ablehnen'),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}
