// Ein Anlass in der Verwaltung, mit Reitern:
//  - Anmeldungen: bestaetigen, ablehnen, aendern, Person eintragen, andere
//    Schicht vorschlagen; oben Informieren, PDFs, Arbeitsplan senden.
//  - Schichten, Notizen, Rezepte & Material — nur wenn der Zugang sie
//    erlaubt ([AnlassRechte]).
// Oben rechts: Anlass bearbeiten.
//
// Gleich fuer Organisator und Vorstand; was geht, sagt der Zugang. Vorbild:
// members-ios OrganizerView, members-android OrganizerDashboardFragment.

import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../bausteine.dart';
import '../modelle.dart';
import '../thema.dart';
import '../zugang.dart';
import 'anlass_bearbeiten_screen.dart';
import 'anmeldung_screens.dart';
import 'material_screen.dart';
import 'notizen_screen.dart';
import 'schichten_screen.dart';

class VerwaltungsAnlassScreen extends StatefulWidget {
  const VerwaltungsAnlassScreen({
    super.key,
    required this.verwaltung,
    required this.anlassId,
    this.eingebettet = false,
  });

  final AnlassVerwaltung verwaltung;

  /// UUID oder Slug; null: der erste (einzige) Anlass des Zugangs.
  final String? anlassId;

  /// Als Reiter der App (externer Organisator): ohne Zurueck-Pfeil.
  final bool eingebettet;

  @override
  State<VerwaltungsAnlassScreen> createState() => _VerwaltungsAnlassScreenState();
}

class _VerwaltungsAnlassScreenState extends State<VerwaltungsAnlassScreen> {
  final _lader = GlobalKey<LadeAnsichtState<VerwalteterAnlass>>();
  VerwalteterAnlass? _anlass;
  final _laeuft = <String>{};

  AnlassVerwaltung get _v => widget.verwaltung;
  AnlassVerwaltungZugang get _z => _v.zugang;

  Future<VerwalteterAnlass> _laden() async {
    final a = await _z.anlass(widget.anlassId);
    if (mounted) setState(() => _anlass = a);
    return a;
  }

  Future<void> _neu() async => _lader.currentState?.neuLaden();

