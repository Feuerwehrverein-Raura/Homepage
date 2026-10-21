// Hauptseite nach der Anmeldung: Reiter unten - auf grossen Bildschirmen
// (Tablet, Browser) links als Seitenleiste. Dort stehen die Unterpunkte von
// "Mehr" direkt in der Leiste (Musik, Gruppen fuer den Vorstand), der Rest
// heisst "Einstellungen"; ausgeklappt stehen unten die Anleitungen.
//
// Mitglieder:          Anlässe · (Organisator) · (Lager) · (Schopf) · Profil · Mehr
// Vorstand:            Anlässe · Vorstand · Lager · Schopf · Profil · Mehr
// Externe Organisatoren: Organisator · Anlässe · Mehr
//
// "Organisator" erscheint bei Mitgliedern nur, wenn sie Anlaesse
// organisieren ([OrganisatorPruefung]); "Lager" nur mit der Authentik-Gruppe
// Lager, Vorstand oder admin ([Dienste.lagerSichtbar]); "Schopf" (Licht und
// Tiefkuehler im Roten Schopf) nur mit Roter Schopf, Vorstand oder admin -
// oder waehrend der eigenen Schicht ([Dienste.roterSchopfSichtbar]). Die Reiter werden
// erst beim ersten Oeffnen gebaut und bleiben danach erhalten (Scroll-Stand,
// geladene Daten).
//
// Eine angetippte Push-Mitteilung ([Dienste.pushZiel], [PushZiel]) fuehrt
// hierher: Vorstand-Mitteilungen in den Reiter Vorstand, Anlass-Mitteilungen
// in den Reiter Anlaesse mit der Detailseite, Profil/Beitraege in den Reiter
// Profil; ohne Ziel zeigt ein Dialog die Mitteilung nochmals.

import 'dart:async';

import 'package:fwv_core/fwv_core.dart';
import 'package:fwv_roterschopf/fwv_roterschopf.dart' show MusikScreen;
import 'package:fwv_vorstand/fwv_vorstand.dart' show istVorstand;
import 'package:material_ui/material_ui.dart';

import 'anlaesse/anlaesse_tab.dart' show AnlaesseTab, anlassOeffnen;
import 'dienste.dart';
import 'einstellungen/adressbuch.dart';
import 'einstellungen/einstellungen_tab.dart';
import 'einstellungen/gruppen_screen.dart';
import 'einstellungen/update_hinweis.dart';
import 'lager/lager_tab.dart';
import 'organisator/organisator_tab.dart';
import 'profil/profil_tab.dart';
import 'push/push_dienst.dart';
import 'roterschopf/roterschopf_tab.dart';
import 'vorstand/vorstand_tab.dart';

/// [musik] und [gruppen] gibt es nur mit Seitenleiste (grosse Bildschirme):
/// Dort stehen die Unterpunkte von "Mehr" direkt in der Leiste. Auf dem Handy
/// sind sie Teil der Einstellungen.
enum Reiter {
  anlaesse,
  organisator,
  vorstand,
  lager,
  roterSchopf,
  profil,
  musik,
  gruppen,
  einstellungen,
}

