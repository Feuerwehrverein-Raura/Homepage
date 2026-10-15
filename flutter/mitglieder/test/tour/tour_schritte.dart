// Die Bildschirme der Foto-Tour und der Weg dorthin - gemeinsam fuer die
// Widget-Tour (bildschirmfotos_test.dart: Android, Browser) und die Bilder
// aus dem iOS-Simulator (integration_test/iphone_bilder_test.dart).
//
// Jeder Eintrag beginnt bei der frisch gestarteten App (angemeldet als
// Erika Muster; 12-login abgemeldet, die Bilder in [tourAlsOrganisator]
// ohne Vorstand) und endet dort, wo das Bild entsteht.

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_mitglieder/dienste.dart';
import 'package:material_ui/material_ui.dart';

/// Was die Schritte vom Geraet wissen muessen.
abstract interface class TourGeraet {
  /// Schmaler Bildschirm: Reiter unten, "Einstellungen" heisst "Mehr".
  bool get handy;

  Plattform get plattform;
}

/// Ein Bild der Tour: der Weg dorthin (die App ist schon gestartet).
typedef TourSchritte = Future<void> Function(WidgetTester tester, TourGeraet g);

/// Bilder, die als Organisator ohne Vorstand entstehen (der Vorstand sieht
/// statt "Organisator" den Reiter "Vorstand").
const tourAlsOrganisator = {
  '11-organisator',
  '13-organisator-anlass',
  '24-organisator-schichten',
  '25-anmeldung-aendern',
  '26-organisatoren',
};

/// Nur auf dem Handy: Im Browser stehen die Anleitungen links in der Leiste.
const tourNurHandy = {'20-hilfe'};

/// Das Bild entsteht abgemeldet.
const tourAbgemeldet = {'12-login'};

Finder _leiste(String text) => find.descendant(
  of: find.byWidgetPredicate((w) => w is NavigationBar || w is NavigationRail),
  matching: find.text(text),
);

Future<void> _reiter(WidgetTester tester, TourGeraet g, String name) async {
  // Unten heisst "Einstellungen" "Mehr".
  final text = g.handy && name == 'Einstellungen' ? 'Mehr' : name;
  await tester.tap(_leiste(text));
  await tester.pumpAndSettle();
}

/// Scrollt, bis [f] gebaut und zu sehen ist (oben an der Liste).
Future<void> _sichtbar(WidgetTester tester, Finder f) async {
  if (f.evaluate().isEmpty) {
    await tester.scrollUntilVisible(
      f,
      200,
      scrollable: find.byType(Scrollable).hitTestable().first,
    );
  }
  await tester.ensureVisible(f);
  await tester.pumpAndSettle();
}

Future<void> _tippen(WidgetTester tester, Finder f) async {
  await _sichtbar(tester, f);
  await tester.tap(f);
  await tester.pumpAndSettle();
}