  /// Oeffnet ein Formular; danach neu laden (die Zahlen aendern sich).
  Future<void> _oeffnen(Widget seite) async {
    await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => seite));
    await _neu();
  }

  Future<void> _aktion(String id, Future<void> Function() aufruf, String erfolg) async {
    setState(() => _laeuft.add(id));
    try {
      await aufruf();
      if (mounted) meldung(context, erfolg);
      await _neu();
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _laeuft.remove(id));
    }
  }

  Future<void> _bestaetigen(VerwalteterAnlass a, VerwalteteAnmeldung r) =>
      _aktion(r.id, () => _z.bestaetigen(a.anlass.id, r.id), '${r.name}: bestätigt');

  Future<void> _ablehnen(VerwalteterAnlass a, VerwalteteAnmeldung r) async {
    final ok = await nachfragen(
      context,
      titel: 'Anmeldung ablehnen?',
      text: '${r.name} bekommt eine Nachricht, dass die Anmeldung abgelehnt wurde.',
      ja: 'Ablehnen',
    );
    if (ok) await _aktion(r.id, () => _z.ablehnen(a.anlass.id, r.id), '${r.name}: abgelehnt');
  }

  Future<void> _pdfWaehlen(VerwalteterAnlass a) async {
    final r = _z.rechte(a);
    final wahl = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (r.pdfTeilnehmerliste)
              ListTile(
                leading: const Icon(Icons.list_alt),
                title: const Text('Teilnehmerliste'),
                onTap: () => Navigator.of(context).pop('teilnehmerliste'),
              ),
            if (r.pdfArbeitsplan)
              ListTile(
                leading: const Icon(Icons.grid_view),
                title: const Text('Arbeitsplan'),
                onTap: () => Navigator.of(context).pop('arbeitsplan'),
              ),
            if (r.pdfAushang)
              ListTile(
                leading: const Icon(Icons.description_outlined),
                title: const Text('Aushang'),
                subtitle: a.anlass.pdfDateiname == null ? null : Text(a.anlass.pdfDateiname!),
                onTap: () => Navigator.of(context).pop('aushang'),
              ),
          ],
        ),
      ),
    );
    if (!mounted || wahl == null) return;
    final id = a.anlass.id;
    final titel = a.anlass.titel;
    final u = _v.umgebung;
    switch (wahl) {
      case 'teilnehmerliste':
        await pdfTeilen(
          context,
          u,
          () => _z.teilnehmerlistePdf(id),
          pdfName('Teilnehmerliste', titel),
        );
      case 'arbeitsplan':
        await pdfTeilen(context, u, () => _z.arbeitsplanPdf(id), pdfName('Arbeitsplan', titel));
      case 'aushang':
        await pdfTeilen(
          context,
          u,
          () => _z.aushangPdf(id),
          a.anlass.pdfDateiname ?? pdfName('Aushang', titel),
        );
    }
  }

  Future<void> _arbeitsplanSenden(VerwalteterAnlass a) async {
    final ok = await nachfragen(
      context,
      titel: 'Arbeitsplan senden?',
      text: 'Alle eingeteilten Helfer bekommen den Arbeitsplan per E-Mail (oder Post).',
      ja: 'Senden',
      gefaehrlich: false,
    );
    if (!ok || !mounted) return;
    try {
      final text = await _z.arbeitsplanSenden(a.anlass.id);
      if (mounted) meldung(context, text);
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    }
  }

  List<(Tab, Widget)> _reiter(VerwalteterAnlass a) {
    final r = _z.rechte(a);
    return [
      (const Tab(text: 'Anmeldungen'), _anmeldungen(a)),
      if (r.schichten)
        (const Tab(text: 'Schichten'), SchichtenAnsicht(verwaltung: _v, anlass: a, neuLaden: _neu)),
      if (r.notizen) (const Tab(text: 'Notizen'), NotizenAnsicht(verwaltung: _v, anlass: a.anlass)),
      if (r.material)
        (
          const Tab(text: 'Material'),
          MaterialAnsicht(verwaltung: _v, anlass: a.anlass, einkauf: r.einkauf),
        ),
    ];
  }

  Widget _anmeldungen(VerwalteterAnlass a) {
    final r = _z.rechte(a);
    return Scaffold(
      resizeToAvoidBottomInset: false,
      floatingActionButton: r.hinzufuegen
          ? FloatingActionButton.extended(
              heroTag: 'person-neu',
              onPressed: () => _oeffnen(PersonHinzufuegenScreen(verwaltung: _v, anlass: a.anlass)),
              icon: const Icon(Icons.person_add_alt),
              label: const Text('Person'),
            )
          : null,
      body: RefreshIndicator(
        onRefresh: _neu,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          // Unten Platz fuer den "Person"-Knopf.
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 96),
          children: [
            _Kopf(anlass: a),
            const SizedBox(height: 8),
            _Werkzeuge(
              rechte: r,
              mitteilen: () => _oeffnen(MitteilenScreen(verwaltung: _v, anlass: a.anlass)),
              pdf: () => _pdfWaehlen(a),
              arbeitsplanSenden: () => _arbeitsplanSenden(a),
            ),
            Abschnitt('Anmeldungen (${a.zahlen.anmeldungen})'),
            if (a.anmeldungen.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 4, vertical: 8),
                child: Text('Noch keine Anmeldungen.'),
              ),
            for (final reg in a.anmeldungen)
              AnmeldungKarte(
                anmeldung: reg,
                rechte: r,
                laeuft: _laeuft.contains(reg.id),
                linkOeffnen: _v.umgebung.linkOeffnen,
                bestaetigen: () => _bestaetigen(a, reg),
                ablehnen: () => _ablehnen(a, reg),
                bearbeiten: () =>
                    _oeffnen(AnmeldungBearbeitenScreen(verwaltung: _v, anlass: a, anmeldung: reg)),
                andereSchicht: () =>
                    _oeffnen(AlternativeScreen(verwaltung: _v, anlass: a.anlass, anmeldung: reg)),
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final a = _anlass;
    final reiter = a == null ? const <(Tab, Widget)>[] : _reiter(a);
    final mitReitern = reiter.length > 1;
    final inhalt = LadeAnsicht<VerwalteterAnlass>(
      key: _lader,
      laden: _laden,
      bauen: (context, a, _) {
        final r = _reiter(a);
        return r.length > 1 ? TabBarView(children: [for (final x in r) x.$2]) : r.first.$2;
      },
    );
    final seite = Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: !widget.eingebettet,
        title: Text(a?.anlass.titel ?? _z.bezeichnung),
        actions: [
          if (a != null && _z.rechte(a).anlassBearbeiten)
            IconButton(
              onPressed: () => _oeffnen(AnlassBearbeitenScreen(verwaltung: _v, anlass: a.anlass)),
              icon: const Icon(Icons.edit_outlined),
              tooltip: 'Anlass bearbeiten',
            ),
        ],
        bottom: mitReitern ? reiterAufRot(tabs: [for (final x in reiter) x.$1]) : null,
      ),
      body: inhalt,
    );
    // Die Zahl der Reiter steht erst nach dem Laden fest;
    // DefaultTabController passt sich an.
    return DefaultTabController(length: mitReitern ? reiter.length : 1, child: seite);
  }
}

