// Ein Artikel: Bestand (gesamt und je Lagerort/Kiste), Mindestbestand,
// Codes, letzte Buchungen. Unten immer sichtbar: Ausgang und Eingang mit
// Menge und optionaler Notiz. Vorbild: ItemDetail der Inventar-PWA.

import 'package:fwv_anlass/fwv_anlass.dart'
    show
        Abschnitt,
        HinweisArt,
        HinweisChip,
        InfoZeile,
        LadeAnsicht,
        LadeAnsichtState,
        UntenLeiste,
        fehlerText,
        meldung;
import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../modelle.dart';
import '../zugang.dart';

typedef _ArtikelDaten = ({Artikel artikel, List<Buchung> verlauf});

/// Oeffnet einen Artikel. Gibt true zurueck, wenn gebucht wurde (die Liste
/// darunter laedt dann neu).
Future<bool> artikelOeffnen(BuildContext context, Lager lager, int artikelId) async =>
    await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => ArtikelScreen(lager: lager, artikelId: artikelId),
      ),
    ) ??
    false;

/// Bestand mit Einheit; gelb, wenn nachzubestellen, rot, wenn leer.
class BestandChip extends StatelessWidget {
  const BestandChip({super.key, required this.artikel});

  final Artikel artikel;

  @override
  Widget build(BuildContext context) => HinweisChip(
    mengeMitEinheit(artikel.bestand, artikel.einheit),
    art: artikel.bestand <= 0
        ? HinweisArt.schlecht
        : artikel.nachbestellen
        ? HinweisArt.warnung
        : HinweisArt.neutral,
  );
}

class ArtikelScreen extends StatefulWidget {
  const ArtikelScreen({super.key, required this.lager, required this.artikelId});

  final Lager lager;
  final int artikelId;

  @override
  State<ArtikelScreen> createState() => _ArtikelScreenState();
}

class _ArtikelScreenState extends State<ArtikelScreen> {
  final _lader = GlobalKey<LadeAnsichtState<_ArtikelDaten>>();
  Artikel? _artikel;
  bool _gebucht = false;
  bool _laeuft = false;

  LagerZugang get _zugang => widget.lager.zugang;

  Future<_ArtikelDaten> _laden() async {
    final a = _zugang.artikelDetail(widget.artikelId);
    final v = _zugang.verlauf(widget.artikelId);
    final daten = (artikel: await a, verlauf: await v);
    if (mounted) setState(() => _artikel = daten.artikel);
    return daten;
  }

  Future<void> _buchen(BuchungsArt art) async {
    final a = _artikel;
    if (a == null) return;
    final eingabe = await showDialog<(int, String?)>(
      context: context,
      builder: (_) => BuchenDialog(art: art, artikel: a),
    );
    if (eingabe == null || !mounted) return;
    setState(() => _laeuft = true);
    try {
      final neu = await _zugang.buchen(a.id, art, eingabe.$1, notiz: eingabe.$2);
      _gebucht = true;
      if (!mounted) return;
      setState(() => _artikel = a.mitBestand(neu));
      meldung(context, '${art.text} gebucht — neuer Bestand: ${mengeMitEinheit(neu, a.einheit)}');
      await _lader.currentState?.neuLaden();
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _laeuft = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final a = _artikel;
    return PopScope<bool>(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).pop(_gebucht);
      },
      child: Scaffold(
        appBar: AppBar(title: Text(a?.name ?? 'Artikel')),
        body: LadeAnsicht<_ArtikelDaten>(
          key: _lader,
          laden: _laden,
          bauen: (context, d, _) => _inhalt(context, _artikel ?? d.artikel, d.verlauf),
        ),
        bottomNavigationBar: a == null
            ? null
            : UntenLeiste(
                kinder: [
                  OutlinedButton.icon(
                    key: const Key('ausgang'),
                    onPressed: _laeuft || a.bestand <= 0
                        ? null
                        : () => _buchen(BuchungsArt.ausgang),
                    icon: const Icon(Icons.remove),
                    label: const Text('Ausgang'),
                  ),
                  FilledButton.icon(
                    key: const Key('eingang'),
                    onPressed: _laeuft ? null : () => _buchen(BuchungsArt.eingang),
                    icon: const Icon(Icons.add),
                    label: const Text('Eingang'),
                  ),
                ],
              ),
      ),
    );
  }

  Widget _inhalt(BuildContext context, Artikel a, List<Buchung> verlauf) {
    final t = Theme.of(context);
    final klein = t.textTheme.bodySmall?.copyWith(color: t.colorScheme.outline);
    final bild = _zugang.bildAdresse(a.bild);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (bild != null) ...[
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Image.network(
                  bild.toString(),
                  headers: _zugang.bildKopfzeilen(bild),
                  width: 72,
                  height: 72,
                  fit: BoxFit.cover,
                  errorBuilder: (_, _, _) => const SizedBox.shrink(),
                ),
              ),
              const SizedBox(width: 12),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Bestand', style: klein),
                  Text(
                    mengeMitEinheit(a.bestand, a.einheit),
                    key: const Key('bestand'),
                    style: t.textTheme.headlineMedium,
                  ),
                  Text(
                    'Mindestbestand ${mengeMitEinheit(a.mindestbestand, a.einheit)}',
                    style: klein,
                  ),
                ],
              ),
            ),
            if (a.nachbestellen)
              HinweisChip(
                a.bestand <= 0 ? 'Leer' : 'Nachbestellen',
                art: a.bestand <= 0 ? HinweisArt.schlecht : HinweisArt.warnung,
              ),
          ],
        ),
        const SizedBox(height: 8),
        if (a.kategorie != null)
          InfoZeile(symbol: Icons.category_outlined, titel: 'Kategorie', text: a.kategorie!),
        if (a.lagerort != null)
          InfoZeile(symbol: Icons.warehouse_outlined, titel: 'Hauptlagerort', text: a.lagerort!),
        if (a.eigenerCode != null)
          InfoZeile(symbol: Icons.qr_code_2, titel: 'Eigener Code', text: a.eigenerCode!),
        if (a.ean != null) InfoZeile(symbol: Icons.barcode_reader, titel: 'EAN', text: a.ean!),
        if (a.lieferant != null)
          InfoZeile(symbol: Icons.local_shipping_outlined, titel: 'Lieferant', text: a.lieferant!),
        if (a.einkaufspreis != null)
          InfoZeile(
            symbol: Icons.payments_outlined,
            titel: 'Einkaufspreis',
            text: 'CHF ${a.einkaufspreis!.toStringAsFixed(2)}',
          ),
        if (a.beschreibung != null)
          InfoZeile(symbol: Icons.notes, titel: 'Beschreibung', text: a.beschreibung!),
        if (a.notizen != null)
          InfoZeile(symbol: Icons.sticky_note_2_outlined, titel: 'Notizen', text: a.notizen!),
        const Abschnitt('Bestand je Lagerort'),
        if (a.orte.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text('Keiner Kiste zugeordnet.', style: klein),
          ),
        for (final o in a.orte)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.inventory_2_outlined),
            title: Text(o.name ?? 'Lagerort'),
            subtitle: o.notiz == null ? null : Text(o.notiz!),
            trailing: Text(mengeMitEinheit(o.menge, a.einheit), style: t.textTheme.titleSmall),
          ),
        const Abschnitt('Letzte Buchungen'),
        if (verlauf.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text('Noch keine Buchungen.', style: klein),
          ),
        for (final b in verlauf)
          ListTile(
            contentPadding: EdgeInsets.zero,
            dense: true,
            title: Text(b.grund ?? b.art?.text ?? 'Buchung'),
            subtitle: Text([if (b.zeitpunkt != null) _zeit(b.zeitpunkt!), ?b.von].join(' · ')),
            trailing: Text(b.mengeText, style: t.textTheme.titleSmall),
          ),
      ],
    );
  }
}

