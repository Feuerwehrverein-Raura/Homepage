// Kamera-Ansicht zum Scannen von Barcodes (EAN, Code128) und QR-Etiketten
// der Inventar-PWA. Gibt den ersten gelesenen Code als Text zurueck; was er
// bedeutet, entscheidet der Aufrufer (codeAusScan, LagerZugang.codeSuchen).

import 'package:material_ui/material_ui.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

/// Oeffnet die Kamera; null bei Abbruch.
Future<String?> barcodeScannen(BuildContext context) =>
    Navigator.of(context)
        .push<String>(MaterialPageRoute(builder: (_) => const BarcodeScannerScreen()));

class BarcodeScannerScreen extends StatefulWidget {
  const BarcodeScannerScreen({super.key});

  @override
  State<BarcodeScannerScreen> createState() => _BarcodeScannerScreenState();
}

class _BarcodeScannerScreenState extends State<BarcodeScannerScreen> {
  // Alle Formate: EAN-13/8 auf Waren, Code128 und QR auf eigenen Etiketten.
  final _kamera = MobileScannerController();
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
      if (text != null && text.trim().isNotEmpty) {
        _fertig = true;
        Navigator.of(context).pop(text.trim());
        return;
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Barcode scannen'),
        actions: [
          IconButton(
            onPressed: () => _kamera.toggleTorch(),
            icon: const Icon(Icons.flashlight_on_outlined),
            tooltip: 'Licht',
          ),
        ],
      ),
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
                const Text(
                  'Barcode oder QR-Etikett im Sucher ausrichten',
                  textAlign: TextAlign.center,
                ),
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
