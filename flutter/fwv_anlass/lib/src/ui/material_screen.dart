// Rezepte und Material eines Anlasses. Das Events-Backend reicht an die
// Inventar-API durch; die Einkaufsliste rechnet die Inventar-API aus den
// verknuepften Rezepten und dem Material von Hand gegen den Lagerbestand.
// Die App zeigt die Werte nur an. Vorbild: members-ios EventMaterialsView,
// members-android EventMaterialsActivity.
//
// Einkauf (mit [AnlassRechte.einkauf], ersetzt die Einkaufs-PWA):
// Positionen abhaken (mit gekaufter Menge), Belege fotografieren (1600 px)
// und das Gekaufte ins Lager zurueckbuchen.

import 'dart:typed_data';

import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../bausteine.dart';
import '../daten.dart';
import '../zugang.dart';

typedef _MaterialDaten = ({
  List<VerknuepftesRezept> rezepte,
  Einkaufsliste liste,
  List<Beleg> belege,
});

class MaterialAnsicht extends StatefulWidget {
  const MaterialAnsicht({
    super.key,
    required this.verwaltung,
    required this.anlass,
    this.einkauf = false,
  });

  final AnlassVerwaltung verwaltung;
  final Anlass anlass;

  /// Einkauf anbieten (abhaken, Belege, zurueckbuchen).
  final bool einkauf;

  @override
  State<MaterialAnsicht> createState() => _MaterialAnsichtState();
}

class _MaterialAnsichtState extends State<MaterialAnsicht> {
  final _lader = GlobalKey<LadeAnsichtState<_MaterialDaten>>();

  AnlassVerwaltungZugang get _dienst => widget.verwaltung.zugang;
  String get _id => widget.anlass.id;

  Future<_MaterialDaten> _laden() async {
    final r = _dienst.rezepte(_id);
    final l = _dienst.einkaufsliste(_id);
    final b = widget.einkauf ? _dienst.belege(_id) : Future.value(const <Beleg>[]);
    return (rezepte: await r, liste: await l, belege: await b);
  }

  // ---------------------------------------------------------------------
  // Einkauf

  Future<void> _abhaken(EinkaufsPosten p, bool gekauft) async {
    final id = p.materialId;
    if (id == null) return;
    if (!gekauft) {
      await _ausfuehren(
        () => _dienst.gekauftSetzen(_id, id, false),
        '${p.name} nicht mehr abgehakt',
      );
      return;
    }
    final vorschlag = (p.zuKaufen ?? 0) > 0 ? p.zuKaufen! : (p.bedarf ?? 1);
    final menge = await showDialog<double>(
      context: context,
      builder: (context) => _MengeDialog(
        titel: 'Gekauft: ${p.name ?? 'Posten'}',
        einheit: p.einheit,
        start: vorschlag,
        beschriftung: 'Gekaufte Menge',
        knopf: 'Abhaken',
      ),
    );
    if (menge == null) return;
    await _ausfuehren(
      () => _dienst.gekauftSetzen(_id, id, true, istMenge: menge),
      '${p.name} abgehakt',
    );
  }

  Future<void> _belegAufnehmen({required bool kamera}) async {
    final umgebung = widget.verwaltung.umgebung;
    try {
      final roh = await umgebung.fotoWaehlen(kamera: kamera);
      if (roh == null) return;
      final jpeg = await umgebung.anhangVerkleinern(roh);
      await _ausfuehren(() => _dienst.belegHochladen(_id, jpeg), 'Beleg gespeichert');
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    }
  }

  Future<void> _belegLoeschen(Beleg b) async {
    final ok = await nachfragen(
      context,
      titel: 'Beleg löschen?',
      text: 'Das Foto wird entfernt.',
      ja: 'Löschen',
    );
    if (ok) await _ausfuehren(() => _dienst.belegLoeschen(_id, b.id), 'Beleg gelöscht');
  }

  void _belegZeigen(Beleg b) => Navigator.of(context).push<void>(
    MaterialPageRoute(
      builder: (_) => _BelegScreen(verwaltung: widget.verwaltung, anlassId: _id, beleg: b),
    ),
  );

