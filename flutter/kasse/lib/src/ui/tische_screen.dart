// Offene Tische (wie die Web-Kasse): je Tisch der offene Betrag; im Tisch
// die Positionen (bezahlt durchgestrichen, Kueche fertig mit Haken),
// Storno je Position, alles bezahlen, Teilbetrag, Tisch aufloesen.
// Aktualisiert sich alle 10 s.
import 'dart:async';

import 'package:flutter/material.dart';

import '../kacheln.dart';
import '../kasse_api.dart';
import 'anmeldung.dart' show knopfRot;
import 'zahlung.dart';

class TischeScreen extends StatefulWidget {
  const TischeScreen({super.key, required this.api, this.twintQr, this.eingebettet = false});
  final KasseApi api;
  final String? twintQr;
  /// Als Reiter in der Kasse: ohne eigene Kopfzeile
  final bool eingebettet;
  @override
  State<TischeScreen> createState() => _TischeScreenState();
}

class _TischeScreenState extends State<TischeScreen> {
  List<TischBestellung> _offen = [];
  bool _laedt = true;
  String? _fehler;
  Timer? _takt;

  @override
  void initState() {
    super.initState();
    _laden();
    _takt = Timer.periodic(const Duration(seconds: 10), (_) => _laden());
  }

  @override
  void dispose() {
    _takt?.cancel();
    super.dispose();
  }

  Future<void> _laden() async {
    try {
      final l = await widget.api.offeneTische();
      if (!mounted) return;
      setState(() {
        _offen = l;
        _fehler = null;
      });
    } on KasseFehler catch (e) {
      if (mounted) setState(() => _fehler = e.meldung);
    } finally {
      if (mounted) setState(() => _laedt = false);
    }
  }

  Map<int, List<TischBestellung>> get _nachTisch {
    final m = <int, List<TischBestellung>>{};
    for (final b in _offen) {
      m.putIfAbsent(b.tisch, () => []).add(b);
    }
    return Map.fromEntries(m.entries.toList()..sort((a, b) => a.key.compareTo(b.key)));
  }

  @override
  Widget build(BuildContext context) {
    final tische = _nachTisch;
    return Scaffold(
      appBar: widget.eingebettet ? null : AppBar(title: const Text('Offene Tische'), backgroundColor: const Color(0xFFDC2626), foregroundColor: Colors.white),
      backgroundColor: const Color(0xFFF3F4F6),
      body: _laedt
          ? const Center(child: CircularProgressIndicator())
          : tische.isEmpty
              ? Center(child: Text(_fehler ?? 'Keine offenen Tische', style: const TextStyle(color: Colors.black54, fontSize: 16)))
              : RefreshIndicator(
                  onRefresh: _laden,
                  child: GridView(
                    padding: const EdgeInsets.all(12),
                    gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(maxCrossAxisExtent: 260, mainAxisExtent: 120, crossAxisSpacing: 10, mainAxisSpacing: 10),
                    children: [
                      for (final e in tische.entries) _tischKachel(e.key, e.value),
                    ],
                  ),
                ),
    );
  }

  Widget _tischKachel(int tisch, List<TischBestellung> bestellungen) {
    final offen = bestellungen.fold(0.0, (s, b) => s + b.offen);
    final alle = bestellungen.expand((b) => b.positionen).toList();
    final fertig = alle.isNotEmpty && alle.every((p) => p.fertig);
    return Material(
      color: fertig ? const Color(0xFF16A34A) : const Color(0xFFDC2626),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () async {
          await Navigator.of(context).push(MaterialPageRoute(builder: (_) => _TischDetail(api: widget.api, tisch: tisch, twintQr: widget.twintQr)));
          _laden();
        },
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Tisch $tisch', style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
            const Spacer(),
            Text('CHF ${offen.toStringAsFixed(2)} offen', style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w600)),
            if (fertig) const Text('Küche fertig', style: TextStyle(color: Colors.white70)),
          ]),
        ),
      ),
    );
  }
}

class _TischDetail extends StatefulWidget {
  const _TischDetail({required this.api, required this.tisch, this.twintQr});
  final KasseApi api;
  final int tisch;
  final String? twintQr;
  @override
  State<_TischDetail> createState() => _TischDetailState();
}

class _TischDetailState extends State<_TischDetail> {
  List<TischBestellung> _bestellungen = [];
  bool _arbeitet = false;

  @override
  void initState() {
    super.initState();
    _laden();
  }

  Future<void> _laden() async {
    try {
      final l = await widget.api.offeneTische();
      if (!mounted) return;
      setState(() => _bestellungen = l.where((b) => b.tisch == widget.tisch).toList());
      if (_bestellungen.isEmpty) Navigator.of(context).pop();
    } on KasseFehler catch (e) {
      _meldung(e.meldung, fehler: true);
    }
  }

  double get _offen => _bestellungen.fold(0.0, (s, b) => s + b.offen);

