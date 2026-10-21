// Eine Zahlung in der Liste, die Aktionen dazu (Blatt von unten) und der
// Dialog fuer die QR-Referenz.

import 'package:flutter/services.dart';
import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:material_ui/material_ui.dart';

import 'beitraege_daten.dart';

/// Was mit einer Zahlung geschehen soll.
enum ZahlungsAktion { bezahlt, zuruecksetzen, referenz, briefAnsehen, briefEmail, briefPost }

class ZahlungZeile extends StatelessWidget {
  const ZahlungZeile({
    super.key,
    required this.zahlung,
    required this.antippen,
    this.arbeitet = false,
  });

  final Beitragszahlung zahlung;
  final VoidCallback antippen;

  /// Laeuft gerade eine Aktion (Fortschritt statt Status).
  final bool arbeitet;

  @override
  Widget build(BuildContext context) {
    final z = zahlung;
    final t = Theme.of(context);
    final referenz = z.hatReferenz ? 'Ref. ${z.referenz}' : 'ohne Referenz';
    final zweite = z.bezahlt
        ? (z.bezahltAm != null ? 'bezahlt am ${datumText(z.bezahltAm!)}' : 'bezahlt')
        : (z.email ?? '');
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 4),
      title: Text(z.name),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text.rich(
            TextSpan(
              children: [
                TextSpan(text: '${chf(z.betrag)} · '),
                TextSpan(
                  text: referenz,
                  style: !z.hatReferenz && !z.bezahlt
                      ? TextStyle(color: hinweisFarben(context, HinweisArt.warnung).$2)
                      : null,
                ),
              ],
            ),
          ),
          if (zweite.isNotEmpty)
            Text(
              zweite,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: t.textTheme.bodySmall,
            ),
        ],
      ),
      trailing: arbeitet
          ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2))
          : _StatusChip(zahlung: z),
      onTap: arbeitet ? null : antippen,
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.zahlung});

  final Beitragszahlung zahlung;

  @override
  Widget build(BuildContext context) => switch (zahlung.status) {
    ZahlungsStatus.bezahlt => const HinweisChip('Bezahlt', art: HinweisArt.gut),
    ZahlungsStatus.offen => const HinweisChip('Offen', art: HinweisArt.schlecht),
    ZahlungsStatus.anderer => HinweisChip(zahlung.statusRoh),
  };
}

/// Blatt mit den Aktionen zu einer Zahlung. null = nichts gewaehlt.
Future<ZahlungsAktion?> zahlungsAktionWaehlen(BuildContext context, Beitragszahlung z) {
  return showModalBottomSheet<ZahlungsAktion>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (context) {
      final t = Theme.of(context);
      void waehlen(ZahlungsAktion a) => Navigator.of(context).pop(a);
      final ohneReferenz = 'Zuerst eine Referenz setzen.';
      return SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.only(bottom: 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ListTile(
                title: Text(z.anzeigeName, style: t.textTheme.titleMedium),
                subtitle: Text('Beitrag ${z.jahr} · ${chf(z.betrag)}'),
              ),
              const Divider(height: 1),
              if (z.bezahlt)
                ListTile(
                  leading: const Icon(Icons.undo),
                  title: const Text('Zurücksetzen'),
                  subtitle: const Text('Wieder auf «offen», Zahlungsdatum wird gelöscht'),
                  onTap: () => waehlen(ZahlungsAktion.zuruecksetzen),
                )
              else
                ListTile(
                  leading: const Icon(Icons.check_circle_outline),
                  title: const Text('Als bezahlt markieren'),
                  subtitle: const Text('Mit heutigem Datum'),
                  onTap: () => waehlen(ZahlungsAktion.bezahlt),
                ),
              ListTile(
                leading: const Icon(Icons.pin_outlined),
                title: const Text('Referenz setzen'),
                subtitle: Text(z.hatReferenz ? 'Jetzt: ${z.referenz}' : 'Noch keine QR-Referenz'),
                onTap: () => waehlen(ZahlungsAktion.referenz),
              ),
              ListTile(
                key: const Key('brief-ansehen'),
                leading: const Icon(Icons.picture_as_pdf_outlined),
                title: const Text('Beitragsbrief ansehen'),
                subtitle: Text(z.hatReferenz ? 'PDF mit QR-Rechnung, wie per Post' : ohneReferenz),
                enabled: z.hatReferenz,
                onTap: () => waehlen(ZahlungsAktion.briefAnsehen),
              ),
              if (!z.bezahlt) ...[
                const Divider(),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
                  child: Text(
                    'Beitragsbrief versenden – geht sofort und echt raus',
                    style: t.textTheme.labelMedium?.copyWith(color: t.colorScheme.outline),
                  ),
                ),
                ListTile(
                  leading: const Icon(Icons.mail_outline),
                  title: const Text('Beitragsbrief per E-Mail'),
                  subtitle: Text(
                    !z.hatReferenz
                        ? ohneReferenz
                        : z.email == null
                        ? 'Keine E-Mail-Adresse hinterlegt'
                        : z.email!,
                  ),
                  enabled: z.hatReferenz && z.email != null,
                  onTap: () => waehlen(ZahlungsAktion.briefEmail),
                ),
                ListTile(
                  leading: const Icon(Icons.local_post_office_outlined),
                  title: const Text('Beitragsbrief per Post'),
                  subtitle: Text(
                    !z.hatReferenz
                        ? ohneReferenz
                        : !z.hatAdresse
                        ? 'Adresse unvollständig'
                        : 'Über Pingen, kostet ca. CHF 1.–',
                  ),
                  enabled: z.hatReferenz && z.hatAdresse,
                  onTap: () => waehlen(ZahlungsAktion.briefPost),
                ),
              ],
            ],
          ),
        ),
      );
    },
  );
}

/// Fragt die QR-Referenz ab. Gibt die bereinigte Referenz zurueck (leer =
/// loeschen), null bei Abbruch.
Future<String?> referenzAbfragen(BuildContext context, Beitragszahlung z) => showDialog<String>(
  context: context,
  builder: (_) => _ReferenzDialog(zahlung: z),
);

class _ReferenzDialog extends StatefulWidget {
  const _ReferenzDialog({required this.zahlung});

  final Beitragszahlung zahlung;

  @override
  State<_ReferenzDialog> createState() => _ReferenzDialogState();
}

class _ReferenzDialogState extends State<_ReferenzDialog> {
  late final _eingabe = TextEditingController(text: widget.zahlung.referenz ?? '');
  String? _fehler;

  @override
  void dispose() {
    _eingabe.dispose();
    super.dispose();
  }

  void _speichern() {
    final r = referenzAusEingabe(_eingabe.text);
    if (r == null) {
      setState(() => _fehler = 'Nur Ziffern, höchstens $referenzMaxLaenge.');
      return;
    }
    Navigator.of(context).pop(r);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Referenz setzen'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('${widget.zahlung.anzeigeName}, Beitrag ${widget.zahlung.jahr}'),
          const SizedBox(height: 12),
          TextField(
            controller: _eingabe,
            autofocus: true,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[\d ]'))],
            decoration: InputDecoration(
              labelText: 'QR-Referenz der Bank',
              hintText: 'z.B. 05590',
              helperText: 'Nur die Ziffern; leer = keine Referenz.',
              helperMaxLines: 2,
              errorText: _fehler,
              border: const OutlineInputBorder(),
            ),
            onSubmitted: (_) => _speichern(),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Abbrechen')),
        FilledButton(onPressed: _speichern, child: const Text('Speichern')),
      ],
    );
  }
}
