// Nachricht per E-Mail und/oder Brief verfassen (docs/vorstand-funktionen.md,
// Abschnitt 7, Phase 2): Versandart, Empfaenger (alle, Status, Zustellart,
// Auswahl), Vorlage, Betreff und Text mit Platzhaltern, Vorschau (E-Mail als
// Text, Brief als PDF vom Backend), Rueckfrage mit Zahlen pro Kanal und
// Kosten, Ergebnis.
//
// Vorbild: vorstand-desktop (pages/dispatch, SendTab). Das Brief-HTML baut
// das Backend (POST /dispatch/brief), nicht die App. Anhaenge, Entwuerfe und
// zeitgesteuertes Senden gibt es hier bewusst nicht (in W nie fertig).

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:material_ui/material_ui.dart';

import '../../dienste.dart';
import '../../mitglieder/modelle.dart';
import '../../versand/einladung.dart';
import '../../versand/versand.dart';
import '../../versand/versand_dienst.dart';
import 'empfaenger_auswahl.dart';
import 'versand_bausteine.dart';

class VerfassenAnsicht extends StatefulWidget {
  const VerfassenAnsicht({super.key, required this.dienste, this.entwurf});

  final VorstandDienste dienste;

  /// Betreff und Text zum Start (z.B. Einladung zu einem Anlass).
  final NachrichtEntwurf? entwurf;

  @override
  State<VerfassenAnsicht> createState() => _VerfassenAnsichtState();
}

/// Ohne Vorlagen (Fehler) geht das Verfassen trotzdem.
typedef _Daten = ({List<VorstandMitglied> mitglieder, List<Vorlage> vorlagen});

class _VerfassenAnsichtState extends State<VerfassenAnsicht> {
  final _betreff = TextEditingController();
  final _text = TextEditingController();
  var _art = Versandart.auto;
  var _wahl = const Empfaengerwahl();
  var _staging = false;
  String? _vorlage;
  var _sendet = false;
  var _vorschauLaedt = false;
  (int, int)? _fortschritt;
  VersandErgebnis? _ergebnis;

  VersandDienst get _dienst => widget.dienste.versand;

  @override
  void initState() {
    super.initState();
    if (widget.entwurf case final e?) {
      _betreff.text = e.betreff;
      _text.text = e.text;
    }
    _betreff.addListener(_neu);
    _text.addListener(_neu);
  }

  void _neu() => setState(() {});

  @override
  void dispose() {
    _betreff.dispose();
    _text.dispose();
    super.dispose();
  }

  Future<_Daten> _laden() async {
    final vorlagen = _dienst.vorlagen().then<List<Vorlage>>(
      (v) => v,
      onError: (_) => const <Vorlage>[],
    );
    final mitglieder = await widget.dienste.mitglieder.liste();
    return (mitglieder: mitglieder, vorlagen: await vorlagen);
  }

  bool get _vollstaendig => _betreff.text.trim().isNotEmpty && _text.text.trim().isNotEmpty;

  Future<void> _vorlageWaehlen(Vorlage? v) async {
    if (v == null) {
      setState(() => _vorlage = null);
      return;
    }
    if (_betreff.text.trim().isNotEmpty || _text.text.trim().isNotEmpty) {
      final ok = await nachfragen(
        context,
        titel: 'Vorlage übernehmen?',
        text: 'Betreff und Text werden durch «${v.name}» ersetzt.',
        ja: 'Ersetzen',
        gefaehrlich: false,
      );
      if (!ok || !mounted) return;
    }
    setState(() {
      _vorlage = v.id;
      _betreff.text = v.betreff;
      _text.text = v.text;
    });
  }

  void _platzhalterEinfuegen(String name) {
    final p = '{{$name}}';
    final wert = _text.value;
    final sel = wert.selection;
    final von = sel.isValid ? sel.start : wert.text.length;
    final bis = sel.isValid ? sel.end : von;
    _text.value = TextEditingValue(
      text: wert.text.replaceRange(von, bis, p),
      selection: TextSelection.collapsed(offset: von + p.length),
    );
  }

