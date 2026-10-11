// Anlass vorschlagen (`POST events/propose`). Der Vorstand prueft den
// Vorschlag und gibt ihn frei. Die Kategorien kommen aus
// `GET event-optionen` — nie fest in der App.

import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';
import '../gemeinsam.dart';

class AnlassVorschlagenScreen extends StatefulWidget {
  const AnlassVorschlagenScreen({super.key, required this.dienste});

  final Dienste dienste;

  @override
  State<AnlassVorschlagenScreen> createState() => _AnlassVorschlagenScreenState();
}

/// Datum mit optionaler Uhrzeit.
class _Zeitpunkt {
  const _Zeitpunkt(this.tag, [this.zeit]);

  final DateTime tag;
  final TimeOfDay? zeit;

  DateTime get wert => DateTime(tag.year, tag.month, tag.day, zeit?.hour ?? 0, zeit?.minute ?? 0);
}

class _AnlassVorschlagenScreenState extends State<AnlassVorschlagenScreen> {
  final _form = GlobalKey<FormState>();
  final _titel = TextEditingController();
  final _ort = TextEditingController();
  final _kosten = TextEditingController();
  final _beschreibung = TextEditingController();
  _Zeitpunkt? _beginn;
  _Zeitpunkt? _ende;
  String? _kategorie;
  List<String>? _kategorien;
  bool _kategorienFehler = false;
  bool _sendet = false;
  bool _geprueft = false;
  String? _fehler;

  @override
  void initState() {
    super.initState();
    _optionenLaden();
  }

