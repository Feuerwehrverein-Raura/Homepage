// Beitraege im Vorstand-Bereich (docs/vorstand-funktionen.md, Abschnitte 11
// und 12). Phase 1: Jahr waehlen, Kennzahlen, Zahlungsliste mit Suche und
// Filter, bezahlt/offen/Referenz setzen, Beitragsbrief fuer EINE Zahlung.
// Phase 2 (beitraege/jahreslauf.dart): Jahresbeitrag festlegen, Beitraege
// erzeugen, Briefe an alle per E-Mail/Post, Zahlungserinnerungen, Versand
// planen und geplante Auftraege stornieren. Briefvorschau und Kassier-Wahl
// gibt es nur auf der Website.
//
// Vorbild: vorstand.html (Reiter Mitgliedsbeitrag) und vorstand-desktop
// (pages/membership-fees). Backend: api-accounting /membership-fees/...

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';
import 'beitraege/beitraege_daten.dart';
import 'beitraege/einstellung_dialog.dart';
import 'beitraege/jahreslauf.dart';
import 'beitraege/kennzahlen_karten.dart';
import 'beitraege/zahlung_zeile.dart';

class BeitraegeAnsicht extends StatefulWidget {
  const BeitraegeAnsicht({super.key, required this.dienste, this.heute});

  final VorstandDienste dienste;

  /// Fuer Tests; sonst das aktuelle Datum.
  final DateTime? heute;

  @override
  State<BeitraegeAnsicht> createState() => _BeitraegeAnsichtState();
}

class _BeitraegeAnsichtState extends State<BeitraegeAnsicht> {
  late final int _diesesJahr = (widget.heute ?? DateTime.now()).year;
  late int _jahr = _diesesJahr;

  /// Neuer Schluessel je Jahr: die Ansicht laedt dann frisch.
  var _laden = GlobalKey<LadeAnsichtState<BeitragsJahr>>();

  final _suche = TextEditingController();
  var _filter = BeitragsFilter.alle;

  /// Zahlung, an der gerade eine Aktion laeuft.
  String? _arbeitetAn;

  BeitraegeDienst get _dienst => widget.dienste.beitraege;

  @override
  void dispose() {
    _suche.dispose();
    super.dispose();
  }

  void _jahrWechseln(int jahr) {
    if (jahr == _jahr) return;
    setState(() {
      _jahr = jahr;
      _laden = GlobalKey();
    });
  }

  /// Jahresbeitrag bearbeiten; laedt danach neu. true = gespeichert.
  Future<bool> _einstellungBearbeiten(BeitragsJahr daten, Future<void> Function() neuLaden) async {
    final neu = await showDialog<BeitragsEinstellung>(
      context: context,
      builder: (_) => EinstellungDialog(
        dienst: _dienst,
        jahr: daten.jahr,
        einstellung: daten.einstellung,
        hatBeitraege: daten.zahlungen.isNotEmpty,
      ),
    );
    if (neu == null || !mounted) return false;
    meldung(context, 'Jahresbeitrag ${daten.jahr} gespeichert');
    await neuLaden();
    return true;
  }

  Future<void> _websiteOeffnen() async {
    final ok = await widget.dienste.umgebung.linkOeffnen(vorstandWebseite);
    if (!ok && mounted) meldung(context, 'Die Website liess sich nicht öffnen.');
  }

