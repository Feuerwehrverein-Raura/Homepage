// Hauptseite nach der Anmeldung: Reiter unten.
//
// Mitglieder:          Anlässe · (Organisator) · Profil · Einstellungen
// Externe Organisatoren: Organisator · Anlässe · Einstellungen
//
// "Organisator" erscheint bei Mitgliedern nur, wenn sie Anlaesse
// organisieren ([OrganisatorPruefung]). Die Reiter werden erst beim ersten
// Oeffnen gebaut und bleiben danach erhalten (Scroll-Stand, geladene Daten).

import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import 'anlaesse/anlaesse_tab.dart';
import 'dienste.dart';
import 'einstellungen/einstellungen_tab.dart';
import 'organisator/organisator_tab.dart';
import 'profil/profil_tab.dart';

enum Reiter { anlaesse, organisator, profil, einstellungen }

class Hauptseite extends StatefulWidget {
  const Hauptseite({super.key, required this.dienste});

  final Dienste dienste;

  @override
  State<Hauptseite> createState() => _HauptseiteState();
}

class _HauptseiteState extends State<Hauptseite> {
  late Reiter _aktiv;
  final _besucht = <Reiter>{};

  bool get _externerOrganisator => widget.dienste.sitzung.sitzung?.kontotyp == Kontotyp.organisator;

  @override
  void initState() {
    super.initState();
    _aktiv = _externerOrganisator ? Reiter.organisator : Reiter.anlaesse;
    widget.dienste.organisator.pruefen();
  }

  List<Reiter> _reiter(bool organisiert) => _externerOrganisator
      ? const [Reiter.organisator, Reiter.anlaesse, Reiter.einstellungen]
      : [Reiter.anlaesse, if (organisiert) Reiter.organisator, Reiter.profil, Reiter.einstellungen];

  Widget _inhalt(Reiter r) => switch (r) {
    Reiter.anlaesse => AnlaesseTab(dienste: widget.dienste),
    Reiter.organisator => OrganisatorTab(dienste: widget.dienste),
    Reiter.profil => ProfilTab(dienste: widget.dienste),
    Reiter.einstellungen => EinstellungenTab(dienste: widget.dienste),
  };

  NavigationDestination _ziel(Reiter r) => switch (r) {
    Reiter.anlaesse => const NavigationDestination(
      icon: Icon(Icons.event_outlined),
      selectedIcon: Icon(Icons.event),
      label: 'Anlässe',
    ),
    Reiter.organisator => const NavigationDestination(
      icon: Icon(Icons.assignment_outlined),
      selectedIcon: Icon(Icons.assignment),
      label: 'Organisator',
    ),
    Reiter.profil => const NavigationDestination(
      icon: Icon(Icons.person_outline),
      selectedIcon: Icon(Icons.person),
      label: 'Profil',
    ),
    Reiter.einstellungen => const NavigationDestination(
      icon: Icon(Icons.settings_outlined),
      selectedIcon: Icon(Icons.settings),
      label: 'Einstellungen',
    ),
  };

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.dienste.organisator,
      builder: (context, _) {
        final reiter = _reiter(widget.dienste.organisator.organisiert);
        // Verschwindet der aktive Reiter (z.B. keine Anlaesse mehr), zurueck
        // zum ersten.
        if (!reiter.contains(_aktiv)) _aktiv = reiter.first;
        _besucht.add(_aktiv);
        final index = reiter.indexOf(_aktiv);
        return Scaffold(
          body: IndexedStack(
            index: index,
            children: [
              for (final r in reiter)
                _besucht.contains(r)
                    ? KeyedSubtree(key: ValueKey(r), child: _inhalt(r))
                    : SizedBox.shrink(key: ValueKey(r)),
            ],
          ),
          bottomNavigationBar: NavigationBar(
            selectedIndex: index,
            onDestinationSelected: (i) => setState(() => _aktiv = reiter[i]),
            destinations: [for (final r in reiter) _ziel(r)],
          ),
        );
      },
    );
  }
}

/// Name zur Anzeige: gespeicherter Name, sonst E-Mail, sonst was im Token
/// steht (z.B. nach der Uebernahme aus der alten App).
String anzeigeName(Sitzung? s) {
  if (s == null) return '';
  final angaben = jwtAngaben(s.accessToken);
  for (final kandidat in [
    s.name,
    s.email,
    angaben['name'],
    angaben['email'],
    angaben['event_title'],
  ]) {
    if (kandidat is String && kandidat.trim().isNotEmpty) return kandidat.trim();
  }
  return s.kontotyp == Kontotyp.organisator ? 'Organisator' : 'Mitglied';
}
