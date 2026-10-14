// Anlass bearbeiten - als Organisator (`PUT events/:id/as-organizer`) oder
// als Vorstand (`PUT events/:id`); der Vorstand legt hier auch neue Anlaesse
// an (`POST events`). Kategorien und Status kommen aus `GET event-optionen`.
//
// Geschickt wird nur, was sich geaendert hat (AnlassEntwurf). Die alte
// iOS-App schickte immer alles und loeschte dabei Menuewahl und
// Anmeldeschluss; hier sind beide im Formular und bleiben ohne Aenderung
// unberuehrt.
//
// Nur fuer den Vorstand ([AnlassVerwaltungZugang.kannAnlegen]) - wie das
// Event-Formular in vorstand.html:
//  - die Kategorie steuert die Abschnitte ([KategorieFelder]): Dorffest nur
//    Schichten, GV Anmeldung und Menuewahl, Aufbau/Abbau/Ausflug mit
//    Anmeldung nur Anmeldung, Ausflug nichts, Sonstiges beides,
//  - "Termin steht noch nicht fest" (datum_offen),
//  - Organisator: Mitglied aus dem Verzeichnis oder extern (Name, E-Mail,
//    auf Wunsch mit Organisator-Zugang),
//  - PDF-Aushang anhaengen/entfernen,
//  - beim Anlegen gleich die Helfer-Schichten (mit "Springer generieren");
//    bei bestehenden Anlaessen stehen sie im Reiter "Schichten".
// Fuer den Organisator bleibt das Formular, wie es war.

import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../bausteine.dart';
import '../daten.dart';
import '../modelle.dart';
import '../vorstand_zugang.dart';
import '../zugang.dart';
import 'mitglied_waehlen_screen.dart';
import 'schichten_screen.dart';

class AnlassBearbeitenScreen extends StatefulWidget {
  const AnlassBearbeitenScreen({
    super.key,
    required this.verwaltung,
    this.anlass,
    this.organisator,
    this.datumOffen,
  });

  final AnlassVerwaltung verwaltung;

  /// null: neuer Anlass (nur Vorstand).
  final Anlass? anlass;

  /// Nur Vorstand: bisheriger Organisator (mit Mitglied-ID und E-Mail).
  final OrganisatorAngabe? organisator;

  /// "Termin noch offen", wenn der Anlass keinen `app`-Block hat
  /// (Vorschlaege); sonst aus dem Anlass.
  final bool? datumOffen;

  @override
  State<AnlassBearbeitenScreen> createState() => _AnlassBearbeitenScreenState();
}

class _AnlassBearbeitenScreenState extends State<AnlassBearbeitenScreen> {
  final _form = GlobalKey<FormState>();
  late final AnlassEntwurf _original = _entwurf();
  late final AnlassEntwurf _e = _entwurf();
  late final Future<EventOptionen> _optionen = widget.verwaltung.zugang.optionen();
  late final _menue = TextEditingController(text: _e.menueOptionen.join('\n'));
  bool _laeuft = false;

  // Organisator (nur Vorstand): Mitglied oder extern.
  late bool _extern =
      _original.organisator != null &&
      !_original.organisator!.istMitglied &&
      (_original.organisator!.name.trim().isNotEmpty ||
          _original.organisator!.email.trim().isNotEmpty);
  late OrganisatorAngabe? _mitglied = (_original.organisator?.istMitglied ?? false)
      ? _original.organisator
      : null;
  late final _externName = TextEditingController(text: _extern ? _original.organisator!.name : '');
  late final _externEmail = TextEditingController(
    text: _extern ? _original.organisator!.email : '',
  );
  bool _zugangErstellen = false;

  /// Neue Schichten (nur beim Anlegen).
  final _schichten = <SchichtEntwurf>[];

  AnlassVerwaltungZugang get _z => widget.verwaltung.zugang;
  bool get _vorstand => _z.kannAnlegen;
  bool get _neu => widget.anlass == null;

  AnlassEntwurf _entwurf() {
    final a = widget.anlass;
    if (a == null) {
      return AnlassEntwurf(
        kategorie: 'Sonstiges',
        status: 'planned',
        organisator: const OrganisatorAngabe(),
      );
    }
    return AnlassEntwurf.aus(
      a,
      organisator: _vorstand ? (widget.organisator ?? const OrganisatorAngabe()) : null,
      datumOffen: widget.datumOffen,
    );
  }

