// Neuer Artikel und unbekannte Codes.
//
// Ohne EAN vergibt die Inventar-API einen eigenen Code (FWV000123), den die
// App vorher anzeigt (`barcode/next`). Ein gescannter, unbekannter Code wird
// entweder zum neuen Artikel (Name aus Open Food Facts/OpenGTINDB
// vorbelegt) oder einem bestehenden Artikel zugeordnet — wie in der
// Inventar-PWA, damit keine Doppel entstehen.

import 'package:fwv_anlass/fwv_anlass.dart'
    show InfoZeile, LadeAnsicht, UntenLeiste, fehlerText, meldung, mitSystemleiste;
import 'package:material_ui/material_ui.dart';

import '../modelle.dart';
import '../zugang.dart';
import 'artikel_screen.dart';

typedef _Auswahl = ({List<Kategorie> kategorien, List<Lagerort> lagerorte, String? naechsterCode});

class ArtikelAnlegenScreen extends StatefulWidget {
  const ArtikelAnlegenScreen({super.key, required this.lager, this.ean, this.vorschlag});

  final Lager lager;

  /// Gescannter Code (EAN), vorbelegt.
  final String? ean;
  final ProduktVorschlag? vorschlag;

  @override
  State<ArtikelAnlegenScreen> createState() => _ArtikelAnlegenScreenState();
}

class _ArtikelAnlegenScreenState extends State<ArtikelAnlegenScreen> {
  final _form = GlobalKey<FormState>();
  late final _name = TextEditingController(
    text: [?widget.vorschlag?.marke, ?widget.vorschlag?.name].join(' ').trim(),
  );
  late final _beschreibung = TextEditingController(text: widget.vorschlag?.beschreibung ?? '');
  late final _ean = TextEditingController(text: widget.ean ?? '');
  final _einheit = TextEditingController(text: 'Stück');
  final _bestand = TextEditingController(text: '0');
  final _minimum = TextEditingController(text: '0');
  int? _kategorie;
  int? _lagerort;
  bool _laeuft = false;

  LagerZugang get _zugang => widget.lager.zugang;

