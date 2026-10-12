// Ausleihen: Zeitraum waehlen -> ausleihbare Artikel und Kisten mit freier
// Menge -> Mengen waehlen -> bestaetigen. Mitglieder leihen fuer sich aus
// (ohne Freigabe); das Lager erfasst hier auch Externe ([fuerExterne]).
// Was frei ist, rechnet das Backend; passt es beim Absenden nicht mehr,
// kommt dessen Meldung (409) und das Angebot wird neu geladen.

import 'package:fwv_anlass/fwv_anlass.dart'
    show
        Abschnitt,
        LadeAnsicht,
        LadeAnsichtState,
        UntenLeiste,
        fehlerText,
        meldung,
        mitSystemleiste;
import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../modelle.dart';
import '../zugang.dart';
import 'bausteine.dart';

/// Oeffnet die Ausleihe; gibt die neue Ausleihe zurueck (oder null).
Future<Ausleihe?> ausleiheNeuOeffnen(
  BuildContext context,
  Ausleihen ausleihen, {
  bool fuerExterne = false,
}) => Navigator.of(context).push<Ausleihe>(
  MaterialPageRoute(
    builder: (_) => AusleiheNeuScreen(ausleihen: ausleihen, fuerExterne: fuerExterne),
  ),
);

class AusleiheNeuScreen extends StatefulWidget {
  const AusleiheNeuScreen({
    super.key,
    required this.ausleihen,
    this.fuerExterne = false,
    this.zeitraum,
  });

  final Ausleihen ausleihen;

  /// Lager: Ausleihe fuer Externe (Name, Organisation, Kontakt).
  final bool fuerExterne;

  /// Vorgewaehlter Zeitraum (sonst zuerst waehlen).
  final DateTimeRange? zeitraum;

  @override
  State<AusleiheNeuScreen> createState() => _AusleiheNeuScreenState();
}

class _AusleiheNeuScreenState extends State<AusleiheNeuScreen> {
  final _lader = GlobalKey<LadeAnsichtState<AusleiheAngebot>>();
  DateTimeRange? _zeitraum;
  AusleiheAngebot? _angebot;
  final _mengen = <int, int>{};
  final _kisten = <int>{};

  AusleiheZugang get _zugang => widget.ausleihen.zugang;

  @override
  void initState() {
    super.initState();
    _zeitraum = widget.zeitraum;
  }

  int get _anzahl => _mengen.values.where((m) => m > 0).length + _kisten.length;

  DateTime get _heute {
    final j = widget.ausleihen.umgebung.jetzt();
    return DateTime(j.year, j.month, j.day);
  }

  Future<void> _zeitraumWaehlen() async {
    final heute = _heute;
    final gewaehlt = await showDateRangePicker(
      context: context,
      firstDate: heute,
      lastDate: heute.add(const Duration(days: 365)),
      initialDateRange: _zeitraum,
      currentDate: heute,
      helpText: 'Von wann bis wann?',
      saveText: 'OK',
    );
    if (gewaehlt == null || !mounted) return;
    setState(() {
      _zeitraum = gewaehlt;
      _angebot = null;
      _mengen.clear();
      _kisten.clear();
    });
  }

  Future<AusleiheAngebot> _laden() async {
    final z = _zeitraum!;
    final a = await _zugang.angebot(z.start, z.end);
    if (!mounted) return a;
    // Auswahl an das neue Angebot anpassen (z.B. nach einem 409).
    setState(() {
      _angebot = a;
      for (final art in a.artikel) {
        final m = _mengen[art.id];
        if (m != null && m > art.frei) _mengen[art.id] = art.frei;
      }
      _kisten.removeWhere((id) => !a.kisten.any((k) => k.id == id && k.frei));
    });
    return a;
  }

  Future<void> _weiter() async {
    final z = _zeitraum;
    final angebot = _angebot;
    if (z == null || angebot == null || _anzahl == 0) return;
    final ergebnis = await Navigator.of(context).push<Object>(
      MaterialPageRoute(
        builder: (_) => _BestaetigenScreen(
          ausleihen: widget.ausleihen,
          fuerExterne: widget.fuerExterne,
          zeitraum: angebot.zeitraumText ?? zeitraumAnzeige(z),
          neu: NeueAusleihe(
            von: z.start,
            bis: z.end,
            artikel: Map.of(_mengen)..removeWhere((_, m) => m <= 0),
            kisten: Set.of(_kisten),
          ),
          angebot: angebot,
        ),
      ),
    );
    if (!mounted) return;
    if (ergebnis is Ausleihe) {
      Navigator.of(context).pop(ergebnis);
    } else if (ergebnis == _neuLaden) {
      await _lader.currentState?.neuLaden();
    }
  }