  void _meldung(String t, {bool fehler = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t), backgroundColor: fehler ? knopfRot : null));
  }

  Future<void> _aktion(Future<void> Function() f) async {
    if (_arbeitet) return;
    setState(() => _arbeitet = true);
    try {
      await f();
    } on KasseFehler catch (e) {
      _meldung(e.meldung, fehler: true);
    } finally {
      if (mounted) setState(() => _arbeitet = false);
      await _laden();
    }
  }

  Future<void> _bezahlen(double betrag, String beschreibung) async {
    final art = await zahlungAbfragen(context, bestellung: 0, betrag: betrag, art: 'cash', twintQr: widget.twintQr, titel: 'Tisch ${widget.tisch}');
    if (art == null) return;
    await _aktion(() async {
      final fertig = await widget.api.tischBezahlen(_bestellungen, betrag, art, beschreibung);
      _meldung(fertig ? 'Tisch ${widget.tisch} bezahlt' : 'CHF ${betrag.toStringAsFixed(2)} bezahlt');
    });
  }

  Future<void> _teilbetrag() async {
    final c = TextEditingController();
    final betrag = await showDialog<double>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Teilbetrag'),
        content: TextField(controller: c, autofocus: true, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(prefixText: 'CHF ')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Abbrechen')),
          FilledButton(onPressed: () => Navigator.pop(context, double.tryParse(c.text.replaceAll(',', '.'))), child: const Text('Weiter')),
        ],
      ),
    );
    if (betrag == null || betrag <= 0) return;
    if (betrag > _offen + 0.009) return _meldung('Mehr als offen (CHF ${_offen.toStringAsFixed(2)})', fehler: true);
    await _bezahlen(betrag, 'Teilzahlung CHF ${betrag.toStringAsFixed(2)}');
  }

  Future<void> _storno(TischBestellung b, TischPosition p) async {
    final ok = await _frage(p.fertig
        ? '«${p.menge}x ${anzeigeName(p.name)}» hat die Küche schon bestätigt.\n\nTrotzdem entfernen (z.B. falsch getippt, nie serviert)?'
        : '«${p.menge}x ${anzeigeName(p.name)}» stornieren?');
    if (ok) await _aktion(() => widget.api.stornieren(b.id, p.id, trotzKueche: p.fertig));
  }

  Future<void> _aufloesen() async {
    final bezahlt = _bestellungen.fold(0.0, (s, b) => s + b.bezahltBetrag);
    final ok = await _frage('Tisch ${widget.tisch} auflösen?\n\nOffen: CHF ${_offen.toStringAsFixed(2)} wird storniert.'
        '${bezahlt > 0 ? '\nBereits bezahlt: CHF ${bezahlt.toStringAsFixed(2)} bleibt in der Abrechnung.' : ''}');
    if (!ok) return;
    await _aktion(() async {
      for (final b in _bestellungen) {
        await widget.api.bestellungStornieren(b.id);
      }
    });
  }

  Future<bool> _frage(String text) async =>
      await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
          content: Text(text),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Abbrechen')),
            FilledButton(style: FilledButton.styleFrom(backgroundColor: knopfRot), onPressed: () => Navigator.pop(context, true), child: const Text('Ja')),
          ],
        ),
      ) ??
      false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Tisch ${widget.tisch}'), backgroundColor: const Color(0xFFDC2626), foregroundColor: Colors.white),
      body: ListView(padding: const EdgeInsets.all(12), children: [
        for (final b in _bestellungen) ...[
          Padding(
            padding: const EdgeInsets.only(top: 8, bottom: 4),
            child: Text('${bestellNr(b.id)}${b.erstellt != null ? ' · ${b.erstellt!.toLocal().hour.toString().padLeft(2, '0')}:${b.erstellt!.toLocal().minute.toString().padLeft(2, '0')}' : ''}',
                style: const TextStyle(color: Colors.black54)),
          ),
          for (final p in b.positionen)
            Card(
              color: p.bezahlt ? const Color(0xFFDCFCE7) : (p.fertig ? const Color(0xFFFEF9C3) : Colors.white),
              child: ListTile(
                title: Text('${p.fertig && !p.bezahlt ? '✓ ' : ''}${p.menge}x ${anzeigeName(p.name)}',
                    style: TextStyle(decoration: p.bezahlt ? TextDecoration.lineThrough : null, fontWeight: FontWeight.w600)),
                subtitle: Text('CHF ${(p.preis * p.menge).toStringAsFixed(2)}'),
                trailing: p.bezahlt ? null : IconButton(icon: const Icon(Icons.close, color: knopfRot), tooltip: 'Stornieren', onPressed: _arbeitet ? null : () => _storno(b, p)),
              ),
            ),
        ],
      ]),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Row(children: [
              const Text('Offen', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const Spacer(),
              Text('CHF ${_offen.toStringAsFixed(2)}', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Color(0xFF15803D))),
            ]),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              height: 56,
              child: FilledButton(
                style: FilledButton.styleFrom(backgroundColor: const Color(0xFF16A34A)),
                onPressed: _arbeitet || _offen <= 0 ? null : () => _bezahlen(_offen, 'Vollständige Bezahlung'),
                child: const Text('Alles bezahlen', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              ),
            ),
            Row(children: [
              Expanded(child: TextButton(onPressed: _arbeitet ? null : _teilbetrag, child: const Text('Teilbetrag'))),
              Expanded(child: TextButton(onPressed: _arbeitet ? null : _aufloesen, child: const Text('Tisch auflösen', style: TextStyle(color: knopfRot)))),
            ]),
          ]),
        ),
      ),
    );
  }
}
