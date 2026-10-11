// Uebernahme der Anmeldung aus der alten App ueber einen nachgebauten
// Plattform-Kanal: einmalig, alte Daten danach geloescht, nie ein Absturz.

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/fwv_core.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const kanal = MethodChannel(MethodChannelAltdatenQuelle.kanalName);
  late Map<String, String>? plattformDaten;
  late List<String> aufrufe;
  late bool lesenScheitert;

  late SpeicherImArbeitsspeicher roh;
  late SitzungsSpeicher speicher;
  late AltdatenUebernahme uebernahme;

  setUp(() {
    plattformDaten = null;
    aufrufe = [];
    lesenScheitert = false;
    roh = SpeicherImArbeitsspeicher();
    speicher = SitzungsSpeicher(roh);
    uebernahme = AltdatenUebernahme(
      quelle: const MethodChannelAltdatenQuelle(),
      speicher: speicher,
    );
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      kanal,
      (call) async {
        aufrufe.add(call.method);
        switch (call.method) {
          case 'lesen':
            if (lesenScheitert) throw PlatformException(code: 'keystore');
            return plattformDaten;
          case 'loeschen':
            plattformDaten = null;
            return null;
        }
        return null;
      },
    );
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      kanal,
      null,
    );
  });

  test('alte Android-Anmeldung wird uebernommen und dort geloescht', () async {
    plattformDaten = {
      'auth_token': 'alt-access',
      'refresh_token': 'alt-refresh',
      'account_type': 'member',
      'qr_token': 'fwv-member-1',
      'user_name': 'Erika Muster',
    };

    expect(await uebernahme.ausfuehren(), UebernahmeErgebnis.uebernommen);

    final s = await speicher.laden();
    expect(s!.accessToken, 'alt-access');
    expect(s.refreshToken, 'alt-refresh');
    expect(s.qrToken, 'fwv-member-1');
    expect(s.kontotyp, Kontotyp.mitglied);
    expect(s.name, 'Erika Muster');
    expect(aufrufe, ['lesen', 'loeschen']);
    expect(plattformDaten, isNull);
  });

  test('Adressbuch-Frage schon gestellt: wird als App-Einstellung gemerkt', () async {
    plattformDaten = {
      'auth_token': 't',
      'contacts_sync_asked': 'true',
      'contacts_sync_enabled': 'false',
    };
    await uebernahme.ausfuehren();
    expect(roh.werte[SitzungsSchluessel.kontakteGefragt], 'true');
    // Abmelden loescht nur die Sitzung, nicht die Einstellung.
    await speicher.leeren();
    expect(roh.werte[SitzungsSchluessel.kontakteGefragt], 'true');
  });

  test('Adressbuch-Frage nie gestellt: nichts gemerkt', () async {
    plattformDaten = {'auth_token': 't', 'contacts_sync_asked': 'false'};
    await uebernahme.ausfuehren();
    expect(roh.werte.containsKey(SitzungsSchluessel.kontakteGefragt), isFalse);
  });

  test('Organisator mit Anlass', () async {
    plattformDaten = {'auth_token': 't', 'account_type': 'organizer', 'event_id': '42'};
    await uebernahme.ausfuehren();
    final s = await speicher.laden();
    expect(s!.kontotyp, Kontotyp.organisator);
    expect(s.eventId, '42');
  });

  test('alter Kontotyp "qr" ist ein Mitglied', () async {
    plattformDaten = {'auth_token': 't', 'account_type': 'qr', 'qr_token': 'fwv-member-9'};
    await uebernahme.ausfuehren();
    expect((await speicher.laden())!.kontotyp, Kontotyp.mitglied);
  });

  test('laeuft nur einmal', () async {
    plattformDaten = {'auth_token': 't'};
    await uebernahme.ausfuehren();
    plattformDaten = {'auth_token': 'spaeter'};
    expect(await uebernahme.ausfuehren(), UebernahmeErgebnis.bereitsErledigt);
    expect((await speicher.laden())!.accessToken, 't');
    expect(aufrufe, ['lesen', 'loeschen']);
  });

  test('nichts vorhanden: kein Fehler, nichts geloescht, erledigt', () async {
    expect(await uebernahme.ausfuehren(), UebernahmeErgebnis.nichtsVorhanden);
    expect(await speicher.laden(), isNull);
    expect(aufrufe, ['lesen']);
    expect(await uebernahme.ausfuehren(), UebernahmeErgebnis.bereitsErledigt);
  });

  test('Eintraege ohne Token werden geloescht, aber nicht uebernommen', () async {
    plattformDaten = {'account_type': 'member', 'auth_token': ''};
    expect(await uebernahme.ausfuehren(), UebernahmeErgebnis.nichtsVorhanden);
    expect(await speicher.laden(), isNull);
    expect(aufrufe, ['lesen', 'loeschen']);
  });

  test('leere alte Datei wird trotzdem entfernt', () async {
    plattformDaten = {};
    expect(await uebernahme.ausfuehren(), UebernahmeErgebnis.nichtsVorhanden);
    expect(aufrufe, ['lesen', 'loeschen']);
  });

  test('neue App schon angemeldet: alte Daten verworfen', () async {
    await speicher.speichern(const Sitzung(accessToken: 'neu', kontotyp: Kontotyp.mitglied));
    plattformDaten = {'auth_token': 'alt'};
    expect(await uebernahme.ausfuehren(), UebernahmeErgebnis.verworfen);
    expect((await speicher.laden())!.accessToken, 'neu');
    expect(plattformDaten, isNull);
  });

  test('Lesefehler: kein Absturz, beim naechsten Start nochmals', () async {
    lesenScheitert = true;
    expect(await uebernahme.ausfuehren(), UebernahmeErgebnis.fehlgeschlagen);
    expect(roh.werte, isEmpty);

    lesenScheitert = false;
    plattformDaten = {'auth_token': 't'};
    expect(await uebernahme.ausfuehren(), UebernahmeErgebnis.uebernommen);
  });

  test('ohne Plattform-Seite (Desktop): nichts vorhanden', () async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      kanal,
      null,
    );
    expect(await uebernahme.ausfuehren(), UebernahmeErgebnis.nichtsVorhanden);
  });
}
