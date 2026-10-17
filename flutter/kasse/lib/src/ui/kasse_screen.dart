// Kassen-Bildschirm (Grundbetrieb Bar): Kopf mit Logo, Anlass, Ort
// (Schopf/Cloud) und laufender Uhr; Reiter je Kategorie mit Kacheln
// (Gruppen oeffnen ihre Varianten); Warenkorb unten mit Bar/TWINT/Karte.
import 'dart:async';

import 'package:flutter/material.dart';

import '../kacheln.dart';
import '../kasse_api.dart';
import 'anmeldung.dart' show knopfRot;
import 'zahlung.dart';

class KasseScreen extends StatefulWidget {
  const KasseScreen({super.key, required this.api, required this.abgemeldet});
  final KasseApi api;
  final VoidCallback abgemeldet;

  @override
  State<KasseScreen> createState() => _KasseScreenState();
}

class _KasseScreenState extends State<KasseScreen> {
  KasseApi get api => widget.api;
  List<Artikel> _artikel = [];
  List<String> _kategorien = [];
  String _kategorie = '';
  Anlass? _anlass;
  String? _twintQr;
  final List<Position> _korb = [];
  bool _laedt = true;
  bool _sendet = false;
  String? _fehler;
  DateTime _jetzt = DateTime.now();
  final List<Timer> _takte = [];
  StreamSubscription<bool>? _ortAbo;

  @override
  void initState() {
    super.initState();
    _takte.add(Timer.periodic(const Duration(seconds: 1), (_) => setState(() => _jetzt = DateTime.now())));
    _takte.add(Timer.periodic(const Duration(seconds: 20), (_) => api.ortPruefen()));
    _takte.add(Timer.periodic(const Duration(minutes: 1), (_) => _nebendaten()));
    _takte.add(Timer.periodic(const Duration(hours: 12), (_) => api.erneuern()));
    _ortAbo = api.ortGeaendert.stream.listen((_) => _laden());
    api.ortPruefen().then((_) => _laden());
    api.erneuern();
  }

  @override
  void dispose() {
    for (final t in _takte) {
      t.cancel();
    }
    _ortAbo?.cancel();
    super.dispose();
  }

  Future<void> _laden() async {
    setState(() => _laedt = true);
    try {
      final artikel = await api.artikel();
      final einst = await api.einstellungen();
      final kats = kategorienSortieren(artikel.map((a) => a.kategorie), einst['kategorien_reihenfolge']);
      setState(() {
        _artikel = artikel;
        _kategorien = kats;
        if (!kats.contains(_kategorie)) _kategorie = kats.isEmpty ? '' : kats.first;
        _fehler = null;
      });
      await _nebendaten();
    } on KasseFehler catch (e) {
      if (e.status == 401) return _abmelden();
      setState(() => _fehler = e.meldung);
    } finally {
      if (mounted) setState(() => _laedt = false);
    }
  }

  Future<void> _nebendaten() async {
    final a = await api.anlass();
    final q = await api.twintQrAdresse();
    if (!mounted) return;
    setState(() {
      _anlass = a;
      _twintQr = q;
    });
  }

  Future<void> _abmelden() async {
    await api.abmelden();
    widget.abgemeldet();
  }

  // ---- Warenkorb -----------------------------------------------------------
  void _hinzu(Artikel a) => setState(() {
        final da = _korb.where((p) => p.artikel.id == a.id && p.sonderPreis == null && p.notiz.isEmpty).firstOrNull;
        if (da != null) {
          da.menge++;
        } else {
          _korb.add(Position(a));
        }
      });

  double get _total => _korb.fold(0, (s, p) => s + p.summe);
  int get _stueck => _korb.fold(0, (s, p) => s + p.menge);

