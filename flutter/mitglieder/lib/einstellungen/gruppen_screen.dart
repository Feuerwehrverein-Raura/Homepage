// Einstellungen -> Vorstand -> "Gruppen verwalten": Mitglieder in
// Authentik-Gruppen aufnehmen oder entfernen (etwa "Roter Schopf" oder
// "Lager", die in der App eigene Reiter freischalten).
//
// Nur fuer Vorstand und admin. Welche Gruppen hier erscheinen, entscheidet
// das Backend (api-members, src/authentik-gruppen.js): nie admin,
// Superuser- oder technische Gruppen. Gruppen, die das Backend nach der
// Funktion eines Mitglieds selbst setzt (Vorstand, Social Media,
// Mitglieder), sind markiert - ein Abgleich kann eine Aenderung von Hand
// wieder ueberschreiben.
//
// Vertragsdatei: docker/backend-members/test/fixtures/gruppen-app.json.

import 'dart:async';

import 'package:fwv_anlass/fwv_anlass.dart'
    show HinweisArt, HinweisChip, LadeAnsicht, LadeAnsichtState, fehlerText, meldung, nachfragen;
import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

/// Wer Gruppen verwalten darf (Gross-/Kleinschreibung egal). Dieselbe Regel
/// prueft api-members.
const gruppenVerwalterGruppen = ['Vorstand', 'admin'];

bool darfGruppenVerwalten(Sitzung? sitzung) =>
    (sitzung?.kontotyp == Kontotyp.mitglied) && sitzung!.hatGruppe(gruppenVerwalterGruppen);

class GruppenMitglied {
  const GruppenMitglied({required this.id, required this.vorname, required this.nachname});

  factory GruppenMitglied.ausJson(Map<String, dynamic> j) => GruppenMitglied(
    id: '${j['id']}',
    vorname: '${j['vorname'] ?? ''}',
    nachname: '${j['nachname'] ?? ''}',
  );

  final String id;
  final String vorname;
  final String nachname;

  String get name => '$vorname $nachname'.trim();
}

class VerwalteteGruppe {
  const VerwalteteGruppe({
    required this.pk,
    required this.name,
    required this.automatisch,
    required this.mitglieder,
    required this.weitereKonten,
  });

  factory VerwalteteGruppe.ausJson(Map<String, dynamic> j) => VerwalteteGruppe(
    pk: '${j['pk']}',
    name: '${j['name']}',
    automatisch: j['automatisch'] == true,
    mitglieder: [
      for (final m in (j['mitglieder'] as List? ?? const []))
        if (m is Map) GruppenMitglied.ausJson(Map<String, dynamic>.from(m)),
    ],
    weitereKonten: (j['weitere_konten'] as num?)?.toInt() ?? 0,
  );

  final String pk;
  final String name;

  /// Setzt das Backend selbst nach der Funktion (Vorstand, Social Media,
  /// Mitglieder).
  final bool automatisch;
  final List<GruppenMitglied> mitglieder;

  /// Konten in der Gruppe, die zu keinem Vereinsmitglied gehoeren.
  final int weitereKonten;
}

class Kandidat {
  const Kandidat({
    required this.id,
    required this.vorname,
    required this.nachname,
    required this.hatKonto,
  });

  factory Kandidat.ausJson(Map<String, dynamic> j) => Kandidat(
    id: '${j['id']}',
    vorname: '${j['vorname'] ?? ''}',
    nachname: '${j['nachname'] ?? ''}',
    hatKonto: j['hat_konto'] == true,
  );

  final String id;
  final String vorname;
  final String nachname;

  /// Ohne Login-Konto (Authentik) kann man niemanden in eine Gruppe nehmen.
  final bool hatKonto;

  String get name => '$vorname $nachname'.trim();
}

/// Die einzige Stelle, die die Routen kennt.
class GruppenZugang {
  const GruppenZugang(this.api);

  /// `SitzungsVerwaltung.api` (api-members).
  final ApiClient api;

  Future<List<VerwalteteGruppe>> gruppen() async {
    final json = await api.get('vorstand/gruppen');
    final liste = json is Map ? json['gruppen'] : null;
    if (liste is! List) throw const FormatException('Unerwartete Antwort vom Server.');
    return [
      for (final g in liste)
        if (g is Map) VerwalteteGruppe.ausJson(Map<String, dynamic>.from(g)),
    ];
  }

