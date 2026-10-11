// Rezepte und Material eines Anlasses. Das Events-Backend reicht an die
// Inventar-API durch; die Einkaufsliste rechnet die Inventar-API aus den
// verknuepften Rezepten und dem Material von Hand gegen den Lagerbestand.
// Die App zeigt die Werte nur an. Vorbild: members-ios EventMaterialsView,
// members-android EventMaterialsActivity.

import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../bausteine.dart';
import '../daten.dart';
import '../zugang.dart';

typedef _MaterialDaten = ({List<VerknuepftesRezept> rezepte, Einkaufsliste liste});

class MaterialAnsicht extends StatefulWidget {
  const MaterialAnsicht({super.key, required this.verwaltung, required this.anlass});

  final AnlassVerwaltung verwaltung;
  final Anlass anlass;

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
    return (rezepte: await r, liste: await l);
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
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(4, 0, 4, 24),
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
                  title: Text(p.name ?? 'Posten'),
                  subtitle: Text(
                    [
                      if (p.bedarf != null) 'Bedarf ${mengeText(p.bedarf)}',
                      if (p.lager != null) 'Lager ${mengeText(p.lager)}',
                      ?p.lieferant,
                    ].join(' · '),
                    style: klein,
                  ),
                  trailing: (p.zuKaufen ?? 0) > 0
                      ? HinweisChip(
                          [mengeText(p.zuKaufen), ?p.einheit].join(' '),
                          art: HinweisArt.warnung,
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
  const _MengeDialog({required this.titel, this.einheit});

  final String titel;
  final String? einheit;

  @override
  State<_MengeDialog> createState() => _MengeDialogState();
}

class _MengeDialogState extends State<_MengeDialog> {
  final _feld = TextEditingController(text: '1');

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
        decoration: InputDecoration(labelText: 'Menge', suffixText: widget.einheit),
        onChanged: (_) => setState(() {}),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Abbrechen')),
        FilledButton(
          onPressed: _menge == null ? null : () => Navigator.of(context).pop(_menge),
          child: const Text('Erfassen'),
        ),
      ],
    );
  }
}
