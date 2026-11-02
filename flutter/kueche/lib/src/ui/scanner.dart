// Kamera fuer den QR-Login (Datenblatt oder Anmeldebon). Gibt den ersten
// gelesenen Code als Text zurueck.

import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

class QrScanner extends StatefulWidget {
  const QrScanner({super.key});

  @override
  State<QrScanner> createState() => _QrScannerState();
}

class _QrScannerState extends State<QrScanner> {
  final _kamera = MobileScannerController(formats: const [BarcodeFormat.qrCode]);
  bool _fertig = false;

  @override
  void dispose() {
    _kamera.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Datenblatt oder Anmeldebon vor die Kamera halten')),
    body: MobileScanner(
      controller: _kamera,
      onDetect: (erfassung) {
        if (_fertig) return;
        for (final c in erfassung.barcodes) {
          final t = c.rawValue;
          if (t != null && t.isNotEmpty) {
            _fertig = true;
            Navigator.of(context).pop(t);
            return;
          }
        }
      },
      errorBuilder: (context, fehler) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            fehler.errorCode == MobileScannerErrorCode.permissionDenied
                ? 'Die App darf die Kamera nicht verwenden. Bitte in den Einstellungen erlauben.'
                : 'Die Kamera konnte nicht gestartet werden. Bitte mit dem Passwort anmelden.',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 18),
          ),
        ),
      ),
    ),
  );
}