  Future<List<Kandidat>> suchen(String suche) async {
    final json = await api.get('vorstand/gruppen/kandidaten', abfrage: {'suche': suche});
    return json is List
        ? [
            for (final k in json)
              if (k is Map) Kandidat.ausJson(Map<String, dynamic>.from(k)),
          ]
        : const [];
  }

  Future<void> aufnehmen(String gruppePk, String memberId) => api.post(
    'vorstand/gruppen/${Uri.encodeComponent(gruppePk)}/mitglieder',
    daten: {'member_id': memberId},
  );

  Future<void> entfernen(String gruppePk, String memberId) => api.delete(
    'vorstand/gruppen/${Uri.encodeComponent(gruppePk)}/mitglieder/${Uri.encodeComponent(memberId)}',
  );
}

const _automatischText =
    'Wird nach der Funktion des Mitglieds automatisch gesetzt. Eine Änderung von '
    'Hand kann beim nächsten Abgleich wieder überschrieben werden.';

/// Liste aller verwaltbaren Gruppen.
class GruppenScreen extends StatefulWidget {
  const GruppenScreen({super.key, required this.zugang});

  final GruppenZugang zugang;

  @override
  State<GruppenScreen> createState() => _GruppenScreenState();
}

class _GruppenScreenState extends State<GruppenScreen> {
  final _ansicht = GlobalKey<LadeAnsichtState<List<VerwalteteGruppe>>>();

  Future<void> _oeffnen(VerwalteteGruppe g) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => GruppeScreen(zugang: widget.zugang, gruppe: g),
      ),
    );
    unawaited(_ansicht.currentState?.neuLaden());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Gruppen verwalten')),
      body: LadeAnsicht<List<VerwalteteGruppe>>(
        key: _ansicht,
        laden: widget.zugang.gruppen,
        istLeer: (l) => l.isEmpty,
        leer: 'Keine Gruppen, die sich hier verwalten lassen.',
        bauen: (context, gruppen, _) => ListView(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Text(
                'Wer in einer Gruppe ist, sieht in der App die passenden Bereiche – '
                'etwa „Roter Schopf“ den Reiter Schopf oder „Lager“ das Lager.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
            for (final g in gruppen)
              ListTile(
                leading: const Icon(Icons.group_outlined),
                title: Text(g.name),
                subtitle: Text(
                  g.mitglieder.length == 1 ? '1 Mitglied' : '${g.mitglieder.length} Mitglieder',
                ),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (g.automatisch) const HinweisChip('automatisch'),
                    const Icon(Icons.chevron_right),
                  ],
                ),
                onTap: () => _oeffnen(g),
              ),
          ],
        ),
      ),
    );
  }
}

/// Eine Gruppe: wer drin ist, entfernen, aufnehmen.
class GruppeScreen extends StatefulWidget {
  const GruppeScreen({super.key, required this.zugang, required this.gruppe});

  final GruppenZugang zugang;
  final VerwalteteGruppe gruppe;

  @override
  State<GruppeScreen> createState() => _GruppeScreenState();
}

class _GruppeScreenState extends State<GruppeScreen> {
  late VerwalteteGruppe _gruppe = widget.gruppe;
  bool _laeuft = false;

  Future<void> _neu() async {
    final alle = await widget.zugang.gruppen();
    final g = alle.where((x) => x.pk == _gruppe.pk).firstOrNull;
    if (g != null && mounted) setState(() => _gruppe = g);
  }