String _zeit(DateTime z) =>
    '${schweizerDatum(z)} ${z.hour.toString().padLeft(2, '0')}:${z.minute.toString().padLeft(2, '0')}';

/// Menge (ganze Zahl > 0, mit Minus/Plus) und optionale Notiz. Gibt
/// (Menge, Notiz) zurueck.
class BuchenDialog extends StatefulWidget {
  const BuchenDialog({super.key, required this.art, required this.artikel});

  final BuchungsArt art;
  final Artikel artikel;

  @override
  State<BuchenDialog> createState() => _BuchenDialogState();
}

class _BuchenDialogState extends State<BuchenDialog> {
  final _menge = TextEditingController(text: '1');
  final _notiz = TextEditingController();

  @override
  void dispose() {
    _menge.dispose();
    _notiz.dispose();
    super.dispose();
  }

  int? get _wert {
    final n = int.tryParse(_menge.text.trim());
    return n != null && n > 0 ? n : null;
  }

  void _aendern(int um) {
    final neu = ((_wert ?? 0) + um).clamp(1, 100000);
    setState(() => _menge.text = '$neu');
  }

  @override
  Widget build(BuildContext context) {
    final ein = widget.art == BuchungsArt.eingang;
    return AlertDialog(
      title: Text('${widget.art.text}: ${widget.artikel.name}'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                IconButton.outlined(
                  onPressed: (_wert ?? 0) > 1 ? () => _aendern(-1) : null,
                  icon: const Icon(Icons.remove),
                  tooltip: 'Weniger',
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    key: const Key('buchen-menge'),
                    controller: _menge,
                    autofocus: true,
                    textAlign: TextAlign.center,
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(
                      labelText: 'Menge',
                      suffixText: widget.artikel.einheit,
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.outlined(
                  onPressed: () => _aendern(1),
                  icon: const Icon(Icons.add),
                  tooltip: 'Mehr',
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('buchen-notiz'),
              controller: _notiz,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(
                labelText: 'Notiz (optional)',
                hintText: ein ? 'z.B. Lieferung Volg' : 'z.B. Chilbi Bar',
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Bestand jetzt: ${mengeMitEinheit(widget.artikel.bestand, widget.artikel.einheit)}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Abbrechen')),
        FilledButton(
          key: const Key('buchen-ok'),
          onPressed: _wert == null
              ? null
              : () =>
                    Navigator.of(context)
                        .pop((_wert!, _notiz.text.trim().isEmpty ? null : _notiz.text.trim())),
          child: Text(ein ? 'Einbuchen' : 'Ausbuchen'),
        ),
      ],
    );
  }
}
