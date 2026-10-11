# Vertrag: Arbeitsplan

`GET /events/:id/arbeitsplan` liefert den Arbeitsplan als fertige Tabelle.
Website, Vorstand, Desktop- und Handy-Apps zeichnen ihn nur ab.

- `arbeitsplan-schichten.json` — Schichten, wie sie aus der Datenbank kommen.
- `arbeitsplan.json` — was das Backend daraus machen muss.

Der Backend-Test prueft, dass aus der ersten Datei genau die zweite entsteht.
Die Tests der Website und aller Apps lesen `arbeitsplan.json` und pruefen,
dass sie sie verstehen und richtig zeichnen. Wer das Format aendert, muss
beide Seiten anpassen — sonst wird die CI rot.

Besonderheiten, die die Datei bewusst enthaelt: Zellen `null` (keine
Schicht, schwarz), eine leere Schicht (nur offene Plaetze), eine
ueberbuchte Schicht (`offen: 0`) und eine Schicht ohne Bereich
(`Allgemein`).

# Vertrag: Mitglieder-App (anzeigefertige `app`-Bloecke)

Die Flutter-Mitglieder-App rechnet nichts selbst; das Backend liefert
Datumstexte, Belegung, ob und warum man sich anmelden kann, Status-Texte
(`src/app-ansicht.js`).

- `anlaesse-app.json` — `GET /events?aktuell=true` (ohne Token).
- `meine-anmeldungen.json` — `GET /registrations/mine` (Mitglied).
- `kalender-app.json` — `GET /calendar/items` (Mitglied).
- `organisator-uebersicht.json` — `GET /events/organisator-uebersicht`
  (Erika organisiert Chilbi und Helferessen): Anmeldungen anzeigefertig aus
  dem `notes`-JSON (Begleitperson, Allergien, Menü, Bemerkung als Text bei
  einer alten Anmeldung), Zahlen, erlaubte Aktionen, `meal_options`.

`test/app-vertrag.test.js` startet den echten Server gegen Postgres
(`TEST_DATABASE_URL`), fuellt feste Daten ein (feste IDs, "jetzt" ueber
`TEST_JETZT` = Sonntag, 11.10.2026, 10:00 Zuerich) und prueft, dass genau
diese Dateien herauskommen. Anlass- und Anmelde-Datei enthalten nur die
Felder, die die App liest (Liste `FELDER` im Test), die `app`-Bloecke
vollstaendig; der Kalender ist die ganze Antwort.

Bewusst enthalten: eine volle Schicht (`voll`), freie Schichten (`1 Platz
frei`, `3 Plätze frei`), Bereich `Kueche` -> `Küche`, `Allgemein` (Name
statt Bereich), Anmeldeschluss vorbei, ausgebuchter Anlass (Teilnehmer-
Limit), Anlass ohne Anmeldung, ein Anlass, der gestern begann und heute
endet (noch aktuell). Ein abgesagter und ein vergangener Anlass sind in der
Datenbank, fehlen aber in `anlaesse-app.json`. Im Kalender fehlt die
E-Mail an das Mitglied (nur Vorstand).

Nach einer gewollten Aenderung neu schreiben:
`FIXTURES_SCHREIBEN=1 TEST_DATABASE_URL=... node --test test/app-vertrag.test.js`
— und die App-Seite anpassen.
