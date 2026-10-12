# Skripte auf der Zentrale (Shelly Pro 3EM)

Der Pro 3EM unter `192.168.88.84` ist mehr als ein Stromzaehler: Er spannt
den Zugangspunkt auf, an dem alle Lampen haengen
(SSID `ShellyPro3EM-…`, Netz `192.168.33.0/24`), und er haelt den Zustand
der drei Lichtgruppen.

## lichtgruppen.js

Verbindet die drei virtuellen Schalter mit den Lampen:

    boolean:200  Spots (die drei Girlanden laufen mit)
    boolean:201  Arbeitsleuchten

boolean:202 hiess "Girlanden" und ist keine eigene Gruppe: Am Taster ist
das eine Stimmung und kein zweiter Handgriff. Der Schalter steht noch auf
dem Geraet, wird aber von niemandem beachtet.

Der BLU-Taster schaltet die Lampen **immer**, auch wenn der Schalter
schon auf dem Zielwert steht; der Schalter wird nur mitgefuehrt. Die
Lichtseite auf dem Laptop nimmt denselben Weg ueber den Endpunkt

    http://192.168.88.84/script/4/gruppe?id=200&an=true

Wer `boolean:200/201` von aussen umlegt, schaltet die Gruppe ebenfalls -
aber nur, wenn sich der Wert aendert.

Belegung des Tasters (vor Ort getestet am 12.10.2026): oben
Arbeitsleuchten ein/aus (idx 0/1, "Licht aus" ist idx 1), unten Spots
ein/aus (idx 2/3). Kein Umschalten: Ein versehentlicher zweiter Druck
laesst das Licht an. Jeder Druck (einfach, doppelt, lang) zaehlt gleich.

**Ereignis und Taste stehen in `e.info`**, nicht in `e`. Die erste
Fassung las `e.event`/`e.idx`, die leer sind, und hat nie auf einen Druck
reagiert - der Empfang war die ganze Zeit einwandfrei.

**Eine Warteschlange, immer nur eine HTTP-Anfrage.** Bei schnellen
Druecken liefen frueher mehrere Durchgaenge nebeneinander, und das
Geraet brach das Skript mit "Too many calls in progress" ab. Je Gruppe
gilt der letzte Wunsch, der neueste Druck kommt zuerst dran.

**Tote Regler werden uebersprungen.** Jede Lampe bekommt einen Versuch
(2 s). Antwortet ein Regler nicht, gilt er fuer beide Gruppen bis zum
naechsten 10-s-Takt als tot. Girlande Raum und Laterne WC stehen vorn,
weil sie nicht an den Sicherungen der Regler haengen. Frueher wartete
die Girlande bei ausgeschalteter Sicherung fast eine Minute.

**Nachfassen:** Was nicht erreicht wurde, wird alle 10 s erneut
geschaltet, hoechstens 30 min - nur die fehlenden Lampen, nie die ganze
Gruppe. Bewusst kein dauerhaftes Erzwingen: Das wuerde Schalten in der
App ueberstimmen und die Arbeitsleuchten, die nach der Sicherung mit
"ein" starten, wieder ausmachen.

**Abgleich alle 2 min:** Brennen alle Lampen einer Gruppe, wird ihr
Schalter auf ein gestellt, sind alle aus, auf aus.

**Mitlesen:** Das Debug-Log ist per Websocket offen:

    curl -sN ws://192.168.88.84/debug/log

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
