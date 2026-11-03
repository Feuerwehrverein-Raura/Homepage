// Pingen (Post) im Vorstand-Bereich (docs/vorstand-funktionen.md,
// Abschnitt 8 und «Massen-PDF» aus 7): Guthaben (Live/Staging), Statistik,
// Briefliste mit Status-Abfrage, ein PDF per Post an ausgewaehlte Mitglieder.
//
// Vorbild: vorstand-desktop PingenTab und MassPdfPage. Die Status-Abfrage
// braucht die Pingen-ID (external_id) - der Desktop schickte die
// Protokoll-ID und bekam nie einen Status.

import 'dart:typed_data';

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:material_ui/material_ui.dart';

import '../../dienste.dart';
import '../../mitglieder/modelle.dart';
import '../../versand/versand.dart';
import '../../versand/versand_dienst.dart';
import 'empfaenger_auswahl.dart';
import 'verlauf_ansicht.dart';
import 'versand_bausteine.dart';

class PingenAnsicht extends StatefulWidget {
  const PingenAnsicht({super.key, required this.dienste});

  final VorstandDienste dienste;

  @override
  State<PingenAnsicht> createState() => _PingenAnsichtState();
}

typedef _Daten = ({
  PingenKonto? konto,
  String? kontoFehler,
  PingenStatistik? statistik,
  List<VersandEintrag> briefe,
  List<VorstandMitglied> mitglieder,
});

/// Hoechstens so viele offene Briefe auf einmal bei Pingen abfragen.
const _abgleichMax = 30;

class _PingenAnsichtState extends State<PingenAnsicht> {
  var _laden = GlobalKey<LadeAnsichtState<_Daten>>();
  var _staging = false;

  final _betreff = TextEditingController();
  ({Uint8List bytes, String dateiname})? _pdf;
  var _ids = <String>{};
  var _sendet = false;
  (int, int)? _fortschritt;
  VersandErgebnis? _ergebnis;

  /// Status, die seit dem Laden bei Pingen abgefragt wurden (Protokoll-ID).
  final _status = <String, String?>{};
  final _pruefe = <String>{};

  VersandDienst get _dienst => widget.dienste.versand;

  @override
  void initState() {
    super.initState();
    _betreff.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _betreff.dispose();
    super.dispose();
  }

  Future<_Daten> _datenLaden() async {
    final staging = _staging;
    final konto = _dienst
        .pingenKonto(staging: staging)
        .then<(PingenKonto?, String?)>(
          (k) => (k, null),
          onError: (Object e) => (null, fehlerText(e)),
        );
    final statistik = _dienst.pingenStatistik().then<PingenStatistik?>(
      (s) => s,
      onError: (_) => null,
    );
    final mitglieder = widget.dienste.mitglieder.liste();
    final briefe = await _dienst.pingenBriefe();
    final (k, kf) = await konto;
    _status.clear();
    return (
      konto: k,
      kontoFehler: kf,
      statistik: await statistik,
      briefe: briefe,
      mitglieder: await mitglieder,
    );
  }

  void _stagingWechseln(bool staging) {
    if (staging == _staging) return;
    setState(() {
      _staging = staging;
      _laden = GlobalKey();
    });
  }

  Future<void> _statusPruefen(VersandEintrag e) async {
    final id = e.externeId;
    if (id == null) return;
    setState(() => _pruefe.add(e.id));
    try {
      final s = await _dienst.briefStatus(id, staging: e.staging);
      if (mounted) setState(() => _status[e.id] = s);
    } on Object catch (f) {
      if (mounted) meldung(context, 'Status: ${fehlerText(f)}');
    } finally {
      if (mounted) setState(() => _pruefe.remove(e.id));
    }
  }

  Future<void> _offeneAbgleichen(List<VersandEintrag> briefe) async {
    final offen = [
      for (final b in briefe)
        if (b.externeId != null && !istEndstatus(_status[b.id] ?? b.status)) b,
    ].take(_abgleichMax);
    for (final b in offen) {
      if (!mounted) return;
      await _statusPruefen(b);
    }
  }

  Future<void> _pdfWaehlen() async {
    final waehlen = widget.dienste.umgebung.pdfWaehlen;
    if (waehlen == null) return;
    try {
      final pdf = await waehlen();
      if (pdf != null && mounted) {
        setState(() {
          _pdf = pdf;
          if (_betreff.text.trim().isEmpty) {
            _betreff.text = pdf.dateiname.replaceAll(RegExp(r'\.pdf$', caseSensitive: false), '');
          }
        });
      }
    } on Object catch (e) {
      if (mounted) meldung(context, 'PDF: ${fehlerText(e)}');
    }
  }

