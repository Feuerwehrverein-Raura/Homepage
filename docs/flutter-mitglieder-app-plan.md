# Bauplan: Mitglieder-App in Flutter (inkl. Organisator)

Stand: 11.10.2026. Grundlage: Bestandsaufnahme von `members-android`,
`members-ios`, der CI und der Backend-Routen. Entscheidung und Struktur:
`docs/flutter-entscheidung.md`.

Code: `flutter/mitglieder` (App), `flutter/fwv_core` (gemeinsam mit der
späteren Vorstand-App). Flutter 3.47, Material aus `material_ui`.

## Grundregeln

- **Die App zeigt an, das Backend rechnet.** Wo die alten Apps selbst
  filtern, zählen oder Texte bauen, kommt das ins Backend (Liste unten).
- **Vertrags-Tests** für jedes Backend-Format, das die App liest
  (`docker/backend-events/test/fixtures/`), wie beim Arbeitsplan.
- **Für das Handy gebaut**: kein seitliches Scrollen, Knöpfe immer sichtbar,
  Dunkelmodus.

## Phase 1 — Mitglieder (ersetzt die heutige App für normale Mitglieder)

| Bereich | Inhalt | Backend |
|---|---|---|
| Anmeldung | Authentik (OIDC, PKCE), QR-Login, Passwort vergessen, automatisches Erneuern, Abmelden | `auth.fwv-raura.ch` (fwv-members-app), `auth/member/qr-login`, `auth/member/request-reset`, `auth/member/reset` |
| Anlässe | Liste, Kalender, Detail | `GET events`, `GET calendar/items`, `GET events/:id` |
| Anmelden | Schicht oder Teilnahme | `POST registrations/public` |
| Arbeitsplan | Karten + PDF | `GET events/:id/arbeitsplan`, `…/pdf/arbeitsplan` |
| Meine Anmeldungen | Liste mit Status | `GET registrations/mine` |
| Profil | anzeigen, ändern, Foto, Austritt | `GET/PUT members/me`, `POST/DELETE members/me/photo`, `POST members/me/austritt` |
| Benachrichtigungen | Einstellungen + Push | `GET/PUT members/me/notifications`, `POST members/me/fcm-token` |
| Zugänge | Funktions-Mails, Cloud, Konten | `GET members/me/accesses`, `PUT members/me/function-email-password` |
| Einstellungen | Newsletter, Adressbuch, Abmelden | `newsletter/subscribe`, `newsletter/unsubscribe` |
| Anlass vorschlagen | Formular | `POST events/propose` |

Basis-URL `https://api.fwv-raura.ch/`, überall `Authorization: Bearer`.

### Stand Phase 1 (11.10.2026)

**Anmeldung — fertig.** Getestet mit Nachbauten; dazu am 11.10.2026 im
Android-Emulator: als Update über die alte App installiert, die alte
Anmeldung wurde übernommen ("Angemeldet als …" ohne neues Login), die alte
Datei `fwv_members_prefs` ist gelöscht.

- `fwv_core` (ohne Oberfläche, auch für die Vorstand-App): `ApiClient`
  (JSON, Bearer, bei 401/403 einmal erneuern und wiederholen),
  `SitzungsVerwaltung` (QR-Login, externer Organisator über
  `events/login`, Passwort-Reset, Erneuern: OIDC-Refresh → stiller
  QR-Login → "Sitzung abgelaufen"; parallele Aufrufe teilen einen
  Versuch; ohne Netz wird nicht abgemeldet), `SitzungsSpeicher` auf
  `flutter_secure_storage` (Schlüssel wie `TokenManager.kt`),
  QR-Code-Leser, Übernahme der alten Anmeldung.
- `mitglieder`: Login-Screen (Reiter Mitglied / QR-Code, darunter
  "Externer Organisator"), Passwort-Reset, QR-Scanner (`mobile_scanner`),
  Authentik über `flutter_appauth` (PKCE, `state` prüft AppAuth),
  Platzhalter-Startseite mit Abmelden. Haken fürs Abmelden des
  Push-Tokens: `pushTokenAbmelden` in `lib/dienste.dart`.
- Übernahme alter Anmeldungen (Entscheidung 3): Kotlin
  (`AltdatenUebernahme.kt`, `security-crypto`, gleicher MasterKey) und
  Swift (`AppDelegate.swift`, Schlüsselbund) über den Kanal
  `ch.fwvraura.members/altdaten`; einmalig, danach gelöscht.
- Tests: `flutter test` in beiden Paketen, `flutter build apk --debug` und
  `flutter build ios --simulator --no-codesign` laufen durch.

Kontakt-Abgleich verdrahtet (11.10.2026): Die App teilt dem nativen
Abgleich (Android) das Token mit — nach dem Laden beim Start, nach jedem
Login und jedem Erneuern (`SitzungsVerwaltung.beiNeuemToken` in
`fwv_core`), beim Abmelden und bei abgelaufener Sitzung `null`; externe
Organisatoren geben immer `null` weiter. Abmelden schaltet den Abgleich aus.
Nach dem ersten Login fragt die App einmal "Mitglieder ins Adressbuch
übernehmen?" (nur Android, nur wenn verfügbar und noch aus); die Antwort
steht unter `contacts_sync_asked`, ein `true` aus der alten App wird
übernommen. Wie in der alten App wird nach dem Abmelden wieder gefragt. Die
Einstellungen fragen den Stand beim Öffnen und bei Rückkehr in die App ab.