/// Ab dieser Breite stehen die Reiter links als Seitenleiste (Material:
/// "medium" ab 600, hier etwas spaeter - darunter passt die Leiste unten
/// besser zu den schmalen Inhalten).
const seitenleisteAb = 840.0;

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
    // Mit einer angetippten Mitteilung gestartet: gleich dorthin. Vorstand:
    // der Reiter liest den Bereich beim Aufbau selbst; alles andere nach dem
    // ersten Bild (Detailseite, Dialog brauchen den Navigator).
    switch (widget.dienste.pushZiel.value) {
      case null:
        break;
      case VorstandZiel():
        if (istVorstand(widget.dienste.sitzung.sitzung)) {
          _aktiv = Reiter.vorstand;
        } else {
          _zielErledigt();
        }
      case final ziel:
        _aktiv = _reiterFuer(ziel) ?? _aktiv;
        WidgetsBinding.instance.addPostFrameCallback((_) => _pushZiel());
    }
    widget.dienste.pushZiel.addListener(_pushZiel);
    _lebenszyklus;
    widget.dienste.organisator.pruefen();
    widget.dienste.schopfPruefung.pruefen();
    // Nach dem (ersten) Login einmal nach dem Adressbuch fragen (Android).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) kontakteFrageStellen(context, widget.dienste);
      if (mounted) _updatePruefen();
    });
  }

  /// Android behaelt die App oft tagelang im Hintergrund - ohne Kaltstart
  /// kaeme der Update-Hinweis nie. Darum auch bei der Rueckkehr pruefen,
  /// aber hoechstens alle [_updateAbstand].
  static const _updateAbstand = Duration(hours: 6);
  DateTime? _updateGeprueft;
  late final AppLifecycleListener _lebenszyklus = AppLifecycleListener(
    onResume: () {
      final zuletzt = _updateGeprueft;
      if (zuletzt == null || widget.dienste.jetzt().difference(zuletzt) >= _updateAbstand) {
        _updatePruefen();
      }
    },
  );

  void _updatePruefen() {
    _updateGeprueft = widget.dienste.jetzt();
    unawaited(updateHinweisZeigen(context, widget.dienste));
  }

  @override
  void dispose() {
    _lebenszyklus.dispose();
    widget.dienste.pushZiel.removeListener(_pushZiel);
    super.dispose();
  }

  /// Ziel zuruecksetzen - erst nach den anderen Zuhoerern (Reiter Vorstand).
  void _zielErledigt() => scheduleMicrotask(() => widget.dienste.pushZiel.value = null);

  /// In welchen Reiter ein Ziel fuehrt (null: bleiben, wo man ist). Externe
  /// Organisatoren haben kein Profil.
  Reiter? _reiterFuer(PushZiel ziel) => switch (ziel) {
    VorstandZiel() => Reiter.vorstand,
    AnlassZiel() => Reiter.anlaesse,
    ProfilZiel() => _externerOrganisator ? null : Reiter.profil,
    MitteilungZiel() => null,
  };

  /// Mitteilung angetippt. Vorstand: zum Reiter Vorstand (den Bereich waehlt
  /// der Reiter selbst); wer nicht (mehr) Vorstand ist, bleibt, wo er ist.
  /// Anlass: Reiter Anlaesse und die Detailseite (sie laedt den Anlass per
  /// ID und meldet, wenn es ihn nicht mehr gibt). Profil: Reiter Profil,
  /// bei Beitraegen mit der Mitteilung. Ohne Ziel: die Mitteilung als Dialog.
  void _pushZiel() {
    final ziel = widget.dienste.pushZiel.value;
    if (ziel == null || !mounted) return;
    if (ziel is VorstandZiel) {
      if (istVorstand(widget.dienste.sitzung.sitzung)) {
        setState(() => _aktiv = Reiter.vorstand);
      } else {
        _zielErledigt();
      }
      return;
    }
    _zielErledigt();
    final reiter = _reiterFuer(ziel);
    if (reiter != null && reiter != _aktiv) setState(() => _aktiv = reiter);
    switch (ziel) {
      case AnlassZiel(:final anlassId):
        unawaited(anlassOeffnen(context, widget.dienste, anlassId));
      case ProfilZiel(:final beitraege, :final titel, :final text):
        // Externe Organisatoren landen nicht im Profil: dann wenigstens die
        // Mitteilung.
        if ((beitraege || reiter == null) && (titel != null || text != null)) {
          unawaited(_mitteilungZeigen(titel ?? 'FWV Raura', text ?? ''));
        }
      case MitteilungZiel(:final titel, :final text):
        unawaited(_mitteilungZeigen(titel, text));
      case VorstandZiel():
        break;
    }
  }

  Future<void> _mitteilungZeigen(String titel, String text) => showDialog<void>(
    context: context,
    builder: (context) => AlertDialog(
      key: const Key('push-mitteilung'),
      icon: const Icon(Icons.notifications_outlined),
      title: Text(titel),
      content: text.isEmpty ? null : SingleChildScrollView(child: Text(text)),
      actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('OK'))],
    ),
  );

  List<Reiter> _reiter(
    bool organisiert,
    bool lager,
    bool roterSchopf, {
    required bool seitenleiste,
  }) => _externerOrganisator
      ? const [Reiter.organisator, Reiter.anlaesse, Reiter.einstellungen]
      : [
          Reiter.anlaesse,
          // Vorstand statt Organisator: Der Vorstand verwaltet alle Anlaesse
          // (und mehr) - ein eigener Organisator-Reiter waere doppelt.
          if (istVorstand(widget.dienste.sitzung.sitzung))
            Reiter.vorstand
          else if (organisiert)
            Reiter.organisator,
          if (lager) Reiter.lager,
          if (roterSchopf) Reiter.roterSchopf,
          Reiter.profil,
          if (seitenleiste) Reiter.musik,
          if (seitenleiste && darfGruppenVerwalten(widget.dienste.sitzung.sitzung)) Reiter.gruppen,
          Reiter.einstellungen,
        ];

  Widget _inhalt(Reiter r, {required bool seitenleiste, required bool ausgeklappt}) => switch (r) {
    Reiter.anlaesse => AnlaesseTab(dienste: widget.dienste),
    Reiter.organisator => OrganisatorTab(dienste: widget.dienste),
    Reiter.vorstand => VorstandTab(dienste: widget.dienste),
    Reiter.lager => LagerTab(dienste: widget.dienste),
    Reiter.roterSchopf => RoterSchopfTab(dienste: widget.dienste),
    Reiter.profil => ProfilTab(dienste: widget.dienste),
    Reiter.musik => MusikScreen(zugang: widget.dienste.musik, player: widget.dienste.musikPlayer),
    Reiter.gruppen => GruppenScreen(zugang: GruppenZugang(widget.dienste.sitzung.api)),
    Reiter.einstellungen => EinstellungenTab(
      dienste: widget.dienste,
      musikUndGruppenAusgelagert: seitenleiste,
      hilfeAusgelagert: ausgeklappt,
    ),
  };

  NavigationDestination _ziel(Reiter r) => switch (r) {
    Reiter.anlaesse => const NavigationDestination(
      icon: Icon(Icons.event_outlined),
      selectedIcon: Icon(Icons.event),
      label: 'Anlässe',
    ),
    Reiter.vorstand => const NavigationDestination(
      icon: Icon(Icons.shield_outlined),
      selectedIcon: Icon(Icons.shield),
      label: 'Vorstand',
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
    Reiter.musik => const NavigationDestination(
      icon: Icon(Icons.queue_music_outlined),
      selectedIcon: Icon(Icons.queue_music),
      label: 'Musik',
    ),
    Reiter.gruppen => const NavigationDestination(
      icon: Icon(Icons.group_outlined),
      selectedIcon: Icon(Icons.group),
      label: 'Gruppen',
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

  Widget _hilfe() => Padding(
    padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
    child: SizedBox(
      width: 196,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Divider(height: 24),
          Padding(
            padding: const EdgeInsets.only(left: 12, bottom: 4),
            child: Text(
              'Hilfe',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          for (final (symbol, titel, _, seite) in anleitungen)
            TextButton.icon(
              style: TextButton.styleFrom(
                foregroundColor: Theme.of(context).colorScheme.onSurfaceVariant,
                alignment: Alignment.centerLeft,
                textStyle: const TextStyle(fontSize: 13),
              ),
              onPressed: () => widget.dienste.linkOeffnen(anleitungsBasis.resolve(seite)),
              icon: Icon(symbol, size: 18),
              label: Text(titel),
            ),
        ],
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      // Sitzung: die Gruppen (Lager) stehen im Token.
      listenable: Listenable.merge([
        widget.dienste.organisator,
        widget.dienste.sitzung,
        widget.dienste.schopfPruefung,
      ]),
      builder: (context, _) {
        final breite = MediaQuery.sizeOf(context).width;
        final seitenleiste = breite >= seitenleisteAb;
        final ausgeklappt = breite >= 1200;
        final reiter = _reiter(
          widget.dienste.organisator.organisiert,
          widget.dienste.lagerSichtbar,
          widget.dienste.roterSchopfSichtbar,
          seitenleiste: seitenleiste,
        );
        // Verschwindet der aktive Reiter (z.B. keine Anlaesse mehr), zurueck
        // zum ersten - Musik und Gruppen (Fenster schmaler geworden) zurueck
        // zu den Einstellungen, wo sie dann stehen.
        if (!reiter.contains(_aktiv)) {
          _aktiv =
              (_aktiv == Reiter.musik || _aktiv == Reiter.gruppen) &&
                  reiter.contains(Reiter.einstellungen)
              ? Reiter.einstellungen
              : reiter.first;
        }
        _besucht.add(_aktiv);
        final index = reiter.indexOf(_aktiv);
        final inhalt = IndexedStack(
          index: index,
          children: [
            for (final r in reiter)
              _besucht.contains(r)
                  ? KeyedSubtree(
                      key: ValueKey(r),
                      child: _inhalt(r, seitenleiste: seitenleiste, ausgeklappt: ausgeklappt),
                    )
                  : SizedBox.shrink(key: ValueKey(r)),
          ],
        );
        void waehlen(int i) => setState(() => _aktiv = reiter[i]);

        // Grosse Bildschirme (Tablet, Browser): Reiter links als Seitenleiste
        // statt unten, ab 1200 Punkten mit Beschriftung daneben. Der Inhalt
        // bekommt die Breite neben der Leiste als Bildschirmbreite, damit
        // mitSystemleiste richtig mittig einrueckt.
        if (seitenleiste) {
          final leiste = ausgeklappt ? 220.0 : 88.0;
          final mq = MediaQuery.of(context);
          return Scaffold(
            body: Row(
              children: [
                SafeArea(
                  right: false,
                  child: NavigationRail(
                    selectedIndex: index,
                    onDestinationSelected: waehlen,
                    extended: ausgeklappt,
                    // minWidth ist die Spalte der Symbole - auch ausgeklappt.
                    minWidth: 88,
                    minExtendedWidth: 220,
                    labelType: ausgeklappt
                        ? NavigationRailLabelType.none
                        : NavigationRailLabelType.all,
                    groupAlignment: -1,
                    // Ausgeklappt: die Anleitungen unten in der Leiste.
                    trailing: ausgeklappt && !_externerOrganisator ? _hilfe() : null,
                    destinations: [
                      for (final r in reiter)
                        NavigationRailDestination(
                          icon: _ziel(r).icon,
                          selectedIcon: _ziel(r).selectedIcon,
                          // Unten heisst der Reiter "Mehr" (Platz), hier ist
                          // Platz fuer den richtigen Namen.
                          label: Text(r == Reiter.einstellungen ? 'Einstellungen' : _ziel(r).label),
                        ),
                    ],
                  ),
                ),
                const VerticalDivider(width: 1, thickness: 1),
                Expanded(
                  // Abschneiden: Seitenwechsel (z.B. die Bereiche im Reiter
                  // Vorstand) glitten sonst ueber die Seitenleiste.
                  child: ClipRect(
                    child: MediaQuery(
                      data: mq.copyWith(size: Size(breite - leiste - 1, mq.size.height)),
                      child: inhalt,
                    ),
                  ),
                ),
              ],
            ),
          );
        }
        return Scaffold(
          body: inhalt,
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
              onDestinationSelected: waehlen,
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