  Future<void> _ausfuehren(Future<void> Function() aktion, String erfolg) async {
    setState(() => _laeuft = true);
    try {
      await aktion();
      await _neu();
      if (mounted) meldung(context, erfolg);
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _laeuft = false);
    }
  }

  Future<void> _entfernen(GruppenMitglied m) async {
    final ja = await nachfragen(
      context,
      titel: 'Aus „${_gruppe.name}“ entfernen?',
      text: _gruppe.automatisch
          ? '${m.name} verliert die Rechte dieser Gruppe.\n\n$_automatischText'
          : '${m.name} verliert die Rechte dieser Gruppe.',
      ja: 'Entfernen',
    );
    if (!ja || !mounted) return;
    await _ausfuehren(
      () => widget.zugang.entfernen(_gruppe.pk, m.id),
      '${m.name} aus „${_gruppe.name}“ entfernt',
    );
  }

  Future<void> _aufnehmen() async {
    final k = await Navigator.of(context).push<Kandidat>(
      MaterialPageRoute(
        builder: (_) => KandidatSuche(
          zugang: widget.zugang,
          schonDrin: {for (final m in _gruppe.mitglieder) m.id},
        ),
      ),
    );
    if (k == null || !mounted) return;
    await _ausfuehren(
      () => widget.zugang.aufnehmen(_gruppe.pk, k.id),
      '${k.name} in „${_gruppe.name}“ aufgenommen',
    );
  }

  @override
  Widget build(BuildContext context) {
    final g = _gruppe;
    return Scaffold(
      appBar: AppBar(title: Text(g.name)),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _laeuft ? null : _aufnehmen,
        icon: const Icon(Icons.person_add_alt_1),
        label: const Text('Aufnehmen'),
      ),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 96),
        children: [
          if (_laeuft) const LinearProgressIndicator(),
          if (g.automatisch)
            const Card(
              margin: EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: ListTile(leading: Icon(Icons.info_outline), title: Text(_automatischText)),
            ),
          if (g.mitglieder.isEmpty)
            const Padding(
              padding: EdgeInsets.all(24),
              child: Text('Noch niemand in dieser Gruppe.', textAlign: TextAlign.center),
            ),
          for (final m in g.mitglieder)
            ListTile(
              leading: const Icon(Icons.person_outline),
              title: Text(m.name),
              trailing: IconButton(
                tooltip: 'Entfernen',
                icon: const Icon(Icons.remove_circle_outline),
                onPressed: _laeuft ? null : () => _entfernen(m),
              ),
            ),
          if (g.weitereKonten > 0)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Text(
                g.weitereKonten == 1
                    ? 'Dazu 1 Konto, das zu keinem Vereinsmitglied gehört (nur in Authentik änderbar).'
                    : 'Dazu ${g.weitereKonten} Konten, die zu keinem Vereinsmitglied gehören '
                          '(nur in Authentik änderbar).',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
        ],
      ),
    );
  }
}

/// Mitglied suchen; gibt den gewaehlten [Kandidat] zurueck.
class KandidatSuche extends StatefulWidget {
  const KandidatSuche({super.key, required this.zugang, required this.schonDrin});

  final GruppenZugang zugang;
  final Set<String> schonDrin;

  @override
  State<KandidatSuche> createState() => _KandidatSucheState();
}

class _KandidatSucheState extends State<KandidatSuche> {
  Timer? _verzoegert;
  List<Kandidat> _treffer = const [];
  String? _fehler;
  bool _sucht = false;
  int _nr = 0;

  @override
  void dispose() {
    _verzoegert?.cancel();
    super.dispose();
  }

  void _eingabe(String text) {
    _verzoegert?.cancel();
    _verzoegert = Timer(const Duration(milliseconds: 300), () => _suchen(text.trim()));
  }

  Future<void> _suchen(String suche) async {
    final nr = ++_nr;
    if (suche.length < 2) {
      setState(() {
        _treffer = const [];
        _fehler = null;
      });
      return;
    }
    setState(() => _sucht = true);
    try {
      final t = await widget.zugang.suchen(suche);
      if (!mounted || nr != _nr) return;
      setState(() {
        _treffer = t;
        _fehler = null;
      });
    } on Object catch (e) {
      if (mounted && nr == _nr) setState(() => _fehler = fehlerText(e));
    } finally {
      if (mounted && nr == _nr) setState(() => _sucht = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mitglied aufnehmen')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              autofocus: true,
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.search),
                hintText: 'Vor- oder Nachname',
              ),
              onChanged: _eingabe,
            ),
          ),
          if (_sucht) const LinearProgressIndicator(),
          if (_fehler != null) Padding(padding: const EdgeInsets.all(16), child: Text(_fehler!)),
          Expanded(
            child: ListView(
              children: [
                for (final k in _treffer)
                  ListTile(
                    leading: const Icon(Icons.person_outline),
                    title: Text(k.name),
                    subtitle: widget.schonDrin.contains(k.id)
                        ? const Text('schon in der Gruppe')
                        : k.hatKonto
                        ? null
                        : const Text('kein Login-Konto – kann nicht aufgenommen werden'),
                    trailing: widget.schonDrin.contains(k.id)
                        ? const HinweisChip('drin', art: HinweisArt.gut)
                        : null,
                    enabled: k.hatKonto && !widget.schonDrin.contains(k.id),
                    onTap: () => Navigator.of(context).pop(k),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