Noch offen bei der Anmeldung: auf einem echten Gerät gegen Authentik
ausprobieren.

**Hauptseite, Profil, Einstellungen, Push — gebaut (11.10.2026).** Getestet
mit Nachbauten (kein echtes Konto, kein Firebase); `flutter build apk
--debug` läuft durch. Noch nicht auf einem Gerät ausprobiert.

- Hauptseite mit Reitern unten: Anlässe · (Organisator) · Profil ·
  Einstellungen. "Organisator" erscheint bei Mitgliedern, wenn
  `events/organized-by-me` etwas liefert; externe Organisatoren starten
  dort und haben kein Profil. Platzhalter für Phase 2: `OrganisatorTab`,
  `OrganisatorAnlassScreen` (`lib/organisator/`).
- `fwv_core` (auch für die Vorstand-App): `MitgliederDienst` (Profil, Foto,
  Austritt, Zugänge, Funktions-Mail-Passwort, Benachrichtigungen,
  Push-Token, Newsletter, organisiert-Abfrage), Modelle `MitgliedProfil`,
  `ProfilAenderung`, `Zugaenge`, `BenachrichtigungsEinstellungen`;
  `ApiClient.hochladen` (multipart, mit Erneuern), `fotoVerkleinern`
  (max. 1024 px, JPEG 85, EXIF-Drehung eingerechnet — vorerst im Gerät).
- Profil: Anzeige mit Foto (relativer Pfad gegen die API aufgelöst),
  Bearbeiten mit Prüfung (Pflichtfelder, E-Mail, Telefon, PLZ) und
  Datumswähler für den Geburtstag, Foto per Kamera/Galerie
  (`image_picker`) oder löschen, Austritt mit Bestätigung und Abmelden,
  Link "Meine Anmeldungen".
- Einstellungen: Benachrichtigungen (+ Push-Erlaubnis dieses Geräts),
  Zugänge (Passwörter verdeckt bis Antippen, Kopieren, Passwort einer
  Funktions-Mail ändern, mind. 12 Zeichen), Newsletter-Schalter (Stand nur
  lokal gemerkt), Adressbuch (iOS: `carddav.mobileconfig` + Anleitung;
  Android: Kanal `ch.fwvraura.members/kontakte`, Kotlin-Abgleich unter
  `android/.../kontakte/`),
  App-Version, Abmelden.
- Push (Android): `firebase_messaging`, dasselbe Firebase-Projekt
  (`google-services.json` aus `members-android`), Kanal `fwv_general`,
  Anzeige im Vordergrund über `flutter_local_notifications`. Token-Anmeldung
  beim Start, nach dem Login und bei neuem Token (`device_id` = zufällige
  Gerätekennung).
- Push (iOS): Firebase-Projekt `fwv-raura-mitglieder`, iOS-App
  `ch.fwvraura.members`. Die App startet Firebase nur, wenn
  `ios/Runner/GoogleService-Info.plist` im App-Bundle liegt (Kanal
  `ch.fwvraura.members/firebase` in `AppDelegate.swift`, geprüft in
  `FirebasePush.starten`); ohne die Datei läuft sie normal, nur ohne Push.
  Die Build-Phase "Copy GoogleService-Info.plist" im Runner-Target kopiert
  die Datei, wenn sie da ist — Ablegen genügt, das Xcode-Projekt muss nicht
  angefasst werden. Damit Nachrichten tatsächlich ankommen, fehlt noch:
  1. Apple-Developer-Account des Vereins (beantragt, siehe unten).
  2. APNs-Authentifizierungsschlüssel (.p8) im Apple-Konto erstellen
     (Certificates, Identifiers & Profiles → Keys → Apple Push
     Notifications service) und in der Firebase-Konsole unter
     Projekteinstellungen → Cloud Messaging → Apple-App-Konfiguration
     hochladen (mit Key-ID und Team-ID).
  3. Im App-ID `ch.fwvraura.members` die Fähigkeit "Push Notifications"
     einschalten und im Xcode-Projekt ergänzen: Datei
     `Runner/Runner.entitlements` mit `aps-environment` (`development` bzw.
     `production`), eingetragen als `CODE_SIGN_ENTITLEMENTS`, und in
     `Info.plist` `UIBackgroundModes` = `remote-notification`. Beides erst
     mit Signierung sinnvoll — ohne passendes Profil lässt sich die App mit
     `aps-environment` nicht auf ein Gerät installieren.
  4. Danach auf einem echten Gerät prüfen (der Simulator bekommt keine
     FCM-Nachrichten über APNs).
- Abmelden meldet das Push-Token ab: neue Route
  `DELETE members/me/fcm-token {token}` in `backend-members` (idempotent),
  danach wird das Token auf dem Gerät verworfen; auf Android wird der
  Kontakt-Abgleich ausgeschaltet. Damit ist der Fehler "Abmelden meldet das
  Push-Token nicht ab" behoben (Backend muss dafür ausgerollt sein).

**Anlässe, Kalender, Anmelden, Arbeitsplan, Meine Anmeldungen, Vorschlagen
— gebaut (11.10.2026).** Getestet mit Nachbauten gegen die Vertragsdateien;
`flutter build apk --debug` und `flutter build ios --simulator --no-codesign
--debug` laufen durch. Noch nicht auf einem Gerät ausprobiert.

