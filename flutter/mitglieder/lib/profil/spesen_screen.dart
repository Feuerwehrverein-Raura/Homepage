// Profil -> "Spesen": eigene Auslagen fuer den Verein abrechnen. Liste mit
// Status (eingereicht, bezahlt, abgelehnt), Beleg ansehen, zurueckziehen,
// und neue Spesen mit Beleg (Foto oder PDF) einreichen. Ausbezahlt wird auf
// die IBAN aus dem Profil; der Kassier bekommt eine Mail
// (docker/backend-members/src/spesen.js).

import 'package:fwv_anlass/fwv_anlass.dart'
    show LadeAnsicht, LadeAnsichtState, fehlerText, meldung, mitSystemleiste, nachfragen;
import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';

class SpesenScreen extends StatefulWidget {
  const SpesenScreen({super.key, required this.dienste});

  final Dienste dienste;

  @override
  State<SpesenScreen> createState() => _SpesenScreenState();
}

class _SpesenScreenState extends State<SpesenScreen> {
  final _ansicht = GlobalKey<LadeAnsichtState<MeineSpesen>>();
  late final _spesen = SpesenDienst(widget.dienste.sitzung.api);
  MeineSpesen? _stand;

  Future<MeineSpesen> _laden() async {
    final s = await _spesen.meine();
    if (mounted) setState(() => _stand = s);
    return s;
  }

  Future<void> _einreichen() async {
    final ok = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => SpesenEinreichenScreen(dienste: widget.dienste, iban: _stand?.iban),
      ),
    );
    if (ok == true && mounted) {
      meldung(context, 'Eingereicht – der Kassier ist informiert.');
      await _ansicht.currentState?.neuLaden();
    }
  }

  Future<void> _beleg(Spesen s) async {
    try {
      final bytes = await _spesen.meinBeleg(s.id);
      await widget.dienste.dateiTeilen(
        bytes,
        s.belegName ?? 'Beleg',
        s.belegTyp ?? 'application/octet-stream',
      );
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    }
  }

  Future<void> _zurueckziehen(Spesen s) async {
    final ja = await nachfragen(
      context,
      titel: 'Spesen zurückziehen?',
      text: '«${s.zweck}» (${spesenFranken(s.betrag)}) wird gelöscht und nicht ausbezahlt.',
      ja: 'Zurückziehen',
    );
    if (!ja) return;
    try {
      await _spesen.zurueckziehen(s.id);
      await _ansicht.currentState?.neuLaden();
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    }
  }

  void _details(Spesen s) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(s.zweck, style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 4),
              Text(
                [
                  spesenFranken(s.betrag),
                  schweizerDatum(s.datum),
                  s.kategorie,
                  if (s.anlass != null) s.anlass!,
                ].join(' · '),
              ),
              const SizedBox(height: 8),
              Text(switch (s.status) {
                SpesenStatus.eingereicht => 'Eingereicht – der Kassier prüft.',
                SpesenStatus.bezahlt =>
                  'Bezahlt${s.erledigt != null ? ' am ${schweizerDatum(s.erledigt!)}' : ''}'
                      '${s.iban != null ? ' auf ${ibanFormatieren(s.iban!)}' : ''}.',
                SpesenStatus.abgelehnt => 'Abgelehnt${s.grund != null ? ': ${s.grund}' : '.'}',
              }),
              const SizedBox(height: 16),
              OutlinedButton.icon(
                key: const Key('spesen-beleg'),
                onPressed: () {
                  Navigator.of(context).pop();
                  _beleg(s);
                },
                icon: const Icon(Icons.receipt_long_outlined),
                label: const Text('Beleg ansehen'),
              ),
              if (s.status == SpesenStatus.eingereicht && !s.pingen) ...[
                const SizedBox(height: 8),
                TextButton.icon(
                  key: const Key('spesen-zurueckziehen'),
                  onPressed: () {
                    Navigator.of(context).pop();
                    _zurueckziehen(s);
                  },
                  icon: const Icon(Icons.undo),
                  label: const Text('Zurückziehen'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final ohneIban = _stand != null && (_stand!.iban == null || _stand!.iban!.trim().isEmpty);
    return Scaffold(
      appBar: AppBar(title: const Text('Spesen')),
      floatingActionButton: FloatingActionButton.extended(
        key: const Key('spesen-neu'),
        onPressed: _stand == null || ohneIban ? null : _einreichen,
        icon: const Icon(Icons.add),
        label: const Text('Spesen einreichen'),
      ),
      body: LadeAnsicht<MeineSpesen>(
        key: _ansicht,
        laden: _laden,
        bauen: (context, d, _) => ListView(
          padding: mitSystemleiste(context, const EdgeInsets.fromLTRB(16, 16, 16, 96)),
          children: [
            const Text(
              'Auslagen für den Verein (Einkauf, Porto, Fahrt, Material …) mit Beleg einreichen. '
              'Der Kassier zahlt auf deine IBAN aus.',
            ),
            const SizedBox(height: 12),
            if (d.iban == null || d.iban!.trim().isEmpty)
              Card(
                key: const Key('spesen-ohne-iban'),
                color: Theme.of(context).colorScheme.errorContainer,
                child: const Padding(
                  padding: EdgeInsets.all(12),
                  child: Text(
                    'Für die Auszahlung braucht es deine IBAN. Trage sie unter Profil → '
                    'Profil bearbeiten ein.',
                  ),
                ),
              )
            else
              Text(
                'Auszahlung auf ${ibanFormatieren(d.iban!)}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            const SizedBox(height: 16),
            if (d.spesen.isEmpty)
              const Text('Noch keine Spesen eingereicht.')
            else
              for (final s in d.spesen)
                Card(
                  child: ListTile(
                    key: Key('spesen-${s.id}'),
                    title: Text(s.zweck, maxLines: 2, overflow: TextOverflow.ellipsis),
                    subtitle: Text(
                      [
                        schweizerDatum(s.datum),
                        s.kategorie,
                        if (s.anlass != null) s.anlass!,
                      ].join(' · '),
                    ),
                    trailing: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          spesenFranken(s.betrag),
                          style: Theme.of(context).textTheme.titleSmall,
                        ),
                        Text(spesenStatusText(s.status), style: _statusStil(context, s.status)),
                      ],
                    ),
                    onTap: () => _details(s),
                  ),
                ),
          ],
        ),
      ),
    );
  }
}