  Future<void> _zurueckbuchen(int anzahl) async {
    final ok = await nachfragen(
      context,
      titel: 'Ins Lager zurückbuchen?',
      text:
          '$anzahl abgehakte ${anzahl == 1 ? 'Position wird' : 'Positionen werden'} dem '
          'Lagerbestand gutgeschrieben (gekaufte Menge, sonst Bedarf minus Bestand). '
          'Jede Position nur einmal.',
      ja: 'Zurückbuchen',
      gefaehrlich: false,
    );
    if (!ok || !mounted) return;
    try {
      final z = await _dienst.insLagerZurueckbuchen(_id);
      if (mounted) meldung(context, z.text);
      await _lader.currentState?.neuLaden();
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    }
  }

  Future<void> _ausfuehren(Future<void> Function() aufruf, String erfolg) async {
    try {
      await aufruf();
      if (mounted) meldung(context, erfolg);
      await _lader.currentState?.neuLaden();
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    }
  }

  Future<int?> _portionenFragen(String titel, int start) => showDialog<int>(
    context: context,
    builder: (context) => _PortionenDialog(titel: titel, start: start),
  );

  Future<void> _rezeptVerknuepfen() async {
    final r = await Navigator.of(context).push<AuswahlRezept>(
      MaterialPageRoute(
        builder: (_) => _AuswahlScreen<AuswahlRezept>(
          titel: 'Rezept wählen',
          laden: () => _dienst.verfuegbareRezepte(_id),
          name: (r) => r.name ?? 'Rezept',
          zusatz: (r) => r.kategorie,
        ),
      ),
    );
    if (r == null || !mounted) return;
    final n = await _portionenFragen(r.name ?? 'Rezept', 20);
    if (n != null) {
      await _ausfuehren(() => _dienst.rezeptVerknuepfen(_id, r.id, n), '${r.name} verknüpft');
    }
  }

  Future<void> _portionen(VerknuepftesRezept r) async {
    final id = r.rezeptId;
    if (id == null) return;
    final n = await _portionenFragen(r.name ?? 'Rezept', r.portionen?.round() ?? 20);
    if (n != null) {
      await _ausfuehren(() => _dienst.portionenAendern(_id, id, n), 'Portionen geändert');
    }
  }

  Future<void> _loesen(VerknuepftesRezept r) async {
    final id = r.rezeptId;
    if (id == null) return;
    final ok = await nachfragen(
      context,
      titel: 'Rezept lösen?',
      text: '${r.name ?? 'Das Rezept'} wird nicht mehr für diesen Anlass eingeplant.',
      ja: 'Lösen',
    );
    if (ok) await _ausfuehren(() => _dienst.rezeptLoesen(_id, id), 'Rezept gelöst');
  }

  Future<void> _materialErfassen() async {
    final m = await Navigator.of(context).push<AuswahlMaterial>(
      MaterialPageRoute(
        builder: (_) => _AuswahlScreen<AuswahlMaterial>(
          titel: 'Material wählen',
          laden: () => _dienst.verfuegbaresMaterial(_id),
          name: (m) => m.name ?? 'Material',
          zusatz: (m) => [?m.einheit, ?m.kategorie].join(' · '),
        ),
      ),
    );
    if (m == null || !mounted) return;
    final menge = await showDialog<double>(
      context: context,
      builder: (context) => _MengeDialog(titel: m.name ?? 'Material', einheit: m.einheit),
    );
    if (menge != null) {
      await _ausfuehren(() => _dienst.materialErfassen(_id, m.id, menge), '${m.name} erfasst');
    }
  }

  Future<void> _materialEntfernen(EinkaufsPosten p) async {
    final id = p.materialId;
    if (id == null) return;
    final ok = await nachfragen(
      context,
      titel: 'Material entfernen?',
      text: p.name ?? '',
      ja: 'Entfernen',
    );
    if (ok) await _ausfuehren(() => _dienst.materialEntfernen(_id, id), 'Material entfernt');
  }

