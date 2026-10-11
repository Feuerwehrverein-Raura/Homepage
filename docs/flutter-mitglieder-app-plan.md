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

Noch offen bei der Anmeldung: Kontakt-Abgleich-Frage nach dem Login (kommt
mit dem nativen Adressbuch). Auf einem echten Gerät gegen Authentik
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
  Android: Kanal `ch.fwvraura.members/kontakte` — nur die Dart-Seite, der
  Kotlin-Abgleich fehlt noch, bis dahin "noch nicht verfügbar"),
  App-Version, Abmelden.
- Push (Android): `firebase_messaging`, dasselbe Firebase-Projekt
  (`google-services.json` aus `members-android`), Kanal `fwv_general`,
  Anzeige im Vordergrund über `flutter_local_notifications`. Token-Anmeldung
  beim Start, nach dem Login und bei neuem Token (`device_id` = zufällige
  Gerätekennung). iOS vorbereitet, aber aus (`FirebasePush.iosAktiv`), bis
  es den Apple-Account, den APNs-Schlüssel und `GoogleService-Info.plist`
  gibt.
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

Beobachtungen am Backend (offen):

- `POST registrations/public` braucht `eventTitle` nicht (Titel kommt aus
  der Datenbank); die App schickt ihn nicht mehr. `organizerEmail` wird noch
  gelesen — als Ausweichadresse, wenn der Anlass keine `organizer_email`
  hat. Ein Client kann so die Benachrichtigung an eine beliebige Adresse
  umleiten (Punkt 8 unten). Die App schickt es nicht; das Backend sollte es
  ignorieren.
- Die Route ist öffentlich: das Mitglied wird nur über die E-Mail im Body
  erkannt, nicht über das Token. Wer eine andere E-Mail eingibt, wird als
  Gast behandelt (Bestätigungs-Mail). Besser: mit Token das Mitglied aus
  dem Token nehmen.
- `meal_selection` (Menüwahl bei GV) zeigt die App noch nicht; dafür
  bräuchte es `meal_options` am Anlass im Vertrag.
- Kalender-Export: Es gibt nur den ganzen Feed `GET calendar/ics`; die App
  baut die .ics-Datei pro Anlass deshalb selbst aus `start_date`/`end_date`.
  Kandidat fürs Backend: `GET events/:id/ics`.
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

## Phase 3 — Ablösung der alten Apps

- **Android**: gleiche App-ID `com.fwv.members`, gleicher Upload-Schlüssel
  (CI-Secrets `MEMBERS_KEYSTORE_BASE64`, `MEMBERS_KEYSTORE_PASSWORD`, Alias
  `members`), Version über `members-v*`-Tags; die neue `versionCode` muss
  über 4200 liegen (0.42.0). Play-Upload wie heute in den internen Test.
- **iOS**: gleiche Bundle-ID `ch.fwvraura.members`. Es gibt noch **keinen
  Apple-Developer-Account, keine Signierung und kein TestFlight** — das
  blockiert iOS im Store unabhängig von Flutter.
- **Kontakt-Abgleich vor dem Store-Update umziehen**: Das Android-Konto
  "FWV Raura" (Typ `com.fwv.members`) gehört zur App. Fehlt der native
  Abgleich in der neuen App, kann Android das Konto samt Kontakten entfernen
  (meist beim nächsten Neustart). Im Emulator am 11.10.2026 nach dem Update
  noch vorhanden (61 Kontakte) — der Umzug muss trotzdem vorher fertig sein.
- **Angemeldet bleiben**: Android speichert das Token heute in
  `EncryptedSharedPreferences` (`fwv_members_prefs`), die neue App liest
  anderswo. Ohne Übernahme-Code müssen sich alle einmal neu anmelden.

## Was ins Backend gehört (heute rechnen die Apps)

1. Anlass-Liste: Vergangene und abgesagte ausfiltern, sortieren.
2. Kalender: E-Mail/Brief-Einträge für Mitglieder serverseitig weglassen.
3. Schicht-Belegung als fertiger Text ("1 Platz frei").
4. `kann_bearbeiten` am Anlass statt Abgleich in der App.
5. Meine Anmeldungen: Schicht-Text und Status fertig liefern.
6. Organisator-Übersicht: ein Aufruf mit Zahlen statt einer Abfrage pro
   Anlass und Auslesen der Bemerkungen.
7. Anmeldung nötig ja/nein aus der Kategorie im Backend bestimmen.
8. `POST registrations/public` soll Titel und Organisator-E-Mail nicht vom
   Gerät übernehmen.
9. Material: "fehlt"-Zahl und Auswahllisten fertig liefern.
10. Profilfoto: absolute URL; Verkleinern im Backend statt im Gerät.
11. Newsletter: Abfrage, ob man angemeldet ist (heute nur lokal gemerkt).

## Fehler in den heutigen Apps (nicht übernehmen)

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