  @override
  Widget build(BuildContext context) {
    final rand = mitSystemleiste(context, const EdgeInsets.fromLTRB(16, 8, 8, 0));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Jahr bleibt stehen, auch waehrend ein anderes Jahr laedt.
        Padding(
          padding: rand.copyWith(bottom: 0),
          child: Row(
            children: [
              Text('Jahr', style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(width: 12),
              DropdownButton<int>(
                key: const Key('beitraege-jahr'),
                value: _jahr,
                underline: const SizedBox.shrink(),
                items: [
                  for (var j = _diesesJahr; j >= _diesesJahr - 4; j--)
                    DropdownMenuItem(value: j, child: Text('$j')),
                ],
                onChanged: (j) {
                  if (j != null) _jahrWechseln(j);
                },
              ),
              const Spacer(),
              IconButton(
                tooltip: 'Neu laden',
                icon: const Icon(Icons.refresh),
                onPressed: () => _laden.currentState?.neuLaden(),
              ),
            ],
          ),
        ),
        const Divider(height: 1),
        Expanded(
          child: LadeAnsicht<BeitragsJahr>(
            key: _laden,
            laden: () => _dienst.jahr(_jahr),
            bauen: _inhalt,
          ),
        ),
      ],
    );
  }

  Widget _inhalt(BuildContext context, BeitragsJahr daten, Future<void> Function() neuLaden) {
    final alle = daten.zahlungen;
    final liste = beitraegeFiltern(alle, filter: _filter, suche: _suche.text);
    final offen = alle.where((z) => !z.bezahlt).length;
    final t = Theme.of(context);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: mitSystemleiste(context, const EdgeInsets.fromLTRB(16, 12, 16, 24)),
      children: [
        _EinstellungZeile(
          jahr: daten.jahr,
          einstellung: daten.einstellung,
          bearbeiten: () => _einstellungBearbeiten(daten, neuLaden),
        ),
        const SizedBox(height: 12),
        KennzahlenKarten(kennzahlen: daten.kennzahlen),
        if (alle.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 24),
            child: Text(
              'Für ${daten.jahr} sind noch keine Beiträge erfasst – unten im Jahreslauf '
              'erzeugen.',
              textAlign: TextAlign.center,
            ),
          )
        else ...[
          const SizedBox(height: 8),
          TextField(
            key: const Key('beitraege-suche'),
            controller: _suche,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              prefixIcon: const Icon(Icons.search),
              hintText: 'Name, E-Mail oder Referenz',
              border: const OutlineInputBorder(),
              isDense: true,
              suffixIcon: _suche.text.isEmpty
                  ? null
                  : IconButton(
                      tooltip: 'Suche leeren',
                      icon: const Icon(Icons.clear),
                      onPressed: () => setState(_suche.clear),
                    ),
            ),
          ),
          const SizedBox(height: 8),
          SegmentedButton<BeitragsFilter>(
            showSelectedIcon: false,
            segments: [
              for (final f in BeitragsFilter.values)
                ButtonSegment(
                  value: f,
                  label: Text(switch (f) {
                    BeitragsFilter.alle => 'Alle (${alle.length})',
                    BeitragsFilter.offen => 'Offen ($offen)',
                    BeitragsFilter.bezahlt => 'Bezahlt (${alle.length - offen})',
                  }),
                ),
            ],
            selected: {_filter},
            onSelectionChanged: (w) => setState(() => _filter = w.first),
          ),
          const SizedBox(height: 4),
          if (liste.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Text('Keine Treffer.', textAlign: TextAlign.center),
            ),
          for (final (i, z) in liste.indexed) ...[
            if (i > 0) const Divider(height: 1),
            ZahlungZeile(
              key: ValueKey(z.id),
              zahlung: z,
              arbeitet: _arbeitetAn == z.id,
              antippen: () => _aktionen(z, neuLaden),
            ),
          ],
        ],
        const SizedBox(height: 24),
        JahresAufgaben(
          dienste: widget.dienste,
          daten: daten,
          neuLaden: neuLaden,
          einstellungBearbeiten: () => _einstellungBearbeiten(daten, neuLaden),
          heute: widget.heute ?? DateTime.now(),
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: Text(
                'Briefvorschau, alle drucken und Kassier wählen: auf der Website.',
                style: t.textTheme.bodySmall,
              ),
            ),
            TextButton.icon(
              onPressed: _websiteOeffnen,
              icon: const Icon(Icons.open_in_new, size: 18),
              label: const Text('Website öffnen'),
            ),
          ],
        ),
      ],
    );
  }

  Future<void> _aktionen(Beitragszahlung z, Future<void> Function() neuLaden) async {
    final aktion = await zahlungsAktionWaehlen(context, z);
    if (aktion == null || !mounted) return;
    switch (aktion) {
      case ZahlungsAktion.bezahlt:
        final ok = await nachfragen(
          context,
          titel: 'Als bezahlt markieren?',
          text:
              'Beitrag ${z.jahr} von ${z.anzeigeName} (${chf(z.betrag)}) mit heutigem Datum '
              'als bezahlt verbuchen?\n\n${z.vorname ?? 'Das Mitglied'} bekommt dazu eine '
              'App-Mitteilung.',
          ja: 'Als bezahlt markieren',
          gefaehrlich: false,
        );
        if (ok) {
          await _ausfuehren(z, () => _dienst.bezahlt(z.id), '${z.anzeigeName}: bezahlt.', neuLaden);
        }
      case ZahlungsAktion.zuruecksetzen:
        final ok = await nachfragen(
          context,
          titel: 'Zurücksetzen?',
          text:
              'Beitrag ${z.jahr} von ${z.anzeigeName} wieder auf «offen» setzen? '
              'Das Zahlungsdatum wird gelöscht.',
          ja: 'Zurücksetzen',
        );
        if (ok) {
          await _ausfuehren(z, () => _dienst.offen(z.id), '${z.anzeigeName}: offen.', neuLaden);
        }
      case ZahlungsAktion.referenz:
        final r = await referenzAbfragen(context, z);
        if (r == null || r == (z.referenz ?? '')) return;
        await _ausfuehren(
          z,
          () => _dienst.referenzSetzen(z.id, r),
          r.isEmpty ? 'Referenz gelöscht.' : 'Referenz gespeichert.',
          neuLaden,
        );
      case ZahlungsAktion.briefEmail:
        final ok = await nachfragen(
          context,
          titel: 'Beitragsbrief per E-Mail senden?',
          text:
              'Sendet jetzt 1 E-Mail mit dem Beitragsbrief ${z.jahr} (${chf(z.betrag)}, '
              'QR-Rechnung) an ${z.anzeigeName} <${z.email}>.\n\n'
              'Das geht sofort raus und lässt sich nicht zurückholen.',
          ja: '1 E-Mail senden',
        );
        if (ok) {
          await _ausfuehren(
            z,
            () => _dienst.briefSenden(z.id, BriefKanal.email),
            'E-Mail an ${z.anzeigeName} gesendet.',
            neuLaden,
          );
        }
      case ZahlungsAktion.briefPost:
        final ok = await nachfragen(
          context,
          titel: 'Beitragsbrief per Post senden?',
          text:
              'Sendet jetzt 1 Brief mit dem Beitragsbrief ${z.jahr} (${chf(z.betrag)}, '
              'QR-Rechnung) per Post (Pingen, kostet ca. CHF 1.–) an:\n\n'
              '${z.anzeigeName}\n${z.strasse}\n${z.plz} ${z.ort}\n\n'
              'Das geht sofort raus und lässt sich nicht zurückholen.',
          ja: '1 Brief senden',
        );
        if (ok) {
          await _ausfuehren(
            z,
            () => _dienst.briefSenden(z.id, BriefKanal.post),
            'Brief an ${z.anzeigeName} ist unterwegs.',
            neuLaden,
          );
        }
    }
  }

  /// Fuehrt eine Aktion aus, meldet das Ergebnis und laedt neu (Kennzahlen
  /// und Liste kommen so frisch vom Backend).
  Future<void> _ausfuehren(
    Beitragszahlung z,
    Future<void> Function() aufruf,
    String erfolg,
    Future<void> Function() neuLaden,
  ) async {
    setState(() => _arbeitetAn = z.id);
    try {
      await aufruf();
      if (!mounted) return;
      meldung(context, erfolg);
      await neuLaden();
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _arbeitetAn = null);
    }
  }
}

