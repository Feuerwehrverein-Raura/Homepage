// Hauptseite nach der Anmeldung: Reiter unten.
//
// Mitglieder:          Anlässe · (Organisator) · (Lager) · (Schopf) · Profil · Mehr
// Externe Organisatoren: Organisator · Anlässe · Mehr
//
// "Organisator" erscheint bei Mitgliedern nur, wenn sie Anlaesse
// organisieren ([OrganisatorPruefung]); "Lager" nur mit der Authentik-Gruppe
// Lager, Vorstand oder admin ([Dienste.lagerSichtbar]); "Schopf" (Licht und
// Tiefkuehler im Roten Schopf) nur mit Roter Schopf, Vorstand oder admin
// ([Dienste.roterSchopfSichtbar]). Die Reiter werden
// erst beim ersten Oeffnen gebaut und bleiben danach erhalten (Scroll-Stand,
// geladene Daten).

import 'dart:async';

import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import 'anlaesse/anlaesse_tab.dart';
import 'dienste.dart';
import 'einstellungen/adressbuch.dart';
import 'einstellungen/einstellungen_tab.dart';
import 'einstellungen/update_hinweis.dart';
import 'lager/lager_tab.dart';
import 'organisator/organisator_tab.dart';
import 'profil/profil_tab.dart';
import 'roterschopf/roterschopf_tab.dart';

enum Reiter { anlaesse, organisator, lager, roterSchopf, profil, einstellungen }

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
    // Nach dem (ersten) Login einmal nach dem Adressbuch fragen (Android).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) kontakteFrageStellen(context, widget.dienste);
      if (mounted) unawaited(updateHinweisZeigen(context, widget.dienste));
    });
  }

  List<Reiter> _reiter(bool organisiert, bool lager, bool roterSchopf) => _externerOrganisator
      ? const [Reiter.organisator, Reiter.anlaesse, Reiter.einstellungen]
      : [
          Reiter.anlaesse,
          if (organisiert) Reiter.organisator,
          if (lager) Reiter.lager,
          if (roterSchopf) Reiter.roterSchopf,
          Reiter.profil,
          Reiter.einstellungen,
        ];

  Widget _inhalt(Reiter r) => switch (r) {
    Reiter.anlaesse => AnlaesseTab(dienste: widget.dienste),
    Reiter.organisator => OrganisatorTab(dienste: widget.dienste),
    Reiter.lager => LagerTab(dienste: widget.dienste),
    Reiter.roterSchopf => RoterSchopfTab(dienste: widget.dienste),
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
    Reiter.lager => const NavigationDestination(
      icon: Icon(Icons.inventory_2_outlined),
      selectedIcon: Icon(Icons.inventory_2),
      label: 'Lager',
    ),
    Reiter.roterSchopf => const NavigationDestination(
      icon: Icon(Icons.lightbulb_outline),
      selectedIcon: Icon(Icons.lightbulb),
      label: 'Schopf',
    ),
    Reiter.profil => const NavigationDestination(
      icon: Icon(Icons.person_outline),
      selectedIcon: Icon(Icons.person),
      label: 'Profil',
    ),
    // "Mehr" statt "Einstellungen": Mit Lager und Schopf hat der Vorstand
    // fuenf oder sechs Reiter, dann bricht "Einstellungen" mitten im Wort um
    // ("Einstellung/en"). Die Seite selbst heisst weiter Einstellungen.
    Reiter.einstellungen => const NavigationDestination(
      icon: Icon(Icons.settings_outlined),
      selectedIcon: Icon(Icons.settings),
      label: 'Mehr',
    ),
  };

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      // Sitzung: die Gruppen (Lager) stehen im Token.
      listenable: Listenable.merge([widget.dienste.organisator, widget.dienste.sitzung]),
      builder: (context, _) {
        final reiter = _reiter(
          widget.dienste.organisator.organisiert,
          widget.dienste.lagerSichtbar,
          widget.dienste.roterSchopfSichtbar,
        );
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
          // Ab sechs Reitern (Vorstand, der organisiert) eine Stufe kleiner:
          // Auf 360 Punkte breiten Handys brach sonst "Organisator" mitten im
          // Wort um. Mit weniger Reitern bleibt alles wie gewohnt.
          bottomNavigationBar: NavigationBarTheme(
            data: reiter.length >= 6
                ? NavigationBarTheme.of(context).copyWith(
                    labelTextStyle: WidgetStateProperty.resolveWith(
                      (zustand) =>
                          NavigationBarTheme.of(context).labelTextStyle
                              ?.resolve(zustand)
                              ?.copyWith(fontSize: 11),
                    ),
                  )
                : NavigationBarTheme.of(context),
            child: NavigationBar(
              selectedIndex: index,
              onDestinationSelected: (i) => setState(() => _aktiv = reiter[i]),
              destinations: [for (final r in reiter) _ziel(r)],
            ),
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
