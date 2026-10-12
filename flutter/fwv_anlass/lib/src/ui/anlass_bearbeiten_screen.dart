// Anlass bearbeiten als Organisator (`PUT events/:id/as-organizer`).
// Kategorien und Status kommen aus `GET event-optionen`.
//
// Geschickt wird nur, was sich geaendert hat (AnlassEntwurf). Die alte
// iOS-App schickte immer alles und loeschte dabei Menuewahl und
// Anmeldeschluss; hier sind beide im Formular und bleiben ohne Aenderung
// unberuehrt.

import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../bausteine.dart';
import '../modelle.dart';
import '../zugang.dart';

class AnlassBearbeitenScreen extends StatefulWidget {
  const AnlassBearbeitenScreen({super.key, required this.verwaltung, required this.anlass});

  final AnlassVerwaltung verwaltung;
  final Anlass anlass;

  @override
  State<AnlassBearbeitenScreen> createState() => _AnlassBearbeitenScreenState();
}

class _AnlassBearbeitenScreenState extends State<AnlassBearbeitenScreen> {
  final _form = GlobalKey<FormState>();
  late final AnlassEntwurf _original = AnlassEntwurf.aus(widget.anlass);
  late final AnlassEntwurf _e = AnlassEntwurf.aus(widget.anlass);
  late final Future<EventOptionen> _optionen = widget.verwaltung.zugang.optionen();
  late final _menue = TextEditingController(text: _e.menueOptionen.join('\n'));
  bool _laeuft = false;

  @override
  void dispose() {
    _menue.dispose();
    super.dispose();
  }

  Future<void> _speichern() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    // Die Liste baut nur, was sichtbar ist — der Titel wird darum auch hier
    // geprueft.
    if (_e.titel.trim().isEmpty) {
      meldung(context, 'Bitte einen Titel angeben.');
      return;
    }
    final b = _e.beginn, en = _e.ende;
    if (b != null && en != null && en.alsDb().compareTo(b.alsDb()) < 0) {
      meldung(context, 'Das Ende liegt vor dem Beginn.');
      return;
    }
    _e.menueOptionen = _menue.text.split('\n');
    setState(() => _laeuft = true);
    try {
      final geschickt = await widget.verwaltung.zugang.anlassAendern(
        widget.anlass.id,
        _original,
        _e,
      );
      if (!mounted) return;
      meldung(context, geschickt ? 'Anlass gespeichert' : 'Nichts geändert');
      Navigator.of(context).pop(geschickt);
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _laeuft = false);
    }
  }

  /// Auswahl mit den Werten des Backends; ein unbekannter aktueller Wert
  /// bleibt waehlbar, damit nichts still verloren geht.
  Widget _auswahl({
    required Key key,
    required String titel,
    required String? wert,
    required List<({String wert, String text})> werte,
    required ValueChanged<String?> aendern,
  }) {
    final liste = [
      ...werte,
      if (wert != null && !werte.any((w) => w.wert == wert)) (wert: wert, text: wert),
    ];
    return DropdownButtonFormField<String>(
      key: key,
      initialValue: wert,
      isExpanded: true,
      decoration: InputDecoration(labelText: titel),
      items: [for (final w in liste) DropdownMenuItem(value: w.wert, child: Text(w.text))],
      onChanged: aendern,
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Anlass bearbeiten')),
      body: FutureBuilder<EventOptionen>(
        future: _optionen,
        builder: (context, o) {
          if (!o.hasData && !o.hasError) return const Center(child: CircularProgressIndicator());
          final optionen = o.data ?? const EventOptionen();
          final gv = _e.kategorie == 'GV' || _original.menueOptionen.isNotEmpty;
          return Form(
            key: _form,
            child: ListView(
              padding: mitSystemleiste(context, const EdgeInsets.all(16)),
              children: [
                TextFormField(
                  initialValue: _e.titel,
                  decoration: const InputDecoration(labelText: 'Titel *'),
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? 'Bitte einen Titel angeben.' : null,
                  onChanged: (v) => _e.titel = v,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  initialValue: _e.untertitel,
                  decoration: const InputDecoration(labelText: 'Untertitel'),
                  onChanged: (v) => _e.untertitel = v,
                ),
                const SizedBox(height: 12),
                _auswahl(
                  key: const Key('anlass-kategorie'),
                  titel: 'Kategorie',
                  wert: _e.kategorie,
                  werte: [for (final k in optionen.kategorien) (wert: k, text: k)],
                  aendern: (v) => setState(() => _e.kategorie = v),
                ),
                const SizedBox(height: 12),
                _auswahl(
                  key: const Key('anlass-status'),
                  titel: 'Status',
                  wert: _e.status,
                  werte: optionen.status,
                  aendern: (v) => setState(() => _e.status = v),
                ),
                const SizedBox(height: 16),
                Text('Wann', style: t.textTheme.titleSmall),
                ZeitpunktFeld(
                  key: const Key('anlass-beginn'),
                  titel: 'Beginn',
                  wert: _e.beginn,
                  aendern: (z) => setState(() => _e.beginn = z),
                  pflicht: true,
                ),
                ZeitpunktFeld(
                  key: const Key('anlass-ende'),
                  titel: 'Ende',
                  wert: _e.ende,
                  aendern: (z) => setState(() => _e.ende = z),
                  vorschlag: _e.beginn,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  initialValue: _e.ort,
                  decoration: const InputDecoration(labelText: 'Ort'),
                  onChanged: (v) => _e.ort = v,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  initialValue: _e.kosten,
                  decoration: const InputDecoration(labelText: 'Kosten'),
                  onChanged: (v) => _e.kosten = v,
                ),
                const SizedBox(height: 16),
                Text('Anmeldung', style: t.textTheme.titleSmall),
                SwitchListTile(
                  key: const Key('anlass-anmeldung'),
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Anmeldung verlangt'),
                  subtitle: optionen.anmeldepflichtigeKategorien.contains(_e.kategorie)
                      ? const Text('Bei dieser Kategorie ohnehin nötig')
                      : null,
                  value: _e.anmeldungVerlangt,
                  onChanged: (v) => setState(() => _e.anmeldungVerlangt = v),
                ),
                ZeitpunktFeld(
                  key: const Key('anlass-anmeldeschluss'),
                  titel: 'Anmeldeschluss',
                  wert: _e.anmeldeschluss,
                  aendern: (z) => setState(() => _e.anmeldeschluss = z),
                  vorschlag: _e.beginn,
                ),
                const SizedBox(height: 8),
                TextFormField(
                  initialValue: _e.maxTeilnehmer?.toString() ?? '',
                  decoration: const InputDecoration(
                    labelText: 'Max. Teilnehmer',
                    helperText: 'Leer: ohne Begrenzung',
                  ),
                  keyboardType: TextInputType.number,
                  validator: (v) {
                    final t = v?.trim() ?? '';
                    if (t.isEmpty) return null;
                    final n = int.tryParse(t);
                    return (n == null || n < 1) ? 'Bitte eine Zahl ab 1 angeben.' : null;
                  },
                  onChanged: (v) => _e.maxTeilnehmer = int.tryParse(v.trim()),
                ),
                if (gv) ...[
                  const SizedBox(height: 12),
                  TextFormField(
                    key: const Key('anlass-menue'),
                    controller: _menue,
                    decoration: const InputDecoration(
                      labelText: 'Menüwahl',
                      helperText: 'Ein Menü pro Zeile; leer: keine Menüwahl',
                    ),
                    minLines: 2,
                    maxLines: 6,
                  ),
                ],
                const SizedBox(height: 16),
                TextFormField(
                  initialValue: _e.beschreibung,
                  decoration: const InputDecoration(labelText: 'Beschreibung'),
                  minLines: 3,
                  maxLines: 10,
                  onChanged: (v) => _e.beschreibung = v,
                ),
              ],
            ),
          );
        },
      ),
      bottomNavigationBar: UntenLeiste(
        kinder: [
          FilledButton(
            key: const Key('anlass-speichern'),
            onPressed: _laeuft ? null : _speichern,
            child: const Text('Speichern'),
          ),
        ],
      ),
    );
  }
}