  @override
  Widget build(BuildContext context) {
    final z = _zeitraum;
    return Scaffold(
      appBar: AppBar(title: Text(widget.fuerExterne ? 'Ausleihe für Externe' : 'Ausleihen')),
      body: Column(
        children: [
          ListTile(
            key: const Key('zeitraum'),
            leading: const Icon(Icons.date_range),
            title: Text(z == null ? 'Zeitraum wählen' : zeitraumAnzeige(z)),
            subtitle: const Text('Abholen bis Zurückbringen'),
            trailing: TextButton(
              key: const Key('zeitraum-waehlen'),
              onPressed: _zeitraumWaehlen,
              child: Text(z == null ? 'Wählen' : 'Ändern'),
            ),
            onTap: _zeitraumWaehlen,
          ),
          const Divider(height: 1),
          Expanded(
            child: z == null
                ? const Center(
                    child: Padding(
                      padding: EdgeInsets.all(24),
                      child: Text(
                        'Zuerst den Zeitraum wählen — dann siehst du, was frei ist.',
                        textAlign: TextAlign.center,
                      ),
                    ),
                  )
                : LadeAnsicht<AusleiheAngebot>(
                    key: _lader,
                    laden: _laden,
                    istLeer: (a) => a.leer,
                    leer: 'Im Moment kann nichts ausgeliehen werden.',
                    bauen: (context, a, _) => _liste(context, a),
                  ),
          ),
        ],
      ),
      bottomNavigationBar: UntenLeiste(
        kinder: [
          FilledButton.icon(
            key: const Key('weiter'),
            onPressed: _anzahl == 0 || _angebot == null ? null : _weiter,
            icon: const Icon(Icons.arrow_forward),
            label: Text(_anzahl == 0 ? 'Etwas auswählen' : 'Weiter ($_anzahl)'),
          ),
        ],
      ),
    );
  }

  Widget _liste(BuildContext context, AusleiheAngebot a) {
    final t = Theme.of(context);
    final klein = t.textTheme.bodySmall?.copyWith(color: t.colorScheme.outline);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: mitSystemleiste(context, const EdgeInsets.only(bottom: 24)),
      children: [
        if (a.artikel.isNotEmpty) const Abschnitt('Artikel'),
        for (final art in a.artikel)
          ListTile(
            key: Key('angebot-artikel-${art.id}'),
            title: Text(art.name),
            subtitle: Text(
              [?art.freiText, ?art.kategorie].join(' · '),
              style: art.frei <= 0 ? klein?.copyWith(color: t.colorScheme.error) : klein,
            ),
            trailing: MengenWaehler(
              schluessel: 'menge-${art.id}',
              wert: _mengen[art.id] ?? 0,
              max: art.frei,
              aendern: (m) => setState(() => _mengen[art.id] = m),
            ),
          ),
        if (a.kisten.isNotEmpty) const Abschnitt('Ganze Kisten'),
        for (final k in a.kisten)
          CheckboxListTile(
            key: Key('angebot-kiste-${k.id}'),
            value: _kisten.contains(k.id),
            onChanged: k.frei
                ? (an) => setState(() => an ?? false ? _kisten.add(k.id) : _kisten.remove(k.id))
                : null,
            title: Text(k.name),
            subtitle: Text(
              [
                ?k.freiText,
                ?k.beschreibung,
                if (k.inhalt.isNotEmpty) 'Inhalt: ${k.inhalt.map((i) => i.anzeige).join(', ')}',
              ].join('\n'),
              style: k.frei ? klein : klein?.copyWith(color: t.colorScheme.error),
            ),
            isThreeLine: k.inhalt.isNotEmpty || k.beschreibung != null,
          ),
      ],
    );
  }
}

/// Rueckgabewert der Bestaetigung: Auswahl passte nicht mehr.
const _neuLaden = 'neu-laden';

/// Zusammenfassung, Notiz (und bei Externen: wer) — dann absenden.
class _BestaetigenScreen extends StatefulWidget {
  const _BestaetigenScreen({
    required this.ausleihen,
    required this.fuerExterne,
    required this.zeitraum,
    required this.neu,
    required this.angebot,
  });

  final Ausleihen ausleihen;
  final bool fuerExterne;
  final String zeitraum;
  final NeueAusleihe neu;
  final AusleiheAngebot angebot;

  @override
  State<_BestaetigenScreen> createState() => _BestaetigenScreenState();
}