class _Kopf extends StatelessWidget {
  const _Kopf({required this.anlass});

  final VerwalteterAnlass anlass;

  @override
  Widget build(BuildContext context) {
    final a = anlass.anlass;
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 8, 14, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (a.app.abgesagt || !anlass.aktuell)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Wrap(
                  spacing: 6,
                  children: [
                    if (a.app.abgesagt) const HinweisChip('Abgesagt', art: HinweisArt.schlecht),
                    if (!anlass.aktuell) const HinweisChip('Vorbei'),
                  ],
                ),
              ),
            if (a.app.datumText != null)
              InfoZeile(symbol: Icons.calendar_today_outlined, text: a.app.datumText!),
            if (a.app.zeitText != null) InfoZeile(symbol: Icons.schedule, text: a.app.zeitText!),
            if (a.ort != null) InfoZeile(symbol: Icons.place_outlined, text: a.ort!),
            if (anlass.zahlen.text != null)
              InfoZeile(symbol: Icons.group_outlined, text: anlass.zahlen.text!),
            if (a.app.anmeldung.anmeldeschlussText != null)
              InfoZeile(
                symbol: Icons.event_busy_outlined,
                titel: 'Anmeldeschluss',
                text: a.app.anmeldung.anmeldeschlussText!,
              ),
          ],
        ),
      ),
    );
  }
}

/// Werkzeuge als Knoepfe, die umbrechen statt seitlich zu scrollen.
class _Werkzeuge extends StatelessWidget {
  const _Werkzeuge({
    required this.rechte,
    required this.mitteilen,
    required this.pdf,
    required this.arbeitsplanSenden,
  });

  final AnlassRechte rechte;
  final VoidCallback mitteilen;
  final VoidCallback pdf;
  final VoidCallback arbeitsplanSenden;

  @override
  Widget build(BuildContext context) {
    Widget knopf(IconData symbol, String text, VoidCallback tun) =>
        ActionChip(avatar: Icon(symbol, size: 18), label: Text(text), onPressed: tun);
    return Wrap(
      spacing: 8,
      runSpacing: 4,
      children: [
        if (rechte.mitteilen) knopf(Icons.campaign_outlined, 'Informieren', mitteilen),
        if (rechte.einPdf) knopf(Icons.picture_as_pdf_outlined, 'PDF', pdf),
        if (rechte.arbeitsplanSenden)
          knopf(Icons.send_outlined, 'Arbeitsplan senden', arbeitsplanSenden),
      ],
    );
  }
}

