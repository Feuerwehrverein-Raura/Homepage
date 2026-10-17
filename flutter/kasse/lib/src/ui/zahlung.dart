// Zahlfenster: Bar (Ziffernblock, Schnellknoepfe, Rueckgeld), TWINT
// (fester QR des Anlasses, Betrag gross darueber) und Karte (Terminal,
// Bestaetigen). Liefert 'cash' | 'twint' | 'card' oder null (abgebrochen).
import 'package:flutter/material.dart';

import '../kacheln.dart';

Future<String?> zahlungAbfragen(BuildContext context, {required int bestellung, required double betrag, required String art, String? twintQr, String? titel}) {
  return showDialog<String>(
    context: context,
    barrierDismissible: false,
    builder: (_) => _Zahlung(bestellung: bestellung, betrag: betrag, startArt: art, twintQr: twintQr, titel: titel),
  );
}

class _Zahlung extends StatefulWidget {
  const _Zahlung({required this.bestellung, required this.betrag, required this.startArt, this.twintQr, this.titel});
  final String? titel;
  final int bestellung;
  final double betrag;
  final String startArt;
  final String? twintQr;
  @override
  State<_Zahlung> createState() => _ZahlungState();
}

class _ZahlungState extends State<_Zahlung> {
  late String _art = widget.startArt;
  String _erhalten = '';
  bool _neu = false;

  double get _erhaltenZahl => double.tryParse(_erhalten) ?? 0;

  /// Noten, die den Betrag decken (wie in der Web-Kasse)
  List<double> get _schnell {
    final b = widget.betrag;
    return [10.0, 20.0, 50.0, 100.0, 200.0].where((n) => n >= b).take(3).toList();
  }

  void _ziffer(String z) => setState(() {
        final basis = _neu || _erhalten == '0' ? '' : _erhalten;
        if (z == '.' && basis.contains('.')) return;
        _erhalten = basis + z;
        _neu = false;
      });

  @override
  Widget build(BuildContext context) {
    final titel = switch (_art) { 'cash' => 'Barzahlung', 'twint' => 'TWINT', _ => 'Karte' };
    return AlertDialog(
      insetPadding: const EdgeInsets.all(16),
      title: Text('$titel · ${widget.titel ?? 'Bestellung ${bestellNr(widget.bestellung)}'}', style: const TextStyle(fontSize: 18)),
      content: SizedBox(
        width: 380,
        child: SingleChildScrollView(child: switch (_art) { 'cash' => _bar(), 'twint' => _twint(), _ => _karte() }),
      ),
      actionsAlignment: MainAxisAlignment.spaceBetween,
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Abbrechen')),
        Wrap(spacing: 4, children: [
          for (final a in ['cash', 'twint', 'card'].where((a) => a != _art))
            OutlinedButton(onPressed: () => setState(() => _art = a), child: Text(switch (a) { 'cash' => 'Bar', 'twint' => 'TWINT', _ => 'Karte' })),
        ]),
      ],
    );
  }

  Widget _betrag() => Text('CHF ${widget.betrag.toStringAsFixed(2)}',
      style: const TextStyle(fontSize: 34, fontWeight: FontWeight.bold, color: Color(0xFF15803D)));

  Widget _bar() {
    final rueck = _erhaltenZahl - widget.betrag;
    final ok = _erhalten.isNotEmpty && rueck >= -0.001;
    return Column(mainAxisSize: MainAxisSize.min, children: [
      Row(children: [
        Expanded(child: _betrag()),
        Text(_erhalten.isEmpty ? '0' : _erhalten, style: const TextStyle(fontSize: 28)),
      ]),
      if (ok)
        Container(
          margin: const EdgeInsets.only(top: 8),
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(color: const Color(0xFFDCFCE7), borderRadius: BorderRadius.circular(10)),
          child: Row(children: [
            const Text('Rückgeld', style: TextStyle(fontSize: 18)),
            const Spacer(),
            Text('CHF ${rueck.toStringAsFixed(2)}', style: const TextStyle(fontSize: 26, fontWeight: FontWeight.bold, color: Color(0xFF15803D))),
          ]),
        ),
      const SizedBox(height: 10),
      Row(children: [
        Expanded(child: _taste('Passend', () => setState(() { _erhalten = widget.betrag.toStringAsFixed(2); _neu = true; }), farbe: const Color(0xFFE5E7EB))),
        for (final n in _schnell)
          Expanded(child: _taste('${n.toInt()}', () => setState(() { _erhalten = n.toStringAsFixed(0); _neu = true; }), farbe: const Color(0xFFDBEAFE))),
      ]),
      for (final reihe in const [['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3'], ['.', '0', '←']])
        Row(children: [
          for (final z in reihe)
            Expanded(
              child: _taste(z, () => z == '←'
                  ? setState(() => _erhalten = _erhalten.isEmpty ? '' : _erhalten.substring(0, _erhalten.length - 1))
                  : _ziffer(z)),
            ),
        ]),
      const SizedBox(height: 8),
      _abschliessen('Bezahlung abschliessen', ok ? () => Navigator.pop(context, 'cash') : null),
    ]);
  }

  Widget _twint() => Column(mainAxisSize: MainAxisSize.min, children: [
        const Text('Diesen Betrag in TWINT eingeben', style: TextStyle(color: Colors.black54)),
        _betrag(),
        const SizedBox(height: 8),
        if (widget.twintQr != null)
          Image.network(widget.twintQr!, width: 260, height: 260, errorBuilder: (_, _, _) => const Text('TWINT-QR nicht geladen'))
        else
          const Text('Kein TWINT-QR hinterlegt'),
        const SizedBox(height: 12),
        _abschliessen('✓ Zahlung erhalten', () => Navigator.pop(context, 'twint')),
      ]);

  Widget _karte() => Column(mainAxisSize: MainAxisSize.min, children: [
        const Text('Betrag am Kartenterminal eingeben', style: TextStyle(color: Colors.black54)),
        _betrag(),
        const SizedBox(height: 16),
        _abschliessen('✓ Kartenzahlung bestätigt', () => Navigator.pop(context, 'card')),
      ]);

  Widget _taste(String text, VoidCallback tap, {Color farbe = const Color(0xFFF3F4F6)}) => Padding(
        padding: const EdgeInsets.all(3),
        child: SizedBox(
          height: 52,
          child: FilledButton(
            style: FilledButton.styleFrom(backgroundColor: farbe, foregroundColor: Colors.black87, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
            onPressed: tap,
            child: Text(text, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
          ),
        ),
      );

  Widget _abschliessen(String text, VoidCallback? tap) => SizedBox(
        width: double.infinity,
        height: 56,
        child: FilledButton(
          style: FilledButton.styleFrom(backgroundColor: const Color(0xFF16A34A), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
          onPressed: tap,
          child: Text(text, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        ),
      );
}