class _BestaetigenScreenState extends State<_BestaetigenScreen> {
  final _form = GlobalKey<FormState>();
  final _notiz = TextEditingController();
  final _name = TextEditingController();
  final _organisation = TextEditingController();
  final _telefon = TextEditingController();
  final _email = TextEditingController();
  bool _laeuft = false;

  @override
  void dispose() {
    for (final c in [_notiz, _name, _organisation, _telefon, _email]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _absenden() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() => _laeuft = true);
    try {
      final a = await widget.ausleihen.zugang.anlegen(
        NeueAusleihe(
          von: widget.neu.von,
          bis: widget.neu.bis,
          artikel: widget.neu.artikel,
          kisten: widget.neu.kisten,
          notizen: _notiz.text,
          extern: widget.fuerExterne
              ? ExternePerson(
                  name: _name.text,
                  organisation: _organisation.text,
                  telefon: _telefon.text,
                  email: _email.text,
                )
              : null,
        ),
      );
      if (mounted) Navigator.of(context).pop(a);
    } on ApiFehler catch (e) {
      if (!mounted) return;
      if (e.status == 409) {
        // Inzwischen vergeben: Meldung zeigen, zurueck zur Auswahl.
        setState(() => _laeuft = false);
        await showDialog<void>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Nicht mehr frei'),
            content: Text(e.meldung),
            actions: [
              FilledButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('Auswahl anpassen'),
              ),
            ],
          ),
        );
        if (mounted) Navigator.of(context).pop(_neuLaden);
      } else {
        meldung(context, fehlerText(e));
      }
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _laeuft = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final n = widget.neu;
    final artikel = {for (final a in widget.angebot.artikel) a.id: a};
    final kisten = {for (final k in widget.angebot.kisten) k.id: k};
    return Scaffold(
      appBar: AppBar(title: const Text('Ausleihe bestätigen')),
      body: Form(
        key: _form,
        child: ListView(
          padding: mitSystemleiste(context, const EdgeInsets.fromLTRB(16, 8, 16, 24)),
          children: [
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.date_range),
              title: Text(widget.zeitraum),
              subtitle: const Text('Zeitraum'),
            ),
            for (final e in n.artikel.entries)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.inventory_outlined),
                title: Text(artikel[e.key]?.name ?? 'Artikel ${e.key}'),
                trailing: Text(
                  [e.value, ?artikel[e.key]?.einheit].join(' '),
                  style: Theme.of(context).textTheme.titleSmall,
                ),
              ),
            for (final id in n.kisten)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.inventory_2_outlined),
                title: Text(kisten[id]?.name ?? 'Kiste $id'),
                subtitle: (kisten[id]?.inhalt.isEmpty ?? true)
                    ? null
                    : Text(kisten[id]!.inhalt.map((i) => i.anzeige).join(', ')),
              ),
            if (widget.fuerExterne) ...[
              const Abschnitt('Ausgeliehen an'),
              TextFormField(
                key: const Key('extern-name'),
                controller: _name,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Name *'),
                validator: (v) => (v ?? '').trim().isEmpty ? 'Bitte einen Namen angeben.' : null,
              ),
              TextFormField(
                key: const Key('extern-organisation'),
                controller: _organisation,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Verein / Firma'),
              ),
              TextFormField(
                key: const Key('extern-telefon'),
                controller: _telefon,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(labelText: 'Telefon'),
              ),
              TextFormField(
                key: const Key('extern-email'),
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: 'E-Mail'),
                validator: (v) {
                  final t = (v ?? '').trim();
                  return t.isEmpty || RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(t)
                      ? null
                      : 'Diese E-Mail-Adresse stimmt nicht.';
                },
              ),
            ],
            const SizedBox(height: 12),
            TextFormField(
              key: const Key('ausleihe-notiz'),
              controller: _notiz,
              minLines: 2,
              maxLines: 5,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                labelText: 'Notiz (optional)',
                hintText: 'z.B. wofür, Abholzeit',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            Text(
              widget.fuerExterne
                  ? 'Die Ausleihe ist sofort reserviert.'
                  : 'Ohne Freigabe: die Ausleihe ist sofort reserviert, das Lager wird '
                        'benachrichtigt und du bekommst eine Bestätigung per E-Mail.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
      bottomNavigationBar: UntenLeiste(
        kinder: [
          FilledButton.icon(
            key: const Key('ausleihen-absenden'),
            onPressed: _laeuft ? null : _absenden,
            icon: _laeuft
                ? const SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.check),
            label: Text(widget.fuerExterne ? 'Ausleihe erfassen' : 'Verbindlich ausleihen'),
          ),
        ],
      ),
    );
  }
}
