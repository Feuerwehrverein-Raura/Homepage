// QR-Code zum Auszahlen (Swiss QR Code, fwv_core QrZahlung): der Kassier
// scannt ihn mit der Bank-App - am Computer mit dem Handy, auf dem Handy als
// Bildschirmfoto (die meisten Bank-Apps lesen QR-Codes auch aus Fotos).

import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';
import 'package:qr_flutter/qr_flutter.dart';

/// Knopf "QR-Code"; oeffnet [qrZahlteilZeigen].
class QrZahlteilKnopf extends StatelessWidget {
  const QrZahlteilKnopf({super.key, required this.zahlung});

  final QrZahlung zahlung;

  @override
  Widget build(BuildContext context) => TextButton.icon(
    onPressed: () => qrZahlteilZeigen(context, zahlung),
    icon: const Icon(Icons.qr_code_2, size: 18),
    label: const Text('QR-Code'),
  );
}

Future<void> qrZahlteilZeigen(BuildContext context, QrZahlung zahlung) => showDialog<void>(
  context: context,
  builder: (c) {
    final t = Theme.of(c);
    final fehlt = zahlung.fehlt;
    return AlertDialog(
      key: const Key('qr-zahlteil'),
      title: const Text('Zahlteil'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (fehlt != null)
              Text(fehlt, key: const Key('qr-zahlteil-fehlt'))
            else ...[
              Center(child: SwissQrBild(inhalt: zahlung.inhalt)),
              const SizedBox(height: 12),
              Text('Mit der Bank-App scannen.', style: t.textTheme.bodySmall),
            ],
            const SizedBox(height: 12),
            _angabe(t, 'Konto / Zahlbar an', [
              ibanFormatieren(zahlung.iban),
              zahlung.name,
              ?zahlung.strasse,
              [?zahlung.plz, ?zahlung.ort].join(' '),
            ]),
            if (zahlung.betrag case final b?) _angabe(t, 'Betrag', [spesenFranken(b)]),
            if (zahlung.mitteilung case final m?) _angabe(t, 'Zusätzliche Informationen', [m]),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(c).pop(), child: const Text('Schliessen')),
      ],
    );
  },
);

Widget _angabe(ThemeData t, String titel, List<String> zeilen) => Padding(
  padding: const EdgeInsets.only(top: 8),
  child: Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(titel, style: t.textTheme.labelMedium),
      SelectableText(zeilen.where((z) => z.trim().isNotEmpty).join('\n')),
    ],
  ),
);

/// Swiss QR Code: QR (Fehlerkorrektur M) auf weissem Grund, in der Mitte das
/// Schweizerkreuz (7 von 46 mm, SIX Kapitel 6.4.2).
class SwissQrBild extends StatelessWidget {
  const SwissQrBild({super.key, required this.inhalt, this.groesse = 240});

  final String inhalt;
  final double groesse;

  @override
  Widget build(BuildContext context) {
    // Ruhezone 4 Module; QrImageView rechnet sie ins Padding.
    const rand = 12.0;
    final code = groesse - 2 * rand;
    return ColoredBox(
      color: Colors.white,
      child: SizedBox.square(
        dimension: groesse,
        child: Stack(
          alignment: Alignment.center,
          children: [
            QrImageView(
              data: inhalt,
              size: groesse,
              padding: const EdgeInsets.all(rand),
              errorCorrectionLevel: QrErrorCorrectLevel.M,
              backgroundColor: Colors.white,
            ),
            SizedBox.square(
              dimension: code * 7 / 46,
              child: const CustomPaint(painter: _Schweizerkreuz()),
            ),
          ],
        ),
      ),
    );
  }
}

/// Schwarzes Quadrat mit weissem Rand, weisses Kreuz (wie das Logo von SIX).
class _Schweizerkreuz extends CustomPainter {
  const _Schweizerkreuz();

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width;
    final weiss = Paint()..color = Colors.white;
    canvas.drawRect(Offset.zero & size, weiss);
    final rand = s * 0.06;
    canvas.drawRect(
      Rect.fromLTWH(rand, rand, s - 2 * rand, s - 2 * rand),
      Paint()..color = Colors.black,
    );
    // Kreuz: Arme 1/6 laenger als breit (Wappen).
    final breite = s * 0.18;
    final laenge = breite * 7 / 6 * 2 + breite;
    final m = s / 2;
    canvas.drawRect(Rect.fromCenter(center: Offset(m, m), width: breite, height: laenge), weiss);
    canvas.drawRect(Rect.fromCenter(center: Offset(m, m), width: laenge, height: breite), weiss);
  }

  @override
  bool shouldRepaint(_Schweizerkreuz alt) => false;
}
