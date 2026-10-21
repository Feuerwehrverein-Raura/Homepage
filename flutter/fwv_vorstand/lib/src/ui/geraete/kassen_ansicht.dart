// Kassen im Bereich "Geraete" (vorstand.html, App-QR-Fenster): Anmeldebon
// fuer ein Kassen-/Kuechengeraet drucken, Freigabe durchsetzen ein/aus und
// die Kassen-Geraete freigeben, sperren, umbenennen. Daten:
// [KassenGeraeteDienst].

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:material_ui/material_ui.dart';

import '../../dienste.dart';
import '../../geraete/kassen_geraete.dart';
import '../../zeit.dart';

class KassenAnsicht extends StatefulWidget {
  const KassenAnsicht({super.key, required this.dienste, this.jetzt = DateTime.now});

  final VorstandDienste dienste;
  final DateTime Function() jetzt;

  @override
  State<KassenAnsicht> createState() => _KassenAnsichtState();
}

class _KassenAnsichtState extends State<KassenAnsicht> {
  final _lader = GlobalKey<LadeAnsichtState<KassenGeraeteStand>>();
  var _druckt = false;
  String? _bonMeldung;

  KassenGeraeteDienst get _d => widget.dienste.kassenGeraete;

  Future<void> _neuLaden() async => _lader.currentState?.neuLaden();

