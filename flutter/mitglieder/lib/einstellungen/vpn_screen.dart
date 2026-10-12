// Mehr -> Konto -> "VPN-Zugang": WireGuard-Zugaenge zur Selbstbedienung,
// wie im Mitgliederbereich der Webseite (mein.html). Die App spricht nur
// mit api-members (/members/me/vpn); die WireGuard-Schnittstelle des
// Servers bedient dort wg-agent.
//
// Die Konfiguration enthaelt den privaten Schluessel und kommt genau EINMAL,
// direkt nach dem Anlegen. Auf dem Handy wird sie nicht als QR-Code gezeigt
// (das eigene Display kann man nicht scannen), sondern ueber das
// Teilen-Menue an die WireGuard-App gegeben.

import 'dart:convert';

import 'package:fwv_anlass/fwv_anlass.dart'
    show LadeAnsicht, LadeAnsichtState, fehlerText, meldung, nachfragen, mitSystemleiste;
import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';

class VpnZugang {
  const VpnZugang({required this.name, required this.geraet, this.adresse, this.zuletzt});

  factory VpnZugang.ausJson(Map<String, dynamic> j) => VpnZugang(
    name: '${j['name']}',
    geraet: '${j['geraet']}',
    adresse: j['adresse']?.toString(),
    zuletzt: DateTime.tryParse('${j['zuletzt']}')?.toLocal(),
  );

  /// Voller Name beim Server (mit Praefix des Mitglieds) - zum Entfernen.
  final String name;
  final String geraet;
  final String? adresse;

  /// Letzte Verbindung; null = noch nie verbunden.
  final DateTime? zuletzt;
}

class NeuerVpnZugang {
  const NeuerVpnZugang({required this.geraet, required this.konfiguration});

  final String geraet;

  /// WireGuard-Konfiguration samt privatem Schluessel - nur jetzt verfuegbar.
  final String konfiguration;
}

/// Die einzige Stelle, die die Routen kennt.
class VpnDienst {
  const VpnDienst(this.api);

  final ApiClient api;

  Future<List<VpnZugang>> liste() async {
    final json = await api.get('members/me/vpn');
    return json is List
        ? [
            for (final z in json)
              if (z is Map) VpnZugang.ausJson(Map<String, dynamic>.from(z)),
          ]
        : const [];
  }

  Future<NeuerVpnZugang> anlegen(String geraet) async {
    final json = await api.post('members/me/vpn', daten: {'geraet': geraet});
    if (json is! Map || json['konfiguration'] == null) {
      throw const FormatException('Der Server hat keine Konfiguration geliefert.');
    }
    return NeuerVpnZugang(geraet: '${json['geraet']}', konfiguration: '${json['konfiguration']}');
  }

  Future<void> entfernen(String name) => api.delete('members/me/vpn/${Uri.encodeComponent(name)}');
}

/// Wie das Backend: Kleinbuchstaben, Ziffern, Bindestriche, 2 bis 20 Zeichen.
String vpnGeraetename(String eingabe) => eingabe
    .trim()
    .toLowerCase()
    .replaceAll(RegExp(r'[^a-z0-9-]'), '-')
    .replaceAll(RegExp(r'-+'), '-')
    .replaceAll(RegExp(r'^-|-$'), '');

class VpnScreen extends StatefulWidget {
  const VpnScreen({super.key, required this.dienste});

  final Dienste dienste;

  @override
  State<VpnScreen> createState() => _VpnScreenState();
}

class _VpnScreenState extends State<VpnScreen> {
  final _ansicht = GlobalKey<LadeAnsichtState<List<VpnZugang>>>();
  late final _vpn = VpnDienst(widget.dienste.sitzung.api);
  final _geraet = TextEditingController();
  bool _legtAn = false;
  NeuerVpnZugang? _neu;

  @override
  void dispose() {
    _geraet.dispose();
    super.dispose();
  }

  Future<void> _anlegen() async {
    final g = vpnGeraetename(_geraet.text);
    if (g.length < 2 || g.length > 20) {
      meldung(context, 'Gerätename: 2 bis 20 Zeichen, Buchstaben und Ziffern.');
      return;
    }
    setState(() => _legtAn = true);
    try {
      final neu = await _vpn.anlegen(g);
      if (!mounted) return;
      setState(() {
        _neu = neu;
        _geraet.clear();
      });
      await _ansicht.currentState?.neuLaden();
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _legtAn = false);
    }
  }

  Future<void> _teilen(NeuerVpnZugang n) async {
    await widget.dienste.dateiTeilen(
      utf8.encode(n.konfiguration),
      'fwv-${n.geraet}.conf',
      'application/octet-stream',
    );
  }

  Future<void> _entfernen(VpnZugang z) async {
    final ja = await nachfragen(
      context,
      titel: '„${z.geraet}“ entfernen?',
      text: 'Das Gerät kommt danach nicht mehr ins Vereinsnetz.',
      ja: 'Entfernen',
    );
    if (!ja) return;
    try {
      await _vpn.entfernen(z.name);
      await _ansicht.currentState?.neuLaden();
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final neu = _neu;
    return Scaffold(
      appBar: AppBar(title: const Text('VPN-Zugang')),
      body: LadeAnsicht<List<VpnZugang>>(
        key: _ansicht,
        laden: _vpn.liste,
        bauen: (context, liste, _) => ListView(
          padding: mitSystemleiste(context, const EdgeInsets.fromLTRB(16, 16, 16, 24)),
          children: [
            const Text(
              'Verbindet dein Gerät mit dem Vereinsnetz – für die Dateiablage und das Netz '
              'im Roten Schopf. Durch den Tunnel läuft nur Vereinsverkehr; dein übriges '
              'Surfen bleibt unberührt.',
            ),
            if (neu != null) ...[
              const SizedBox(height: 16),
              Card(
                color: Theme.of(context).colorScheme.tertiaryContainer,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Jetzt einrichten: „${neu.geraet}“',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Die Konfiguration wird aus Sicherheitsgründen nur jetzt angezeigt. '
                        'WireGuard-App installieren, dann hier „In WireGuard öffnen“ und die '
                        'WireGuard-App wählen. Wer sie verliert, legt einfach einen neuen Zugang an.',
                      ),
                      const SizedBox(height: 12),
                      FilledButton.icon(
                        onPressed: () => _teilen(neu),
                        icon: const Icon(Icons.vpn_key_outlined),
                        label: const Text('In WireGuard öffnen'),
                      ),
                    ],
                  ),
                ),
              ),
            ],
            const SizedBox(height: 16),
            Text('Deine Geräte', style: Theme.of(context).textTheme.titleMedium),
            if (liste.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: Text('Noch kein Gerät verbunden.'),
              ),
            for (final z in liste)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.devices),
                title: Text(z.geraet),
                subtitle: Text(
                  [
                    ?z.adresse,
                    z.zuletzt == null
                        ? 'noch nie verbunden'
                        : 'zuletzt ${schweizerDatum(z.zuletzt!)}',
                  ].join(' · '),
                ),
                trailing: IconButton(
                  tooltip: 'Entfernen',
                  icon: const Icon(Icons.delete_outline),
                  onPressed: () => _entfernen(z),
                ),
              ),
            const SizedBox(height: 16),
            TextField(
              controller: _geraet,
              maxLength: 20,
              decoration: const InputDecoration(labelText: 'Gerätename, z.B. handy'),
            ),
            FilledButton(
              onPressed: _legtAn ? null : _anlegen,
              child: Text(_legtAn ? 'Wird erstellt …' : 'Zugang erstellen'),
            ),
          ],
        ),
      ),
    );
  }
}