  @override
  void dispose() {
    _menue.dispose();
    _externName.dispose();
    _externEmail.dispose();
    super.dispose();
  }

  OrganisatorAngabe _organisator() => _extern
      ? OrganisatorAngabe(
          name: _externName.text,
          email: _externEmail.text,
          zugangErstellen: _zugangErstellen,
        )
      : (_mitglied ?? const OrganisatorAngabe());

  Future<void> _speichern() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    // Die Liste baut nur, was sichtbar ist - der Titel wird darum auch hier
    // geprueft.
    if (_e.titel.trim().isEmpty) {
      meldung(context, 'Bitte einen Titel angeben.');
      return;
    }
    final b = _e.beginn, en = _e.ende;
    if (b == null && _neu) {
      meldung(context, 'Bitte einen Beginn wählen.');
      return;
    }
    if (b != null && en != null && en.alsDb().compareTo(b.alsDb()) < 0) {
      meldung(context, 'Das Ende liegt vor dem Beginn.');
      return;
    }
    if (_vorstand) {
      _e.organisator = _organisator();
      if (_extern && _zugangErstellen && _externEmail.text.trim().isEmpty) {
        meldung(context, 'Für den Organisator-Zugang braucht es eine E-Mail.');
        return;
      }
    }
    _e.menueOptionen = _menue.text.split('\n');
    setState(() => _laeuft = true);
    try {
      final a = widget.anlass;
      if (a == null) {
        await _anlegen();
        return;
      }
      final geschickt = await _z.anlassAendern(a.id, _original, _e);
      if (!mounted) return;
      meldung(context, geschickt ? 'Anlass gespeichert' : 'Nichts geändert');
      Navigator.of(context).pop(geschickt);
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _laeuft = false);
    }
  }

  /// Anlass anlegen, dann die Schichten (sofern die Kategorie welche hat).
  /// Scheitert eine Schicht, steht der Anlass trotzdem - die Meldung sagt,
  /// welche fehlen.
  Future<void> _anlegen() async {
    final id = await _z.anlassAnlegen(_e);
    final fehlen = <String>[];
    if (KategorieFelder.fuer(_e.kategorie).schichten) {
      for (final s in _schichten) {
        try {
          await _z.schichtAnlegen(id, s);
        } on Object {
          fehlen.add(s.name.trim());
        }
      }
    }
    if (!mounted) return;
    meldung(
      context,
      fehlen.isEmpty
          ? 'Anlass angelegt'
          : 'Anlass angelegt, aber diese Schichten fehlen: ${fehlen.join(', ')}',
    );
    Navigator.of(context).pop(true);
  }

  Future<void> _mitgliedWaehlen() async {
    final m = await Navigator.of(context).push<VerzeichnisMitglied>(
      MaterialPageRoute(builder: (_) => MitgliedWaehlenScreen(verwaltung: widget.verwaltung)),
    );
    if (m == null || !mounted) return;
    setState(
      () => _mitglied = OrganisatorAngabe(mitgliedId: m.id, name: m.name, email: m.email ?? ''),
    );
  }

  Future<void> _pdfWaehlen() async {
    final waehlen = widget.verwaltung.umgebung.pdfWaehlen;
    if (waehlen == null) return;
    final GewaehlteDatei? d;
    try {
      d = await waehlen();
    } on Object catch (e) {
      // z.B. Datei zu gross (der Waehler liest sie dann gar nicht erst)
      if (mounted) meldung(context, fehlerText(e));
      return;
    }
    if (d == null || !mounted) return;
    if (!istPdf(d.bytes)) {
      meldung(context, 'Bitte ein PDF wählen.');
      return;
    }
    if (d.bytes.length > pdfHoechstGroesse) {
      meldung(context, 'Das PDF darf höchstens 10 MB gross sein.');
      return;
    }
    setState(() {
      _e.pdfNeu = d;
      _e.pdfEntfernen = false;
    });
  }

  void _pdfEntfernen() => setState(() {
    _e.pdfNeu = null;
    _e.pdfEntfernen = widget.anlass?.pdfDateiname != null;
  });

  Future<void> _schicht({int? index}) async {
    final s = await Navigator.of(context).push<SchichtEntwurf>(
      MaterialPageRoute(
        builder: (_) => SchichtFormular.lokal(
          verwaltung: widget.verwaltung,
          entwurf: index == null ? null : _schichten[index],
          startDatum: _e.beginn?.datum,
        ),
      ),
    );
    if (s == null || !mounted) return;
    setState(() => index == null ? _schichten.add(s) : _schichten[index] = s);
  }

  void _springer() {
    final neu = springerSchichten(_schichten);
    if (neu.isEmpty) {
      meldung(
        context,
        _schichten.isEmpty
            ? 'Keine Zeitfenster - zuerst andere Schichten (Bar, Küche …) anlegen.'
            : 'Alle Zeitfenster haben schon Springer.',
      );
      return;
    }
    setState(() => _schichten.addAll(neu));
    meldung(
      context,
      neu.length == 1 ? '1 Springer-Schicht ergänzt' : '${neu.length} Springer-Schichten ergänzt',
    );
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

  Widget _ueberschrift(String text) => Padding(
    padding: const EdgeInsets.only(top: 20, bottom: 4),
    child: Text(text, style: Theme.of(context).textTheme.titleSmall),
  );

  List<Widget> _organisatorFelder() {
    final t = Theme.of(context);
    return [
      _ueberschrift('Organisator'),
      SegmentedButton<bool>(
        key: const Key('organisator-art'),
        segments: const [
          ButtonSegment(value: false, label: Text('Mitglied'), icon: Icon(Icons.badge_outlined)),
          ButtonSegment(value: true, label: Text('Extern'), icon: Icon(Icons.person_outline)),
        ],
        selected: {_extern},
        onSelectionChanged: (s) => setState(() => _extern = s.first),
      ),
      const SizedBox(height: 8),
      if (!_extern) ...[
        Card(
          margin: EdgeInsets.zero,
          child: ListTile(
            key: const Key('organisator-mitglied'),
            leading: Icon(_mitglied == null ? Icons.person_search : Icons.check_circle),
            title: Text(_mitglied?.name ?? 'Mitglied wählen'),
            subtitle: _mitglied == null || _mitglied!.email.isEmpty ? null : Text(_mitglied!.email),
            onTap: _mitgliedWaehlen,
            trailing: _mitglied == null
                ? const Icon(Icons.chevron_right)
                : IconButton(
                    onPressed: () => setState(() => _mitglied = null),
                    icon: const Icon(Icons.close),
                    tooltip: 'Kein Organisator',
                  ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(
            'Das Mitglied verwaltet den Anlass in der Mitglieder-App - ohne eigenen Zugang.',
            style: t.textTheme.bodySmall,
          ),
        ),
      ] else ...[
        TextFormField(
          key: const Key('organisator-name'),
          controller: _externName,
          decoration: const InputDecoration(labelText: 'Name', hintText: 'z.B. Max Muster'),
        ),
        const SizedBox(height: 12),
        TextFormField(
          key: const Key('organisator-email'),
          controller: _externEmail,
          decoration: const InputDecoration(labelText: 'E-Mail'),
          keyboardType: TextInputType.emailAddress,
          validator: (v) {
            final s = v?.trim() ?? '';
            return s.isEmpty || s.contains('@') ? null : 'Bitte eine gültige E-Mail angeben.';
          },
        ),
        CheckboxListTile(
          key: const Key('organisator-zugang'),
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          title: const Text('Organisator-Zugang erstellen'),
          subtitle: const Text(
            'Login fürs Event-Dashboard; die Zugangsdaten gehen per E-Mail an den Organisator.',
          ),
          value: _zugangErstellen,
          onChanged: (v) => setState(() => _zugangErstellen = v ?? false),
        ),
      ],
    ];
  }

  List<Widget> _pdfFelder() {
    final t = Theme.of(context);
    final waehlen = widget.verwaltung.umgebung.pdfWaehlen;
    final name = _e.pdfNeu?.dateiname ?? (_e.pdfEntfernen ? null : widget.anlass?.pdfDateiname);
    return [
      _ueberschrift('PDF-Aushang'),
      Card(
        margin: EdgeInsets.zero,
        child: ListTile(
          key: const Key('anlass-pdf'),
          leading: const Icon(Icons.picture_as_pdf_outlined),
          title: Text(name ?? 'Kein PDF angehängt'),
          subtitle: _e.pdfNeu != null
              ? Text(
                  '${dateiGroesseText(_e.pdfNeu!.bytes.length)} · Wird beim Speichern hochgeladen',
                )
              : (_e.pdfEntfernen ? const Text('Wird beim Speichern entfernt') : null),
        ),
      ),
      Wrap(
        spacing: 8,
        children: [
          if (waehlen != null)
            TextButton.icon(
              key: const Key('pdf-waehlen'),
              onPressed: _pdfWaehlen,
              icon: const Icon(Icons.attach_file),
              label: Text(name == null ? 'PDF wählen' : 'Anderes PDF'),
            ),
          if (name != null)
            TextButton.icon(
              key: const Key('pdf-entfernen'),
              onPressed: _pdfEntfernen,
              icon: const Icon(Icons.delete_outline),
              label: const Text('Entfernen'),
            ),
        ],
      ),
      if (waehlen == null)
        Text('Ein PDF hochladen geht vorerst nur auf der Website.', style: t.textTheme.bodySmall),
    ];
  }

  List<Widget> _schichtFelder(EventOptionen optionen) {
    String bereich(String w) =>
        optionen.bereiche.where((b) => b.wert == w).map((b) => b.text).firstOrNull ?? w;
    return [
      _ueberschrift('Helfer-Schichten'),
      if (_schichten.isEmpty)
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 4),
          child: Text('Noch keine Schichten.'),
        ),
      for (final (i, s) in _schichten.indexed)
        Card(
          key: Key('neue-schicht-$i'),
          margin: const EdgeInsets.symmetric(vertical: 3),
          child: ListTile(
            title: Text('${bereich(s.bereich)} – ${s.name}'),
            subtitle: Text(
              [
                if (s.datum != null) schweizerDatum(s.datum!),
                if (s.von.isNotEmpty) s.bis.isEmpty ? 'ab ${s.von}' : '${s.von}–${s.bis}',
                '${s.gebraucht} benötigt',
              ].join(' · '),
            ),
            onTap: () => _schicht(index: i),
            trailing: IconButton(
              onPressed: () => setState(() => _schichten.removeAt(i)),
              icon: const Icon(Icons.delete_outline),
              tooltip: 'Schicht entfernen',
            ),
          ),
        ),
      Wrap(
        spacing: 8,
        children: [
          TextButton.icon(
            key: const Key('neue-schicht'),
            onPressed: () => _schicht(),
            icon: const Icon(Icons.add),
            label: const Text('Schicht'),
          ),
          TextButton.icon(
            key: const Key('springer-generieren'),
            onPressed: _springer,
            icon: const Icon(Icons.directions_run),
            label: const Text('Springer generieren'),
          ),
        ],
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(_neu ? 'Neuer Anlass' : 'Anlass bearbeiten')),
      body: FutureBuilder<EventOptionen>(
        future: _optionen,
        builder: (context, o) {
          if (!o.hasData && !o.hasError) return const Center(child: CircularProgressIndicator());
          final optionen = o.data ?? const EventOptionen();
          // Organisator: wie bisher alles. Vorstand: was die Kategorie braucht.
          final felder = _vorstand ? KategorieFelder.fuer(_e.kategorie) : const KategorieFelder();
          final gv =
              (_vorstand ? felder.menue : _e.kategorie == 'GV') ||
              _original.menueOptionen.isNotEmpty;
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
                if (_vorstand)
                  SwitchListTile(
                    key: const Key('anlass-datum-offen'),
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Termin steht noch nicht fest'),
                    subtitle: const Text(
                      'Statt des Datums erscheint überall «Datum noch offen». '
                      'Der Beginn dient nur der Einordnung in der Liste.',
                    ),
                    value: _e.datumOffen,
                    onChanged: (v) => setState(() => _e.datumOffen = v),
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
                  decoration: const InputDecoration(
                    labelText: 'Kosten',
                    hintText: 'z.B. CHF 20.- oder kostenlos',
                  ),
                  onChanged: (v) => _e.kosten = v,
                ),
                if (_vorstand) ..._organisatorFelder(),
                if (felder.anmeldung) ...[
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
                ],
                if (felder.ohneAnmeldung)
                  Padding(
                    padding: const EdgeInsets.only(top: 16),
                    child: Text(
                      'Bei «Ausflug» ist keine Anmeldung nötig. Mit Anmeldung: '
                      '«Ausflug mit Anmeldung» wählen.',
                      style: t.textTheme.bodySmall,
                    ),
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
                if (_vorstand) ..._pdfFelder(),
                if (_vorstand && _neu && felder.schichten) ..._schichtFelder(optionen),
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
            child: Text(_neu ? 'Anlegen' : 'Speichern'),
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
