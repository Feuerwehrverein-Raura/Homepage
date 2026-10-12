// Schichten eines Anlasses anlegen, aendern, loeschen
// (`…/shifts-as-organizer`). Eingeteilte bekommen bei Aenderungen und beim
// Loeschen vom Backend eine Nachricht.
//
// Beim Aendern bleibt das Datum der Schicht, wie es ist (die alte iOS-App
// setzte es auf heute); geschickt wird nur, was sich geaendert hat.

import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../bausteine.dart';
import '../modelle.dart';
import '../zugang.dart';

/// Reiter "Schichten" eines Anlasses: Liste mit Belegung, Antippen zum
/// Aendern, "+" fuer eine neue Schicht.
class SchichtenAnsicht extends StatelessWidget {
  const SchichtenAnsicht({
    super.key,
    required this.verwaltung,
    required this.anlass,
    required this.neuLaden,
  });

  final AnlassVerwaltung verwaltung;
  final VerwalteterAnlass anlass;
  final Future<void> Function() neuLaden;

  Future<void> _formular(BuildContext context, {Schicht? schicht}) async {
    final ok = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) =>
            SchichtFormular(verwaltung: verwaltung, anlass: anlass.anlass, schicht: schicht),
      ),
    );
    if (ok == true) await neuLaden();
  }

  @override
  Widget build(BuildContext context) {
    final schichten = anlass.anlass.schichten;
    return Scaffold(
      resizeToAvoidBottomInset: false,
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'schicht-neu',
        onPressed: () => _formular(context),
        icon: const Icon(Icons.add),
        label: const Text('Schicht'),
      ),
      body: RefreshIndicator(
        onRefresh: neuLaden,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: mitSystemleiste(context, const EdgeInsets.fromLTRB(12, 8, 12, 96)),
          children: [
            if (schichten.isEmpty)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'Noch keine Schichten. Mit „Schicht“ legst du die erste an.',
                  textAlign: TextAlign.center,
                ),
              ),
            for (final s in schichten)
              Card(
                key: Key('schicht-${s.id}'),
                margin: const EdgeInsets.symmetric(vertical: 4),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: () => _formular(context, schicht: s),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                    child: SchichtZeile(schicht: s),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class SchichtFormular extends StatefulWidget {
  const SchichtFormular({super.key, required this.verwaltung, required this.anlass, this.schicht});

  final AnlassVerwaltung verwaltung;
  final Anlass anlass;

  /// null: neue Schicht.
  final Schicht? schicht;

  @override
  State<SchichtFormular> createState() => _SchichtFormularState();
}

class _SchichtFormularState extends State<SchichtFormular> {
  final _form = GlobalKey<FormState>();
  late final SchichtEntwurf? _original = widget.schicht == null
      ? null
      : SchichtEntwurf.aus(widget.schicht!);
  late final SchichtEntwurf _e = widget.schicht == null
      // Neue Schicht: am ersten Tag des Anlasses.
      ? SchichtEntwurf(datum: Zeitpunkt.ausDb(widget.anlass.beginn)?.datum)
      : SchichtEntwurf.aus(widget.schicht!);
  late final Future<EventOptionen> _optionen = widget.verwaltung.zugang.optionen();
  bool _laeuft = false;

  AnlassVerwaltungZugang get _dienst => widget.verwaltung.zugang;

  Future<void> _speichern() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    if (_e.datum == null) {
      meldung(context, 'Bitte ein Datum wählen.');
      return;
    }
    setState(() => _laeuft = true);
    try {
      final original = _original;
      var geschickt = true;
      if (original == null) {
        await _dienst.schichtAnlegen(widget.anlass.id, _e);
      } else {
        geschickt = await _dienst.schichtAendern(
          widget.anlass.id,
          widget.schicht!.id,
          original,
          _e,
        );
      }
      if (!mounted) return;
      meldung(context, geschickt ? 'Schicht gespeichert' : 'Nichts geändert');
      Navigator.of(context).pop(geschickt);
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _laeuft = false);
    }
  }

  Future<void> _loeschen() async {
    final s = widget.schicht!;
    final belegt = s.app.belegung.besetzt + s.app.belegung.angefragt;
    final ok = await nachfragen(
      context,
      titel: 'Schicht löschen?',
      text: belegt > 0
          ? 'Die $belegt Eingeteilten bekommen eine Nachricht, dass die Schicht entfällt.'
          : 'Die Schicht wird entfernt.',
      ja: 'Löschen',
    );
    if (!ok || !mounted) return;
    setState(() => _laeuft = true);
    try {
      await _dienst.schichtLoeschen(widget.anlass.id, s.id);
      if (!mounted) return;
      meldung(context, 'Schicht gelöscht');
      Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _laeuft = false);
    }
  }

  Future<void> _datum() async {
    final start = _e.datum ?? DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: start,
      firstDate: DateTime(start.year - 2),
      lastDate: DateTime(start.year + 3),
    );
    if (d != null) setState(() => _e.datum = d);
  }

  Future<void> _uhrzeit(bool von) async {
    final alt = von ? _e.von : _e.bis;
    final m = RegExp(r'^(\d{2}):(\d{2})$').firstMatch(alt);
    final z = await showTimePicker(
      context: context,
      initialTime: m == null
          ? const TimeOfDay(hour: 12, minute: 0)
          : TimeOfDay(hour: int.parse(m[1]!), minute: int.parse(m[2]!)),
    );
    if (z == null) return;
    final text = '${z.hour.toString().padLeft(2, '0')}:${z.minute.toString().padLeft(2, '0')}';
    setState(() => von ? _e.von = text : _e.bis = text);
  }

  @override
  Widget build(BuildContext context) {
    final neu = widget.schicht == null;
    return Scaffold(
      appBar: AppBar(title: Text(neu ? 'Neue Schicht' : 'Schicht ändern')),
      body: FutureBuilder<EventOptionen>(
        future: _optionen,
        builder: (context, o) {
          final bereiche = o.data?.bereiche ?? const [(wert: 'Allgemein', text: 'Allgemein')];
          final liste = [
            ...bereiche,
            if (!bereiche.any((b) => b.wert == _e.bereich)) (wert: _e.bereich, text: _e.bereich),
          ];
          return Form(
            key: _form,
            child: ListView(
              padding: mitSystemleiste(context, const EdgeInsets.all(16)),
              children: [
                TextFormField(
                  key: const Key('schicht-name'),
                  initialValue: _e.name,
                  decoration: const InputDecoration(
                    labelText: 'Name *',
                    hintText: 'z.B. Schicht 1',
                  ),
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? 'Bitte einen Namen angeben.' : null,
                  onChanged: (v) => _e.name = v,
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: _e.bereich,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Bereich'),
                  items: [
                    for (final b in liste) DropdownMenuItem(value: b.wert, child: Text(b.text)),
                  ],
                  onChanged: (v) => setState(() => _e.bereich = v ?? _e.bereich),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  initialValue: _e.beschreibung,
                  decoration: const InputDecoration(labelText: 'Beschreibung'),
                  onChanged: (v) => _e.beschreibung = v,
                ),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    OutlinedButton.icon(
                      key: const Key('schicht-datum'),
                      onPressed: _datum,
                      icon: const Icon(Icons.calendar_today_outlined, size: 18),
                      label: Text(_e.datum == null ? 'Datum wählen' : schweizerDatum(_e.datum!)),
                    ),
                    OutlinedButton.icon(
                      onPressed: () => _uhrzeit(true),
                      icon: const Icon(Icons.schedule, size: 18),
                      label: Text(_e.von.isEmpty ? 'Von' : 'Von ${_e.von}'),
                    ),
                    OutlinedButton.icon(
                      onPressed: () => _uhrzeit(false),
                      icon: const Icon(Icons.schedule, size: 18),
                      label: Text(_e.bis.isEmpty ? 'Bis' : 'Bis ${_e.bis}'),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                ZahlWaehler(
                  titel: 'Benötigt',
                  wert: _e.gebraucht,
                  max: 100,
                  aendern: (n) => setState(() => _e.gebraucht = n),
                ),
                if (!neu) ...[
                  const SizedBox(height: 24),
                  OutlinedButton.icon(
                    onPressed: _laeuft ? null : _loeschen,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Theme.of(context).colorScheme.error,
                    ),
                    icon: const Icon(Icons.delete_outline),
                    label: const Text('Schicht löschen'),
                  ),
                ],
              ],
            ),
          );
        },
      ),
      bottomNavigationBar: UntenLeiste(
        kinder: [
          FilledButton(
            key: const Key('schicht-speichern'),
            onPressed: _laeuft ? null : _speichern,
            child: const Text('Speichern'),
          ),
        ],
      ),
    );
  }
}
