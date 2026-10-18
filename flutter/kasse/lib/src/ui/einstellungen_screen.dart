// Einstellungen wie in der Web-Kasse (SettingsView): Geraetecode, Anmeldebon,
// Bar-Licht, Tischkarten, Bondrucker (Bar/Kueche, Testdruck), Anlass und
// TWINT-QR, Kacheln (Reihenfolge, meistverkauft zuerst), Speichern, Abmelden.
// Als Reiter in der Kasse eingebettet (kasse_screen.dart).
import 'package:flutter/material.dart';

import '../kasse_api.dart';
import '../protokoll.dart';
import 'anmeldung.dart' show knopfRot;

class EinstellungenScreen extends StatefulWidget {
  const EinstellungenScreen({
    super.key,
    required this.api,
    required this.version,
    required this.updatePruefen,
    required this.abmelden,
    required this.gespeichert,
  });
  final KasseApi api;
  final String? version;
  final VoidCallback updatePruefen;
  final VoidCallback abmelden;
  /// Nach dem Speichern (Kacheln neu ordnen, Anlass neu laden)
  final VoidCallback gespeichert;

  @override
  State<EinstellungenScreen> createState() => _EinstellungenScreenState();
}

class _EinstellungenScreenState extends State<EinstellungenScreen> {
  KasseApi get api => widget.api;
  Map<String, String> _werte = {};
  final Map<String, TextEditingController> _felder = {};
  bool _laedt = true;
  bool _speichert = false;
  bool? _barlicht;
  Map<String, dynamic>? _anlass;
  List<Map<String, dynamic>> _anlaesse = [];
  final _kartenVon = TextEditingController(text: '1');
  final _kartenBis = TextEditingController(text: '20');

  static const _textFelder = [
    'printer_bar_ip', 'printer_bar_port', 'printer_kitchen_ip', 'printer_kitchen_port', 'kategorien_reihenfolge',
  ];

  @override
  void initState() {
    super.initState();
    _laden();
  }

  @override
  void dispose() {
    for (final c in _felder.values) {
      c.dispose();
    }
    _kartenVon.dispose();
    _kartenBis.dispose();
    super.dispose();
  }

  Future<void> _laden() async {
    final werte = await api.einstellungen();
    bool? licht;
    try {
      licht = await api.barlichtLesen();
    } catch (_) {}
    Map<String, dynamic>? anlass;
    var liste = <Map<String, dynamic>>[];
    try {
      final (stand, l) = await api.anlassStand();
      anlass = stand;
      liste = l;
    } catch (_) {}
    if (!mounted) return;
    setState(() {
      _werte = {
        'printer_bar_protocol': 'epos',
        'printer_kitchen_protocol': 'epos',
        'printer_bar_port': '9100',
        'printer_kitchen_port': '9100',
        ...werte,
      };
      for (final k in _textFelder) {
        (_felder[k] ??= TextEditingController()).text = _werte[k] ?? '';
      }
      _barlicht = licht;
      _anlass = anlass;
      _anlaesse = liste;
      _laedt = false;
    });
  }