  Future<void> _auswaehlen(List<VorstandMitglied> mitglieder) async {
    final ids = await empfaengerAuswaehlen(
      context,
      mitglieder: mitglieder,
      gewaehlt: _wahl.ids,
      schnellwahl: [
        ('Mit E-Mail-Zustellung', (m) => hatEmail(m) && m.zustellungEmail),
        ('Mit Post-Zustellung', (m) => m.zustellungPost && hatPostadresse(m)),
      ],
    );
    if (ids != null) setState(() => _wahl = _wahl.mit(ids: ids));
  }

  Future<void> _briefVorschau(VorstandMitglied probe) async {
    setState(() => _vorschauLaedt = true);
    await pdfTeilen(
      context,
      widget.dienste.umgebung,
      () => _dienst.briefVorschau(mitgliedId: probe.id, betreff: _betreff.text, text: _text.text),
      pdfName('Vorschau', mitgliedName(probe)),
    );
    if (mounted) setState(() => _vorschauLaedt = false);
  }

  Future<void> _senden(Versandplan plan) async {
    if (!_vollstaendig || plan.leer) return;
    final mitPost = plan.post.isNotEmpty;
    final ok = await nachfragen(
      context,
      titel: 'Nachricht senden?',
      text: versandRueckfrage(plan, betreff: _betreff.text, staging: _staging),
      ja: mitPost && !_staging ? 'Senden und Briefe bezahlen' : 'Senden',
      gefaehrlich: mitPost && !_staging,
    );
    if (!ok || !mounted) return;
    setState(() {
      _sendet = true;
      _ergebnis = null;
    });
    final ergebnis = await _dienst.senden(
      plan,
      betreff: _betreff.text,
      text: _text.text,
      staging: mitPost && _staging,
      anlassId: widget.entwurf?.anlassId,
      fortschritt: (f, g) {
        if (mounted) setState(() => _fortschritt = (f, g));
      },
    );
    if (!mounted) return;
    setState(() {
      _sendet = false;
      _fortschritt = null;
      _ergebnis = ergebnis;
      // Kein versehentliches zweites Senden an dieselben Leute.
      if (ergebnis.emails + ergebnis.briefe > 0) {
        _betreff.clear();
        _text.clear();
        _vorlage = null;
      }
    });
  }

  @override
  Widget build(BuildContext context) => LadeAnsicht<_Daten>(laden: _laden, bauen: _inhalt);

