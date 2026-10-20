// Ein Anlass in der Verwaltung, mit Reitern:
//  - Anmeldungen: bestaetigen, ablehnen, aendern, Person eintragen, andere
//    Schicht vorschlagen; oben Informieren, PDFs, Arbeitsplan senden. Eine
//    Karte pro Person, darin ihre Schichten chronologisch ([PersonKarte]).
//  - Schichten, Notizen, Rezepte & Material — nur wenn der Zugang sie
//    erlaubt ([AnlassRechte]).
// Oben rechts: Anlass bearbeiten; der Vorstand kann ihn auch loeschen.
// Werkzeug "Organisatoren": Mitorganisatoren verwalten (Vorstand und
// Haupt-Organisator, organisatoren_screen.dart).
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
import 'organisatoren_screen.dart';
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

  /// Nur Vorstand: Anlass mit Schichten und Anmeldungen loeschen.
  Future<void> _loeschen(VerwalteterAnlass a) async {
    final n = a.zahlen.anmeldungen;
    final ok = await nachfragen(
      context,
      titel: 'Anlass löschen?',
      text:
          '«${a.anlass.titel}» wird mit allen Schichten'
          '${n > 0 ? ' und $n ${n == 1 ? 'Anmeldung' : 'Anmeldungen'}' : ''} endgültig gelöscht. '
          'Die Angemeldeten bekommen keine Nachricht - vorher informieren oder den Anlass '
          'lieber absagen (Status «Abgesagt»).',
      ja: 'Löschen',
    );
    if (!ok || !mounted) return;
    setState(() => _laeuft.add('anlass'));
    try {
      await _z.anlassLoeschen(a.anlass.id);
      if (!mounted) return;
      meldung(context, 'Anlass gelöscht');
      Navigator.of(context).maybePop(true);
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _laeuft.remove('anlass'));
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

  /// "Anmeldungen (4)" - mit Schichten "Anmeldungen (3 Personen · 5 Schichten)",
  /// weil eine Karte pro Person mehrere Anmeldungen zusammenfasst.
  String _anmeldungenTitel(VerwalteterAnlass a, List<AnmeldePerson> personen) {
    final schichten = personen.fold(0, (n, p) => n + p.schichten);
    if (schichten == 0) return 'Anmeldungen (${a.anmeldungen.length})';
    final n = personen.length;
    return 'Anmeldungen ($n ${n == 1 ? 'Person' : 'Personen'} · '
        '$schichten ${schichten == 1 ? 'Schicht' : 'Schichten'})';
  }

  Widget _anmeldungen(VerwalteterAnlass a) {
    final r = _z.rechte(a);
    final personen = anmeldungenNachPerson(a.anmeldungen, a.anlass.schichten);
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
          // Breit genug fuer Personen-Karten in Spalten.
          padding: mitSystemleiste(
            context,
            const EdgeInsets.fromLTRB(12, 8, 12, 96),
            maxBreite: kartenBreite,
          ),
          children: [
            _Kopf(anlass: a),
            const SizedBox(height: 8),
            _Werkzeuge(
              rechte: r,
              mitteilen: () => _oeffnen(MitteilenScreen(verwaltung: _v, anlass: a.anlass)),
              pdf: () => _pdfWaehlen(a),
              arbeitsplanSenden: () => _arbeitsplanSenden(a),
              organisatoren: () => _oeffnen(OrganisatorenScreen(verwaltung: _v, anlass: a.anlass)),
              einladen: switch (_v.einladen) {
                final e? => () => e(context, a.anlass),
                null => null,
              },
            ),
            Abschnitt(_anmeldungenTitel(a, personen)),
            if (a.anmeldungen.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 4, vertical: 8),
                child: Text('Noch keine Anmeldungen.'),
              ),
            KartenSpalten(
              minBreite: 400,
              children: [
                for (final p in personen)
                  PersonKarte(
                    person: p,
                    rechte: r,
                    laeuft: _laeuft,
                    linkOeffnen: _v.umgebung.linkOeffnen,
                    bestaetigen: (reg) => _bestaetigen(a, reg),
                    ablehnen: (reg) => _ablehnen(a, reg),
                    bearbeiten: (reg) => _oeffnen(
                      AnmeldungBearbeitenScreen(verwaltung: _v, anlass: a, anmeldung: reg),
                    ),
                    andereSchicht: (reg) => _oeffnen(
                      AlternativeScreen(verwaltung: _v, anlass: a.anlass, anmeldung: reg),
                    ),
                  ),
              ],
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
              onPressed: () => _oeffnen(
                AnlassBearbeitenScreen(
                  verwaltung: _v,
                  anlass: a.anlass,
                  organisator: _z.kannAnlegen ? a.organisatorAngabe : null,
                ),
              ),
              icon: const Icon(Icons.edit_outlined),
              tooltip: 'Anlass bearbeiten',
            ),
          if (a != null && _z.kannLoeschen)
            IconButton(
              key: const Key('anlass-loeschen'),
              onPressed: _laeuft.contains('anlass') ? null : () => _loeschen(a),
              icon: const Icon(Icons.delete_outline),
              tooltip: 'Anlass löschen',
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
        child: _mitLogo(
          Column(
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
      ),
    );
  }

  /// Logo (falls vorhanden) rechts neben den Angaben; ohne Logo unveraendert.
  Widget _mitLogo(Widget inhalt) {
    final logo = anlass.anlass.app.logo;
    if (logo == null) return inhalt;
    return Row(
      children: [
        Expanded(child: inhalt),
        AnlassLogo(
          key: const Key('anlass-logo'),
          logo: logo,
          groesse: 64,
          abstand: const EdgeInsets.only(left: 12),
        ),
      ],
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
    required this.organisatoren,
    this.einladen,
  });

  final AnlassRechte rechte;
  final VoidCallback mitteilen;
  final VoidCallback pdf;
  final VoidCallback arbeitsplanSenden;

  /// Mitorganisatoren verwalten (Vorstand und Haupt-Organisator).
  final VoidCallback organisatoren;

  /// Einladung an die Mitglieder (nur Vorstand), sonst null.
  final VoidCallback? einladen;

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
        if (rechte.organisatorenVerwalten)
          knopf(Icons.groups_outlined, 'Organisatoren', organisatoren),
        if (einladen case final e?) knopf(Icons.mail_outline, 'Einladung', e),
      ],
    );
  }
}