  void _meldung(String t, {bool fehler = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t), backgroundColor: fehler ? knopfRot : null));
  }

  Future<void> _mit(Future<void> Function() f) async {
    try {
      await f();
    } on KasseFehler catch (e) {
      _meldung(e.meldung, fehler: true);
    }
  }

  Future<void> _speichern() async {
    setState(() => _speichert = true);
    for (final k in _textFelder) {
      _werte[k] = _felder[k]!.text.trim();
    }
    await _mit(() async {
      await api.einstellungenSpeichern(_werte);
      protokoll('einstellungen_gespeichert');
      _meldung('Einstellungen gespeichert');
      widget.gespeichert();
    });
    if (mounted) setState(() => _speichert = false);
  }

  // ---- Bausteine -------------------------------------------------------------
  Widget _karte(String titel, List<Widget> inhalt, {String? text}) => Card(
        margin: const EdgeInsets.only(bottom: 12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(titel, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.bold)),
            if (text != null) ...[
              const SizedBox(height: 4),
              Text(text, style: const TextStyle(color: Colors.black54)),
            ],
            const SizedBox(height: 12),
            ...inhalt,
          ]),
        ),
      );

  Widget _feld(String key, String label, {TextInputType? tastatur}) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: TextField(
          controller: _felder[key],
          keyboardType: tastatur,
          onTapOutside: (_) => FocusManager.instance.primaryFocus?.unfocus(),
          decoration: InputDecoration(labelText: label, border: const OutlineInputBorder()),
          style: const TextStyle(fontSize: 18),
        ),
      );

  Widget _drucker(String station, String titel) {
    final p = 'printer_${station}_';
    return _karte(titel, [
      DropdownButtonFormField<String>(
        initialValue: _werte['${p}protocol'] == 'raw' ? 'raw' : 'epos',
        decoration: const InputDecoration(labelText: 'Protokoll', border: OutlineInputBorder()),
        items: const [
          DropdownMenuItem(value: 'epos', child: Text('ePOS-Print (TM-m30III)')),
          DropdownMenuItem(value: 'raw', child: Text('Raw TCP (TM-T20III)')),
        ],
        onChanged: (v) => setState(() => _werte['${p}protocol'] = v ?? 'epos'),
      ),
      const SizedBox(height: 10),
      _feld('${p}ip', 'IP-Adresse', tastatur: TextInputType.url),
      _feld('${p}port', 'Port', tastatur: TextInputType.number),
      OutlinedButton.icon(
        icon: const Icon(Icons.print),
        label: const Text('Testdruck'),
        onPressed: () => _mit(() async {
          await api.testdruck(station, _felder['${p}ip']!.text.trim(), _felder['${p}port']!.text.trim(), _werte['${p}protocol'] ?? 'epos');
          _meldung('Testdruck an ${_felder['${p}ip']!.text.trim()} gesendet');
        }),
      ),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    if (_laedt) return const Center(child: CircularProgressIndicator());
    final anlassTitel = (_anlass?['anlass'] as Map?)?['titel'];
    final auswahl = _anlass?['auswahl'] as String?;
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        _karte('📱 Dieses Gerät', [
          Text('Gerätecode: ${api.geraetCode}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text('Kassen-App ${widget.version ?? '?'} · ${api.lokal ? 'Schopf (T400)' : 'Cloud'}'),
          const SizedBox(height: 12),
          OutlinedButton.icon(icon: const Icon(Icons.system_update), label: const Text('Auf Update prüfen'), onPressed: widget.updatePruefen),
        ]),
        _karte('🎫 Anmeldebon für ein Gerät', text: 'Druckt am Bar-Drucker einen QR-Bon, mit dem sich ein weiteres Gerät einmal als Kasse anmeldet (gilt eine Stunde).', [
          FilledButton.icon(
            icon: const Icon(Icons.print),
            label: const Text('Anmeldebon drucken'),
            onPressed: () => _mit(() async {
              final bis = await api.kassenbonDrucken();
              _meldung(bis == null
                  ? 'Anmeldebon gedruckt'
                  : 'Anmeldebon gedruckt – gilt einmal bis ${bis.hour.toString().padLeft(2, '0')}:${bis.minute.toString().padLeft(2, '0')} Uhr');
            }),
          ),
        ]),
        _karte('💡 Bar-Licht', text: 'Spot 1 und Girlande Bar blinken bei jeder Bar-Bestellung, bis die Bar sie als erledigt markiert.', [
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(_barlicht == null ? 'Zustand unbekannt' : (_barlicht! ? 'Eingeschaltet' : 'Ausgeschaltet'),
                style: const TextStyle(fontSize: 18)),
            value: _barlicht ?? false,
            onChanged: _barlicht == null
                ? null
                : (an) => _mit(() async {
                      await api.barlichtSetzen(an);
                      protokoll('barlicht_schalter', meldung: an ? 'an' : 'aus');
                      setState(() => _barlicht = an);
                    }),
          ),
        ]),
        _karte('🪑 Tischkarten drucken', text: 'Je Tisch eine Karte mit grosser Nummer am Bar-Drucker. Nur im Schopf-WLAN.', [
          Row(children: [
            Expanded(child: TextField(controller: _kartenVon, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'von', border: OutlineInputBorder()))),
            const SizedBox(width: 12),
            Expanded(child: TextField(controller: _kartenBis, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'bis', border: OutlineInputBorder()))),
          ]),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            icon: const Icon(Icons.print),
            label: const Text('Tischkarten drucken'),
            onPressed: () => _mit(() async {
              final a = int.tryParse(_kartenVon.text.trim());
              final b = int.tryParse(_kartenBis.text.trim()) ?? a;
              if (a == null || b == null) return _meldung('Bitte Tischnummern eingeben', fehler: true);
              final n = await api.tischkartenDrucken(a, b);
              _meldung('$n Tischkarten gedruckt');
            }),
          ),
        ]),
        _drucker('bar', '🖨️ Bondrucker Bar'),
        _drucker('kitchen', '🖨️ Bondrucker Küche'),
        _karte('🎪 Anlass und TWINT-QR', text: 'Bestellungen und TWINT-QR gehören zu diesem Anlass. «Automatisch» nimmt den laufenden.', [
          if (anlassTitel != null) Text('Jetzt: $anlassTitel', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            initialValue: auswahl ?? '',
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Anlass', border: OutlineInputBorder()),
            items: [
              const DropdownMenuItem(value: '', child: Text('Automatisch')),
              for (final a in _anlaesse)
                DropdownMenuItem(value: '${a['id']}', child: Text('${a['titel']}', overflow: TextOverflow.ellipsis)),
              if (auswahl != null && auswahl.isNotEmpty && !_anlaesse.any((a) => '${a['id']}' == auswahl))
                DropdownMenuItem(value: auswahl, child: Text('${anlassTitel ?? auswahl}')),
            ],
            onChanged: (v) => _mit(() async {
              await api.anlassWaehlen(v == null || v.isEmpty ? null : v);
              protokoll('anlass_gewaehlt', meldung: v);
              await _laden();
              widget.gespeichert();
            }),
          ),
        ]),
        _karte('🧾 Kacheln der Kasse', text: 'Reihenfolge der Kategorien, durch Komma getrennt (z.B. Essen, Getränke, Weinkarte).', [
          _feld('kategorien_reihenfolge', 'Reihenfolge der Kategorien'),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Meistverkaufte Artikel zuerst', style: TextStyle(fontSize: 17)),
            value: _werte['meistverkauft_zuerst'] == 'true',
            onChanged: (v) => setState(() => _werte['meistverkauft_zuerst'] = v ? 'true' : 'false'),
          ),
        ]),
        SizedBox(
          height: 60,
          child: FilledButton(
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFF16A34A)),
            onPressed: _speichert ? null : _speichern,
            child: Text(_speichert ? 'Speichert…' : '💾 Einstellungen speichern', style: const TextStyle(fontSize: 19, fontWeight: FontWeight.bold)),
          ),
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 52,
          child: OutlinedButton(
            style: OutlinedButton.styleFrom(foregroundColor: knopfRot),
            onPressed: widget.abmelden,
            child: const Text('Abmelden'),
          ),
        ),
        const SizedBox(height: 24),
      ],
    );
  }
}
