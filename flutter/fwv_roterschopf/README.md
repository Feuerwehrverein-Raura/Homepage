# fwv_roterschopf

Roter Schopf in der App: Licht schalten (die Gruppen Spots und
Arbeitsleuchten sowie jede Lampe einzeln) und die Tiefkuehler sehen
(Temperatur, Strom, rot ueber der Grenze). Gemeinsam fuer die
Mitglieder-App (Reiter "Schopf") und die spaetere Vorstand-App.

## Wer es sieht

Authentik-Gruppe **Roter Schopf**, **Vorstand** oder **admin**
(Gross-/Kleinschreibung egal), ueber Authentik oder per QR-Code
angemeldet; externe Organisatoren nie. Dieselbe Regel prueft api-members
(`docker/backend-members/src/roter-schopf.js`) - die App entscheidet nur,
ob sie den Reiter zeigt.

## Backend

Die Screens kennen keine Routen, nur den `RoterSchopfZugang`:

    GET  https://api.fwv-raura.ch/kiosk/roter-schopf
    POST https://api.fwv-raura.ch/kiosk/roter-schopf/licht
         {kennung: "gruppe:spots" | "192.168.33.4:1", an: true|false}

api-members erreicht das Vereinslokal ueber den WireGuard-Tunnel und
schaltet Gruppen ueber das Skript "Lichtgruppen" auf der Zentrale - den
gleichen Weg wie der Taster an der Wand und der Kiosk-Laptop
(`roterschopf-kiosk/zentrale/`).

## Vertrag

`test/roter_schopf_test.dart` liest
`docker/backend-members/test/fixtures/roter-schopf-app.json`, geschrieben
vom Backend-Test:

    cd docker/backend-members
    FIXTURES_SCHREIBEN=1 node --test test/roter-schopf.test.js
