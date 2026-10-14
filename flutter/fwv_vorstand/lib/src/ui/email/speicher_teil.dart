// Speicher aller Postfaecher (GET /mailcow/quota), die vollsten zuerst.

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:material_ui/material_ui.dart';

import '../../email/mailcow_dienst.dart';
import 'postfaecher_teil.dart' show SpeicherBalken;

class SpeicherTeil extends StatelessWidget {
  const SpeicherTeil({super.key, required this.dienst});

  final MailcowDienst dienst;

  @override
  Widget build(BuildContext context) {
    return LadeAnsicht<List<Speicher>>(
      laden: dienst.speicher,
      leer: 'Keine Postfächer gefunden.',
      istLeer: (l) => l.isEmpty,
      bauen: (context, liste, _) {
        final t = Theme.of(context);
        final belegt = liste.fold<num>(0, (s, q) => s + q.belegtBytes);
        final gesamt = liste.fold<num>(0, (s, q) => s + q.quotaBytes);
        final voll = liste.where((q) => q.prozent >= 90).length;
        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: mitSystemleiste(
            context,
            const EdgeInsets.fromLTRB(16, 12, 16, 24),
            maxBreite: 1100,
          ),
          children: [
            Text(
              '${groesseText(belegt)} von ${groesseText(gesamt)} belegt · '
              '${liste.length} Postfächer'
              '${voll > 0 ? ' · $voll fast voll' : ''}',
              key: const Key('speicher-summe'),
              style: t.textTheme.titleSmall,
            ),
            const SizedBox(height: 12),
            KartenSpalten(
              minBreite: 300,
              children: [
                for (final q in liste)
                  Card(
                    key: Key('speicher-${q.adresse}'),
                    margin: const EdgeInsets.only(bottom: 8),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(q.adresse, style: t.textTheme.titleSmall),
                          if (q.name != null) Text(q.name!, style: t.textTheme.bodySmall),
                          const SizedBox(height: 8),
                          SpeicherBalken(anteil: (q.prozent / 100).clamp(0, 1).toDouble()),
                          const SizedBox(height: 4),
                          Text(
                            '${groesseText(q.belegtBytes)} / ${groesseText(q.quotaBytes)} '
                            '(${q.prozent} %)',
                            style: t.textTheme.bodySmall,
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ],
        );
      },
    );
  }
}
