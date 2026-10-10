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