  @override
  void dispose() {
    for (final c in [_titel, _ort, _kosten, _beschreibung]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _optionenLaden() async {
    try {
      final o = await widget.dienste.anlaesse.optionen();
      if (mounted) setState(() => _kategorien = o.kategorien);
    } on Object {
      if (mounted) setState(() => _kategorienFehler = true);
    }
  }

  Future<_Zeitpunkt?> _waehlen(_Zeitpunkt? bisher, {DateTime? ab}) async {
    final heute = widget.dienste.jetzt();
    final erster = DateTime(heute.year, heute.month, heute.day);
    final tag = await showDatePicker(
      context: context,
      initialDate: bisher?.tag ?? ab ?? erster,
      firstDate: erster,
      lastDate: DateTime(heute.year + 5),
    );
    if (tag == null || !mounted) return null;
    final zeit = await showTimePicker(
      context: context,
      initialTime: bisher?.zeit ?? const TimeOfDay(hour: 18, minute: 0),
      helpText: 'Uhrzeit (optional)',
      cancelText: 'Ohne Uhrzeit',
    );
    return _Zeitpunkt(tag, zeit);
  }

  String _text(_Zeitpunkt z) {
    final datum = schweizerDatum(z.tag);
    final zeit = z.zeit;
    return zeit == null
        ? datum
        : '$datum, ${zeit.hour.toString().padLeft(2, '0')}:${zeit.minute.toString().padLeft(2, '0')} Uhr';
  }

  String? get _zeitFehler {
    if (_beginn == null) return 'Bitte das Datum wählen.';
    final e = _ende;
    if (e != null && e.wert.isBefore(_beginn!.wert)) return 'Das Ende liegt vor dem Beginn.';
    return null;
  }

  Future<void> _senden() async {
    setState(() {
      _geprueft = true;
      _fehler = null;
    });
    final ok = _form.currentState!.validate();
    if (!ok || _zeitFehler != null) return;
    setState(() => _sendet = true);
    try {
      await widget.dienste.anlaesse.vorschlagen(
        AnlassVorschlag(
          titel: _titel.text,
          beginn: _beginn!.wert,
          beginnMitZeit: _beginn!.zeit != null,
          ende: _ende?.wert,
          endeMitZeit: _ende?.zeit != null,
          ort: _ort.text,
          kategorie: _kategorie,
          kosten: _kosten.text,
          beschreibung: _beschreibung.text,
        ),
      );
      if (!mounted) return;
      setState(() => _sendet = false);
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          icon: const Icon(Icons.check_circle),
          title: const Text('Danke!'),
          content: const Text(
            'Dein Vorschlag ist beim Vorstand. Sobald er freigegeben ist, '
            'erscheint der Anlass in der Liste.',
          ),
          actions: [
            FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('OK')),
          ],
        ),
      );
      if (mounted) Navigator.of(context).pop(true);
    } on Object catch (f) {
      if (mounted) setState(() => _fehler = fehlerText(f));
    } finally {
      if (mounted) setState(() => _sendet = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final zeitFehler = _geprueft ? _zeitFehler : null;
    return Scaffold(
      appBar: AppBar(title: const Text('Anlass vorschlagen')),
      body: Form(
        key: _form,
        autovalidateMode: _geprueft
            ? AutovalidateMode.onUserInteraction
            : AutovalidateMode.disabled,
        // Kein ListView: alle Felder muessen gebaut bleiben, sonst prueft
        // validate() die weggescrollten nicht.
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Der Vorstand prüft deinen Vorschlag und meldet sich bei dir.',
                style: t.textTheme.bodyMedium,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _titel,
                enabled: !_sendet,
                decoration: const InputDecoration(labelText: 'Titel *'),
                textInputAction: TextInputAction.next,
                validator: (v) => (v ?? '').trim().isEmpty ? 'Bitte einen Titel angeben.' : null,
              ),
              const SizedBox(height: 12),
              _ZeitFeld(
                key: const Key('vorschlag-beginn'),
                titel: 'Beginn *',
                text: _beginn == null ? 'Datum wählen' : _text(_beginn!),
                fehler: zeitFehler == 'Bitte das Datum wählen.' ? zeitFehler : null,
                onTap: _sendet
                    ? null
                    : () async {
                        final z = await _waehlen(_beginn);
                        if (z != null) setState(() => _beginn = z);
                      },
              ),
              _ZeitFeld(
                key: const Key('vorschlag-ende'),
                titel: 'Ende',
                text: _ende == null ? 'optional' : _text(_ende!),
                fehler: zeitFehler != null && zeitFehler != 'Bitte das Datum wählen.'
                    ? zeitFehler
                    : null,
                loeschen: _ende == null || _sendet ? null : () => setState(() => _ende = null),
                onTap: _sendet
                    ? null
                    : () async {
                        final z = await _waehlen(_ende, ab: _beginn?.tag);
                        if (z != null) setState(() => _ende = z);
                      },
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _ort,
                enabled: !_sendet,
                decoration: const InputDecoration(labelText: 'Ort'),
                textInputAction: TextInputAction.next,
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                key: const Key('vorschlag-kategorie'),
                initialValue: _kategorie,
                isExpanded: true,
                decoration: InputDecoration(
                  labelText: 'Kategorie',
                  helperText: _kategorienFehler
                      ? 'Kategorien konnten nicht geladen werden.'
                      : _kategorien == null
                      ? 'Wird geladen …'
                      : null,
                ),
                items: [
                  for (final k in _kategorien ?? const <String>[])
                    DropdownMenuItem(value: k, child: Text(k)),
                ],
                onChanged: _sendet || _kategorien == null
                    ? null
                    : (k) => setState(() => _kategorie = k),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _kosten,
                enabled: !_sendet,
                decoration: const InputDecoration(
                  labelText: 'Kosten',
                  hintText: 'z.B. CHF 20 pro Person',
                ),
                textInputAction: TextInputAction.next,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _beschreibung,
                enabled: !_sendet,
                decoration: const InputDecoration(labelText: 'Beschreibung'),
                minLines: 3,
                maxLines: 8,
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: Material(
        color: t.colorScheme.surfaceContainer,
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_fehler != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(_fehler!, style: TextStyle(color: t.colorScheme.error)),
                  ),
                FilledButton(
                  key: const Key('vorschlag-senden'),
                  onPressed: _sendet ? null : _senden,
                  child: _sendet
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Vorschlag senden'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ZeitFeld extends StatelessWidget {
  const _ZeitFeld({
    super.key,
    required this.titel,
    required this.text,
    required this.onTap,
    this.fehler,
    this.loeschen,
  });

  final String titel;
  final String text;
  final VoidCallback? onTap;
  final String? fehler;
  final VoidCallback? loeschen;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: const Icon(Icons.calendar_today_outlined),
      title: Text(titel),
      subtitle: Text(
        fehler ?? text,
        style: fehler == null ? null : TextStyle(color: Theme.of(context).colorScheme.error),
      ),
      trailing: loeschen == null
          ? null
          : IconButton(
              onPressed: loeschen,
              icon: const Icon(Icons.clear),
              tooltip: 'Ende entfernen',
            ),
      onTap: onTap,
    );
  }
}