/// Eine Anmeldung mit allem, was der Organisator wissen muss, und den
/// Knoepfen dazu (immer sichtbar, kein Wischen noetig).
class AnmeldungKarte extends StatelessWidget {
  const AnmeldungKarte({
    super.key,
    required this.anmeldung,
    required this.rechte,
    required this.bestaetigen,
    required this.ablehnen,
    required this.bearbeiten,
    required this.andereSchicht,
    required this.linkOeffnen,
    this.laeuft = false,
  });

  final VerwalteteAnmeldung anmeldung;
  final AnlassRechte rechte;
  final bool laeuft;
  final VoidCallback bestaetigen;
  final VoidCallback ablehnen;
  final VoidCallback bearbeiten;
  final VoidCallback andereSchicht;
  final Future<bool> Function(Uri adresse) linkOeffnen;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final r = anmeldung;
    Widget zeile(IconData symbol, String text) => Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(symbol, size: 16, color: t.colorScheme.outline),
          const SizedBox(width: 6),
          Expanded(child: Text(text, style: t.textTheme.bodyMedium)),
        ],
      ),
    );
    final kannAndereSchicht =
        rechte.alternative &&
        r.art == AnmeldeArt.schicht &&
        r.email != null &&
        r.status != 'rejected';
    final alt = r.alternative;
    return Card(
      key: Key('anmeldung-${r.id}'),
      margin: const EdgeInsets.symmetric(vertical: 5),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    r.personen > 1 ? '${r.name} (${r.personen} Personen)' : r.name,
                    style: t.textTheme.titleSmall,
                  ),
                ),
                const SizedBox(width: 8),
                StatusChip(text: r.statusText ?? r.status, farbe: r.statusFarbe),
              ],
            ),
            if (r.angemeldetText != null)
              Text(
                'angemeldet am ${r.angemeldetText}${r.mitglied ? ' · Mitglied' : ' · Gast'}',
                style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.outline),
              ),
            for (final s in r.schichten) zeile(Icons.schedule, s.beschriftung),
            if (r.begleitpersonen.isNotEmpty)
              zeile(
                Icons.group_outlined,
                'Mit: ${r.begleitpersonen.map((b) => b.name).join(', ')}',
              ),
            if (r.menue != null) zeile(Icons.restaurant, 'Menü: ${r.menue}'),
            if (r.allergien != null)
              zeile(Icons.warning_amber_outlined, 'Allergien: ${r.allergien}'),
            if (r.bemerkung != null) zeile(Icons.notes, r.bemerkung!),
            if (alt != null)
              zeile(
                Icons.swap_horiz,
                'Vorgeschlagen: ${alt.schichtText}'
                '${alt.vorgeschlagenText == null ? '' : ' (${alt.vorgeschlagenText})'}',
              ),
            if (r.telefon != null || r.email != null)
              Wrap(
                spacing: 4,
                children: [
                  if (r.telefon != null)
                    TextButton.icon(
                      onPressed: () =>
                          linkOeffnen(Uri(scheme: 'tel', path: r.telefon!.replaceAll(' ', ''))),
                      icon: const Icon(Icons.phone_outlined, size: 18),
                      label: Text(r.telefon!),
                    ),
                  if (r.email != null)
                    TextButton.icon(
                      onPressed: () => linkOeffnen(Uri(scheme: 'mailto', path: r.email)),
                      icon: const Icon(Icons.mail_outline, size: 18),
                      label: Text(r.email!, overflow: TextOverflow.ellipsis),
                    ),
                ],
              ),
            if (laeuft)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: LinearProgressIndicator(),
              )
            else
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  if (r.offen && rechte.bestaetigen) ...[
                    FilledButton(onPressed: bestaetigen, child: const Text('Bestätigen')),
                    OutlinedButton(onPressed: ablehnen, child: const Text('Ablehnen')),
                  ],
                  if (rechte.bearbeiten)
                    TextButton.icon(
                      onPressed: bearbeiten,
                      icon: const Icon(Icons.edit_outlined, size: 18),
                      label: const Text('Ändern'),
                    ),
                  if (kannAndereSchicht)
                    TextButton.icon(
                      onPressed: andereSchicht,
                      icon: const Icon(Icons.swap_horiz, size: 18),
                      label: const Text('Andere Schicht'),
                    ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}