  Future<void> _bonDrucken() async {
    setState(() {
      _druckt = true;
      _bonMeldung = null;
    });
    try {
      final bon = await _d.anmeldebon();
      final bis = bon.giltBis;
      final gilt = bis == null
          ? 'gilt einmal, eine Stunde.'
          : 'gilt einmal bis ${_uhrzeit(bis)} Uhr.';
      _bonMeldung = bon.warteschlange
          ? 'Bon geht an den Bar-Drucker im Schopf (kommt in wenigen Sekunden) – $gilt'
          : 'Bon gedruckt – $gilt';
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _druckt = false);
    }
  }

  Future<void> _tun(Future<void> Function() aktion, String erfolg) async {
    try {
      await aktion();
      if (mounted) meldung(context, erfolg);
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    }
    await _neuLaden();
  }

  Future<void> _freigabeSetzen(bool an) async {
    if (an) {
      final ok = await nachfragen(
        context,
        titel: 'Freigabe einschalten?',
        text:
            'Danach können nur freigegebene Geräte buchen und bezahlen. '
            'Die Küche ist nicht betroffen.',
        ja: 'Einschalten',
        gefaehrlich: false,
      );
      if (!ok) return;
    }
    await _tun(
      () => _d.freigabeSetzen(an: an),
      an
          ? 'Freigabe ist eingeschaltet.'
          : 'Freigabe ist ausgeschaltet – alle Geräte dürfen buchen.',
    );
  }

  Future<void> _umbenennen(KassenGeraet g) async {
    final name = await showDialog<String>(
      context: context,
      builder: (_) => _NameDialog(name: g.name ?? ''),
    );
    if (name == null || name.trim().isEmpty) return;
    await _tun(() => _d.umbenennen(g.id, name), 'Umbenannt in «${name.trim()}».');
  }

  @override
  Widget build(BuildContext context) => LadeAnsicht<KassenGeraeteStand>(
    key: _lader,
    laden: _d.laden,
    bauen: (context, stand, _) => _inhalt(context, stand),
  );

  Widget _inhalt(BuildContext context, KassenGeraeteStand stand) {
    final t = Theme.of(context);
    final leise = t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant);
    final jetzt = widget.jetzt();
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: mitSystemleiste(
        context,
        const EdgeInsets.fromLTRB(12, 4, 12, 24),
        maxBreite: kartenBreite,
      ),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Kasse/Küche-Gerät anmelden', style: t.textTheme.titleMedium),
                const SizedBox(height: 4),
                const Text(
                  'Druckt am Bondrucker einen QR-Bon. Das Gerät scannt ihn bei «QR-Code» '
                  'und ist als Kasse angemeldet. Gilt einmal, eine Stunde.',
                ),
                const SizedBox(height: 12),
                FilledButton.icon(
                  key: const Key('kassenbon-drucken'),
                  onPressed: _druckt ? null : _bonDrucken,
                  icon: const Icon(Icons.print_outlined),
                  label: Text(_druckt ? 'Druckt …' : 'Anmeldebon drucken'),
                ),
                if (_bonMeldung case final m?)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(m, key: const Key('kassenbon-meldung')),
                  ),
              ],
            ),
          ),
        ),
        Card(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SwitchListTile(
                key: const Key('freigabe-durchsetzen'),
                title: const Text('Freigabe durchsetzen'),
                subtitle: const Text(
                  'Ist sie an, können nur freigegebene Geräte buchen und bezahlen. '
                  'Den Gerätecode zeigt die Kassen-App im Menü ⋮, die Web-Kasse unter '
                  'Einstellungen.',
                ),
                value: stand.freigabeAn,
                onChanged: _freigabeSetzen,
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 16, 4, 8),
          child: Text(
            stand.geraete.length == 1 ? '1 Kassen-Gerät' : '${stand.geraete.length} Kassen-Geräte',
            style: t.textTheme.titleSmall?.copyWith(color: t.colorScheme.primary),
          ),
        ),
        if (stand.geraete.isEmpty)
          const Padding(
            padding: EdgeInsets.all(16),
            child: Text('Noch keine Geräte gemeldet.', textAlign: TextAlign.center),
          ),
        KartenSpalten(
          children: [
            for (final g in stand.geraete)
              Card(
                key: Key('kasse-${g.id}'),
                margin: const EdgeInsets.symmetric(vertical: 4),
                child: ListTile(
                  leading: Icon(
                    g.typ == 'pwa' ? Icons.language : Icons.point_of_sale_outlined,
                    color: t.colorScheme.onSurfaceVariant,
                  ),
                  title: Text(
                    '${g.code} · ${g.name ?? 'Gerät'}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  subtitle: Text(
                    [
                      g.typText,
                      if (g.zuletzt case final z?) 'zuletzt ${vorZeit(z, jetzt)}',
                    ].join(' · '),
                    style: leise,
                  ),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      HinweisChip(
                        g.stand.text,
                        art: switch (g.stand) {
                          KassenGeraetStand.freigegeben => HinweisArt.gut,
                          KassenGeraetStand.gesperrt => HinweisArt.schlecht,
                          KassenGeraetStand.neu => HinweisArt.warnung,
                        },
                      ),
                      PopupMenuButton<String>(
                        key: Key('kasse-menue-${g.id}'),
                        tooltip: 'Aktionen',
                        onSelected: (w) => switch (w) {
                          'freigeben' => _tun(
                            () => _d.freigeben(g.id),
                            '${g.code} ist freigegeben.',
                          ),
                          'sperren' => _tun(() => _d.sperren(g.id), '${g.code} ist gesperrt.'),
                          _ => _umbenennen(g),
                        },
                        itemBuilder: (_) => [
                          if (g.stand != KassenGeraetStand.freigegeben)
                            const PopupMenuItem(value: 'freigeben', child: Text('Freigeben')),
                          if (!g.gesperrt)
                            const PopupMenuItem(value: 'sperren', child: Text('Sperren')),
                          const PopupMenuItem(value: 'umbenennen', child: Text('Umbenennen')),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ],
    );
  }

  static String _uhrzeit(DateTime z) =>
      '${z.hour.toString().padLeft(2, '0')}:${z.minute.toString().padLeft(2, '0')}';
}

class _NameDialog extends StatefulWidget {
  const _NameDialog({required this.name});

  final String name;

  @override
  State<_NameDialog> createState() => _NameDialogState();
}

class _NameDialogState extends State<_NameDialog> {
  late final _feld = TextEditingController(text: widget.name);

  @override
  void dispose() {
    _feld.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Gerät umbenennen'),
    content: TextField(
      key: const Key('kasse-name'),
      controller: _feld,
      autofocus: true,
      maxLength: 80,
      decoration: const InputDecoration(hintText: 'z.B. Kassen-Handy 1'),
      onSubmitted: (v) => Navigator.of(context).pop(v),
    ),
    actions: [
      TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Abbrechen')),
      FilledButton(
        onPressed: () => Navigator.of(context).pop(_feld.text),
        child: const Text('Speichern'),
      ),
    ],
  );
}