  Future<void> _gruppeOeffnen(Kachel k) async {
    final a = await showModalBottomSheet<Artikel>(
      context: context,
      builder: (_) => SafeArea(
        child: ListView(shrinkWrap: true, children: [
          Padding(padding: const EdgeInsets.all(16), child: Text(k.gruppe!, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold))),
          for (final v in k.varianten)
            ListTile(
              title: Text(nameTeilen(v.name)?.variante ?? v.anzeige, style: const TextStyle(fontSize: 18)),
              trailing: Text('CHF ${v.preis.toStringAsFixed(2)}', style: const TextStyle(fontSize: 16)),
              onTap: () => Navigator.pop(context, v),
            ),
        ]),
      ),
    );
    if (a != null) _hinzu(a);
  }

  // ---- Bezahlen ----------------------------------------------------------
  Future<void> _bezahlen(String art) async {
    if (_korb.isEmpty || _sendet) return;
    setState(() => _sendet = true);
    try {
      final b = await api.bestellen(List.of(_korb));
      if (!mounted) return;
      final korbVorher = List.of(_korb);
      setState(_korb.clear);
      if (b.druckfehler.isNotEmpty) _meldung('Bon nicht gedruckt: ${b.druckfehler.join(' · ')}', fehler: true);
      final zahlung = await zahlungAbfragen(context, bestellung: b.id, betrag: b.total, art: art, twintQr: _twintQr);
      if (zahlung == null) {
        _meldung('Bestellung ${bestellNr(b.id)} offen gelassen');
        return;
      }
      await api.bezahlt(b.id, zahlung);
      if (mounted) {
        await showDialog<void>(
          context: context,
          builder: (_) => AlertDialog(
            icon: const Icon(Icons.check_circle, color: Color(0xFF16A34A), size: 64),
            title: Text('Bestellung ${bestellNr(b.id)}'),
            content: Text('CHF ${b.total.toStringAsFixed(2)} · ${korbVorher.length} Positionen', textAlign: TextAlign.center),
            actions: [FilledButton(onPressed: () => Navigator.pop(context), child: const Text('OK'))],
          ),
        );
      }
    } on KasseFehler catch (e) {
      if (e.status == 401) return _abmelden();
      _meldung('Nicht gebucht: ${e.meldung} – Warenkorb bleibt.', fehler: true);
    } finally {
      if (mounted) setState(() => _sendet = false);
    }
  }

  void _meldung(String text, {bool fehler = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(text),
      backgroundColor: fehler ? knopfRot : null,
      duration: Duration(seconds: fehler ? 8 : 3),
    ));
  }

  // ---- Oberflaeche ---------------------------------------------------------
  @override
  Widget build(BuildContext context) {
    final breit = MediaQuery.sizeOf(context).width >= 900;
    final kacheln = kachelnBilden(_artikel.where((a) => a.kategorie == _kategorie).toList());
    return Scaffold(
      backgroundColor: const Color(0xFFF3F4F6),
      appBar: _kopf(),
      body: _laedt && _artikel.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : _fehler != null && _artikel.isEmpty
              ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_fehler!, textAlign: TextAlign.center)))
              : Row(children: [
                  Expanded(child: Column(children: [_kategorieLeiste(), Expanded(child: _raster(kacheln))])),
                  if (breit) SizedBox(width: 380, child: _korbAnsicht()),
                ]),
      bottomNavigationBar: breit ? null : _korbLeiste(),
    );
  }

  PreferredSizeWidget _kopf() => AppBar(
        backgroundColor: const Color(0xFFDC2626),
        foregroundColor: Colors.white,
        titleSpacing: 8,
        title: Row(children: [
          CircleAvatar(backgroundColor: Colors.white, radius: 18, child: Image.asset('assets/kasse-logo.png', height: 30)),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Kasse', style: TextStyle(fontWeight: FontWeight.bold)),
              if (_anlass != null) Text(_anlass!.titel, style: const TextStyle(fontSize: 12), overflow: TextOverflow.ellipsis),
            ]),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(color: api.lokal ? const Color(0xFF16A34A) : const Color(0xFF991B1B), borderRadius: BorderRadius.circular(12)),
            child: Text(api.lokal ? '📍 Schopf' : '☁️ Cloud', style: const TextStyle(fontSize: 12)),
          ),
          const SizedBox(width: 8),
          Text(
            '${_jetzt.hour.toString().padLeft(2, '0')}:${_jetzt.minute.toString().padLeft(2, '0')}:${_jetzt.second.toString().padLeft(2, '0')}',
            style: const TextStyle(fontWeight: FontWeight.bold, fontFeatures: [FontFeature.tabularFigures()]),
          ),
        ]),
        actions: [
          PopupMenuButton<String>(
            onSelected: (w) => w == 'neu' ? _laden() : _abmelden(),
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'neu', child: Text('Artikel neu laden')),
              PopupMenuItem(value: 'ab', child: Text('Abmelden')),
            ],
          ),
        ],
      );

  Widget _kategorieLeiste() => SizedBox(
        height: 56,
        child: ListView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          children: [
            for (final k in _kategorien)
              Padding(
                padding: const EdgeInsets.only(right: 6),
                child: ChoiceChip(
                  label: Text(k, style: const TextStyle(fontSize: 15)),
                  selected: k == _kategorie,
                  selectedColor: const Color(0xFFFECACA),
                  onSelected: (_) => setState(() => _kategorie = k),
                ),
              ),
          ],
        ),
      );

  Widget _raster(List<Kachel> kacheln) => GridView.builder(
        padding: const EdgeInsets.all(10),
        gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(maxCrossAxisExtent: 220, mainAxisExtent: 110, crossAxisSpacing: 10, mainAxisSpacing: 10),
        itemCount: kacheln.length,
        itemBuilder: (_, i) {
          final k = kacheln[i];
          final imKorb = k.istGruppe
              ? _korb.where((p) => k.varianten.any((v) => v.id == p.artikel.id)).fold(0, (s, p) => s + p.menge)
              : _korb.where((p) => p.artikel.id == k.artikel!.id).fold(0, (s, p) => s + p.menge);
          return Material(
            color: imKorb > 0 ? const Color(0xFFFEE2E2) : Colors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: const BorderSide(color: Color(0xFFDC2626), width: 1.5)),
            child: InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: () => k.istGruppe ? _gruppeOeffnen(k) : _hinzu(k.artikel!),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Expanded(child: Text(k.titel, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold))),
                    if (imKorb > 0)
                      CircleAvatar(radius: 13, backgroundColor: const Color(0xFFDC2626), child: Text('$imKorb', style: const TextStyle(color: Colors.white, fontSize: 13))),
                  ]),
                  const Spacer(),
                  Row(children: [
                    Text(k.preisText, style: const TextStyle(color: Color(0xFFB91C1C), fontWeight: FontWeight.bold, fontSize: 15)),
                    const Spacer(),
                    if (k.istGruppe) Text('${k.varianten.length} ▸', style: const TextStyle(color: Color(0xFFB91C1C))),
                  ]),
                ]),
              ),
            ),
          );
        },
      );

  Widget _zahlKnoepfe() => Row(children: [
        _zahlKnopf('Bar', const Color(0xFF16A34A), 'cash'),
        const SizedBox(width: 8),
        _zahlKnopf('TWINT', Colors.black, 'twint'),
        const SizedBox(width: 8),
        _zahlKnopf('Karte', const Color(0xFF2563EB), 'card'),
      ]);

  Widget _zahlKnopf(String text, Color farbe, String art) => Expanded(
        child: SizedBox(
          height: 56,
          child: FilledButton(
            style: FilledButton.styleFrom(backgroundColor: farbe, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
            onPressed: _korb.isEmpty || _sendet ? null : () => _bezahlen(art),
            child: Text(text, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          ),
        ),
      );

  /// Schmal (Handy): Leiste unten, Tipp oeffnet den Warenkorb.
  Widget _korbLeiste() => SafeArea(
        child: Container(
          color: Colors.white,
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            InkWell(
              onTap: _korb.isEmpty ? null : () => showModalBottomSheet<void>(context: context, isScrollControlled: true, builder: (_) => StatefulBuilder(builder: (c, s) => SizedBox(height: MediaQuery.sizeOf(c).height * 0.7, child: _korbAnsicht(neuZeichnen: () { s(() {}); setState(() {}); })))),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(children: [
                  const Icon(Icons.shopping_basket_outlined),
                  const SizedBox(width: 8),
                  Text(_korb.isEmpty ? 'Warenkorb leer' : '$_stueck Artikel ▴', style: const TextStyle(fontSize: 16)),
                  const Spacer(),
                  Text('CHF ${_total.toStringAsFixed(2)}', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Color(0xFF15803D))),
                ]),
              ),
            ),
            _zahlKnoepfe(),
          ]),
        ),
      );

  Widget _korbAnsicht({VoidCallback? neuZeichnen}) {
    void neu(VoidCallback f) {
      setState(f);
      neuZeichnen?.call();
    }

    return Container(
      color: Colors.white,
      child: Column(children: [
        const Padding(padding: EdgeInsets.all(14), child: Align(alignment: Alignment.centerLeft, child: Text('Bestellung', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)))),
        Expanded(
          child: _korb.isEmpty
              ? const Center(child: Text('Warenkorb ist leer', style: TextStyle(color: Colors.black45)))
              : ListView(children: [
                  for (final p in _korb)
                    ListTile(
                      title: Text(p.artikel.anzeige, style: const TextStyle(fontWeight: FontWeight.w600)),
                      subtitle: Text('CHF ${p.preis.toStringAsFixed(2)}${p.notiz.isEmpty ? '' : ' · ${p.notiz}'}'),
                      onLongPress: () async {
                        final n = await _notizFragen(p.notiz);
                        if (n != null) neu(() => p.notiz = n);
                      },
                      trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                        IconButton(onPressed: () => neu(() => p.menge > 1 ? p.menge-- : _korb.remove(p)), icon: const Icon(Icons.remove_circle_outline)),
                        Text('${p.menge}', style: const TextStyle(fontSize: 18)),
                        IconButton(onPressed: () => neu(() => p.menge++), icon: const Icon(Icons.add_circle_outline)),
                      ]),
                    ),
                ]),
        ),
        Padding(
          padding: const EdgeInsets.all(12),
          child: Column(children: [
            Row(children: [
              const Text('Total', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const Spacer(),
              Text('CHF ${_total.toStringAsFixed(2)}', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Color(0xFF15803D))),
            ]),
            const SizedBox(height: 10),
            if (neuZeichnen == null) _zahlKnoepfe(),
            if (_korb.isNotEmpty)
              TextButton(onPressed: () => neu(_korb.clear), child: const Text('Warenkorb leeren', style: TextStyle(color: knopfRot))),
          ]),
        ),
      ]),
    );
  }

  Future<String?> _notizFragen(String alt) {
    final c = TextEditingController(text: alt);
    return showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Notiz'),
        content: TextField(controller: c, autofocus: true, decoration: const InputDecoration(hintText: 'z.B. ohne Zwiebeln')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Abbrechen')),
          FilledButton(onPressed: () => Navigator.pop(context, c.text.trim()), child: const Text('OK')),
        ],
      ),
    );
  }
}