/// Eine Person mit all ihren Anmeldungen: Name, Mitglied/Gast, Telefon und
/// E-Mail einmal, darunter die Schichten chronologisch - jede mit ihrer
/// Notiz und den Aktionen ihrer Anmeldung (Bestaetigen/Ablehnen sichtbar,
/// Aendern und Andere Schicht im Menue mit den drei Punkten).
///
/// Die Aktionen gehoeren immer zur jeweiligen Anmeldung, nicht zur Person.
class PersonKarte extends StatelessWidget {
  const PersonKarte({
    super.key,
    required this.person,
    required this.rechte,
    required this.bestaetigen,
    required this.ablehnen,
    required this.bearbeiten,
    required this.andereSchicht,
    required this.linkOeffnen,
    this.laeuft = const {},
  });

  final AnmeldePerson person;
  final AnlassRechte rechte;

  /// IDs der Anmeldungen, bei denen gerade etwas laeuft.
  final Set<String> laeuft;
  final void Function(VerwalteteAnmeldung r) bestaetigen;
  final void Function(VerwalteteAnmeldung r) ablehnen;
  final void Function(VerwalteteAnmeldung r) bearbeiten;
  final void Function(VerwalteteAnmeldung r) andereSchicht;
  final Future<bool> Function(Uri adresse) linkOeffnen;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final p = person;
    final r0 = p.erste;
    final einzeln = p.anmeldungen.length == 1;
    // "angemeldet am" in den Kopf, wenn alle am selben Tag kamen.
    final angemeldet = {for (final r in p.anmeldungen) r.angemeldetText};
    final angemeldetKopf = angemeldet.length == 1 ? angemeldet.first : null;
    final unterzeile = [
      if (angemeldetKopf != null) 'angemeldet am $angemeldetKopf',
      p.mitglied ? 'Mitglied' : 'Gast',
    ].join(' · ');
    final telefon = p.telefon;
    final email = p.email;
    return Card(
      key: Key('person-${p.schluessel}'),
      margin: const EdgeInsets.symmetric(vertical: 5),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 6, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      einzeln && r0.personen > 1 ? '${p.name} (${r0.personen} Personen)' : p.name,
                      style: t.textTheme.titleSmall,
                    ),
                  ),
                  if (p.einStatus) ...[
                    const SizedBox(width: 8),
                    StatusChip(text: r0.statusText ?? r0.status, farbe: r0.statusFarbe),
                  ],
                ],
              ),
            ),
            Text(unterzeile, style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.outline)),
            if (telefon != null || email != null)
              Wrap(
                children: [
                  if (telefon != null)
                    TextButton.icon(
                      style: _knopfStil,
                      onPressed: () =>
                          linkOeffnen(Uri(scheme: 'tel', path: telefon.replaceAll(' ', ''))),
                      icon: const Icon(Icons.phone_outlined, size: 18),
                      label: Text(telefon),
                    ),
                  if (email != null)
                    TextButton.icon(
                      style: _knopfStil,
                      onPressed: () => linkOeffnen(Uri(scheme: 'mailto', path: email)),
                      icon: const Icon(Icons.mail_outline, size: 18),
                      label: Text(email, overflow: TextOverflow.ellipsis),
                    ),
                ],
              ),
            for (final (i, r) in p.anmeldungen.indexed) ...[
              if (i > 0) const Divider(height: 12, endIndent: 8),
              _AnmeldungZeile(
                anmeldung: r,
                rechte: rechte,
                mitStatus: !p.einStatus,
                mitPersonen: !einzeln,
                angemeldet: angemeldetKopf == null ? r.angemeldetText : null,
                laeuft: laeuft.contains(r.id),
                bestaetigen: () => bestaetigen(r),
                ablehnen: () => ablehnen(r),
                bearbeiten: () => bearbeiten(r),
                andereSchicht: () => andereSchicht(r),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Kleine Knoepfe, damit die Karte kompakt bleibt.
final _knopfStil = TextButton.styleFrom(
  visualDensity: VisualDensity.compact,
  padding: const EdgeInsets.symmetric(horizontal: 8),
);

/// Eine Anmeldung in der [PersonKarte]: ihre Schicht(en) bzw. "ohne
/// Schicht", die Notizen und die Aktionen.
class _AnmeldungZeile extends StatelessWidget {
  const _AnmeldungZeile({
    required this.anmeldung,
    required this.rechte,
    required this.mitStatus,
    required this.mitPersonen,
    required this.angemeldet,
    required this.laeuft,
    required this.bestaetigen,
    required this.ablehnen,
    required this.bearbeiten,
    required this.andereSchicht,
  });

  final VerwalteteAnmeldung anmeldung;
  final AnlassRechte rechte;

  /// Status pro Anmeldung zeigen (die Person hat gemischte Status).
  final bool mitStatus;

  /// "N Personen" hier zeigen statt im Kopf (mehrere Anmeldungen).
  final bool mitPersonen;

  /// "angemeldet am", wenn es nicht im Kopf steht.
  final String? angemeldet;
  final bool laeuft;
  final VoidCallback bestaetigen;
  final VoidCallback ablehnen;
  final VoidCallback bearbeiten;
  final VoidCallback andereSchicht;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final r = anmeldung;
    Widget zeile(IconData symbol, String text, {TextStyle? stil}) => Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(symbol, size: 16, color: t.colorScheme.outline),
          const SizedBox(width: 6),
          Expanded(child: Text(text, style: stil ?? t.textTheme.bodyMedium)),
        ],
      ),
    );
    final kannAndereSchicht =
        rechte.alternative &&
        r.art == AnmeldeArt.schicht &&
        r.email != null &&
        r.status != 'rejected';
    final mitMenue = rechte.bearbeiten || kannAndereSchicht;
    final alt = r.alternative;
    final klein = t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant);
    final personen = mitPersonen && r.personen > 1 ? ' · ${r.personen} Personen' : '';
    final schichtStil = t.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w500);
    return Column(
      key: Key('anmeldung-${r.id}'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (r.schichten.isEmpty)
                    zeile(Icons.event_outlined, 'ohne Schicht$personen', stil: schichtStil),
                  for (final (i, s) in r.schichten.indexed)
                    zeile(
                      Icons.schedule,
                      i == 0 ? '${s.beschriftung}$personen' : s.beschriftung,
                      stil: schichtStil,
                    ),
                  if (mitStatus)
                    Padding(
                      padding: const EdgeInsets.only(top: 4, left: 22),
                      child: StatusChip(text: r.statusText ?? r.status, farbe: r.statusFarbe),
                    ),
                ],
              ),
            ),
            if (mitMenue && !laeuft)
              PopupMenuButton<VoidCallback>(
                key: Key('aktionen-${r.id}'),
                tooltip: 'Aktionen',
                icon: const Icon(Icons.more_vert),
                style: IconButton.styleFrom(visualDensity: VisualDensity.compact),
                padding: EdgeInsets.zero,
                onSelected: (tun) => tun(),
                itemBuilder: (context) => [
                  if (rechte.bearbeiten)
                    PopupMenuItem(
                      value: bearbeiten,
                      child: const ListTile(
                        leading: Icon(Icons.edit_outlined),
                        title: Text('Ändern'),
                        contentPadding: EdgeInsets.zero,
                      ),
                    ),
                  if (kannAndereSchicht)
                    PopupMenuItem(
                      value: andereSchicht,
                      child: const ListTile(
                        leading: Icon(Icons.swap_horiz),
                        title: Text('Andere Schicht'),
                        contentPadding: EdgeInsets.zero,
                      ),
                    ),
                ],
              )
            else
              const SizedBox(width: 8),
          ],
        ),
        Padding(
          padding: const EdgeInsets.only(left: 22, right: 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (r.begleitpersonen.isNotEmpty)
                zeile(
                  Icons.group_outlined,
                  'Mit: ${r.begleitpersonen.map((b) => b.name).join(', ')}',
                  stil: klein,
                ),
              if (r.menue != null) zeile(Icons.restaurant, 'Menü: ${r.menue}', stil: klein),
              if (r.allergien != null)
                zeile(Icons.warning_amber_outlined, 'Allergien: ${r.allergien}', stil: klein),
              if (r.bemerkung != null) zeile(Icons.notes, r.bemerkung!, stil: klein),
              if (alt != null)
                zeile(
                  Icons.swap_horiz,
                  'Vorgeschlagen: ${alt.schichtText}'
                  '${alt.vorgeschlagenText == null ? '' : ' (${alt.vorgeschlagenText})'}',
                  stil: klein,
                ),
              if (angemeldet != null)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text('angemeldet am $angemeldet', style: klein),
                ),
            ],
          ),
        ),
        if (laeuft)
          const Padding(padding: EdgeInsets.fromLTRB(22, 8, 8, 8), child: LinearProgressIndicator())
        else if (r.offen && rechte.bestaetigen)
          Padding(
            padding: const EdgeInsets.only(left: 18, top: 4),
            child: Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [
                FilledButton(
                  style: FilledButton.styleFrom(visualDensity: VisualDensity.compact),
                  onPressed: bestaetigen,
                  child: const Text('Bestätigen'),
                ),
                OutlinedButton(
                  style: OutlinedButton.styleFrom(visualDensity: VisualDensity.compact),
                  onPressed: ablehnen,
                  child: const Text('Ablehnen'),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