- Grundsatz eingehalten: Die App zeigt nur die `app`-Blöcke des Backends an
  (`datum_text`, `zeit_text`, `anmeldung.moeglich/grund/art`,
  `anmeldeschluss_text`, `plaetze_text`, `kann_bearbeiten`, pro Schicht
  `bereich_text`, `belegung.text`, `waehlbar`; `status_text`/`status_farbe`/
  `beschriftung`; `datum_text` im Kalender). Kein Filtern, Zählen oder
  Datumsformatieren auf dem Gerät.
- `fwv_core`: Modelle `Anlass` (mit `AnlassApp`, `AnlassAnmeldung`,
  `Schicht`, `SchichtApp`, `Belegung`, `datum_offen`/`gruppe`),
  `MeineAnmeldung`, `KalenderEintrag`, `EventOptionen`; `AnlaesseDienst`
  (Liste, Detail, Kalender, Arbeitsplan + PDF, Anmelden, eigene Anmeldungen,
  Optionen, Vorschlagen); `ApiClient.datei` (Bytes, z.B. PDF);
  Kalender-Export `anlassAlsIcs`. Vertrags-Tests lesen
  `anlaesse-app.json`, `meine-anmeldungen.json`, `kalender-app.json` aus dem
  Repo.
- Anlässe-Reiter: oben Liste / Kalender. Liste aus `GET events?aktuell=true`
  (mit Token), Karten mit Titel, Datum/Zeit, Ort und Hinweis ("Helfer
  gesucht", "Anmeldung offen" oder der Grund vom Backend); danach der
  Abschnitt "Ideen – Datum noch offen" (`gruppe = datum_offen`, schlichte
  Karten). Kalender: Monatsraster (Montag zuerst) mit Punkten, darunter die
  Einträge des Monats bzw. des gewählten Tags; Anlässe öffnen das Detail.
  Herunterziehen lädt neu, Fehler- und Leer-Zustände. "+" (nur Mitglieder):
  Anlass vorschlagen (`POST events/propose`), Kategorien aus
  `GET event-optionen`.
- Detail: Titel, Untertitel, Datum, Zeit, Ort, Kosten, Organisation,
  Anmeldeschluss, Plätze, Beschreibung, Schichten mit Belegung. Unten immer
  sichtbar: "Helfen"/"Anmelden" nur bei `anmeldung.moeglich`, sonst der
  Grund; "Arbeitsplan ansehen" bei Schichten. Oben: "Zum Kalender" (nicht bei
  offenem Datum) und "Bearbeiten" bei `kann_bearbeiten` (führt vorerst auf
  den Platzhalter `OrganisatorAnlassScreen`).
- Arbeitsplan: Karten pro Zeitfenster aus `GET events/:id/arbeitsplan`
  (nur Bereiche mit Schicht, "noch niemand", "N Plätze frei"); PDF über das
  Teilen-Menü (`share_plus`) zum Öffnen, Sichern oder Weiterschicken.
- Anmelden (`POST registrations/public`): Name, E-Mail, Telefon aus
  `members/me` vorbelegt; Helfer wählen nur unter `waehlbar`-Schichten (mit
  Belegung), Teilnehmer geben Personen (1–20) und Allergien an; Prüfung von
  Name, E-Mail und Schichtwahl; Meldung des Servers bei Erfolg und bei
  Absagen (409 usw.).
- Meine Anmeldungen (aus dem Profil): Anlass, Datum, Status-Chip in der
  Farbe des Backends, Schicht-Beschriftungen; Antippen öffnet den Anlass.

Beobachtungen am Backend:

- Erledigt (11.10.2026): `POST registrations/public` ignoriert
  `eventTitle` und `organizerEmail`; die Meldung geht an `organizer_email`
  des Anlasses, sonst an `CONTACT_EMAIL` (auch bei alten, noch
  unbestätigten Gast-Anmeldungen). Mit gültigem Mitglieder-Token zählt das
  Mitglied aus dem Token (Name, E-Mail, `member_id`), nicht die E-Mail im
  Formular; ohne Token wie bisher.
- `meal_selection` (Menüwahl bei GV) zeigt die App beim Anmelden noch
  nicht; `meal_options` liefert jetzt die Organisator-Übersicht, im
  Anlass-Vertrag (`anlaesse-app.json`) steht es noch nicht.
- Erledigt: `GET events/:id/ics` (eine Datei pro Anlass, Ortszeit
  Europe/Zurich, nicht bei "Datum noch offen"). Die App baut die Datei
  noch selbst und kann auf die Route umstellen.
- `POST events/propose` antwortet nur mit der neuen Zeile, ohne Meldung —
  der Dank-Text steht in der App.

Unterschiede, die beim Bau aufgefallen sind:

- Benachrichtigungsarten: Das Backend kennt `shift_reminder`,
  `event_update`, `newsletter`, `general` (Push verschickt nur die drei
  ohne `newsletter`). Die alte iOS-App zeigte `event_invitation` und
  `registration_status` — die verwendet kein Backend. Die neue App nimmt
  die Arten des Backends.
- Zugänge: Das Backend liefert Nextcloud-Ordner als `name`, die alte
  Android-App las `mount_point` und zeigte keinen Namen. `organizerEvents`
  und `smbCredentials` liefert das Backend, angezeigt werden sie (wie
  bisher) nicht.
- Funktions-Mail-Passwort: Backend verlangt 8 Zeichen, die App 12.
- Austritt: `POST members/me/austritt` sucht das Mitglied nur über die
  E-Mail, nicht wie die anderen `members/me`-Routen über
  `mitgliedZurAnmeldung` — Mitglieder ohne E-Mail bekommen 404.

## Phase 2 — Organisator

Übersicht der eigenen Anlässe, Anmeldungen bestätigen/ablehnen/ändern/
löschen/hinzufügen, Alternative vorschlagen, Angemeldete informieren,
Anlass bearbeiten, Schichten, Organisator-Notizen mit Anhängen, Rezepte und
Material, PDFs (Teilnehmerliste, Aushang, Arbeitsplan). Alle unter
`events/…-as-organizer`, `events/organized-by-me`,
`events/:id/organizer-registrations`, `events/:id/organizer-notes`,
`events/:id/recipes|shopping-list|manual-items`.

### Stand Phase 2 (11.10.2026)

**Gebaut.** Getestet mit Nachbauten und gegen die Vertragsdatei;
`flutter build apk --debug` und `flutter build ios --simulator --no-codesign
--debug` laufen durch. Noch nicht auf einem Gerät ausprobiert.

- Backend: `GET events/organisator-uebersicht` — ein Aufruf: eigene
  Anlässe (Vorstand: alle aktuellen, externer Organisator: sein Anlass),
  Schichten mit `app`-Block, je Anmeldung anzeigefertig Name, Kontakt,
  Personen, Begleitpersonen, Allergien, Menü, Bemerkung, Schichten, Status;
  Zahlen und erlaubte Aktionen (`src/organisator-ansicht.js`, Vertrag
  `fixtures/organisator-uebersicht.json`, Datenschutz-Test). Organisator-
  Login (`events/login`) gilt nicht mehr, wenn der Anlass vorbei oder
  abgesagt ist — auch schon ausgestellte Tokens. `meal_options` liess sich
  über `PUT events/:id[/as-organizer]` als Liste nie speichern (JSONB,
  "invalid input syntax for type json") — behoben.
- Neues Paket `flutter/fwv_anlass` (mit Oberfläche, gemeinsam mit der
  späteren Vorstand-App): Schnittstelle `AnlassVerwaltungZugang` — die
  Screens kennen keine Routen. `OrganisatorZugang` (Routen
  `…-as-organizer`, externer Organisator `events/my-event/…`); ein
  `VorstandZugang` kommt mit der Vorstand-App dazu (Stelle in
  `lib/src/zugang.dart` beschrieben). Screens: Übersicht, Anlass mit
  Reitern (Anmeldungen, Schichten, Notizen, Material), Anmeldung ändern/
  löschen, Person eintragen (Mitglied aus dem Verzeichnis oder Gast),
  andere Schicht vorschlagen, Angemeldete informieren (mit Ergebnis und
  "nicht erreicht"), Anlass bearbeiten (Kategorien/Status aus
  `event-optionen`), Schichten, Notizen mit Fotos (1600 px, Base64), Rezepte
  und Material (Werte der Inventar-API), PDFs über das Teilen-Menü.
  Gemeinsame Bausteine (Laden, Meldungen, Chips) liegen jetzt dort; die
  Mitglieder-App exportiert sie weiter.
- Mitglieder-App: `OrganisatorTab` und `OrganisatorAnlassScreen` sind nur
  noch Hüllen; externe Organisatoren sehen ihren Anlass direkt.
- Die drei iOS-Fehler unten sind behoben: Bearbeiten schickt nur
  Geändertes (Tests im Paket).

Offen: externe Organisatoren können nur bestätigen, ablehnen, eintragen
und den Arbeitsplan senden (mehr Routen hat `events/my-event` nicht).
Langfristig soll das Backend pro Aktion eine Route haben, die selbst
prüft "Vorstand oder Organisator dieses Anlasses und nicht vorbei".
`GET events/:id/pdf/teilnehmerliste` ist ohne Anmeldung abrufbar (mit
E-Mail-Adressen) — gehört geschützt. Notizen nehmen nur Fotos auf, keine
anderen Dateien.

### Stand Lager und Einkauf (11.10.2026)

**Gebaut** (Entscheidung "Inventar, Einkauf, Kasse" in
`docs/flutter-entscheidung.md`). Getestet mit Nachbauten und gegen echte
Antworten der Inventar-API; noch nicht auf einem Gerät und noch nicht gegen
das echte Authentik ausprobiert.

- Inventar-Backend (`simple-inventory-system/backend`): nimmt zusätzlich
  Authentik-Tokens von `fwv-members-app` und `fwv-members` an (Issuer und
  JWKS je Anwendung, `src/zugang.ts`), aber nur mit der Gruppe Lager,
  Vorstand oder admin (Gross-/Kleinschreibung egal), sonst 403 mit
  deutscher Meldung. Tokens der Inventar-PWA (`inventory-system`) und der
  lokale Modus unverändert. Dazu: `GET items/:id` liefert den Bestand je
  Lagerort (`locations`); `GET locations/overview` lieferte immer 500 (stand
  hinter `locations/:id`) — behoben; Buchen verlangt eine ganze Zahl über 0
  ("5" + "3" ergab vorher "53") und meldet "Nicht genug an Lager" auf
  Deutsch; Zurückbuchen nimmt auch das Material von Hand mit und rundet auf
  ganze Einheiten; mit dem internen Key nennt das Events-Backend die
  handelnde Person (`x-fwv-user-email`). Tests: `npm test` (tsc,
  Zugangsregeln, API gegen Postgres mit nachgebautem Authentik), neu in der
  CI (`tests.yml`, Job Inventar-Backend) — vorher lief nur `tsc` im
  Docker-Build.
- Neues Paket `flutter/fwv_lager` (mit Oberfläche, für beide Apps):
  Schnittstelle `LagerZugang`, `ApiLagerZugang` auf
  `https://inventar.fwv-raura.ch/api/`. Artikel suchen, Barcode/QR scannen
  (`mobile_scanner`, Etiketten der Inventar-PWA werden erkannt), Artikel mit
  Bestand je Lagerort, Mindestbestand und letzten Buchungen, Eingang/Ausgang
  mit Menge und Notiz, Lagerorte mit Inhalt, Nachbestellen, Artikel anlegen
  (ohne EAN vergibt das Backend `FWV000123`), unbekannten Code einem
  Artikel zuordnen. Vertrag `fwv_lager/test/fixtures/inventar-api.json`
  schreibt und prüft der Backend-Test.
- `fwv_core`: `Sitzung.gruppen`/`hatGruppe` aus dem `groups`-Claim des
  Tokens — Authentik oder Mitglieder-Token (QR-Code usw., siehe "Stand
  QR-Login gleichwertig"); externe Organisatoren haben nie Gruppen.
  `SitzungsVerwaltung.apiFuer` (zweites Backend, gleiches Token und
  Erneuern), `ApiClient.patch`, `hochladen` mit Text-Feldern.
- Mitglieder-App: Reiter "Lager" für Lager, Vorstand, admin.
- Einkauf im Organisator-Bereich (Reiter Material, Recht
  `aktionen.einkauf`): Positionen abhaken (mit gekaufter Menge), Belege
  fotografieren oder aus der Galerie (1600 px, Rückkamera), ansehen,
  teilen, löschen, "Eingekauft → ins Lager zurückbuchen". Neue Proxy-Routen
  im Events-Backend (`PATCH …/shopping-list/:itemId`,
  `POST …/shopping-list/restock`, `GET/POST …/receipts`,
  `GET …/receipts/:id/image`, `DELETE …/receipts/:id`), Test mit
  nachgebauter Inventar-API (`test/einkauf.test.js`).

**Die Einkaufs-PWA (`simple-inventory-system/shopping-pwa`) kann wegfallen,
sobald das live ist** (Backends ausgerollt, App im Store). Was sie noch
zusätzlich kann und die App nicht: Teilen-Links für Nicht-Mitglieder,
Deadline/Budget pro Anlass, Ist-Preis und Zahler je Position, Web-Push.
Vor dem Abschalten klären, ob das jemand braucht.

Offen:

- Authentik: Die Tokens müssen die Gruppe wirklich im Claim `groups`
  tragen (Standard-Mapping "profile"); auf einem Gerät mit einem Konto der
  Gruppe Lager prüfen.
- Ein- und Ausbuchen ändert nur den Gesamtbestand, nicht die Menge in den
  Kisten (`item_locations`) — so ist das Inventar gebaut (auch in der PWA).
- Belegbilder und Artikelbilder liegen unter `/api/uploads/` der
  Inventar-API ohne Anmeldung abrufbar (Dateinamen sind zufällig).
- Die Inventar-Leserouten (`GET items`, `locations`, `reports`, …) sind
  weiterhin ohne Anmeldung offen.

### Stand Ausleihe (11.10.2026)

**Gebaut** (Entscheidung "Ausleihe" in `docs/flutter-entscheidung.md`).
Getestet mit Nachbauten und gegen echte Antworten der Inventar-API; noch
nicht auf einem Gerät, noch nicht gegen das echte Authentik, Versand nur
gegen nachgebaute Dienste.

- Inventar-Backend: neue Tabellen `ausleihen`, `ausleihe_positionen`,
  `ausleihe_kisten_inhalt`, `ausleihe_fotos`, Spalte `ausleihbar` an
  `items` und `locations` (Standard aus) — angelegt beim Start wie die
  anderen Tabellen (`CREATE TABLE IF NOT EXISTS`). Routen unter
  `/api/ausleihe` (Liste im README von `simple-inventory-system`). Regeln in
  `src/ausleihe.ts`: frei = Bestand + gerade Ausgegebenes − alle
  überschneidenden Ausleihen (reserviert oder ausgegeben, Kisten mit
  Inhalt); eine Kiste ist frei, wenn keine überschneidende Ausleihe sie
  hat; Ausgegebenes belegt bis zur Rückgabe, auch überfällig. Anlegen prüft
  im Backend (409 mit deutscher Meldung, gesperrt gegen gleichzeitiges
  Anlegen). Ausgeben bucht aus (`Ausleihe #id`) und hält den Kisten-Inhalt
  fest; Zurücknehmen bucht Zurückgekommenes ein, Beschädigtes/Fehlendes
  bleibt ausgebucht (Verlauf mit Grund), Fehlendes aus Kisten wird dort
  abgezogen. Status, Farbe, Zeitraum, Hinweis ("Seit 2 Tagen überfällig")
  und erlaubte Aktionen liefert der `app`-Block.
- Rechte: die Ausleihe-Routen nehmen Tokens der Mitglieder-App/-Web **ohne**
  Lager-Gruppe an (jedes Mitglied leiht für sich, sieht und sagt eigene ab);
  verwalten, Externe erfassen, Fotos und "ausleihbar" nur Lager, Vorstand,
  admin. Alle anderen Inventar-Routen verlangen weiter die Gruppe.
- Benachrichtigungen: neue Ausleihe eines Mitglieds → E-Mail ans Lager und
  Bestätigung ans Mitglied (+ Push, wenn api-members das Mitglied über die
  E-Mail findet); Absage eines Mitglieds → E-Mail ans Lager. Externe erfasst
  das Lager selbst — keine Meldung. Erinnerungen (stündlich geprüft,
  höchstens eine pro Ausleihe und Tag): einen Tag vor "bis" und täglich bei
  Überfälligkeit an die Person (E-Mail, Mitglieder auch Push); beim ersten
  Überfällig-Tag zusätzlich ans Lager.
- `fwv_lager`: `AusleiheZugang`/`ApiAusleiheZugang` (eigene Schnittstelle
  neben `LagerZugang`, weil jedes Mitglied ausleihen darf), Modelle,
  Screens: Ausleihen (Zeitraum → Angebot mit freier Menge → Mengen/Kisten →
  bestätigen, 409 lädt neu), Meine Ausleihen, Ausleihe (Absagen/Ausgeben/
  Zurücknehmen je nach `app`-Block), Ausleihen verwalten (Kommend ·
  Ausgegeben · Überfällig · Erledigt, "Für Externe"), Rückgabe je Position
  bzw. Kisten-Zeile (Menge, Zustand, Schaden, Fotos 1600 px).
  `LagerZugang` setzt "ausleihbar" (Schalter im Artikel und im Lagerort).
  Vertrag `fwv_lager/test/fixtures/ausleihe-api.json` schreibt und prüft
  `simple-inventory-system/backend/test/ausleihe.test.mjs` ("heute" darin
  immer 11.10.2026).
- Mitglieder-App: Profil → "Material ausleihen" und "Meine Ausleihen" für
  alle angemeldeten Mitglieder, über Authentik oder per QR-Code gleich;
  externe Organisatoren haben kein Profil. Im Reiter Lager oben "Ausleihen
  verwalten". `fwv_core`: `Sitzung.mitgliedAngemeldet`.

**Vor dem Einschalten auf dem Server** (`simple-inventory-system/.env`,
Werte aus der `.env` des Haupt-Stacks; nichts davon ist gesetzt):

- `DISPATCH_API_KEY` = `API_KEY` — sonst geht keine E-Mail raus (nur Log).
- `INTERNAL_API_KEY` = `INTERNAL_API_KEY` — sonst kein Push.
- `LAGER_EMAIL` — Standard `lager@fwv-raura.ch`; prüfen, ob es die Adresse
  gibt.
- `DISPATCH_API_URL` / `MEMBERS_API_URL` — Standard `http://api-dispatch:3000`
  bzw. `http://api-members:3000` über das Netz `proxy`; einmal aus dem
  Container prüfen (sonst `http://fwv-api-dispatch:3000` usw.).
- Erst danach `AUSLEIHE_ERINNERUNG_ENABLED=true` — bis dahin keine
  Erinnerungen. Probelauf: `POST /api/ausleihe/erinnerungen` mit
  `x-order-api-key`.

Offen:

- Das Lager muss zuerst Artikel und Kisten als ausleihbar markieren.
- Die Inventar-PWA kennt die Ausleihe nicht; der Raspberry-Pi-Sync nimmt
  die Ausleihe-Tabellen nicht mit.
- Schadenfotos liegen wie Belege unter `/api/uploads/` ohne Anmeldung.
- Ausgeben verlangt genug Bestand; stimmt der Kisten-Inhalt
  (`item_locations`) nicht mit dem Gesamtbestand, meldet es 409.
- Kein Bearbeiten einer Ausleihe (Zeitraum/Mengen) — absagen und neu.

### Stand QR-Login gleichwertig (11.10.2026)

Wer sich per QR-Code, Anmeldebon, App-Passwort oder Passwort-Reset
anmeldet, hat dieselben Rechte wie nach dem Login über Authentik. Getestet
mit nachgebautem Authentik bzw. api-members, noch nicht gegen das echte
Authentik.

- api-members: Das Mitglieder-Token (HS256, `type: member`) enthält in
  `groups` die Namen der Authentik-Gruppen des Mitglieds
  (`src/member-gruppen.js`; Admin-API `GET /api/v3/core/users/<pk>/`,
  `groups_obj`, 60 s zwischengespeichert, nach dem Gruppen-Abgleich sofort
  neu). Ohne Authentik-Konto oder bei Fehler wie bisher `[]` (Log). Die
  Gruppen gelten bis zum Ablauf des Tokens (8 h, Anmeldebon 7 Tage); die
  App holt beim Erneuern per QR-Code ein neues.
- Neu `GET /auth/member/pruefen` (Bearer Mitglieder-Token): `{valid,
  member_id, email, name, benutzername, groups, exp}` mit den aktuellen
  Gruppen, sonst 401. Prüft nur das mitgeschickte Token.
- Inventar: nimmt Mitglieder-Tokens an und fragt dafür api-members
  (`MEMBERS_API_URL`, 60 s pro Token gemerkt, kein gemeinsames Geheimnis);
  danach dieselbe Regel wie für die App (Lager nur mit Lager/Vorstand/admin,
  ausleihen jedes Mitglied). api-members weg → 503.
- Events-Backend: Gruppen-Vergleich unabhängig von Gross-/Kleinschreibung
  (`Vorstand` aus Authentik = `vorstand`), für alle Tokens.
- App: `jwtGruppen` liest auch Mitglieder-Tokens; Lager-Reiter und
  Ausleihe für QR-Logins wie für Authentik; der Hinweis "nicht per
  QR-Code" ist weg. Externe Organisatoren weiterhin nie.
- Tests: `docker/backend-members/test/member-gruppen.test.js` (neu, CI-Job
  "Backend Members"), Inventar `api.test.mjs`/`ausleihe.test.mjs`/
  `zugang.test.mjs`, Events `datenschutz.test.js`/`organisator.test.js`,
  `fwv_core`, `fwv_lager`, Mitglieder-App.

Offen:

- Auf dem Server prüfen, dass `AUTHENTIK_API_TOKEN` von api-members Benutzer
  und Gruppen lesen darf und dass das Inventar `http://api-members:3000`
  erreicht (sonst `MEMBERS_API_URL` setzen).
- Mitglieder ohne E-Mail-Adresse können nicht ausleihen (die Ausleihe hängt
  an der E-Mail) und werden im Events-Backend weiterhin nicht als Mitglied
  erkannt (es verlangt `email` im Token).
- Das Members-Backend selbst vergleicht `requireRole` weiter exakt
  (`vorstand`); unverändert, weil es dort nur um Vorstand-Logins geht.

## Phase 3 — Ablösung der alten Apps

- **Android**: gleiche App-ID `com.fwv.members`, gleicher Upload-Schlüssel
  (CI-Secrets `MEMBERS_KEYSTORE_BASE64`, `MEMBERS_KEYSTORE_PASSWORD`, Alias
  `members`), Version über `members-v*`-Tags; die neue `versionCode` muss
  über 4200 liegen (0.42.0). Play-Upload wie heute in den internen Test.
  **Umgestellt (11.10.2026)** — siehe Abschnitt "Release".
- **iOS**: gleiche Bundle-ID `ch.fwvraura.members`. Es gibt noch **keinen
  Apple-Developer-Account, keine Signierung und kein TestFlight** — das
  blockiert iOS im Store unabhängig von Flutter.
- **Schwarzer Bildschirm nach dem Update (behoben)**: iOS speichert
  Szenen-Sitzungen samt Konfiguration (`Library/Saved Application State`)
  und stellt sie nach einem App-Update wieder her, ohne `Info.plist` erneut
  zu lesen. Die alte App war eine SwiftUI-App; ihre gespeicherte Sitzung hat
  `SwiftUI.AppSceneDelegate` als Delegate und kein Storyboard — die
  Flutter-App bekam dadurch weder Fenster noch Engine. `AppDelegate.swift`
  erkennt das beim Verbinden der Szene (`UIScene.willConnectNotification`),
  setzt den Flutter-`SceneDelegate` ein und baut das Fenster aus
  `Main.storyboard` selbst auf. Im Simulator mit der gespeicherten Sitzung
  der alten App nachgestellt und geprüft (11.10.2026).
- **Kontakt-Abgleich vor dem Store-Update umziehen**: Das Android-Konto
  "FWV Raura" (Typ `com.fwv.members`) gehört zur App. Fehlt der native
  Abgleich in der neuen App, kann Android das Konto samt Kontakten entfernen
  (meist beim nächsten Neustart). Im Emulator am 11.10.2026 nach dem Update
  noch vorhanden (61 Kontakte) — der Umzug muss trotzdem vorher fertig sein.
- **Angemeldet bleiben**: Android speichert das Token heute in
  `EncryptedSharedPreferences` (`fwv_members_prefs`), die neue App liest
  anderswo. Ohne Übernahme-Code müssen sich alle einmal neu anmelden.

## Release

Stand 11.10.2026: Der Tag-Workflow baut die **Flutter-App**, nicht mehr
`members-android`. Erste Flutter-Version: **`members-v1.0.0`**
(`versionCode` 10000, liegt über 4200 der letzten nativen Fassung 0.42.0).

Release auslösen (vom aktuellen `main`):

```sh
git tag members-v1.0.0
git push origin members-v1.0.0
```

Was dann passiert (`.github/workflows/build-android-members.yml`):

1. `flutter analyze` + `flutter test` für `fwv_core`, `fwv_anlass`,
   `fwv_lager`, `mitglieder`; bricht etwas, wird nichts gebaut.
2. `flutter build appbundle` und `flutter build apk` mit
   `--build-name X.Y.Z --build-number X*10000+Y*100+Z`, signiert mit dem
   Upload-Schlüssel der alten App (Secrets `MEMBERS_KEYSTORE_BASE64`,
   `MEMBERS_KEYSTORE_PASSWORD`, Alias `members`;
   `android/app/build.gradle.kts`). Ohne Keystore (lokal) signiert Gradle
   mit dem Debug-Schlüssel; bei einem Tag ohne Keystore bricht der Lauf ab.
   R8 ist an (Flutter-Standard), eigene Regeln in
   `android/app/proguard-rules.pro`.
3. GitHub-Release mit APK + AAB (`make_latest: false`) und rollender Zeiger
   `members-latest/members-latest.apk`.
4. Upload in den internen Test von Google Play (Status `completed`) mit
   `r0adkll/upload-google-play@v1.1.5` (Secret `PLAY_SERVICE_ACCOUNT_JSON`),
   Versionshinweise aus `flutter/mitglieder/play/whatsnew/whatsnew-de-CH`
   (de-CH, max. 500 Zeichen — vor jedem Release anpassen). Warum diese
   Action statt Gradle Play Publisher: `docs/play-console-setup.md`,
   Abschnitt 9. Der Store-Eintrag (Texte, Bilder) bleibt unverändert.

Die native App (`members-android`) bleibt vorerst im Repo, wird aber weder
bei Tags noch bei Pull Requests gebaut. Ein `workflow_dispatch` des
Workflows baut eine beliebige Version ohne Play-Upload (optional mit
GitHub-Release).

Lokal geprüft (11.10.2026): `flutter build appbundle --release
--build-name 1.0.0 --build-number 10000` und `flutter build apk --release …`
laufen durch (Debug-signiert); das Release-APK startet im Emulator als
Update über die installierte App, Anmeldung bleibt, Konto "FWV Raura" und
Kontakte-Abgleich (61 Mitglieder) funktionieren mit R8, keine
`ClassNotFound`/`MissingPluginException` im Log.

**iOS** bleibt blockiert: Ohne Apple-Developer-Account gibt es weder
Signierung noch TestFlight; sobald der Vereins-Account da ist, folgt ein
eigener Release-Weg.

## Was ins Backend gehört (heute rechnen die Apps)

1. Anlass-Liste: Vergangene und abgesagte ausfiltern, sortieren.
2. Kalender: E-Mail/Brief-Einträge für Mitglieder serverseitig weglassen.
3. Schicht-Belegung als fertiger Text ("1 Platz frei").
4. `kann_bearbeiten` am Anlass statt Abgleich in der App.
5. Meine Anmeldungen: Schicht-Text und Status fertig liefern.
6. ~~Organisator-Übersicht: ein Aufruf mit Zahlen statt einer Abfrage pro
   Anlass und Auslesen der Bemerkungen.~~ Erledigt
   (`GET events/organisator-uebersicht`).
7. Anmeldung nötig ja/nein aus der Kategorie im Backend bestimmen.
8. ~~`POST registrations/public` soll Titel und Organisator-E-Mail nicht
   vom Gerät übernehmen.~~ Erledigt.
9. Material: "fehlt"-Zahl und Auswahllisten fertig liefern.
10. Profilfoto: absolute URL; Verkleinern im Backend statt im Gerät.
11. Newsletter: Abfrage, ob man angemeldet ist (heute nur lokal gemerkt).

## Fehler in den heutigen Apps (nicht übernehmen)

In der Flutter-App alle behoben (Stand 11.10.2026); die ersten drei mit
Tests in `flutter/fwv_anlass`.

- iOS: Beim Bearbeiten einer Schicht springt das Datum auf heute.
- iOS: Anlass bearbeiten löscht Menüwahl und Anmeldeschluss.
- iOS: Anmeldung bearbeiten überschreibt die Bemerkungen (Begleitpersonen,
  Allergien, Menü gehen verloren).
- iOS: Beim Login wird `state` nicht geprüft.
- Android: zwei Aufrufe ohne Backend-Route (`auth/organizer/qr-login`,
  `GET events/my-event/registrations`).
- Android: Organisator-Login liest `event_id` oben in der Antwort,
  `events/login` liefert die ID aber in `event.id` — gespeichert wurde nie
  eine.
- Beide: Abmelden meldet das Push-Token nicht ab.

## Bausteine (Flutter-Pakete, Versionen beim Einbau prüfen)

`flutter_appauth` (Login), `flutter_secure_storage`, `mobile_scanner` (QR),
`image_picker`, `firebase_messaging`, `url_launcher`, `share_plus`,
`open_filex`, `package_info_plus`.

## Entscheidungen

1. ~~Adressbuch~~ — **entschieden (11.10.2026): jede Plattform ihr nativer
   Weg, wie heute.** Android: eigener Kontakt-Abgleich (Konto "FWV Raura",
   SyncAdapter); der bestehende Kotlin-Code zieht in den Android-Teil der
   Flutter-App um, die Oberfläche löst ihn nur aus. iOS: CardDAV über
   Nextcloud (`carddav.mobileconfig`) — Apple erlaubt Apps keinen eigenen
   Abgleich.
2. ~~Organisator-Login~~ — **entschieden (11.10.2026): beides.** Ist der
   Organisator Mitglied, meldet er sich mit seinem Mitgliederkonto an und
   sieht seine Anlässe dort (verknüpft über `events/organized-by-me`). Externe
   Organisatoren melden sich mit E-Mail und Passwort an (`POST events/login`).
   Der Organisator-QR der alten Android-App entfällt — dafür gibt es im
   Backend keine Route.
3. ~~Neu anmelden nach dem Update~~ — **entschieden: Übernahme-Code.** Die
   App liest beim ersten Start einmal die alten Anmeldedaten (Android:
   `EncryptedSharedPreferences` `fwv_members_prefs`; iOS: Schlüsselbund,
   Dienst `ch.fwvraura.members`), übernimmt sie und löscht die alten.
4. ~~iOS~~ — **entschieden: Apple-Developer-Account für den Verein wird
   beantragt** (als Organisation, mit D-U-N-S-Nummer).