  Widget _inhalt(BuildContext context, _Daten daten, Future<void> Function() neuLaden) {
    final empfaenger = empfaengerWaehlen(daten.mitglieder, _wahl);
    final plan = versandPlanen(empfaenger, _art);
    final fortschritt = _fortschritt;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: mitSystemleiste(
        context,
        const EdgeInsets.fromLTRB(16, 12, 16, 24),
        maxBreite: kartenBreite,
      ),
      children: [
        KartenSpalten(
          minBreite: 420,
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _versandart(context, plan),
                _empfaenger(context, daten.mitglieder, empfaenger, plan),
              ],
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _inhaltKarte(context, daten.vorlagen),
                _vorschauUndSenden(context, plan, empfaenger, fortschritt),
              ],
            ),
          ],
        ),
      ],
    );
  }

  Widget _versandart(BuildContext context, Versandplan plan) {
    final t = Theme.of(context);
    final mitPost = _art != Versandart.email;
    return Karte(
      titel: 'Versandart',
      kinder: [
        SegmentedButton<Versandart>(
          key: const Key('versand-art'),
          showSelectedIcon: false,
          segments: [
            for (final a in Versandart.values) ButtonSegment(value: a, label: Text(a.text)),
          ],
          selected: {_art},
          onSelectionChanged: _sendet ? null : (s) => setState(() => _art = s.first),
        ),
        const SizedBox(height: 6),
        Text(_art.erklaerung, style: t.textTheme.bodySmall),
        if (mitPost)
          SwitchListTile(
            key: const Key('versand-staging'),
            contentPadding: EdgeInsets.zero,
            value: _staging,
            onChanged: _sendet ? null : (v) => setState(() => _staging = v),
            title: const Text('Staging (Test)'),
            subtitle: Text(
              _staging
                  ? 'Briefe gehen an Pingens Testumgebung – nichts wird gedruckt, nichts kostet.'
                  : 'Aus: echte Briefe, ca. ${franken(pingenKostenProBrief)} pro Brief.',
            ),
          ),
      ],
    );
  }

  Widget _empfaenger(
    BuildContext context,
    List<VorstandMitglied> alle,
    List<VorstandMitglied> empfaenger,
    Versandplan plan,
  ) {
    final t = Theme.of(context);
    final zahlen = {
      for (final s in mitgliedStatusWerte) s: alle.where((m) => m.status == s).length,
    };
    return Karte(
      titel: 'Empfänger',
      kinder: [
        Wrap(
          spacing: 8,
          runSpacing: 4,
          children: [
            for (final a in EmpfaengerArt.values)
              ChoiceChip(
                key: Key('empfaenger-${a.name}'),
                label: Text(a.text),
                selected: _wahl.art == a,
                onSelected: _sendet ? null : (_) => setState(() => _wahl = _wahl.mit(art: a)),
              ),
          ],
        ),
        const SizedBox(height: 8),
        switch (_wahl.art) {
          EmpfaengerArt.alle => Text(
            'Alle Mitglieder ausser ${nichtImVersand.join(', ')}.',
            style: t.textTheme.bodySmall,
          ),
          EmpfaengerArt.status => DropdownButton<String>(
            key: const Key('empfaenger-status-wahl'),
            isExpanded: true,
            value: _wahl.status,
            items: [
              for (final s in mitgliedStatusWerte)
                DropdownMenuItem(value: s, child: Text('$s (${zahlen[s]})')),
            ],
            onChanged: _sendet
                ? null
                : (s) {
                    if (s != null) setState(() => _wahl = _wahl.mit(status: s));
                  },
          ),
          EmpfaengerArt.zustellart => SegmentedButton<Zustellart>(
            key: const Key('empfaenger-zustellart-wahl'),
            showSelectedIcon: false,
            segments: [
              for (final z in Zustellart.values) ButtonSegment(value: z, label: Text(z.text)),
            ],
            selected: {_wahl.zustellart},
            onSelectionChanged: _sendet
                ? null
                : (s) => setState(() => _wahl = _wahl.mit(zustellart: s.first)),
          ),
          EmpfaengerArt.einzeln => OutlinedButton.icon(
            key: const Key('empfaenger-auswaehlen'),
            onPressed: _sendet ? null : () => _auswaehlen(alle),
            icon: const Icon(Icons.checklist),
            label: Text(
              _wahl.ids.isEmpty
                  ? 'Mitglieder auswählen …'
                  : '${_wahl.ids.length} ausgewählt – ändern …',
            ),
          ),
        },
        const SizedBox(height: 12),
        VersandZahlen(key: const Key('versand-zahlen'), gewaehlt: empfaenger.length, plan: plan),
      ],
    );
  }

  Widget _inhaltKarte(BuildContext context, List<Vorlage> vorlagen) {
    final t = Theme.of(context);
    final unbekannt = unbekanntePlatzhalter('${_betreff.text}\n${_text.text}');
    return Karte(
      titel: 'Inhalt',
      kinder: [
        if (vorlagen.isNotEmpty) ...[
          DropdownButton<String?>(
            key: const Key('versand-vorlage'),
            isExpanded: true,
            value: vorlagen.any((v) => v.id == _vorlage) ? _vorlage : null,
            hint: const Text('Vorlage wählen (optional)'),
            items: [
              const DropdownMenuItem<String?>(child: Text('Keine Vorlage')),
              for (final v in vorlagen)
                DropdownMenuItem<String?>(
                  value: v.id,
                  child: Text(v.typ == null ? v.name : '${v.name} (${v.typ})'),
                ),
            ],
            onChanged: _sendet
                ? null
                : (id) => _vorlageWaehlen(vorlagen.where((v) => v.id == id).firstOrNull),
          ),
          const SizedBox(height: 8),
        ],
        TextField(
          key: const Key('versand-betreff'),
          controller: _betreff,
          enabled: !_sendet,
          textInputAction: TextInputAction.next,
          decoration: const InputDecoration(labelText: 'Betreff', border: OutlineInputBorder()),
        ),
        const SizedBox(height: 12),
        TextField(
          key: const Key('versand-text'),
          controller: _text,
          enabled: !_sendet,
          minLines: 8,
          maxLines: 20,
          keyboardType: TextInputType.multiline,
          decoration: const InputDecoration(
            labelText: 'Text',
            alignLabelWithHint: true,
            border: OutlineInputBorder(),
            helperText:
                'Leere Zeile = neuer Absatz. Anrede und Gruss setzt das Layout '
                '(«Mit freundlichen Grüssen … Der Vorstand»).',
            helperMaxLines: 3,
          ),
        ),
        if (widget.entwurf?.anhang case final anhang?) ...[
          const SizedBox(height: 8),
          Hinweis(
            key: const Key('versand-anhang'),
            text: 'Kommt mit: «$anhang» – als Anhang der E-Mail und als weitere Seiten des Briefs.',
          ),
        ],
        const SizedBox(height: 8),
        Text('Platzhalter einfügen', style: t.textTheme.labelMedium),
        const SizedBox(height: 4),
        Wrap(
          spacing: 6,
          runSpacing: 4,
          children: [
            for (final p in versandPlatzhalter)
              ActionChip(
                visualDensity: VisualDensity.compact,
                label: Text('{{$p}}'),
                onPressed: _sendet ? null : () => _platzhalterEinfuegen(p),
              ),
          ],
        ),
        if (unbekannt.isNotEmpty) ...[
          const SizedBox(height: 8),
          Hinweis(
            key: const Key('versand-unbekannt'),
            text:
                '${unbekannt.join(', ')} kennt der Versand nicht – das käme wörtlich an. '
                'Bitte von Hand ersetzen.',
          ),
        ],
      ],
    );
  }

  Widget _vorschauUndSenden(
    BuildContext context,
    Versandplan plan,
    List<VorstandMitglied> empfaenger,
    (int, int)? fortschritt,
  ) {
    final t = Theme.of(context);
    final probe = plan.email.firstOrNull ?? empfaenger.firstOrNull;
    final briefProbe = plan.post.firstOrNull;
    return Karte(
      titel: 'Vorschau',
      kinder: [
        EmailVorschau(
          key: const Key('versand-vorschau'),
          probe: probe,
          betreff: _betreff.text,
          text: _text.text,
        ),
        if (_art != Versandart.email) ...[
          const SizedBox(height: 8),
          OutlinedButton.icon(
            key: const Key('versand-brief-vorschau'),
            onPressed: briefProbe == null || _text.text.trim().isEmpty || _vorschauLaedt
                ? null
                : () => _briefVorschau(briefProbe),
            icon: _vorschauLaedt
                ? const SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.picture_as_pdf_outlined),
            label: Text(
              briefProbe == null
                  ? 'Brief-Vorschau (kein Brief-Empfänger)'
                  : 'Brief als PDF – ${mitgliedName(briefProbe)}',
            ),
          ),
        ],
        const SizedBox(height: 16),
        if (fortschritt != null) ...[
          LinearProgressIndicator(
            value: fortschritt.$2 == 0 ? null : fortschritt.$1 / fortschritt.$2,
          ),
          const SizedBox(height: 4),
          Text('${fortschritt.$1} von ${fortschritt.$2} …', style: t.textTheme.bodySmall),
          const SizedBox(height: 8),
        ],
        FilledButton.icon(
          key: const Key('versand-senden'),
          onPressed: _vollstaendig && !plan.leer && !_sendet ? () => _senden(plan) : null,
          icon: _sendet
              ? const SizedBox.square(
                  dimension: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.send),
          label: Text(_sendet ? 'Wird gesendet …' : 'Senden …'),
        ),
        if (!_vollstaendig || plan.leer)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              plan.leer
                  ? 'Niemand erreichbar – Empfänger oder Versandart ändern.'
                  : 'Betreff und Text ausfüllen.',
              style: t.textTheme.bodySmall,
            ),
          ),
        // Ergebnis gleich unter dem Knopf, wo man gerade hinschaut.
        if (_ergebnis case final e?) ...[
          const SizedBox(height: 12),
          VersandErgebnisKarte(ergebnis: e, schliessen: () => setState(() => _ergebnis = null)),
        ],
      ],
    );
  }
}
