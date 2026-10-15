// Geraete und Versionen im Vorstand-Bereich: welches Mitglied hat welche
// App-Version auf welchem Geraet (GET /vorstand/app-geraete)? Gruppiert nach
// Version, neuste zuerst; veraltete markiert; Filter "Nur veraltete" und
// Suche (Name, Modell, Version) - beides ohne neuen Abruf. Auf breiten
// Bildschirmen die Karten in Spalten ([KartenSpalten]).

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';
import '../geraete/app_geraete.dart';
import '../zeit.dart';

class GeraeteAnsicht extends StatefulWidget {
  const GeraeteAnsicht({super.key, required this.dienste, this.jetzt = DateTime.now});

  final VorstandDienste dienste;

  /// Fuer "vor 3 Tagen" (in Tests fest).
  final DateTime Function() jetzt;

  @override
  State<GeraeteAnsicht> createState() => _GeraeteAnsichtState();
}

class _GeraeteAnsichtState extends State<GeraeteAnsicht> with AutomaticKeepAliveClientMixin {
  final _suche = TextEditingController();
  bool _nurVeraltete = false;

  @override
  bool get wantKeepAlive => true;

  @override
  void dispose() {
    _suche.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final kopf = mitSystemleiste(
      context,
      const EdgeInsets.fromLTRB(12, 12, 12, 0),
      maxBreite: kartenBreite,
    ).copyWith(bottom: 4);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: kopf,
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: TextField(
                  key: const Key('geraete-suche'),
                  controller: _suche,
                  textInputAction: TextInputAction.search,
                  onChanged: (_) => setState(() {}),
                  decoration: InputDecoration(
                    isDense: true,
                    prefixIcon: const Icon(Icons.search),
                    hintText: 'Name, Modell oder Version',
                    border: const OutlineInputBorder(),
                    suffixIcon: _suche.text.isEmpty
                        ? null
                        : IconButton(
                            tooltip: 'Suche leeren',
                            icon: const Icon(Icons.clear),
                            onPressed: () => setState(_suche.clear),
                          ),
                  ),
                ),
              ),
              FilterChip(
                key: const Key('nur-veraltete'),
                label: const Text('Nur veraltete'),
                selected: _nurVeraltete,
                onSelected: (v) => setState(() => _nurVeraltete = v),
              ),
            ],
          ),
        ),
        Expanded(
          child: LadeAnsicht<AppGeraeteStand>(
            laden: () => widget.dienste.appGeraete.laden(),
            istLeer: (s) => s.alle.isEmpty,
            leer: 'Noch kein Gerät hat sich gemeldet.',
            bauen: (context, stand, _) => _liste(context, stand),
          ),
        ),
      ],
    );
  }

  Widget _liste(BuildContext context, AppGeraeteStand stand) {
    final t = Theme.of(context);
    final gruppen = nachVersion(stand, nurVeraltete: _nurVeraltete, suche: _suche.text);
    final anzahl = gruppen.fold(0, (n, g) => n + g.geraete.length);
    final jetzt = widget.jetzt();
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: mitSystemleiste(
        context,
        const EdgeInsets.fromLTRB(12, 4, 12, 24),
        maxBreite: kartenBreite,
      ),
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 4, 4, 0),
          child: Text(
            _neusteText(stand),
            key: const Key('neuste-version'),
            style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant),
          ),
        ),
        if (gruppen.isEmpty)
          Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              _nurVeraltete && _suche.text.trim().isEmpty
                  ? 'Alle Geräte sind auf dem neusten Stand.'
                  : 'Keine Geräte zu dieser Suche.',
              textAlign: TextAlign.center,
            ),
          ),
        for (final g in gruppen) ...[
          _GruppenKopf(gruppe: g, neuste: g.build != null && g.build == stand.neusteBuild),
          KartenSpalten(
            children: [for (final geraet in g.geraete) GeraetKarte(geraet: geraet, jetzt: jetzt)],
          ),
        ],
        if (anzahl > 0)
          Padding(
            padding: const EdgeInsets.only(top: 16),
            child: Text(
              anzahl == 1 ? '1 Gerät' : '$anzahl Geräte',
              textAlign: TextAlign.center,
              style: t.textTheme.bodySmall,
            ),
          ),
      ],
    );
  }

  String _neusteText(AppGeraeteStand s) {
    final v = s.neusteVersion;
    if (v == null) return 'Neuste Version noch unbekannt.';
    return switch (s.herkunft) {
      'env' => 'Neuste Version: $v (eingestellt auf dem Server).',
      _ => 'Neuste Version: $v (höchste von einem Android-Gerät gemeldete).',
    };
  }
}

class _GruppenKopf extends StatelessWidget {
  const _GruppenKopf({required this.gruppe, required this.neuste});

  final VersionsGruppe gruppe;
  final bool neuste;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final n = gruppe.geraete.length;
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 20, 4, 8),
      child: Wrap(
        spacing: 8,
        runSpacing: 4,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          Text(
            gruppe.titel,
            key: Key('gruppe-${gruppe.titel}'),
            style: t.textTheme.titleSmall?.copyWith(color: t.colorScheme.primary),
          ),
          Text(n == 1 ? '1 Gerät' : '$n Geräte', style: t.textTheme.bodySmall),
          if (neuste) const HinweisChip('neuste', art: HinweisArt.gut),
          if (!neuste && gruppe.veraltet) const HinweisChip('veraltet', art: HinweisArt.schlecht),
        ],
      ),
    );
  }
}

/// Ein Geraet: Name, Plattform und Quelle, Modell/Betriebssystem, Version,
/// zuletzt gesehen.
class GeraetKarte extends StatelessWidget {
  const GeraetKarte({super.key, required this.geraet, required this.jetzt});

  final AppGeraet geraet;
  final DateTime jetzt;

  IconData get _symbol => switch (geraet.plattform) {
    'android' || 'ios' => Icons.smartphone_outlined,
    'web' => Icons.language,
    'windows' || 'macos' || 'linux' => Icons.computer_outlined,
    _ => Icons.devices_other_outlined,
  };

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final g = geraet;
    final leise = t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant);
    final details = [?g.modell, ?g.os].join(' · ');
    final zuletzt = g.zuletzt;
    return Card(
      key: Key('geraet-${g.mitgliedId}-${g.plattform}-${g.version}'),
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(_symbol, color: t.colorScheme.onSurfaceVariant),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(g.name, style: t.textTheme.titleSmall, overflow: TextOverflow.ellipsis),
                  Text(g.herkunftText),
                  if (details.isNotEmpty)
                    Text(details, style: leise, maxLines: 2, overflow: TextOverflow.ellipsis),
                  if (zuletzt != null)
                    Tooltip(
                      message: 'Zuletzt: ${_datum(zuletzt)}',
                      child: Text(vorZeit(zuletzt, jetzt), style: leise),
                    ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            HinweisChip(
              g.ohneMeldung ? 'unbekannt' : (g.version ?? '?'),
              art: g.istVeraltet ? HinweisArt.schlecht : HinweisArt.neutral,
            ),
          ],
        ),
      ),
    );
  }

  static String _datum(DateTime z) =>
      '${z.day}.${z.month}.${z.year} ${z.hour.toString().padLeft(2, '0')}:'
      '${z.minute.toString().padLeft(2, '0')}';
}
