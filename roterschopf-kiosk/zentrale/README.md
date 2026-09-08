# Skripte auf der Zentrale (Shelly Pro 3EM)

Der Pro 3EM unter `192.168.88.84` ist mehr als ein Stromzaehler: Er spannt
den Zugangspunkt auf, an dem alle Lampen haengen
(SSID `ShellyPro3EM-…`, Netz `192.168.33.0/24`), und er haelt den Zustand
der drei Lichtgruppen.

## lichtgruppen.js

Verbindet die drei virtuellen Schalter mit den Lampen:

    boolean:200  Spots
    boolean:201  Arbeitsleuchten
    boolean:202  Girlanden (noch nicht belegt)

Wer den Schalter umlegt, ist gleich — der BLU-Taster an der Wand oder die
Lichtseite auf dem Laptop. Das Skript hoert auf die Aenderung und setzt
alle Lampen der Gruppe nach. Deshalb schalten weder Taster noch Laptop die
Lampen direkt: Sonst haetten beide ein eigenes Bild davon, was an ist.

Der BLU-Taster hat vier Tasten mit fester Absicht statt Umschaltung — zwei
zum Ein-, zwei zum Ausschalten. Ein versehentlicher zweiter Druck laesst
das Licht dann an, statt es wieder auszuschalten. Aus demselben Grund gilt
jeder Druck (einfach, doppelt, lang) als dieselbe Absicht.

**Nur ASCII in dieser Datei.** Der JSON-Parser des Geraets bricht ab,
sobald ein mehrbyteiges Zeichen an einer Uebertragungsgrenze landet — ein
einzelner Gedankenstrich hat den Upload gekostet.

## Einspielen

    scp zentrale/lichtgruppen.js zentrale/skript-hochladen.py \
        stefan@192.168.88.10:/tmp/
    ssh stefan@192.168.88.10 'python3 /tmp/skript-hochladen.py'

Das Skript wird in Stuecken von 400 Zeichen uebertragen; mehr nimmt
`Script.PutCode` nicht auf einmal an.

## Stillgelegt, nicht geloescht

Die Skripte `Spots` (id 1) und `Taster Eingang` (id 3) sind abgeschaltet.
Sie reagierten ebenfalls auf den BLU-Taster und haetten sich mit dem neuen
gestritten. Ihr Code bleibt als Beleg dafuer, wie die Anlage gedacht war —
aus `Taster Eingang` stammt die Gruppenzuordnung.
