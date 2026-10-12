// Formulare rund um Anmeldungen: aendern/loeschen, Person eintragen, andere
// Schicht vorschlagen, Angemeldete informieren. Vorbild: members-ios
// OrganizerRegistrationSheets.swift, members-android Add-/
// EditRegistrationDialog.
//
// Anmeldung aendern schickt nur geaenderte Felder (AnmeldungEntwurf);
// Begleitpersonen, Allergien und Menue stehen nicht im Formular und bleiben
// erhalten — anders als in der alten iOS-App.

import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../bausteine.dart';
import '../daten.dart';
import '../modelle.dart';
import '../zugang.dart';

String? _pflicht(String? wert, String text) => (wert == null || wert.trim().isEmpty) ? text : null;

String? _emailPruefen(String? wert) {
  final t = wert?.trim() ?? '';
  if (t.isEmpty) return null;
  return RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(t)
      ? null
      : 'Bitte eine gültige E-Mail-Adresse angeben.';
}

// ---------------------------------------------------------------------------

class AnmeldungBearbeitenScreen extends StatefulWidget {
  const AnmeldungBearbeitenScreen({
    super.key,
    required this.verwaltung,
    required this.anlass,
    required this.anmeldung,
  });

  final AnlassVerwaltung verwaltung;
  final VerwalteterAnlass anlass;
  final VerwalteteAnmeldung anmeldung;

  @override
  State<AnmeldungBearbeitenScreen> createState() => _AnmeldungBearbeitenScreenState();
}

class _AnmeldungBearbeitenScreenState extends State<AnmeldungBearbeitenScreen> {
  final _form = GlobalKey<FormState>();
  late final AnmeldungEntwurf _e = AnmeldungEntwurf.aus(widget.anmeldung);
  bool _laeuft = false;

  VerwalteteAnmeldung get _r => widget.anmeldung;