TextStyle? _statusStil(BuildContext context, SpesenStatus s) {
  final f = Theme.of(context).colorScheme;
  final basis = Theme.of(context).textTheme.bodySmall;
  return switch (s) {
    SpesenStatus.eingereicht => basis,
    SpesenStatus.bezahlt => basis?.copyWith(
      color: Colors.green.shade700,
      fontWeight: FontWeight.w600,
    ),
    SpesenStatus.abgelehnt => basis?.copyWith(color: f.error, fontWeight: FontWeight.w600),
  };
}

/// Formular "Spesen einreichen". Gibt true zurueck, wenn eingereicht.
class SpesenEinreichenScreen extends StatefulWidget {
  const SpesenEinreichenScreen({super.key, required this.dienste, this.iban});

  final Dienste dienste;
  final String? iban;

  @override
  State<SpesenEinreichenScreen> createState() => _SpesenEinreichenScreenState();
}

class _SpesenEinreichenScreenState extends State<SpesenEinreichenScreen> {
  final _betrag = TextEditingController();
  final _zweck = TextEditingController();
  late DateTime _datum = widget.dienste.jetzt();
  String? _kategorie;
  String? _anlassId;
  SpesenBeleg? _beleg;
  bool _sendet = false;
  late final Future<List<(String, String)>> _anlaesse = _anlaesseLaden();

  @override
  void dispose() {
    _betrag.dispose();
    _zweck.dispose();
    super.dispose();
  }

  /// Eigene Anmeldungen (auch vergangene) und kommende Anlaesse.
  Future<List<(String, String)>> _anlaesseLaden() async {
    final d = widget.dienste.anlaesse;
    final liste = <String, String>{};
    try {
      for (final a in await d.meineAnmeldungen()) {
        liste[a.anlassId] = a.anlassTitel;
      }
    } on Object catch (_) {}
    try {
      for (final a in await d.aktuelle()) {
        liste.putIfAbsent(a.id, () => a.titel);
      }
    } on Object catch (_) {}
    return [for (final e in liste.entries) (e.key, e.value)];
  }

  double? get _betragWert {
    final t = _betrag.text.trim().replaceAll(',', '.').replaceAll("'", '');
    final w = double.tryParse(t);
    return w == null || w <= 0 ? null : (w * 100).round() / 100;
  }

  bool get _vollstaendig =>
      _betragWert != null && _zweck.text.trim().length >= 3 && _kategorie != null && _beleg != null;

  Future<void> _datumWaehlen() async {
    final heute = widget.dienste.jetzt();
    final d = await showDatePicker(
      context: context,
      initialDate: _datum,
      firstDate: DateTime(heute.year - 1),
      lastDate: heute,
    );
    if (d != null) setState(() => _datum = d);
  }

  Future<void> _belegWaehlen(String art) async {
    final d = widget.dienste;
    try {
      SpesenBeleg? beleg;
      if (art == 'kamera' || art == 'galerie') {
        final bytes = await d.dokumentFotoWaehlen(kamera: art == 'kamera');
        if (bytes != null) {
          beleg = (bytes: bytes, dateiname: 'Beleg ${isoDatum(_datum)}.jpg', typ: 'image/jpeg');
        }
      } else {
        final datei = await d.pdfWaehlen();
        if (datei != null) {
          final typ = belegTyp(datei.dateiname);
          if (typ == null) {
            if (mounted) meldung(context, 'Beleg muss ein PDF, JPG oder PNG sein.');
            return;
          }
          beleg = (bytes: datei.bytes, dateiname: datei.dateiname, typ: typ);
        }
      }
      if (beleg == null) return;
      if (beleg.bytes.length > 10 * 1024 * 1024) {
        if (mounted) meldung(context, 'Der Beleg darf höchstens 10 MB gross sein.');
        return;
      }
      setState(() => _beleg = beleg);
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    }
  }

