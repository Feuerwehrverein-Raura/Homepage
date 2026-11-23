// Kleine Bausteine der Nachricht-Ansicht: Karte mit Titel, Hinweis, Zahlen
// pro Kanal, E-Mail-Vorschau, Ergebnis eines Versands.

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:material_ui/material_ui.dart';

import '../../versand/versand.dart';
import '../../versand/versand_dienst.dart';

class Karte extends StatelessWidget {
  const Karte({super.key, required this.titel, required this.kinder, this.aktion});

  final String titel;
  final List<Widget> kinder;

  /// Rechts neben dem Titel (z.B. Neu laden).
  final Widget? aktion;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(child: Text(titel, style: t.textTheme.titleMedium)),
                ?aktion,
              ],
            ),
            const SizedBox(height: 8),
            ...kinder,
          ],
        ),
      ),
    );
  }
}

/// Gelber Hinweis mit Symbol.
class Hinweis extends StatelessWidget {
  const Hinweis({super.key, required this.text, this.art = HinweisArt.warnung});

  final String text;
  final HinweisArt art;

  @override
  Widget build(BuildContext context) {
    final (hinten, vorne) = hinweisFarben(context, art);
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: hinten, borderRadius: BorderRadius.circular(8)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            art == HinweisArt.warnung ? Icons.warning_amber : Icons.info_outline,
            size: 18,
            color: vorne,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text, style: TextStyle(color: vorne)),
          ),
        ],
      ),
    );
  }
}

/// "12 gewählt · 9 per E-Mail · 3 per Brief (ca. CHF 3.00) · 1 nicht erreichbar"
class VersandZahlen extends StatelessWidget {
  const VersandZahlen({super.key, required this.gewaehlt, required this.plan});

  final int gewaehlt;
  final Versandplan plan;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        HinweisChip('$gewaehlt gewählt'),
        if (plan.art != Versandart.post)
          HinweisChip(
            '${plan.email.length} per E-Mail',
            art: plan.email.isEmpty ? HinweisArt.neutral : HinweisArt.gut,
          ),
        if (plan.art != Versandart.email)
          HinweisChip(
            '${anzahl(plan.post.length, 'Brief', 'Briefe')}'
            '${plan.post.isEmpty ? '' : ' · ca. ${franken(plan.kosten)}'}',
            art: plan.post.isEmpty ? HinweisArt.neutral : HinweisArt.warnung,
          ),
        if (plan.ohne.isNotEmpty)
          HinweisChip('${plan.ohne.length} nicht erreichbar', art: HinweisArt.schlecht),
      ],
    );
  }
}

/// Ergebnis eines Versands (E-Mail, Brief, PDF).
class VersandErgebnisKarte extends StatelessWidget {
  const VersandErgebnisKarte({super.key, required this.ergebnis, required this.schliessen});

  final VersandErgebnis ergebnis;
  final VoidCallback schliessen;

  @override
  Widget build(BuildContext context) {
    final e = ergebnis;
    final gut = e.fehler.isEmpty && !e.abgebrochen;
    final (hinten, vorne) = hinweisFarben(context, gut ? HinweisArt.gut : HinweisArt.warnung);
    final zeilen = [
      if (e.emails > 0) '${anzahl(e.emails, 'E-Mail', 'E-Mails')} gesendet',
      if (e.emailsUebersprungen > 0) '${e.emailsUebersprungen} ohne E-Mail übersprungen',
      if (e.briefe > 0)
        '${anzahl(e.briefe, 'Brief', 'Briefe')} an Pingen${e.staging ? ' (Staging, Test)' : ''}',
      if (e.emails == 0 && e.briefe == 0) 'Nichts gesendet.',
      if (e.abgebrochen) 'Abgebrochen: keine Verbindung. Der Rest ging NICHT raus.',
    ];
    return Card(
      key: const Key('versand-ergebnis'),
      color: hinten,
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 8, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(gut ? Icons.check_circle : Icons.warning_amber, color: vorne),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    gut ? 'Versand abgeschlossen' : 'Versand mit Problemen',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(color: vorne),
                  ),
                ),
                IconButton(
                  tooltip: 'Ausblenden',
                  icon: const Icon(Icons.close),
                  onPressed: schliessen,
                ),
              ],
            ),
            for (final z in zeilen) Text(z),
            if (e.fehler.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text('Fehlgeschlagen (${e.fehler.length}):', style: TextStyle(color: vorne)),
              for (final f in e.fehler.take(20)) Text('• ${f.name}: ${f.grund}'),
              if (e.fehler.length > 20) Text('… und ${e.fehler.length - 20} weitere'),
            ],
          ],
        ),
      ),
    );
  }
}
