// Eine Ausleihe: Zeitraum, Status, wer, Positionen (Kisten mit Inhalt),
// Rueckgabe mit Zustand und Fotos. Unten immer sichtbar, was erlaubt ist
// (vom Backend: kann_absagen / kann_ausgeben / kann_zuruecknehmen).

import 'package:fwv_anlass/fwv_anlass.dart'
    show
        Abschnitt,
        InfoZeile,
        LadeAnsicht,
        LadeAnsichtState,
        StatusChip,
        UntenLeiste,
        fehlerText,
        meldung,
        nachfragen,
        mitSystemleiste;
import 'package:material_ui/material_ui.dart';

import '../modelle.dart';
import '../zugang.dart';
import 'bausteine.dart';
import 'zuruecknehmen_screen.dart';

/// Oeffnet eine Ausleihe; true, wenn sich etwas geaendert hat.
Future<bool> ausleiheOeffnen(BuildContext context, Ausleihen ausleihen, int id) async =>
    await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => AusleiheScreen(ausleihen: ausleihen, id: id),
      ),
    ) ??
    false;

class AusleiheScreen extends StatefulWidget {
  const AusleiheScreen({super.key, required this.ausleihen, required this.id});

  final Ausleihen ausleihen;
  final int id;

  @override
  State<AusleiheScreen> createState() => _AusleiheScreenState();
}

class _AusleiheScreenState extends State<AusleiheScreen> {
  final _lader = GlobalKey<LadeAnsichtState<Ausleihe>>();
  Ausleihe? _a;
  bool _geaendert = false;
  bool _laeuft = false;

  AusleiheZugang get _zugang => widget.ausleihen.zugang;

  Future<Ausleihe> _laden() async {
    final a = await _zugang.ausleihe(widget.id);
    if (mounted) setState(() => _a = a);
    return a;
  }