  Future<void> _senden() async {
    final betrag = _betragWert;
    final beleg = _beleg;
    if (betrag == null || beleg == null || _kategorie == null) return;
    setState(() => _sendet = true);
    try {
      await SpesenDienst(widget.dienste.sitzung.api).einreichen(
        betrag: betrag,
        datum: _datum,
        zweck: _zweck.text,
        kategorie: _kategorie!,
        anlassId: _anlassId,
        beleg: beleg,
      );
      if (mounted) Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (mounted) {
        meldung(context, fehlerText(e));
        setState(() => _sendet = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final beleg = _beleg;
    return Scaffold(
      appBar: AppBar(title: const Text('Spesen einreichen')),
      body: ListView(
        padding: mitSystemleiste(context, const EdgeInsets.fromLTRB(16, 16, 16, 24)),
        children: [
          TextField(
            key: const Key('spesen-betrag'),
            controller: _betrag,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(
              labelText: 'Betrag',
              prefixText: 'CHF ',
              border: OutlineInputBorder(),
            ),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 12),
          InkWell(
            key: const Key('spesen-datum'),
            onTap: _datumWaehlen,
            child: InputDecorator(
              decoration: const InputDecoration(
                labelText: 'Datum der Auslage',
                border: OutlineInputBorder(),
              ),
              child: Text(schweizerDatum(_datum)),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            key: const Key('spesen-zweck'),
            controller: _zweck,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              labelText: 'Wofür?',
              hintText: 'z.B. Brot und Getränke für die Chilbi',
              border: OutlineInputBorder(),
            ),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            key: const Key('spesen-kategorie'),
            initialValue: _kategorie,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Kategorie', border: OutlineInputBorder()),
            items: [for (final k in spesenKategorien) DropdownMenuItem(value: k, child: Text(k))],
            onChanged: (k) => setState(() => _kategorie = k),
          ),
          const SizedBox(height: 12),
          FutureBuilder<List<(String, String)>>(
            future: _anlaesse,
            builder: (context, snap) => DropdownButtonFormField<String?>(
              key: const Key('spesen-anlass'),
              initialValue: _anlassId,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: 'Anlass (optional)',
                border: OutlineInputBorder(),
              ),
              items: [
                const DropdownMenuItem<String?>(value: null, child: Text('Kein Anlass')),
                for (final (id, titel) in snap.data ?? const <(String, String)>[])
                  DropdownMenuItem<String?>(
                    value: id,
                    child: Text(titel, overflow: TextOverflow.ellipsis),
                  ),
              ],
              onChanged: (a) => setState(() => _anlassId = a),
            ),
          ),
          const SizedBox(height: 16),
          Text('Beleg (Pflicht)', style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          if (beleg != null)
            ListTile(
              key: const Key('spesen-beleg-gewaehlt'),
              contentPadding: EdgeInsets.zero,
              leading: Icon(
                beleg.typ == 'application/pdf'
                    ? Icons.picture_as_pdf_outlined
                    : Icons.image_outlined,
              ),
              title: Text(beleg.dateiname),
              subtitle: Text('${(beleg.bytes.length / 1024).ceil()} KB'),
              trailing: IconButton(
                tooltip: 'Beleg entfernen',
                icon: const Icon(Icons.close),
                onPressed: () => setState(() => _beleg = null),
              ),
            ),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                key: const Key('spesen-foto'),
                onPressed: _sendet ? null : () => _belegWaehlen('kamera'),
                icon: const Icon(Icons.photo_camera_outlined),
                label: const Text('Foto aufnehmen'),
              ),
              OutlinedButton.icon(
                key: const Key('spesen-galerie'),
                onPressed: _sendet ? null : () => _belegWaehlen('galerie'),
                icon: const Icon(Icons.photo_library_outlined),
                label: const Text('Aus Galerie'),
              ),
              OutlinedButton.icon(
                key: const Key('spesen-pdf'),
                onPressed: _sendet ? null : () => _belegWaehlen('pdf'),
                icon: const Icon(Icons.picture_as_pdf_outlined),
                label: const Text('PDF'),
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (widget.iban != null)
            Text(
              'Auszahlung auf ${ibanFormatieren(widget.iban!)}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          const SizedBox(height: 8),
          FilledButton.icon(
            key: const Key('spesen-senden'),
            onPressed: _vollstaendig && !_sendet ? _senden : null,
            icon: _sendet
                ? const SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.send_outlined),
            label: Text(_sendet ? 'Wird eingereicht …' : 'Einreichen'),
          ),
        ],
      ),
    );
  }
}