/// Jahresbeitrag, Faelligkeit, GV - oder der Hinweis, dass nichts
/// hinterlegt ist.
class _EinstellungZeile extends StatelessWidget {
  const _EinstellungZeile({
    required this.jahr,
    required this.einstellung,
    required this.bearbeiten,
  });

  final int jahr;
  final BeitragsEinstellung? einstellung;
  final VoidCallback bearbeiten;

  @override
  Widget build(BuildContext context) {
    final e = einstellung;
    final t = Theme.of(context);
    final text = e == null
        ? 'Für $jahr ist noch kein Jahresbeitrag hinterlegt.'
        : [
            'Jahresbeitrag ${chf(e.betrag)}',
            if (e.faellig != null) 'fällig am ${datumText(e.faellig!)}',
            if (e.gv != null) 'GV ${e.gv}',
          ].join(' · ');
    return Row(
      children: [
        Icon(Icons.info_outline, size: 18, color: t.colorScheme.outline),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: t.textTheme.bodyMedium?.copyWith(color: t.colorScheme.onSurfaceVariant),
          ),
        ),
        IconButton(
          key: const Key('einstellung-bearbeiten'),
          tooltip: 'Jahresbeitrag bearbeiten',
          onPressed: bearbeiten,
          icon: const Icon(Icons.edit_outlined),
        ),
      ],
    );
  }
}