  Future<void> _speichern() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() => _laeuft = true);
    try {
      final geschickt = await widget.verwaltung.zugang.anmeldungAendern(
        widget.anlass.anlass.id,
        _r,
        _e,
      );
      if (!mounted) return;
      meldung(context, geschickt ? 'Anmeldung gespeichert' : 'Nichts geändert');
      Navigator.of(context).pop(geschickt);
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _laeuft = false);
    }
  }

  Future<void> _loeschen() async {
    final ok = await nachfragen(
      context,
      titel: 'Anmeldung löschen?',
      text: 'Die Anmeldung von ${_r.name} wird entfernt.',
      ja: 'Löschen',
    );
    if (!ok || !mounted) return;
    setState(() => _laeuft = true);
    try {
      await widget.verwaltung.zugang.anmeldungLoeschen(widget.anlass.anlass.id, _r.id);
      if (!mounted) return;
      meldung(context, 'Anmeldung gelöscht');
      Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _laeuft = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final gast = !_r.mitglied;
    final bleibt = [
      if (_r.begleitpersonen.isNotEmpty)
        'Begleitpersonen: ${_r.begleitpersonen.map((b) => b.name).join(', ')}',
      if (_r.allergien != null) 'Allergien: ${_r.allergien}',
      if (_r.menue != null) 'Menü: ${_r.menue}',
      for (final s in _r.schichten) 'Schicht: ${s.beschriftung}',
    ];
    return Scaffold(
      appBar: AppBar(title: const Text('Anmeldung ändern')),
      body: Form(
        key: _form,
        child: ListView(
          padding: mitSystemleiste(context, const EdgeInsets.all(16)),
          children: [
            if (gast) ...[
              TextFormField(
                initialValue: _e.name,
                decoration: const InputDecoration(labelText: 'Name *'),
                textCapitalization: TextCapitalization.words,
                validator: (v) => _pflicht(v, 'Bitte einen Namen angeben.'),
                onChanged: (v) => _e.name = v,
              ),
              const SizedBox(height: 12),
              TextFormField(
                initialValue: _e.email,
                decoration: const InputDecoration(labelText: 'E-Mail'),
                keyboardType: TextInputType.emailAddress,
                autocorrect: false,
                validator: _emailPruefen,
                onChanged: (v) => _e.email = v,
              ),
            ] else
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.badge_outlined),
                title: Text(_r.name),
                subtitle: Text(
                  [
                    ?_r.email,
                    'Mitglied — Name und E-Mail stehen im Mitgliederverzeichnis',
                  ].join('\n'),
                ),
              ),
            const SizedBox(height: 12),
            TextFormField(
              initialValue: _e.telefon,
              decoration: const InputDecoration(labelText: 'Telefon'),
              keyboardType: TextInputType.phone,
              onChanged: (v) => _e.telefon = v,
            ),
            const SizedBox(height: 16),
            ZahlWaehler(
              titel: 'Personen',
              wert: _e.personen,
              max: 50,
              aendern: (n) => setState(() => _e.personen = n),
            ),
            const SizedBox(height: 12),
            TextFormField(
              initialValue: _e.bemerkung,
              decoration: const InputDecoration(labelText: 'Bemerkung'),
              minLines: 2,
              maxLines: 5,
              onChanged: (v) => _e.bemerkung = v,
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              key: const Key('anmeldung-status'),
              initialValue: _e.status,
              decoration: const InputDecoration(labelText: 'Status'),
              items: [
                const DropdownMenuItem(value: 'pending', child: Text('offen')),
                const DropdownMenuItem(value: 'approved', child: Text('bestätigt')),
                const DropdownMenuItem(value: 'rejected', child: Text('abgelehnt')),
                if (!['pending', 'approved', 'rejected'].contains(_r.status))
                  DropdownMenuItem(value: _r.status, child: Text(_r.statusText ?? _r.status)),
              ],
              onChanged: (v) => setState(() => _e.status = v ?? _e.status),
            ),
            if (bleibt.isNotEmpty) ...[
              const SizedBox(height: 20),
              Text('Bleibt unverändert', style: t.textTheme.titleSmall),
              const SizedBox(height: 4),
              for (final b in bleibt) Text(b, style: t.textTheme.bodyMedium),
            ],
            if (widget.anlass.rechte.loeschen) ...[
              const SizedBox(height: 24),
              OutlinedButton.icon(
                onPressed: _laeuft ? null : _loeschen,
                style: OutlinedButton.styleFrom(foregroundColor: t.colorScheme.error),
                icon: const Icon(Icons.delete_outline),
                label: const Text('Anmeldung löschen'),
              ),
            ],
          ],
        ),
      ),
      bottomNavigationBar: UntenLeiste(
        kinder: [
          FilledButton(
            key: const Key('anmeldung-speichern'),
            onPressed: _laeuft ? null : _speichern,
            child: const Text('Speichern'),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------

/// Person von Hand eintragen (telefonisch gemeldet): Mitglied aus dem
/// Verzeichnis oder Gast. Wird gleich bestaetigt.
class PersonHinzufuegenScreen extends StatefulWidget {
  const PersonHinzufuegenScreen({super.key, required this.verwaltung, required this.anlass});

  final AnlassVerwaltung verwaltung;
  final Anlass anlass;

  @override
  State<PersonHinzufuegenScreen> createState() => _PersonHinzufuegenScreenState();
}

class _PersonHinzufuegenScreenState extends State<PersonHinzufuegenScreen> {
  final _form = GlobalKey<FormState>();
  late final Future<List<VerzeichnisMitglied>> _verzeichnis = widget.verwaltung.zugang
      .mitgliederVerzeichnis();
  bool _alsGast = false;
  String _suche = '';
  VerzeichnisMitglied? _mitglied;
  String _name = '';
  String _email = '';
  String _telefon = '';
  int _personen = 1;
  String _bemerkung = '';
  bool _laeuft = false;

  Future<void> _speichern() async {
    if (!_alsGast && _mitglied == null) {
      meldung(context, 'Bitte ein Mitglied auswählen.');
      return;
    }
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() => _laeuft = true);
    try {
      await widget.verwaltung.zugang.personHinzufuegen(
        widget.anlass.id,
        NeuePerson(
          mitgliedId: _alsGast ? null : _mitglied!.id,
          name: _alsGast ? _name : null,
          email: _alsGast ? _email : null,
          telefon: _alsGast ? _telefon : null,
          personen: _personen,
          bemerkung: _bemerkung,
        ),
      );
      if (!mounted) return;
      meldung(context, '${_alsGast ? _name.trim() : _mitglied!.name} eingetragen');
      Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _laeuft = false);
    }
  }

  Widget _mitgliedWahl() => FutureBuilder<List<VerzeichnisMitglied>>(
    future: _verzeichnis,
    builder: (context, v) {
      if (v.hasError) return Text(fehlerText(v.error!));
      if (!v.hasData) {
        return const Padding(
          padding: EdgeInsets.all(16),
          child: Center(child: CircularProgressIndicator()),
        );
      }
      final s = _suche.trim().toLowerCase();
      final treffer = [
        for (final m in v.data!)
          if (s.isEmpty || m.name.toLowerCase().contains(s)) m,
      ];
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_mitglied != null)
            Card(
              child: ListTile(
                leading: const Icon(Icons.check_circle),
                title: Text(_mitglied!.name),
                subtitle: _mitglied!.funktion == null ? null : Text(_mitglied!.funktion!),
                trailing: IconButton(
                  onPressed: () => setState(() => _mitglied = null),
                  icon: const Icon(Icons.close),
                  tooltip: 'Andere Person',
                ),
              ),
            )
          else ...[
            TextField(
              key: const Key('mitglied-suche'),
              decoration: const InputDecoration(
                labelText: 'Mitglied suchen',
                prefixIcon: Icon(Icons.search),
              ),
              onChanged: (t) => setState(() => _suche = t),
            ),
            // Nur so viele wie noetig zeichnen; das Verzeichnis hat einige
            // hundert Eintraege.
            for (final m in treffer.take(s.isEmpty ? 15 : 40))
              ListTile(
                title: Text(m.name),
                subtitle: m.funktion == null ? null : Text(m.funktion!),
                onTap: () => setState(() => _mitglied = m),
              ),
            if (treffer.isEmpty)
              const Padding(padding: EdgeInsets.all(8), child: Text('Niemand gefunden.')),
          ],
        ],
      );
    },
  );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Person eintragen')),
      body: Form(
        key: _form,
        child: ListView(
          padding: mitSystemleiste(context, const EdgeInsets.all(16)),
          children: [
            SegmentedButton<bool>(
              segments: const [
                ButtonSegment(
                  value: false,
                  label: Text('Mitglied'),
                  icon: Icon(Icons.badge_outlined),
                ),
                ButtonSegment(value: true, label: Text('Gast'), icon: Icon(Icons.person_outline)),
              ],
              selected: {_alsGast},
              onSelectionChanged: (w) => setState(() => _alsGast = w.first),
            ),
            const SizedBox(height: 12),
            if (_alsGast) ...[
              TextFormField(
                decoration: const InputDecoration(labelText: 'Name *'),
                textCapitalization: TextCapitalization.words,
                validator: (v) => _pflicht(v, 'Bitte einen Namen angeben.'),
                onChanged: (v) => _name = v,
              ),
              const SizedBox(height: 12),
              TextFormField(
                decoration: const InputDecoration(labelText: 'E-Mail'),
                keyboardType: TextInputType.emailAddress,
                autocorrect: false,
                validator: _emailPruefen,
                onChanged: (v) => _email = v,
              ),
              const SizedBox(height: 12),
              TextFormField(
                decoration: const InputDecoration(labelText: 'Telefon'),
                keyboardType: TextInputType.phone,
                onChanged: (v) => _telefon = v,
              ),
            ] else
              _mitgliedWahl(),
            const SizedBox(height: 16),
            ZahlWaehler(
              titel: 'Personen',
              wert: _personen,
              aendern: (n) => setState(() => _personen = n),
            ),
            const SizedBox(height: 12),
            TextFormField(
              decoration: const InputDecoration(labelText: 'Bemerkung'),
              minLines: 1,
              maxLines: 4,
              onChanged: (v) => _bemerkung = v,
            ),
            const SizedBox(height: 8),
            Text(
              'Die Anmeldung ist gleich bestätigt.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
      bottomNavigationBar: UntenLeiste(
        kinder: [
          FilledButton(
            key: const Key('person-eintragen'),
            onPressed: _laeuft ? null : _speichern,
            child: const Text('Eintragen'),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------

/// Einer angemeldeten Person eine andere Schicht vorschlagen. Das Backend
/// schickt eine E-Mail mit "Ja"/"Nein"-Link.
class AlternativeScreen extends StatefulWidget {
  const AlternativeScreen({
    super.key,
    required this.verwaltung,
    required this.anlass,
    required this.anmeldung,
  });

  final AnlassVerwaltung verwaltung;
  final Anlass anlass;
  final VerwalteteAnmeldung anmeldung;

  @override
  State<AlternativeScreen> createState() => _AlternativeScreenState();
}

class _AlternativeScreenState extends State<AlternativeScreen> {
  String? _schichtId;
  String _kommentar = '';
  bool _laeuft = false;

  List<Schicht> get _schichten => [
    for (final s in widget.anlass.schichten)
      if (!widget.anmeldung.schichtIds.contains(s.id)) s,
  ];

  String _text(Schicht s) => [
    s.app.bereichText ?? s.name,
    s.app.datumText,
    s.app.zeitText,
  ].whereType<String>().join(' · ');

  Future<void> _senden() async {
    final s = _schichten.firstWhere((s) => s.id == _schichtId);
    setState(() => _laeuft = true);
    try {
      final text = await widget.verwaltung.zugang.alternativeVorschlagen(
        widget.anlass.id,
        widget.anmeldung.id,
        schichtId: s.id,
        schichtText: _text(s),
        email: widget.anmeldung.email!,
        kommentar: _kommentar,
      );
      if (!mounted) return;
      meldung(context, text);
      Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _laeuft = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final r = widget.anmeldung;
    return Scaffold(
      appBar: AppBar(title: const Text('Andere Schicht')),
      body: ListView(
        padding: mitSystemleiste(context, const EdgeInsets.symmetric(vertical: 8)),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: Text(
              '${r.name} bekommt eine E-Mail an ${r.email} und kann den Vorschlag annehmen oder ablehnen.',
              style: t.textTheme.bodyMedium,
            ),
          ),
          if (_schichten.isEmpty)
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text('Es gibt keine andere Schicht.'),
            ),
          RadioGroup<String>(
            groupValue: _schichtId,
            onChanged: (v) => setState(() => _schichtId = v),
            child: Column(
              children: [
                for (final s in _schichten)
                  RadioListTile<String>(
                    value: s.id,
                    title: Text(_text(s)),
                    subtitle: s.app.belegung.text == null ? null : Text(s.app.belegung.text!),
                  ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              decoration: const InputDecoration(labelText: 'Nachricht (optional)'),
              minLines: 2,
              maxLines: 5,
              onChanged: (v) => _kommentar = v,
            ),
          ),
        ],
      ),
      bottomNavigationBar: UntenLeiste(
        kinder: [
          FilledButton(
            onPressed: _laeuft || _schichtId == null ? null : _senden,
            child: const Text('Vorschlag senden'),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------

/// Alle Angemeldeten informieren; danach steht, wen die Nachricht wie
/// erreicht hat — und wen nicht.
class MitteilenScreen extends StatefulWidget {
  const MitteilenScreen({super.key, required this.verwaltung, required this.anlass});

  final AnlassVerwaltung verwaltung;
  final Anlass anlass;

  @override
  State<MitteilenScreen> createState() => _MitteilenScreenState();
}

class _MitteilenScreenState extends State<MitteilenScreen> {
  final _form = GlobalKey<FormState>();
  late final _betreff = TextEditingController(text: 'Änderung: ${widget.anlass.titel}');
  final _nachricht = TextEditingController();
  MitteilungErgebnis? _ergebnis;
  bool _laeuft = false;

  @override
  void dispose() {
    _betreff.dispose();
    _nachricht.dispose();
    super.dispose();
  }

  Future<void> _senden() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() => _laeuft = true);
    try {
      final e = await widget.verwaltung.zugang.mitteilen(
        widget.anlass.id,
        betreff: _betreff.text,
        nachricht: _nachricht.text,
      );
      if (mounted) setState(() => _ergebnis = e);
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _laeuft = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final e = _ergebnis;
    return Scaffold(
      appBar: AppBar(title: const Text('Angemeldete informieren')),
      body: Form(
        key: _form,
        child: ListView(
          padding: mitSystemleiste(context, const EdgeInsets.all(16)),
          children: [
            if (e == null) ...[
              Text(
                'Geht an alle offenen und bestätigten Anmeldungen: per E-Mail, an Mitglieder mit '
                'Briefzustellung per Post, dazu eine Mitteilung in der App.',
                style: t.textTheme.bodyMedium,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _betreff,
                decoration: const InputDecoration(labelText: 'Betreff *'),
                validator: (v) => _pflicht(v, 'Bitte einen Betreff angeben.'),
              ),
              const SizedBox(height: 12),
              TextFormField(
                key: const Key('mitteilung-text'),
                controller: _nachricht,
                decoration: const InputDecoration(labelText: 'Nachricht *'),
                minLines: 5,
                maxLines: 12,
                validator: (v) => _pflicht(v, 'Bitte eine Nachricht schreiben.'),
              ),
            ] else ...[
              Text('Gesendet', style: t.textTheme.titleLarge),
              const SizedBox(height: 8),
              ListTile(
                leading: const Icon(Icons.mail_outline),
                title: Text('Per E-Mail: ${e.perEmail}'),
              ),
              if (e.perPost > 0)
                ListTile(
                  leading: const Icon(Icons.local_post_office_outlined),
                  title: Text('Per Post: ${e.perPost}'),
                ),
              ListTile(
                leading: const Icon(Icons.notifications_outlined),
                title: Text('Mitteilung in der App: ${e.perPush}'),
              ),
              if (e.uebersprungen > 0)
                ListTile(
                  leading: const Icon(Icons.block),
                  title: Text('Übersprungen: ${e.uebersprungen}'),
                ),
              if (e.nichtErreicht.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  'Nicht erreicht — bitte selbst informieren:',
                  style: t.textTheme.titleSmall?.copyWith(color: t.colorScheme.error),
                ),
                for (final n in e.nichtErreicht) Text('• $n'),
              ],
            ],
          ],
        ),
      ),
      bottomNavigationBar: UntenLeiste(
        kinder: [
          if (e == null)
            FilledButton.icon(
              key: const Key('mitteilung-senden'),
              onPressed: _laeuft ? null : _senden,
              icon: const Icon(Icons.send),
              label: const Text('Senden'),
            )
          else
            FilledButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Fertig'),
            ),
        ],
      ),
    );
  }
}
