// Empfaenger einzeln waehlen: Suche und Kaestchen (in vorstand.html war der
// Knopf dafuer ohne Funktion). Fuer Nachricht und Pingen-PDF.

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:material_ui/material_ui.dart';

import '../../mitglieder/modelle.dart';
import '../../versand/versand.dart';

/// Schnellwahl oben in der Liste ("Alle mit Post-Zustellung").
typedef Schnellwahl = (String text, bool Function(VorstandMitglied m) passt);

/// Oeffnet die Auswahl; null bei Abbruch, sonst die gewaehlten IDs.
Future<Set<String>?> empfaengerAuswaehlen(
  BuildContext context, {
  required List<VorstandMitglied> mitglieder,
  required Set<String> gewaehlt,
  String titel = 'Empfänger wählen',
  List<Schnellwahl> schnellwahl = const [],
  String Function(VorstandMitglied m)? hinweis,
}) => Navigator.of(context).push<Set<String>>(
  MaterialPageRoute(
    fullscreenDialog: true,
    builder: (_) => EmpfaengerAuswahlScreen(
      mitglieder: mitglieder,
      gewaehlt: gewaehlt,
      titel: titel,
      schnellwahl: schnellwahl,
      hinweis: hinweis,
    ),
  ),
);

class EmpfaengerAuswahlScreen extends StatefulWidget {
  const EmpfaengerAuswahlScreen({
    super.key,
    required this.mitglieder,
    required this.gewaehlt,
    this.titel = 'Empfänger wählen',
    this.schnellwahl = const [],
    this.hinweis,
  });

  final List<VorstandMitglied> mitglieder;
  final Set<String> gewaehlt;
  final String titel;
  final List<Schnellwahl> schnellwahl;

  /// Zweite Zeile je Mitglied; sonst Status und Kanaele.
  final String Function(VorstandMitglied m)? hinweis;

  @override
  State<EmpfaengerAuswahlScreen> createState() => _EmpfaengerAuswahlScreenState();
}

class _EmpfaengerAuswahlScreenState extends State<EmpfaengerAuswahlScreen> {
  late final Set<String> _ids = {...widget.gewaehlt};
  final _suche = TextEditingController();

  @override
  void dispose() {
    _suche.dispose();
    super.dispose();
  }

  List<VorstandMitglied> get _sichtbar {
    final s = _suche.text.trim().toLowerCase();
    if (s.isEmpty) return widget.mitglieder;
    return [
      for (final m in widget.mitglieder)
        if ([
          m.vorname,
          m.nachname,
          m.email,
          m.ort,
          m.status,
        ].any((f) => (f ?? '').toLowerCase().contains(s)))
          m,
    ];
  }

  String _standardHinweis(VorstandMitglied m) => [
    m.status ?? 'ohne Status',
    if (hatEmail(m) && m.zustellungEmail) 'E-Mail',
    if (m.zustellungPost) hatPostadresse(m) ? 'Post' : 'Post ohne Adresse',
  ].join(' · ');

  @override
  Widget build(BuildContext context) {
    final sichtbar = _sichtbar;
    final rand = mitSystemleiste(context, const EdgeInsets.fromLTRB(16, 8, 16, 0));
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.titel),
        actions: [
          TextButton(
            key: const Key('auswahl-fertig'),
            onPressed: () => Navigator.of(context).pop(_ids),
            child: Text('Fertig (${_ids.length})'),
          ),
        ],
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: rand,
            child: TextField(
              key: const Key('auswahl-suche'),
              controller: _suche,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                isDense: true,
                prefixIcon: const Icon(Icons.search),
                hintText: 'Name, E-Mail, Ort, Status',
                border: const OutlineInputBorder(),
                suffixIcon: _suche.text.isEmpty
                    ? null
                    : IconButton(
                        tooltip: 'Suche leeren',
                        icon: const Icon(Icons.clear),
                        onPressed: () => setState(_suche.clear),
                      ),
              ),
            ),
          ),
          Padding(
            padding: rand.copyWith(top: 8, bottom: 4),
            child: Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [
                ActionChip(
                  label: Text(_suche.text.isEmpty ? 'Alle' : 'Alle Treffer'),
                  onPressed: () => setState(() => _ids.addAll(sichtbar.map((m) => m.id))),
                ),
                for (final (text, passt) in widget.schnellwahl)
                  ActionChip(
                    label: Text(text),
                    onPressed: () => setState(
                      () => _ids.addAll(widget.mitglieder.where(passt).map((m) => m.id)),
                    ),
                  ),
                ActionChip(
                  label: const Text('Keine'),
                  onPressed: _ids.isEmpty ? null : () => setState(_ids.clear),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: sichtbar.isEmpty
                ? const Center(child: Text('Niemand gefunden.'))
                : ListView.builder(
                    padding: mitSystemleiste(context, const EdgeInsets.only(bottom: 24)),
                    itemCount: sichtbar.length,
                    itemBuilder: (context, i) {
                      final m = sichtbar[i];
                      return CheckboxListTile(
                        key: Key('auswahl-${m.id}'),
                        value: _ids.contains(m.id),
                        onChanged: (an) => setState(() {
                          if (an ?? false) {
                            _ids.add(m.id);
                          } else {
                            _ids.remove(m.id);
                          }
                        }),
                        title: Text(mitgliedName(m).isEmpty ? '(ohne Namen)' : mitgliedName(m)),
                        subtitle: Text((widget.hinweis ?? _standardHinweis)(m)),
                        controlAffinity: ListTileControlAffinity.leading,
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