  Future<void> _auswaehlen(List<VorstandMitglied> mitAdresse) async {
    final ids = await empfaengerAuswaehlen(
      context,
      titel: 'Brief-Empfänger',
      mitglieder: mitAdresse,
      gewaehlt: _ids,
      schnellwahl: [
        ('Alle mit Post-Zustellung', (m) => m.zustellungPost && !nichtImVersand.contains(m.status)),
      ],
      hinweis: (m) =>
          ['${m.strasse}, ${m.plz} ${m.ort}', if (m.zustellungPost) 'Post-Zustellung'].join(' · '),
    );
    if (ids != null) setState(() => _ids = ids);
  }

  Future<void> _senden(List<VorstandMitglied> empfaenger) async {
    final pdf = _pdf;
    if (pdf == null || empfaenger.isEmpty) return;
    final kosten = franken(empfaenger.length * pingenKostenProBrief);
    final ok = await nachfragen(
      context,
      titel: 'PDF per Post senden?',
      text:
          '«${pdf.dateiname}» an ${anzahl(empfaenger.length, 'Mitglied', 'Mitglieder')}.\n\n'
          '${_staging ? 'Staging (Test): nichts wird gedruckt, nichts kostet.' : 'Echte Briefe: ca. $kosten, '
                    'gehen sofort an Pingen. Zurückholen geht nicht.'}',
      ja: _staging ? 'Senden (Test)' : 'Senden und bezahlen',
      gefaehrlich: !_staging,
    );
    if (!ok || !mounted) return;
    setState(() {
      _sendet = true;
      _ergebnis = null;
    });
    final ergebnis = await _dienst.pdfAnAuswahl(
      pdf: pdf.bytes,
      betreff: _betreff.text.trim().isEmpty ? pdf.dateiname : _betreff.text,
      mitglieder: empfaenger,
      staging: _staging,
      fortschritt: (f, g) {
        if (mounted) setState(() => _fortschritt = (f, g));
      },
    );
    if (!mounted) return;
    setState(() {
      _sendet = false;
      _fortschritt = null;
      _ergebnis = ergebnis;
      if (ergebnis.briefe > 0) {
        _pdf = null;
        _ids = {};
        _betreff.clear();
      }
    });
    if (ergebnis.briefe > 0) await _laden.currentState?.neuLaden();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: mitSystemleiste(
            context,
            const EdgeInsets.fromLTRB(16, 8, 4, 4),
          ).copyWith(bottom: 4),
          child: Row(
            children: [
              SegmentedButton<bool>(
                key: const Key('pingen-umgebung'),
                showSelectedIcon: false,
                segments: const [
                  ButtonSegment(value: false, label: Text('Live')),
                  ButtonSegment(value: true, label: Text('Staging')),
                ],
                selected: {_staging},
                onSelectionChanged: _sendet ? null : (s) => _stagingWechseln(s.first),
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
          child: LadeAnsicht<_Daten>(key: _laden, laden: _datenLaden, bauen: _inhalt),
        ),
      ],
    );
  }

  Widget _inhalt(BuildContext context, _Daten d, Future<void> Function() neuLaden) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: mitSystemleiste(
        context,
        const EdgeInsets.fromLTRB(16, 12, 16, 24),
        maxBreite: kartenBreite,
      ),
      children: [
        KartenSpalten(children: [_konto(context, d), _statistik(context, d.statistik)]),
        KartenSpalten(
          minBreite: 420,
          children: [_pdfSenden(context, d.mitglieder), _briefe(context, d.briefe)],
        ),
      ],
    );
  }

  Widget _konto(BuildContext context, _Daten d) {
    final t = Theme.of(context);
    final k = d.konto;
    return Karte(
      key: const Key('pingen-konto'),
      titel: _staging ? 'Guthaben (Staging)' : 'Guthaben',
      kinder: [
        if (k == null)
          Text(
            'Konto nicht abrufbar: ${d.kontoFehler ?? 'unbekannt'}',
            style: t.textTheme.bodySmall,
          )
        else ...[
          Text(
            k.guthaben == null ? '–' : '${k.waehrung} ${k.guthaben!.toStringAsFixed(2)}',
            style: t.textTheme.headlineMedium,
          ),
          if (k.name != null) Text(k.name!, style: t.textTheme.bodySmall),
          if (k.guthaben != null && !_staging)
            Text(
              'reicht für ca. ${(k.guthaben! / pingenKostenProBrief).floor()} Briefe',
              style: t.textTheme.bodySmall,
            ),
        ],
      ],
    );
  }

  Widget _statistik(BuildContext context, PingenStatistik? s) {
    final t = Theme.of(context);
    Widget zahl(String text, int wert) => SizedBox(
      width: 110,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('$wert', style: t.textTheme.titleLarge),
          Text(text, style: t.textTheme.bodySmall),
        ],
      ),
    );
    return Karte(
      key: const Key('pingen-statistik'),
      titel: 'Briefe (alle Zeit)',
      kinder: [
        if (s == null)
          Text('Statistik nicht abrufbar.', style: t.textTheme.bodySmall)
        else
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              zahl('Total', s.total),
              zahl('Versendet', s.gesendet),
              zahl('Ausstehend', s.ausstehend),
              zahl('Fehlgeschlagen', s.fehlgeschlagen),
              zahl('Letzte 7 Tage', s.tage7),
              zahl('Letzte 30 Tage', s.tage30),
            ],
          ),
      ],
    );
  }

  Widget _pdfSenden(BuildContext context, List<VorstandMitglied> mitglieder) {
    final t = Theme.of(context);
    final mitAdresse = mitglieder.where(hatPostadresse).toList();
    final empfaenger = mitAdresse.where((m) => _ids.contains(m.id)).toList();
    final kannWaehlen = widget.dienste.umgebung.pdfWaehlen != null;
    final pdf = _pdf;
    final fortschritt = _fortschritt;
    return Karte(
      key: const Key('pingen-pdf'),
      titel: 'PDF per Post senden',
      kinder: [
        Text(
          'Ein fertiges PDF (z.B. Einladung, Jahresprogramm) an ausgewählte Mitglieder. '
          'Die Adresse setzt das Backend ins Fenster.',
          style: t.textTheme.bodySmall,
        ),
        const SizedBox(height: 8),
        if (!kannWaehlen)
          const Hinweis(
            art: HinweisArt.neutral,
            text:
                'Diese App-Version kann noch keine Datei wählen – PDF-Versand vorerst auf '
                'der Website.',
          )
        else
          OutlinedButton.icon(
            key: const Key('pingen-pdf-waehlen'),
            onPressed: _sendet ? null : _pdfWaehlen,
            icon: const Icon(Icons.attach_file),
            label: Text(pdf == null ? 'PDF wählen …' : pdf.dateiname),
          ),
        const SizedBox(height: 8),
        TextField(
          key: const Key('pingen-betreff'),
          controller: _betreff,
          enabled: !_sendet,
          decoration: const InputDecoration(
            labelText: 'Betreff (für Protokoll und Dateiname)',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          key: const Key('pingen-empfaenger'),
          onPressed: _sendet ? null : () => _auswaehlen(mitAdresse),
          icon: const Icon(Icons.checklist),
          label: Text(
            empfaenger.isEmpty ? 'Empfänger wählen …' : '${empfaenger.length} Empfänger – ändern …',
          ),
        ),
        if (empfaenger.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(
            '${anzahl(empfaenger.length, 'Brief', 'Briefe')} · '
            '${_staging ? 'Staging, kostet nichts' : 'ca. ${franken(empfaenger.length * pingenKostenProBrief)}'}',
            key: const Key('pingen-kosten'),
            style: t.textTheme.bodySmall,
          ),
        ],
        const SizedBox(height: 12),
        if (fortschritt != null) ...[
          LinearProgressIndicator(
            value: fortschritt.$2 == 0 ? null : fortschritt.$1 / fortschritt.$2,
          ),
          const SizedBox(height: 8),
        ],
        FilledButton.icon(
          key: const Key('pingen-senden'),
          onPressed: pdf != null && empfaenger.isNotEmpty && !_sendet
              ? () => _senden(empfaenger)
              : null,
          icon: const Icon(Icons.local_post_office_outlined),
          label: Text(_sendet ? 'Wird gesendet …' : (_staging ? 'Senden (Staging) …' : 'Senden …')),
        ),
        // Ergebnis gleich unter dem Knopf, wo man gerade hinschaut.
        if (_ergebnis case final e?) ...[
          const SizedBox(height: 12),
          VersandErgebnisKarte(ergebnis: e, schliessen: () => setState(() => _ergebnis = null)),
        ],
      ],
    );
  }

  Widget _briefe(BuildContext context, List<VersandEintrag> briefe) {
    final offen = briefe
        .where((b) => b.externeId != null && !istEndstatus(_status[b.id] ?? b.status))
        .length;
    return Karte(
      key: const Key('pingen-briefe'),
      titel: 'Letzte Briefe',
      aktion: offen == 0
          ? null
          : TextButton.icon(
              key: const Key('pingen-abgleichen'),
              onPressed: _pruefe.isNotEmpty ? null : () => _offeneAbgleichen(briefe),
              icon: const Icon(Icons.sync, size: 18),
              label: Text('$offen offene prüfen'),
            ),
      kinder: [
        if (briefe.isEmpty)
          const Text('Noch keine Briefe.')
        else
          for (final b in briefe)
            VersandZeile(
              eintrag: b.mitStatus(_status[b.id]),
              antippen: () => versandDetails(context, b.mitStatus(_status[b.id])),
              aktion: b.externeId == null
                  ? null
                  : _pruefe.contains(b.id)
                  ? const Padding(
                      padding: EdgeInsets.all(12),
                      child: SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    )
                  : IconButton(
                      key: Key('pingen-status-${b.id}'),
                      tooltip: 'Status bei Pingen prüfen',
                      icon: const Icon(Icons.refresh, size: 20),
                      onPressed: () => _statusPruefen(b),
                    ),
            ),
      ],
    );
  }
}