  List<Widget> _einkauf(BuildContext context, _MaterialDaten d) {
    final t = Theme.of(context);
    final klein = t.textTheme.bodySmall?.copyWith(color: t.colorScheme.outline);
    final offen = d.liste.zumZurueckbuchen;
    return [
      const Abschnitt('Einkauf'),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: FilledButton.icon(
          key: const Key('zurueckbuchen'),
          onPressed: offen == 0 ? null : () => _zurueckbuchen(offen),
          icon: const Icon(Icons.move_to_inbox_outlined),
          label: Text(
            offen == 0
                ? 'Eingekauft → ins Lager zurückbuchen'
                : 'Eingekauft → ins Lager zurückbuchen ($offen)',
          ),
        ),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
        child: Text(
          offen == 0
              ? 'Gekauftes in der Einkaufsliste abhaken, dann hier ins Lager buchen.'
              : 'Bucht die abgehakten Positionen dem Lagerbestand gut.',
          style: klein,
        ),
      ),
      const Abschnitt('Belege'),
      if (d.belege.isEmpty) const ListTile(title: Text('Noch keine Belege.')),
      for (final b in d.belege)
        ListTile(
          key: Key('beleg-${b.id}'),
          leading: const Icon(Icons.receipt_long_outlined),
          title: Text(
            [
              b.datumText ?? 'Beleg',
              if (b.betrag != null) 'CHF ${b.betrag!.toStringAsFixed(2)}',
            ].join(' · '),
          ),
          subtitle: switch ([?b.notiz, ?(b.bezahltVon ?? b.hochgeladenVon)].join(' · ')) {
            '' => null,
            final z => Text(z, maxLines: 1, overflow: TextOverflow.ellipsis),
          },
          onTap: () => _belegZeigen(b),
          trailing: IconButton(
            onPressed: () => _belegLoeschen(b),
            icon: const Icon(Icons.delete_outline),
            tooltip: 'Beleg löschen',
          ),
        ),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: Wrap(
          spacing: 8,
          children: [
            OutlinedButton.icon(
              key: const Key('beleg-kamera'),
              onPressed: () => _belegAufnehmen(kamera: true),
              icon: const Icon(Icons.photo_camera_outlined),
              label: const Text('Beleg fotografieren'),
            ),
            OutlinedButton.icon(
              key: const Key('beleg-galerie'),
              onPressed: () => _belegAufnehmen(kamera: false),
              icon: const Icon(Icons.photo_library_outlined),
              label: const Text('Aus Galerie'),
            ),
          ],
        ),
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final klein = t.textTheme.bodySmall?.copyWith(color: t.colorScheme.outline);
    return Scaffold(
      resizeToAvoidBottomInset: false,
      body: LadeAnsicht<_MaterialDaten>(
        key: _lader,
        laden: _laden,
        bauen: (context, d, _) => ListView(
          key: const Key('material-liste'),
          physics: const AlwaysScrollableScrollPhysics(),
          padding: mitSystemleiste(context, const EdgeInsets.fromLTRB(4, 0, 4, 24)),
          children: [
            const Abschnitt('Rezepte'),
            if (d.rezepte.isEmpty) const ListTile(title: Text('Keine Rezepte verknüpft.')),
            for (final r in d.rezepte)
              ListTile(
                title: Text(r.name ?? 'Rezept'),
                subtitle: Text(
                  [
                    if (r.portionen != null) '${mengeText(r.portionen)} Portionen',
                    if (r.ausLagerMoeglich != null)
                      'aus Lager möglich: ${mengeText(r.ausLagerMoeglich)}',
                    ?r.kategorie,
                  ].join(' · '),
                ),
                onTap: () => _portionen(r),
                trailing: IconButton(
                  onPressed: () => _loesen(r),
                  icon: const Icon(Icons.link_off),
                  tooltip: 'Verknüpfung lösen',
                ),
              ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Align(
                alignment: Alignment.centerLeft,
                child: OutlinedButton.icon(
                  onPressed: _rezeptVerknuepfen,
                  icon: const Icon(Icons.add),
                  label: const Text('Rezept verknüpfen'),
                ),
              ),
            ),
            const Abschnitt('Material von Hand'),
            if (d.liste.vonHand.isEmpty)
              const ListTile(title: Text('Kein Material von Hand erfasst.')),
            for (final p in d.liste.vonHand)
              ListTile(
                title: Text(p.name ?? 'Material'),
                subtitle: Text([mengeText(p.vonHand), ?p.einheit].join(' ')),
                trailing: IconButton(
                  onPressed: () => _materialEntfernen(p),
                  icon: const Icon(Icons.delete_outline),
                  tooltip: 'Entfernen',
                ),
              ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Align(
                alignment: Alignment.centerLeft,
                child: OutlinedButton.icon(
                  onPressed: _materialErfassen,
                  icon: const Icon(Icons.add),
                  label: const Text('Material erfassen'),
                ),
              ),
            ),
            if (d.liste.posten.isNotEmpty) ...[
              Abschnitt(
                d.liste.zuKaufen == null
                    ? 'Einkaufsliste'
                    : 'Einkaufsliste · ${d.liste.zuKaufen} zu kaufen',
              ),
              for (final p in d.liste.posten)
                ListTile(
                  key: Key('posten-${p.materialId}'),
                  leading: widget.einkauf
                      ? Checkbox(
                          value: p.gekauft,
                          onChanged: p.eingebucht || p.materialId == null
                              ? null
                              : (v) => _abhaken(p, v ?? false),
                        )
                      : null,
                  title: Text(p.name ?? 'Posten'),
                  subtitle: Text(
                    [
                      if (p.bedarf != null) 'Bedarf ${mengeText(p.bedarf)}',
                      if (p.lager != null) 'Lager ${mengeText(p.lager)}',
                      ?p.lieferant,
                      if (p.gekauft)
                        p.istMenge == null
                            ? 'gekauft'
                            : 'gekauft ${[mengeText(p.istMenge), ?p.einheit].join(' ')}',
                    ].join(' · '),
                    style: klein,
                  ),
                  trailing: p.eingebucht
                      ? const HinweisChip('im Lager', art: HinweisArt.gut)
                      : (p.zuKaufen ?? 0) > 0
                      ? HinweisChip(
                          [mengeText(p.zuKaufen), ?p.einheit].join(' '),
                          art: p.gekauft ? HinweisArt.neutral : HinweisArt.warnung,
                        )
                      : const Icon(Icons.check, color: Colors.green),
                ),
              if (d.liste.geschaetzteKosten != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  child: Text(
                    'Geschätzte Kosten: CHF ${d.liste.geschaetzteKosten!.toStringAsFixed(2)}',
                    style: t.textTheme.bodyMedium,
                  ),
                ),
            ],
            if (widget.einkauf) ..._einkauf(context, d),
          ],
        ),
      ),
    );
  }
}