/// Datum mit optionaler Uhrzeit (Datum- und Zeitwaehler), loeschbar.
class ZeitpunktFeld extends StatelessWidget {
  const ZeitpunktFeld({
    super.key,
    required this.titel,
    required this.wert,
    required this.aendern,
    this.vorschlag,
    this.pflicht = false,
  });

  final String titel;
  final Zeitpunkt? wert;
  final ValueChanged<Zeitpunkt?> aendern;

  /// Startwert fuer den Datumswaehler, wenn noch nichts gesetzt ist.
  final Zeitpunkt? vorschlag;
  final bool pflicht;

  Future<void> _datum(BuildContext context) async {
    final start = wert?.datum ?? vorschlag?.datum ?? DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: start,
      firstDate: DateTime(start.year - 5),
      lastDate: DateTime(start.year + 5),
    );
    if (d != null) aendern(wert == null ? Zeitpunkt(d) : wert!.mitDatum(d));
  }

  Future<void> _zeit(BuildContext context) async {
    final w = wert;
    if (w == null) return;
    final z = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: w.stunde ?? 18, minute: w.minute ?? 0),
    );
    if (z != null) aendern(w.mitUhrzeit(z.hour, z.minute));
  }

  @override
  Widget build(BuildContext context) {
    final w = wert;
    final zeit = w?.mitZeit == true
        ? '${w!.stunde.toString().padLeft(2, '0')}:${(w.minute ?? 0).toString().padLeft(2, '0')}'
        : null;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Wrap(
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 8,
        runSpacing: 4,
        children: [
          SizedBox(width: 120, child: Text(titel)),
          OutlinedButton.icon(
            onPressed: () => _datum(context),
            icon: const Icon(Icons.calendar_today_outlined, size: 18),
            label: Text(w == null ? 'Datum wählen' : schweizerDatum(w.datum)),
          ),
          if (w != null)
            OutlinedButton.icon(
              onPressed: () => _zeit(context),
              icon: const Icon(Icons.schedule, size: 18),
              label: Text(zeit ?? 'ganztägig'),
            ),
          if (w != null && w.mitZeit)
            IconButton(
              onPressed: () => aendern(w.mitUhrzeit(null, null)),
              icon: const Icon(Icons.timer_off_outlined),
              tooltip: 'Ohne Uhrzeit',
            ),
          if (w != null && !pflicht)
            IconButton(
              onPressed: () => aendern(null),
              icon: const Icon(Icons.clear),
              tooltip: '$titel entfernen',
            ),
        ],
      ),
    );
  }
}