  Future<void> _ausfuehren(Future<Ausleihe> Function() aktion, String erfolg) async {
    setState(() => _laeuft = true);
    try {
      final neu = await aktion();
      _geaendert = true;
      if (!mounted) return;
      setState(() => _a = neu);
      meldung(context, erfolg);
      await _lader.currentState?.neuLaden();
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _laeuft = false);
    }
  }

  Future<void> _absagen() async {
    final ok = await nachfragen(
      context,
      titel: 'Ausleihe absagen?',
      text: 'Die Reservierung wird aufgehoben.',
      ja: 'Absagen',
    );
    if (ok) await _ausfuehren(() => _zugang.absagen(widget.id), 'Ausleihe abgesagt');
  }

  Future<void> _ausgeben() async {
    final ok = await nachfragen(
      context,
      titel: 'Ausgeben?',
      text: 'Alles wird aus dem Lager ausgebucht (Grund: Ausleihe #${widget.id}).',
      ja: 'Ausgeben',
      gefaehrlich: false,
    );
    if (ok) await _ausfuehren(() => _zugang.ausgeben(widget.id), 'Ausgegeben und ausgebucht');
  }

  Future<void> _zuruecknehmen() async {
    final a = _a;
    if (a == null) return;
    final neu = await Navigator.of(context).push<Ausleihe>(
      MaterialPageRoute(
        builder: (_) => ZuruecknehmenScreen(ausleihen: widget.ausleihen, ausleihe: a),
      ),
    );
    if (neu == null || !mounted) return;
    _geaendert = true;
    setState(() => _a = neu);
    meldung(context, 'Zurückgenommen und eingebucht');
    await _lader.currentState?.neuLaden();
  }

  @override
  Widget build(BuildContext context) {
    final a = _a;
    final knoepfe = <Widget>[
      if (a != null && a.app.kannAbsagen)
        OutlinedButton.icon(
          key: const Key('absagen'),
          onPressed: _laeuft ? null : _absagen,
          icon: const Icon(Icons.close),
          label: const Text('Absagen'),
        ),
      if (a != null && a.app.kannAusgeben)
        FilledButton.icon(
          key: const Key('ausgeben'),
          onPressed: _laeuft ? null : _ausgeben,
          icon: const Icon(Icons.outbox_outlined),
          label: const Text('Ausgeben'),
        ),
      if (a != null && a.app.kannZuruecknehmen)
        FilledButton.icon(
          key: const Key('zuruecknehmen'),
          onPressed: _laeuft ? null : _zuruecknehmen,
          icon: const Icon(Icons.move_to_inbox_outlined),
          label: const Text('Zurücknehmen'),
        ),
    ];
    return PopScope<bool>(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).pop(_geaendert);
      },
      child: Scaffold(
        appBar: AppBar(title: Text('Ausleihe #${widget.id}')),
        body: LadeAnsicht<Ausleihe>(
          key: _lader,
          laden: _laden,
          bauen: (context, geladen, _) => _inhalt(context, _a ?? geladen),
        ),
        bottomNavigationBar: knoepfe.isEmpty ? null : UntenLeiste(kinder: knoepfe),
      ),
    );
  }

  Widget _inhalt(BuildContext context, Ausleihe a) {
    final t = Theme.of(context);
    final klein = t.textTheme.bodySmall?.copyWith(color: t.colorScheme.outline);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: mitSystemleiste(context, const EdgeInsets.fromLTRB(16, 12, 16, 24)),
      children: [
        Row(
          children: [
            Expanded(child: Text(a.app.zeitraumText ?? '', style: t.textTheme.titleLarge)),
            const SizedBox(width: 8),
            StatusChip(text: a.app.statusText ?? a.status.wert, farbe: a.app.statusFarbe),
          ],
        ),
        if (a.app.hinweis != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              a.app.hinweis!,
              style: a.app.ueberfaellig
                  ? t.textTheme.bodyMedium?.copyWith(color: t.colorScheme.error)
                  : klein,
            ),
          ),
        const SizedBox(height: 8),
        if (a.app.ausleiherText != null)
          InfoZeile(
            symbol: a.extern ? Icons.groups_outlined : Icons.person_outline,
            titel: 'Ausgeliehen an',
            text: a.app.ausleiherText!,
          ),
        if (a.externTelefon != null)
          InfoZeile(symbol: Icons.phone_outlined, titel: 'Telefon', text: a.externTelefon!),
        if (a.externEmail ?? a.mitgliedEmail case final mail?)
          InfoZeile(symbol: Icons.mail_outline, titel: 'E-Mail', text: mail),
        if (a.notizen != null) InfoZeile(symbol: Icons.notes, titel: 'Notiz', text: a.notizen!),
        const Abschnitt('Ausgeliehen'),
        for (final p in a.positionen) _position(context, p),
        if (a.rueckgabeNotiz != null) ...[
          const SizedBox(height: 8),
          InfoZeile(
            symbol: Icons.sticky_note_2_outlined,
            titel: 'Bei der Rückgabe',
            text: a.rueckgabeNotiz!,
          ),
        ],
        if (a.fotos.isNotEmpty) ...[
          const Abschnitt('Fotos'),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final f in a.fotos) AusleiheBild(ausleihen: widget.ausleihen, pfad: f.bild),
            ],
          ),
        ],
      ],
    );
  }

  Widget _position(BuildContext context, AusleihePosition p) {
    final t = Theme.of(context);
    final klein = t.textTheme.bodySmall?.copyWith(color: t.colorScheme.outline);
    String? rueckgabe(int menge, int? zurueck, String? zustand, String? schaden) =>
        zurueck == null && zustand == null
        ? null
        : [
            if (zurueck != null && zurueck != menge) 'zurück $zurueck von $menge',
            ?zustand,
            ?schaden,
          ].join(' · ');
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                p.istKiste ? Icons.inventory_2_outlined : Icons.inventory_outlined,
                size: 20,
                color: t.colorScheme.primary,
              ),
              const SizedBox(width: 12),
              Expanded(child: Text(p.anzeige, style: t.textTheme.bodyLarge)),
            ],
          ),
          if (!p.istKiste)
            if (rueckgabe(p.menge, p.zurueckMenge, p.zustandText, p.schaden) case final r?)
              Padding(
                padding: const EdgeInsets.only(left: 32),
                child: Text(r, style: klein),
              ),
          if (p.istKiste) ...[
            if (p.zustandText != null || p.schaden != null)
              Padding(
                padding: const EdgeInsets.only(left: 32),
                child: Text([?p.zustandText, ?p.schaden].join(' · '), style: klein),
              ),
            for (final z in p.inhalt)
              Padding(
                padding: const EdgeInsets.only(left: 32, top: 2),
                child: Text(
                  [
                    z.anzeige,
                    ?rueckgabe(z.menge, z.zurueckMenge, z.zustandText, z.schaden),
                  ].join(' — '),
                  style: t.textTheme.bodySmall,
                ),
              ),
          ],
        ],
      ),
    );
  }
}
