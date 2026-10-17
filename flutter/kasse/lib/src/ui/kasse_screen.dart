// Kassen-Bildschirm (Grundbetrieb Bar): Kopf mit Logo, Anlass, Ort
// (Schopf/Cloud) und laufender Uhr; Reiter je Kategorie mit Kacheln
// (Gruppen oeffnen ihre Varianten); Warenkorb unten mit Bar/TWINT/Karte.
import 'dart:async';

import 'package:flutter/material.dart';

import '../kacheln.dart';
import '../kasse_api.dart';
import 'anmeldung.dart' show knopfRot;
import 'tische_screen.dart';
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
  StreamSubscription<int>? _pufferAbo;
  int _puffer = 0;
  // Nicht gedruckte Bons: bleibt stehen, bis jemand "Gesehen" tippt -
  // eine kurze Meldung ist im Betrieb weg, bevor sie jemand liest.
  String? _druckWarnung;
  // Tische (nur bei Service oder solange noch Tische offen sind)
  bool _tischModus = false;
  int? _tischNr;
  int _offeneTische = 0;
  bool get _tischeSichtbar => (_anlass?.hatService ?? false) || _offeneTische > 0;

  @override
  void initState() {
    super.initState();
    _takte.add(Timer.periodic(const Duration(seconds: 1), (_) => setState(() => _jetzt = DateTime.now())));
    _takte.add(Timer.periodic(const Duration(seconds: 20), (_) => api.ortPruefen()));
    _takte.add(Timer.periodic(const Duration(minutes: 1), (_) => _nebendaten()));
    _takte.add(Timer.periodic(const Duration(hours: 12), (_) => api.erneuern()));
    _ortAbo = api.ortGeaendert.stream.listen((_) {
      _laden();
      api.pufferSenden();
    });
    _puffer = api.pufferOffen;
    _pufferAbo = api.pufferGeaendert.stream.listen((n) => setState(() => _puffer = n));
    _takte.add(Timer.periodic(const Duration(seconds: 15), (_) => api.pufferSenden()));
    api.pufferSenden();
    api.ortPruefen().then((_) => _laden());
    api.erneuern();
  }

  @override
  void dispose() {
    for (final t in _takte) {
      t.cancel();
    }
    _ortAbo?.cancel();
    _pufferAbo?.cancel();
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
    var tische = _offeneTische;
    try {
      tische = (await api.offeneTische()).map((b) => b.tisch).toSet().length;
    } catch (_) {}
    if (!mounted) return;
    setState(() {
      _anlass = a;
      _twintQr = q;
      _offeneTische = tische;
      if (!(a?.hatService ?? false)) _tischModus = false;
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
      final b = await api.bestellenOderPuffern(List.of(_korb));
      if (!mounted) return;
      final korbVorher = List.of(_korb);
      setState(_korb.clear);
      if (b.druckfehler.isNotEmpty) setState(() => _druckWarnung = 'Bestellung ${bestellNr(b.id)}: ${b.druckfehler.join(' · ')}');
      final zahlung = await zahlungAbfragen(context, bestellung: b.id, betrag: b.total, art: art, twintQr: _twintQr);
      if (zahlung == null) {
        _meldung('Bestellung ${bestellNr(b.id)} offen gelassen');
        return;
      }
      if (!await api.bezahltOderPuffern(b.id, zahlung)) {
        _meldung('Zahlung vom Server abgelehnt - bitte in der Web-Kasse prüfen.', fehler: true);
        return;
      }
      if (mounted) {
        await showDialog<void>(
          context: context,
          builder: (_) => AlertDialog(
            icon: const Icon(Icons.check_circle, color: Color(0xFF16A34A), size: 64),
            title: Text('Bestellung ${bestellNr(b.id)}'),
            content: Text('CHF ${b.total.toStringAsFixed(2)} · ${korbVorher.length} ${korbVorher.length == 1 ? 'Position' : 'Positionen'}', textAlign: TextAlign.center),
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

  Future<void> _anTischSenden() async {
    if (_korb.isEmpty || _sendet) return;
    final nr = _tischNr;
    if (nr == null || nr <= 0) {
      await _tischWaehlen();
      if (_tischNr == null) return;
      return _anTischSenden();
    }
    setState(() => _sendet = true);
    try {
      final b = await api.bestellen(List.of(_korb), tisch: nr);
      setState(() {
        _korb.clear();
        _tischNr = null;
      });
      _meldung('An Tisch $nr gesendet (${bestellNr(b.id)})');
      if (b.druckfehler.isNotEmpty) setState(() => _druckWarnung = 'Tisch $nr, ${bestellNr(b.id)}: ${b.druckfehler.join(' · ')}');
      _nebendaten();
    } on KasseFehler catch (e) {
      if (e.status == 401) return _abmelden();
      _meldung('Nicht gesendet: ${e.meldung} – Warenkorb bleibt.', fehler: true);
    } finally {
      if (mounted) setState(() => _sendet = false);
    }
  }

  Future<void> _tischWaehlen() async {
    final c = TextEditingController(text: _tischNr?.toString() ?? '');
    final nr = await showDialog<int>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Tischnummer'),
        content: TextField(controller: c, autofocus: true, keyboardType: TextInputType.number, style: const TextStyle(fontSize: 28)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Abbrechen')),
          FilledButton(onPressed: () => Navigator.pop(context, int.tryParse(c.text.trim())), child: const Text('OK')),
        ],
      ),
    );
    if (nr != null && nr > 0) setState(() => _tischNr = nr);
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
      body: Column(children: [
        if (_druckWarnung != null)
          Material(
            color: const Color(0xFFDC2626),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
              child: Row(children: [
                const Text('🖨️', style: TextStyle(fontSize: 22)),
                const SizedBox(width: 8),
                Expanded(child: Text('Bon nicht gedruckt – $_druckWarnung', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold))),
                TextButton(onPressed: () => setState(() => _druckWarnung = null), child: const Text('Gesehen', style: TextStyle(color: Colors.white))),
              ]),
            ),
          ),
        if (_puffer > 0)
          Material(
            color: const Color(0xFFF59E0B),
            child: InkWell(
              onTap: api.pufferSenden,
              child: Padding(
                padding: const EdgeInsets.all(10),
                child: Text('⏳ $_puffer ${_puffer == 1 ? 'Buchung wartet' : 'Buchungen warten'} auf Verbindung – weiter kassieren, wird nachgesendet (tippen: jetzt senden)',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
              ),
            ),
          ),
        Expanded(child: _inhalt(breit, kacheln)),
      ]),
      bottomNavigationBar: breit ? null : _korbLeiste(),
    );
  }

  Widget _inhalt(bool breit, List<Kachel> kacheln) {
    return _laedt && _artikel.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : _fehler != null && _artikel.isEmpty
              ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_fehler!, textAlign: TextAlign.center)))
              : Row(children: [
                  Expanded(child: Column(children: [_kategorieLeiste(), Expanded(child: _raster(kacheln))])),
                  if (breit) SizedBox(width: 380, child: _korbAnsicht()),
                ]);
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
          if (_tischeSichtbar)
            IconButton(
              tooltip: 'Tische',
              onPressed: () async {
                await Navigator.of(context).push(MaterialPageRoute(builder: (_) => TischeScreen(api: api, twintQr: _twintQr)));
                _nebendaten();
              },
              icon: Badge(isLabelVisible: _offeneTische > 0, label: Text('$_offeneTische'), child: const Icon(Icons.table_restaurant)),
            ),
          PopupMenuButton<String>(
            onSelected: (w) => w == 'neu' ? _laden() : w == 'ab' ? _abmelden() : null,
            itemBuilder: (_) => [
              const PopupMenuItem(value: 'neu', child: Text('Artikel neu laden')),
              const PopupMenuItem(value: 'ab', child: Text('Abmelden')),
              PopupMenuItem(enabled: false, value: 'code', child: Text('Gerätecode ${api.geraetCode}')),
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

  Widget _bestellart() => !_tischeSichtbar
      ? const SizedBox.shrink()
      : Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: SegmentedButton<bool>(
            segments: const [
              ButtonSegment(value: false, label: Text('Bar'), icon: Icon(Icons.local_bar)),
              ButtonSegment(value: true, label: Text('Tisch'), icon: Icon(Icons.table_restaurant)),
            ],
            selected: {_tischModus},
            onSelectionChanged: (w) => setState(() => _tischModus = w.first),
          ),
        );

  Widget _zahlKnoepfe() => _tischModus
      ? Row(children: [
          SizedBox(
            height: 56,
            child: OutlinedButton(onPressed: _tischWaehlen, child: Text(_tischNr == null ? 'Tisch ?' : 'Tisch $_tischNr', style: const TextStyle(fontSize: 18))),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: SizedBox(
              height: 56,
              child: FilledButton(
                style: FilledButton.styleFrom(backgroundColor: const Color(0xFFDC2626)),
                onPressed: _korb.isEmpty || _sendet ? null : _anTischSenden,
                child: const Text('An Tisch senden', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              ),
            ),
          ),
        ])
      : _barKnoepfe();

  Widget _barKnoepfe() => Row(children: [
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
            _bestellart(),
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
            if (neuZeichnen == null) ...[_bestellart(), _zahlKnoepfe()],
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
