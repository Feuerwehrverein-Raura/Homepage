// Offene Mitgliederbeitraege im Profil: eine Karte je offenem Jahr, Tippen
// oeffnet den Einzahlungsschein (Swiss QR Code zum Scannen mit der Bank-App
// und alle Angaben zum Abtippen). Bezahlte Beitraege verschwinden, sobald der
// Kassier sie als bezahlt markiert.

import 'package:flutter/services.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:fwv_vorstand/fwv_vorstand.dart' show SwissQrBild;
import 'package:material_ui/material_ui.dart';

class OffeneBeitraegeTeil extends StatelessWidget {
  const OffeneBeitraegeTeil({super.key, required this.beitraege, this.heute});

  final List<OffenerBeitrag> beitraege;

  /// Fuer Tests; sonst jetzt.
  final DateTime? heute;

  @override
  Widget build(BuildContext context) {
    if (beitraege.isEmpty) return const SizedBox.shrink();
    final farben = Theme.of(context).colorScheme;
    final jetzt = heute ?? DateTime.now();
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Card(
        key: const Key('offene-beitraege'),
        color: farben.errorContainer,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Text(
                beitraege.length == 1
                    ? 'Offener Mitgliederbeitrag'
                    : 'Offene Mitgliederbeiträge',
                style: Theme.of(context).textTheme.titleMedium
                    ?.copyWith(color: farben.onErrorContainer),
              ),
            ),
            for (final b in beitraege)
              ListTile(
                key: Key('beitrag-${b.jahr}'),
                leading: Icon(Icons.qr_code_2, color: farben.onErrorContainer),
                title: Text(
                  'Mitgliederbeitrag ${b.jahr} – ${spesenFranken(b.betrag)}',
                  style: TextStyle(color: farben.onErrorContainer),
                ),
                subtitle: Text(
                  _unterzeile(b, jetzt),
                  style: TextStyle(color: farben.onErrorContainer),
                ),
                trailing: Icon(
                  Icons.chevron_right,
                  color: farben.onErrorContainer,
                ),
                onTap: () => einzahlungsscheinZeigen(context, b),
              ),
            const SizedBox(height: 4),
          ],
        ),
      ),
    );
  }

  static String _unterzeile(OffenerBeitrag b, DateTime jetzt) {
    final f = b.faellig;
    final wann = f == null
        ? 'Einzahlungsschein anzeigen'
        : b.ueberfaellig(jetzt)
        ? 'Fällig seit ${schweizerDatum(f)} – Einzahlungsschein anzeigen'
        : 'Zahlbar bis ${schweizerDatum(f)} – Einzahlungsschein anzeigen';
    return wann;
  }
}

Future<void> einzahlungsscheinZeigen(BuildContext context, OffenerBeitrag b) =>
    showDialog<void>(
      context: context,
      builder: (c) {
        final t = Theme.of(c);
        return AlertDialog(
          key: const Key('einzahlungsschein'),
          title: Text('Mitgliederbeitrag ${b.jahr}'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (b.qrInhalt case final q?) ...[
                  Center(child: SwissQrBild(inhalt: q)),
                  const SizedBox(height: 8),
                  Text(
                    'Mit der Bank-App scannen – oder ein Bildschirmfoto machen, die meisten '
                    'Bank-Apps lesen den Code auch aus Fotos.',
                    style: t.textTheme.bodySmall,
                  ),
                ] else
                  Text(
                    'Der Einzahlungsschein ist noch nicht bereit (Referenznummer fehlt). '
                    'Bei Fragen hilft der Kassier: kassier@fwv-raura.ch',
                    key: const Key('einzahlungsschein-ohne-referenz'),
                  ),
                _angabe(c, 'Konto / Zahlbar an', [
                  b.iban,
                  ...b.empfaenger,
                ], kopieren: b.iban),
                if (b.referenz case final r?)
                  _angabe(c, 'Referenz', [r], kopieren: r),
                _angabe(c, 'Betrag', [spesenFranken(b.betrag)]),
                if (b.mitteilung case final m?)
                  _angabe(c, 'Zusätzliche Informationen', [m]),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(c).pop(),
              child: const Text('Schliessen'),
            ),
          ],
        );
      },
    );

Widget _angabe(
  BuildContext c,
  String titel,
  List<String> zeilen, {
  String? kopieren,
}) {
  final t = Theme.of(c);
  return Padding(
    padding: const EdgeInsets.only(top: 12),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(titel, style: t.textTheme.labelMedium),
              SelectableText(
                zeilen.where((z) => z.trim().isNotEmpty).join('\n'),
              ),
            ],
          ),
        ),
        if (kopieren != null)
          IconButton(
            tooltip: '$titel kopieren',
            icon: const Icon(Icons.copy, size: 18),
            onPressed: () async {
              await Clipboard.setData(
                ClipboardData(text: kopieren.replaceAll(' ', '')),
              );
              if (c.mounted) {
                ScaffoldMessenger.maybeOf(c)
                    ?.showSnackBar(SnackBar(content: Text('$titel kopiert')));
              }
            },
          ),
      ],
    ),
  );
}