/// Liste mit Suche zum Auswaehlen (Rezept, Material).
class _AuswahlScreen<T> extends StatefulWidget {
  const _AuswahlScreen({
    required this.titel,
    required this.laden,
    required this.name,
    required this.zusatz,
  });

  final String titel;
  final Future<List<T>> Function() laden;
  final String Function(T) name;
  final String? Function(T) zusatz;

  @override
  State<_AuswahlScreen<T>> createState() => _AuswahlScreenState<T>();
}

class _AuswahlScreenState<T> extends State<_AuswahlScreen<T>> {
  String _suche = '';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.titel)),
      body: LadeAnsicht<List<T>>(
        laden: widget.laden,
        istLeer: (l) => l.isEmpty,
        leer: 'Im Inventar ist nichts erfasst.',
        bauen: (context, alle, _) {
          final s = _suche.trim().toLowerCase();
          final treffer = [
            for (final e in alle)
              if (s.isEmpty || widget.name(e).toLowerCase().contains(s)) e,
          ];
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            children: [
              Padding(
                padding: const EdgeInsets.all(12),
                child: TextField(
                  decoration: const InputDecoration(
                    labelText: 'Suchen',
                    prefixIcon: Icon(Icons.search),
                  ),
                  onChanged: (t) => setState(() => _suche = t),
                ),
              ),
              for (final e in treffer.take(60))
                ListTile(
                  title: Text(widget.name(e)),
                  subtitle: switch (widget.zusatz(e)) {
                    final z? when z.isNotEmpty => Text(z),
                    _ => null,
                  },
                  onTap: () => Navigator.of(context).pop(e),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _PortionenDialog extends StatefulWidget {
  const _PortionenDialog({required this.titel, required this.start});

  final String titel;
  final int start;

  @override
  State<_PortionenDialog> createState() => _PortionenDialogState();
}

class _PortionenDialogState extends State<_PortionenDialog> {
  late int _n = widget.start.clamp(1, 1000);

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.titel),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ZahlWaehler(
            titel: 'Portionen',
            wert: _n,
            max: 1000,
            aendern: (n) => setState(() => _n = n),
          ),
          Wrap(
            spacing: 6,
            children: [
              for (final d in const [-10, 10, 50])
                ActionChip(
                  label: Text(d > 0 ? '+$d' : '$d'),
                  onPressed: () => setState(() => _n = (_n + d).clamp(1, 1000)),
                ),
            ],
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Abbrechen')),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(_n),
          child: const Text('Übernehmen'),
        ),
      ],
    );
  }
}

