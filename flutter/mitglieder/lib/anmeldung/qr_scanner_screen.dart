// Kamera-Ansicht zum Scannen des Login-Codes. Gibt den ersten gelesenen
// QR-Code als Text zurueck; ob er taugt, entscheidet der Login-Screen.

import 'package:material_ui/material_ui.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

class QrScannerScreen extends StatefulWidget {
  const QrScannerScreen({super.key});

  @override
  State<QrScannerScreen> createState() => _QrScannerScreenState();
}

class _QrScannerScreenState extends State<QrScannerScreen> {
  final _kamera = MobileScannerController(formats: const [BarcodeFormat.qrCode]);
  bool _fertig = false;

  @override
  void dispose() {
    _kamera.dispose();
    super.dispose();
  }

  void _erkannt(BarcodeCapture erfassung) {
    if (_fertig) return;
    for (final code in erfassung.barcodes) {
      final text = code.rawValue;
      if (text != null && text.isNotEmpty) {
        _fertig = true;
        Navigator.of(context).pop(text);
        return;
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('QR-Code scannen')),
      body: Column(
        children: [
          Expanded(
            child: MobileScanner(
              controller: _kamera,
              onDetect: _erkannt,
              errorBuilder: (context, fehler) => Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(
                    fehler.errorCode == MobileScannerErrorCode.permissionDenied
                        ? 'Die App darf die Kamera nicht verwenden. Bitte in den '
                              'Einstellungen erlauben.'
                        : 'Die Kamera konnte nicht gestartet werden.',
                    textAlign: TextAlign.center,
                  ),
                ),
              ),
            ),
          ),
          SafeArea(
            top: false,
            minimum: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text('QR-Code im Sucher ausrichten', textAlign: TextAlign.center),
                const SizedBox(height: 12),
                OutlinedButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Abbrechen'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