  @override
  void dispose() {
    for (final c in [_name, _beschreibung, _ean, _einheit, _bestand, _minimum]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<_Auswahl> _laden() async {
    final k = _zugang.kategorien();
    final l = _zugang.lagerorte();
    final n = _zugang.naechsterCode();
    return (kategorien: await k, lagerorte: await l, naechsterCode: await n);
  }

  String? _ganzeZahl(String? t) {
    final n = int.tryParse((t ?? '').trim());
    return n == null || n < 0 ? 'Bitte eine ganze Zahl (0 oder mehr)' : null;
  }

  Future<void> _anlegen() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() => _laeuft = true);
    try {
      final a = await _zugang.anlegen(
        NeuerArtikel(
          name: _name.text,
          beschreibung: _beschreibung.text,
          kategorieId: _kategorie,
          lagerortId: _lagerort,
          ean: _ean.text,
          einheit: _einheit.text,
          bestand: int.parse(_bestand.text.trim()),
          mindestbestand: int.parse(_minimum.text.trim()),
        ),
      );
      if (!mounted) return;
      meldung(context, 'Angelegt${a.code == null ? '' : ' — Code ${a.code}'}');
      final navigator = Navigator.of(context);
      // Den neuen Artikel zeigen; zurueck geht es zur Liste (die neu laedt).
      await navigator.push<bool>(
        MaterialPageRoute(
          builder: (_) => ArtikelScreen(lager: widget.lager, artikelId: a.id),
        ),
      );
      if (mounted) navigator.pop(true);
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _laeuft = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Artikel anlegen')),
      body: LadeAnsicht<_Auswahl>(
        laden: _laden,
        bauen: (context, d, _) => Form(
          key: _form,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: mitSystemleiste(context, const EdgeInsets.fromLTRB(16, 12, 16, 24)),
            children: [
              TextFormField(
                key: const Key('anlegen-name'),
                controller: _name,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(labelText: 'Name *'),
                validator: (t) => (t ?? '').trim().isEmpty ? 'Bitte einen Namen angeben' : null,
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<int?>(
                key: const Key('anlegen-kategorie'),
                initialValue: _kategorie,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Kategorie'),
                items: [
                  const DropdownMenuItem<int?>(value: null, child: Text('—')),
                  for (final k in d.kategorien)
                    DropdownMenuItem<int?>(
                      value: k.id,
                      child: Text(k.name, overflow: TextOverflow.ellipsis),
                    ),
                ],
                onChanged: (v) => setState(() => _kategorie = v),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<int?>(
                key: const Key('anlegen-lagerort'),
                initialValue: _lagerort,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Lagerort'),
                items: [
                  const DropdownMenuItem<int?>(value: null, child: Text('—')),
                  for (final l in d.lagerorte)
                    DropdownMenuItem<int?>(
                      value: l.id,
                      child: Text(l.name, overflow: TextOverflow.ellipsis),
                    ),
                ],
                onChanged: (v) => setState(() => _lagerort = v),
              ),
              const SizedBox(height: 12),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: TextFormField(
                      key: const Key('anlegen-bestand'),
                      controller: _bestand,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: 'Anfangsbestand'),
                      validator: _ganzeZahl,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(
                      key: const Key('anlegen-minimum'),
                      controller: _minimum,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: 'Mindestbestand'),
                      validator: _ganzeZahl,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _einheit,
                decoration: const InputDecoration(
                  labelText: 'Einheit',
                  hintText: 'Stück, Flasche, kg …',
                ),
              ),
              const SizedBox(height: 12),
              TextFormField(
                key: const Key('anlegen-ean'),
                controller: _ean,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: 'EAN (Barcode des Herstellers)',
                  suffixIcon: IconButton(
                    onPressed: () async {
                      final gelesen = await widget.lager.umgebung.scannen(context);
                      if (gelesen != null) setState(() => _ean.text = codeAusScan(gelesen));
                    },
                    icon: const Icon(Icons.qr_code_scanner),
                    tooltip: 'EAN scannen',
                  ),
                ),
                onChanged: (_) => setState(() {}),
              ),
              if (_ean.text.trim().isEmpty)
                InfoZeile(
                  symbol: Icons.qr_code_2,
                  text: d.naechsterCode == null
                      ? 'Ohne EAN bekommt der Artikel einen eigenen Code.'
                      : 'Ohne EAN bekommt der Artikel den Code ${d.naechsterCode}.',
                ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _beschreibung,
                minLines: 1,
                maxLines: 4,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(labelText: 'Beschreibung'),
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: UntenLeiste(
        kinder: [
          FilledButton.icon(
            key: const Key('anlegen-ok'),
            onPressed: _laeuft ? null : _anlegen,
            icon: const Icon(Icons.check),
            label: const Text('Anlegen'),
          ),
        ],
      ),
    );
  }
}

/// Gescannter Code ist nicht im Lager: neu anlegen oder zuordnen.
/// Gibt true zurueck, wenn sich etwas geaendert hat.
class UnbekannterCodeScreen extends StatelessWidget {
  const UnbekannterCodeScreen({super.key, required this.lager, required this.treffer});

  final Lager lager;
  final Unbekannt treffer;

  Future<void> _anlegen(BuildContext context) async {
    final navigator = Navigator.of(context);
    final neu = await navigator.push<bool>(
      MaterialPageRoute(
        builder: (_) =>
            ArtikelAnlegenScreen(lager: lager, ean: treffer.code, vorschlag: treffer.vorschlag),
      ),
    );
    if (neu ?? false) navigator.pop(true);
  }

  Future<void> _zuordnen(BuildContext context) async {
    final navigator = Navigator.of(context);
    final ziel = await navigator.push<Artikel>(
      MaterialPageRoute(builder: (_) => _ArtikelWaehlen(lager: lager)),
    );
    if (ziel == null || !context.mounted) return;
    try {
      final a = await lager.zugang.codeZuordnen(ziel.id, treffer.code);
      if (!context.mounted) return;
      meldung(context, '${treffer.code} gehört jetzt zu ${a.name}');
      await navigator.push<bool>(
        MaterialPageRoute(
          builder: (_) => ArtikelScreen(lager: lager, artikelId: a.id),
        ),
      );
      navigator.pop(true);
    } on Object catch (e) {
      if (context.mounted) meldung(context, fehlerText(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final v = treffer.vorschlag;
    final t = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Unbekannter Code')),
      body: ListView(
        padding: mitSystemleiste(context, const EdgeInsets.all(16)),
        children: [
          Text(treffer.code, style: t.textTheme.headlineSmall),
          const SizedBox(height: 8),
          const Text('Dieser Code ist noch keinem Artikel im Lager zugeordnet.'),
          if (v?.name != null) ...[
            const SizedBox(height: 16),
            InfoZeile(
              symbol: Icons.travel_explore,
              titel: switch (treffer.quelle) {
                'openfoodfacts' => 'Gefunden bei Open Food Facts',
                'opengtindb' => 'Gefunden bei OpenGTINDB',
                _ => 'Gefunden',
              },
              text: [?v!.marke, v.name!].join(' · '),
            ),
          ] else if (treffer.geprueft.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text(
              'Auch nicht gefunden in: ${treffer.geprueft.join(', ')}',
              style: t.textTheme.bodySmall,
            ),
          ],
        ],
      ),
      bottomNavigationBar: UntenLeiste(
        kinder: [
          OutlinedButton(
            key: const Key('code-zuordnen'),
            onPressed: () => _zuordnen(context),
            child: const Text('Zuordnen'),
          ),
          FilledButton(
            key: const Key('code-anlegen'),
            onPressed: () => _anlegen(context),
            child: const Text('Neu anlegen'),
          ),
        ],
      ),
    );
  }
}

/// Artikel suchen und einen auswaehlen.
class _ArtikelWaehlen extends StatefulWidget {
  const _ArtikelWaehlen({required this.lager});

  final Lager lager;

  @override
  State<_ArtikelWaehlen> createState() => _ArtikelWaehlenState();
}

class _ArtikelWaehlenState extends State<_ArtikelWaehlen> {
  String _suche = '';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Zu welchem Artikel?')),
      body: LadeAnsicht<List<Artikel>>(
        laden: widget.lager.zugang.artikel,
        istLeer: (l) => l.isEmpty,
        leer: 'Im Lager ist nichts erfasst.',
        bauen: (context, alle, _) {
          final s = _suche.trim().toLowerCase();
          final treffer = [
            for (final a in alle)
              if (s.isEmpty || a.name.toLowerCase().contains(s)) a,
          ];
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            children: [
              Padding(
                padding: const EdgeInsets.all(12),
                child: TextField(
                  key: const Key('zuordnen-suche'),
                  decoration: const InputDecoration(
                    labelText: 'Suchen',
                    prefixIcon: Icon(Icons.search),
                  ),
                  onChanged: (t) => setState(() => _suche = t),
                ),
              ),
              for (final a in treffer.take(80))
                ListTile(
                  title: Text(a.name),
                  subtitle: Text([?a.kategorie, ?a.code].join(' · ')),
                  onTap: () => Navigator.of(context).pop(a),
                ),
            ],
          );
        },
      ),
    );
  }
}