class _MengeDialog extends StatefulWidget {
  const _MengeDialog({
    required this.titel,
    this.einheit,
    this.start = 1,
    this.beschriftung = 'Menge',
    this.knopf = 'Erfassen',
  });

  final String titel;
  final String? einheit;
  final double start;
  final String beschriftung;
  final String knopf;

  @override
  State<_MengeDialog> createState() => _MengeDialogState();
}

class _MengeDialogState extends State<_MengeDialog> {
  late final _feld = TextEditingController(text: mengeText(widget.start));

  @override
  void dispose() {
    _feld.dispose();
    super.dispose();
  }

  /// Komma wie Punkt — je nach Tastatur liegt das eine oder das andere.
  double? get _menge {
    final v = double.tryParse(_feld.text.trim().replaceAll(',', '.'));
    return v != null && v > 0 ? v : null;
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.titel),
      content: TextField(
        key: const Key('material-menge'),
        controller: _feld,
        autofocus: true,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        decoration: InputDecoration(labelText: widget.beschriftung, suffixText: widget.einheit),
        onChanged: (_) => setState(() {}),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Abbrechen')),
        FilledButton(
          onPressed: _menge == null ? null : () => Navigator.of(context).pop(_menge),
          child: Text(widget.knopf),
        ),
      ],
    );
  }
}

/// Ein Beleg gross (zoombar), mit Teilen (z.B. an den Kassier).
class _BelegScreen extends StatelessWidget {
  const _BelegScreen({required this.verwaltung, required this.anlassId, required this.beleg});

  final AnlassVerwaltung verwaltung;
  final String anlassId;
  final Beleg beleg;

  @override
  Widget build(BuildContext context) {
    final titel = ['Beleg', ?beleg.datumText].join(' ');
    return Scaffold(
      appBar: AppBar(
        title: Text(titel),
        actions: [
          Builder(
            builder: (knopf) => IconButton(
              onPressed: () async {
                final ursprung = stelleVon(knopf);
                try {
                  final bytes = await verwaltung.zugang.belegBild(anlassId, beleg.id);
                  await verwaltung.umgebung.dateiTeilen(
                    bytes,
                    'beleg-${beleg.id}.jpg',
                    'image/jpeg',
                    ursprung: ursprung,
                  );
                } on Object catch (e) {
                  if (knopf.mounted) meldung(knopf, fehlerText(e));
                }
              },
              icon: const Icon(Icons.share_outlined),
              tooltip: 'Teilen',
            ),
          ),
        ],
      ),
      body: LadeAnsicht<Uint8List>(
        laden: () => verwaltung.zugang.belegBild(anlassId, beleg.id),
        bauen: (context, bytes, _) => LayoutBuilder(
          builder: (context, b) => SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            child: SizedBox(
              width: b.maxWidth,
              height: b.maxHeight,
              child: InteractiveViewer(
                maxScale: 5,
                child: Image.memory(
                  bytes,
                  fit: BoxFit.contain,
                  errorBuilder: (_, _, _) =>
                      const Center(child: Text('Das Bild lässt sich nicht anzeigen.')),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
