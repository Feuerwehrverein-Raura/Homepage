// Zustellliste: Mitglieder mit E-Mail-Zustellung, alle Adressen kopieren,
// Alias mitglieder@ abgleichen (POST /members/emails/sync-alias).

import 'package:flutter/services.dart' show Clipboard, ClipboardData;
import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:material_ui/material_ui.dart';

import '../../email/mailcow_dienst.dart';
import 'aliase_teil.dart' show mitgliederAlias;

class ZustelllisteTeil extends StatefulWidget {
  const ZustelllisteTeil({super.key, required this.dienst});

  final MailcowDienst dienst;

  @override
  State<ZustelllisteTeil> createState() => _ZustelllisteTeilState();
}

class _ZustelllisteTeilState extends State<ZustelllisteTeil> {
  var _gleichtAb = false;
  String? _ergebnis;

  Future<void> _kopieren(Zustellliste l) async {
    if (l.adressen.isEmpty) {
      meldung(context, 'Keine Adressen zum Kopieren.');
      return;
    }
    await Clipboard.setData(ClipboardData(text: l.alsText));
    if (mounted) meldung(context, '${l.adressen.length} Adressen kopiert');
  }

  Future<void> _abgleichen(Zustellliste l) async {
    final ja = await nachfragen(
      context,
      titel: '$mitgliederAlias abgleichen?',
      text:
          'Der Alias leitet danach an genau die ${l.adressen.length} Adressen dieser Liste '
          'weiter. Von Hand eingetragene Ziele des Alias gehen dabei verloren.',
      ja: 'Abgleichen',
      gefaehrlich: false,
    );
    if (!ja || !mounted) return;
    setState(() => _gleichtAb = true);
    try {
      final r = await widget.dienst.mitgliederAliasAbgleichen();
      if (!mounted) return;
      final text = '${r.alias} ${r.neu ? 'angelegt' : 'aktualisiert'}: ${r.empfaenger} Empfänger.';
      setState(() => _ergebnis = text);
      meldung(context, text);
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _gleichtAb = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return LadeAnsicht<Zustellliste>(
      laden: widget.dienst.zustellliste,
      bauen: (context, l, _) {
        final t = Theme.of(context);
        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: mitSystemleiste(context, const EdgeInsets.fromLTRB(16, 12, 16, 24)),
          children: [
            Text(
              '${l.adressen.length} Adressen mit E-Mail-Zustellung',
              key: const Key('zustellung-anzahl'),
              style: t.textTheme.titleMedium,
            ),
            Text(
              'Ohne Ausgetretene und Verstorbene; Versand-E-Mail vor Haupt-E-Mail.',
              style: t.textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                OutlinedButton.icon(
                  key: const Key('zustellung-kopieren'),
                  onPressed: () => _kopieren(l),
                  icon: const Icon(Icons.copy),
                  label: const Text('Alle Adressen kopieren'),
                ),
                FilledButton.tonalIcon(
                  key: const Key('zustellung-abgleichen'),
                  onPressed: _gleichtAb || l.adressen.isEmpty ? null : () => _abgleichen(l),
                  icon: _gleichtAb
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.sync),
                  label: const Text('Alias mitglieder@ abgleichen'),
                ),
              ],
            ),
            if (_ergebnis != null) ...[
              const SizedBox(height: 8),
              Text(_ergebnis!, style: t.textTheme.bodyMedium?.copyWith(color: FwvFarben.gruen)),
            ],
            const SizedBox(height: 12),
            for (final (i, e) in l.empfaenger.indexed) ...[
              if (i > 0) const Divider(height: 1),
              ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                dense: true,
                title: Text(e.name.isEmpty ? '(ohne Name)' : e.name),
                subtitle: SelectableText(e.email),
                trailing: e.status == null ? null : Text(e.status!, style: t.textTheme.bodySmall),
              ),
            ],
          ],
        );
      },
    );
  }
}