/// Die Bilder der Tour - auf dem Handy (Android, iOS) und im Browser
/// ("mein-" davor) unter denselben Namen. Die Nummern 01-11 gab es schon in
/// den alten Apps; die Anleitungen verweisen darauf.
final tourBilder = <String, TourSchritte>{
  '01-anlaesse': (t, g) async {},
  '02-kalender': (t, g) async => _tippen(t, find.text('Kalender')),
  '03-anlass-detail': (t, g) async => _tippen(t, find.text('Chilbi 2026')),
  '04-anmeldung': _anmeldung,
  '05-profil': (t, g) async => _reiter(t, g, 'Profil'),
  '06-meine-anmeldungen': (t, g) async {
    await _reiter(t, g, 'Profil');
    await _tippen(t, find.text('Meine Anmeldungen'));
  },
  '07-zugaenge': (t, g) async {
    await _reiter(t, g, 'Profil');
    await _tippen(t, find.text('Zugänge'));
  },
  '08-einstellungen': (t, g) async => _reiter(t, g, 'Einstellungen'),
  '09-benachrichtigungen': (t, g) async {
    await _reiter(t, g, 'Profil');
    await _tippen(t, find.text('Benachrichtigungen'));
  },
  '10-adressbuch': (t, g) async {
    await _reiter(t, g, 'Einstellungen');
    if (g.plattform == Plattform.android) {
      await _sichtbar(t, find.text('Adressbuch'));
    } else {
      await _tippen(t, find.text('Mitglieder-Adressbuch einrichten'));
    }
  },
  '11-organisator': (t, g) async => _reiter(t, g, 'Organisator'),
  // Abgemeldet gestartet (tourAbgemeldet).
  '12-login': (t, g) async {},
  '13-organisator-anlass': _organisatorAnlass,
  '14-lager': (t, g) async => _reiter(t, g, 'Lager'),
  '15-schopf-lampen': (t, g) async => _reiter(t, g, 'Schopf'),
  '16-schopf-messwerte': (t, g) async {
    await _reiter(t, g, 'Schopf');
    await _tippen(t, find.text('Messwerte'));
  },
  '17-musik': (t, g) async {
    if (!g.handy) return _reiter(t, g, 'Musik');
    await _reiter(t, g, 'Einstellungen');
    await _tippen(t, find.widgetWithText(ListTile, 'Musik'));
  },
  '18-vpn': (t, g) async {
    await _reiter(t, g, 'Profil');
    await _tippen(t, find.text('VPN-Zugang'));
  },
  '19-material-ausleihen': _ausleihen,
  '20-hilfe': (t, g) async {
    await _reiter(t, g, 'Einstellungen');
    await _sichtbar(t, find.text('Hilfe'));
  },
  '21-austritt': _austritt,
  '22-anmelden-teilnahme': _teilnahme,
  '23-schon-angemeldet': (t, g) async {
    await _teilnahme(t, g);
    await _tippen(t, find.byKey(const Key('anmelden-senden')));
    expect(find.text('Schon angemeldet'), findsOneWidget);
  },
  '24-organisator-schichten': (t, g) async {
    await _organisatorAnlass(t, g);
    await _tippen(t, find.widgetWithText(Tab, 'Schichten'));
  },
  '25-anmeldung-aendern': (t, g) async {
    await _organisatorAnlass(t, g);
    await _tippen(t, find.byKey(const Key('aktionen-00000000-0000-0000-0000-700000000001')));
    await _tippen(t, find.text('Ändern'));
  },
  '26-organisatoren': (t, g) async {
    await _organisatorAnlass(t, g);
    await _tippen(t, find.widgetWithText(ActionChip, 'Organisatoren'));
  },
  '27-vorstand': (t, g) async => _reiter(t, g, 'Vorstand'),
  '28-vorstand-mitglieder': (t, g) async {
    await _reiter(t, g, 'Vorstand');
    await _tippen(t, find.widgetWithText(Tab, 'Mitglieder'));
  },
  '29-gruppen': (t, g) async {
    if (!g.handy) return _reiter(t, g, 'Gruppen');
    await _reiter(t, g, 'Einstellungen');
    await _tippen(t, find.text('Gruppen verwalten'));
  },
};

/// Teilnahme am Preisjassen: zwei Personen.
Future<void> _teilnahme(WidgetTester t, TourGeraet g) async {
  await _tippen(t, find.text('Preisjassen 2026'));
  await _tippen(t, find.byKey(const Key('anlass-anmelden')));
  await _tippen(t, find.byTooltip('Mehr Personen'));
}

Future<void> _anmeldung(WidgetTester t, TourGeraet g) async {
  await _tippen(t, find.text('Chilbi 2026'));
  await _tippen(t, find.byKey(const Key('anlass-anmelden')));
  // Eine Schicht gewaehlt, damit man sieht, wie es aussieht.
  await _tippen(t, find.byKey(const Key('schicht-00000000-0000-0000-0000-500000000001')));
  // Zurueck nach oben: Name, E-Mail und die gewaehlte Schicht.
  final liste = find.byType(Scrollable).hitTestable().first;
  await t.drag(liste, const Offset(0, 2000));
  await t.pumpAndSettle();
}

/// Ausleihen: Zeitraum 13.-15.10.2026, drei Teller und eine Kiste gewaehlt.
Future<void> _ausleihen(WidgetTester t, TourGeraet g) async {
  await _reiter(t, g, 'Profil');
  await _tippen(t, find.byKey(const Key('material-ausleihen')));
  await _tippen(t, find.byKey(const Key('zeitraum-waehlen')));
  await _tippen(t, find.text('13').first);
  await _tippen(t, find.text('15').first);
  final fertig = find.text('Speichern');
  await _tippen(t, fertig.evaluate().isEmpty ? find.text('OK') : fertig);
  for (var i = 0; i < 3; i++) {
    await _tippen(t, find.byKey(const Key('menge-2-plus')));
  }
  await _tippen(t, find.byKey(const Key('angebot-kiste-2')));
  await t.drag(find.byType(Scrollable).hitTestable().first, const Offset(0, 2000));
  await t.pumpAndSettle();
}

Future<void> _organisatorAnlass(WidgetTester t, TourGeraet g) async {
  await _reiter(t, g, 'Organisator');
  await _tippen(t, find.text('Chilbi 2026'));
}

Future<void> _austritt(WidgetTester t, TourGeraet g) async {
  await _reiter(t, g, 'Profil');
  await _tippen(t, find.text('Austritt beantragen'));
  await t.enterText(find.widgetWithText(TextField, 'Begründung (optional)'), 'Umzug ins Ausland');
  await t.pumpAndSettle();
  await _tippen(t, find.widgetWithText(FilledButton, 'Austritt beantragen'));
  expect(find.text('Austritt beantragen?'), findsOneWidget);
}
