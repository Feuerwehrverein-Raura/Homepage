// Anmeldung wie in der Mitglieder-App: dunkelroter Grund, Logo, Karte mit
// zwei Reitern. An der Kasse: QR-Code (Kassen-QR aus "Zugaenge", Anmeldebon,
// Datenblatt) oder Kassen-Passwort.
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../kasse_api.dart';

const vereinsRot = Color(0xFF7F1D1D);
const knopfRot = Color(0xFFB91C1C);

class Anmeldung extends StatefulWidget {
  const Anmeldung({super.key, required this.api, required this.angemeldet});
  final KasseApi api;
  final VoidCallback angemeldet;

  @override
  State<Anmeldung> createState() => _AnmeldungState();
}

class _AnmeldungState extends State<Anmeldung> {
  final _passwort = TextEditingController();
  bool _laeuft = false;
  String? _fehler;

  Future<void> _ausfuehren(Future<void> Function() aktion) async {
    setState(() {
      _laeuft = true;
      _fehler = null;
    });
    try {
      await aktion();
      widget.angemeldet();
    } on KasseFehler catch (e) {
      setState(() => _fehler = e.meldung);
    } finally {
      if (mounted) setState(() => _laeuft = false);
    }
  }

  Future<void> _qr() async {
    final code = await Navigator.of(context).push<String>(MaterialPageRoute(builder: (_) => const QrScanner()));
    if (code == null || !mounted) return;
    await _ausfuehren(() => widget.api.mitQrAnmelden(code));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: vereinsRot,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                children: [
                  Image.asset('assets/kasse-logo.png', height: 200),
                  const SizedBox(height: 12),
                  const Text('Feuerwehrverein Raura',
                      style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 28),
                  Card(
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                    clipBehavior: Clip.antiAlias,
                    child: DefaultTabController(
                      length: 2,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const TabBar(
                            labelColor: knopfRot,
                            indicatorColor: knopfRot,
                            indicatorSize: TabBarIndicatorSize.label,
                            labelStyle: TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
                            tabs: [Tab(text: 'QR-Code'), Tab(text: 'Passwort')],
                          ),
                          SizedBox(
                            height: 210,
                            child: TabBarView(children: [_qrReiter(), _passwortReiter()]),
                          ),
                        ],
                      ),
                    ),
                  ),
                  if (_fehler != null) ...[
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10)),
                      child: Text(_fehler!, style: const TextStyle(color: knopfRot)),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _qrReiter() => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            const Text('Kassen-QR aus «Zugänge» in der App, Datenblatt oder Anmeldebon vom Bondrucker.',
                textAlign: TextAlign.center, style: TextStyle(color: Colors.black54)),
            const Spacer(),
            _knopf(_laeuft ? 'Anmeldung läuft…' : 'QR-Code scannen', Icons.qr_code_scanner, _laeuft ? null : _qr),
          ],
        ),
      );

  Widget _passwortReiter() => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            TextField(
              controller: _passwort,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Kassen-Passwort', border: OutlineInputBorder()),
              onSubmitted: (_) => _passwortSenden(),
            ),
            const Spacer(),
            _knopf(_laeuft ? 'Anmeldung läuft…' : 'Anmelden', Icons.login, _laeuft ? null : _passwortSenden),
          ],
        ),
      );

  void _passwortSenden() {
    final pw = _passwort.text.trim();
    if (pw.isEmpty) return;
    _ausfuehren(() => widget.api.mitPasswortAnmelden(pw));
  }

  Widget _knopf(String text, IconData icon, VoidCallback? tap) => SizedBox(
        width: double.infinity,
        height: 56,
        child: FilledButton.icon(
          style: FilledButton.styleFrom(backgroundColor: knopfRot, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
          onPressed: tap,
          icon: Icon(icon),
          label: Text(text, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
        ),
      );
}

/// Kamera-Scanner; liefert den Text des ersten QR-Codes.
class QrScanner extends StatefulWidget {
  const QrScanner({super.key});
  @override
  State<QrScanner> createState() => _QrScannerState();
}

class _QrScannerState extends State<QrScanner> {
  bool _fertig = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('QR-Code scannen')),
      body: MobileScanner(
        onDetect: (erfassung) {
          if (_fertig) return;
          final text = erfassung.barcodes.map((b) => b.rawValue).whereType<String>().firstOrNull;
          if (text == null) return;
          _fertig = true;
          Navigator.of(context).pop(text);
        },
      ),
    );
  }
}
