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
- Beide: Abmelden meldet das Push-Token nicht ab.

## Bausteine (Flutter-Pakete, Versionen beim Einbau prüfen)

`flutter_appauth` (Login), `flutter_secure_storage`, `mobile_scanner` (QR),
`image_picker`, `firebase_messaging`, `url_launcher`, `share_plus`,
`open_filex`, `package_info_plus`.

## Offene Fragen

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
