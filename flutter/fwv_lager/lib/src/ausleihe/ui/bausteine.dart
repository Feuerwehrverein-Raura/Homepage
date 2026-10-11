// Bausteine der Ausleihe-Screens: Karte einer Ausleihe, kleiner
// Mengen-Waehler, Bild einer Ausleihe.

import 'package:fwv_anlass/fwv_anlass.dart' show StatusChip;
import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../modelle.dart';
import '../zugang.dart';

/// "12.10.2026 – 14.10.2026" fuer einen gewaehlten Zeitraum (Anzeige vor
/// dem Laden; danach zeigt die App den Text des Backends).
String zeitraumAnzeige(DateTimeRange z) => isoDatum(z.start) == isoDatum(z.end)
    ? schweizerDatum(z.start)
    : '${schweizerDatum(z.start)} – ${schweizerDatum(z.end)}';

/// Eine Ausleihe in Listen: Zeitraum, Status, Positionen, Hinweis; mit
/// [zeigeAusleiher] auch wer (fuer das Lager).
class AusleiheKarte extends StatelessWidget {
  const AusleiheKarte({super.key, required this.ausleihe, this.zeigeAusleiher = false, this.onTap});

  final Ausleihe ausleihe;
  final bool zeigeAusleiher;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final a = ausleihe;
    final t = Theme.of(context);
    final klein = t.textTheme.bodySmall?.copyWith(color: t.colorScheme.outline);
    return Card(
      key: Key('ausleihe-${a.id}'),
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      zeigeAusleiher
                          ? (a.app.ausleiherText ?? 'Ausleihe #${a.id}')
                          : (a.app.zeitraumText ?? 'Ausleihe #${a.id}'),
                      style: t.textTheme.titleMedium,
                    ),
                  ),
                  const SizedBox(width: 8),
                  StatusChip(text: a.app.statusText ?? a.status.wert, farbe: a.app.statusFarbe),
                ],
              ),
              if (zeigeAusleiher && a.app.zeitraumText != null)
                Text(a.app.zeitraumText!, style: t.textTheme.bodyMedium),
              const SizedBox(height: 4),
              Text(a.positionenText, maxLines: 3, overflow: TextOverflow.ellipsis),
              if (a.app.hinweis != null) ...[
                const SizedBox(height: 4),
                Text(
                  a.app.hinweis!,
                  style: a.app.ueberfaellig
                      ? t.textTheme.bodySmall?.copyWith(color: t.colorScheme.error)
                      : klein,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// − Menge + (0 bis [max]); kompakt fuer Listen.
class MengenWaehler extends StatelessWidget {
  const MengenWaehler({
    super.key,
    required this.wert,
    required this.max,
    required this.aendern,
    this.min = 0,
    this.schluessel,
  });

  final int wert;
  final int min;
  final int max;
  final ValueChanged<int> aendern;

  /// Fuer Tests: Schluessel-Praefix ("menge-2" -> "menge-2-plus").
  final String? schluessel;

  @override
  Widget build(BuildContext context) {
    final s = schluessel;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        IconButton(
          key: s == null ? null : Key('$s-minus'),
          visualDensity: VisualDensity.compact,
          onPressed: wert > min ? () => aendern(wert - 1) : null,
          icon: const Icon(Icons.remove_circle_outline),
          tooltip: 'Weniger',
        ),
        SizedBox(
          width: 36,
          child: Text(
            '$wert',
            key: s == null ? null : Key('$s-wert'),
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium,
          ),
        ),
        IconButton(
          key: s == null ? null : Key('$s-plus'),
          visualDensity: VisualDensity.compact,
          onPressed: wert < max ? () => aendern(wert + 1) : null,
          icon: const Icon(Icons.add_circle_outline),
          tooltip: 'Mehr',
        ),
      ],
    );
  }
}

/// Foto einer Ausleihe (Schaden), mit dem Token der App geladen.
class AusleiheBild extends StatelessWidget {
  const AusleiheBild({super.key, required this.ausleihen, required this.pfad, this.groesse = 88});

  final Ausleihen ausleihen;
  final String? pfad;
  final double groesse;

  @override
  Widget build(BuildContext context) {
    final adresse = ausleihen.zugang.bildAdresse(pfad);
    final leer = Container(
      width: groesse,
      height: groesse,
      color: Theme.of(context).colorScheme.outlineVariant,
      child: const Icon(Icons.image_outlined),
    );
    if (adresse == null) return leer;
    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: Image.network(
        adresse.toString(),
        headers: ausleihen.zugang.bildKopfzeilen(adresse),
        width: groesse,
        height: groesse,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => leer,
      ),
    );
  }
}
