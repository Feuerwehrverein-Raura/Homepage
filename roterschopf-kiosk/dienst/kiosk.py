#!/usr/bin/env python3
"""Kiosk-Dienst fuer den Roten Schopf.

Liefert die Bedienoberflaeche und steuert dahinter MPD. Bewusst ohne
Fremdbibliotheken: Der Rechner ist ein ThinkPad T400 von 2008, und jede
Abhaengigkeit ist eine, die beim naechsten Systemwechsel bricht.

Zwei Aufgaben:

  * Oberflaeche ausliefern (die Seite unter web/)
  * Eine schmale Schnittstelle darunter — Musik steuern, Zustand melden

Alles Wesentliche liegt lokal. Der Vereinsserver liefert nur Playlists,
Sender und den Arbeitsplan; faellt er aus, spielt die Musik weiter und die
zuletzt geholten Daten bleiben stehen.
"""

import datetime
import json
import os
import socket
import urllib.request
import threading
import time
from concurrent import futures
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

WEB = "/usr/local/lib/kiosk/web"
DATEN = "/var/lib/kiosk"
MPD_HOST, MPD_PORT = "127.0.0.1", 6600

# Was die Ampel oben prueft. Bewusst nur diese vier — eine laengere Liste
# liest am Festabend niemand.
PRUEFUNGEN = [
    ("musik", "Musik", ("127.0.0.1", 6600)),
    ("drucker", "Bondrucker", ("192.168.88.11", 9100)),
    ("internet", "Internet", ("1.1.1.1", 443)),
    ("server", "Vereinsserver", ("10.10.0.1", 443)),
]

zustand = {"ampel": {}, "geprueft": 0}
sperre = threading.Lock()


# --------------------------------------------------------------------------
# MPD
# --------------------------------------------------------------------------

def mpd(*befehle):
    """Schickt Befehle an MPD und liefert die Antwort als Woerterbuch.

    Eigene Umsetzung statt einer Bibliothek: Das MPD-Protokoll ist
    zeilenbasiert und in dreissig Zeilen erledigt.
    """
    try:
        s = socket.create_connection((MPD_HOST, MPD_PORT), timeout=3)
        s.settimeout(3)
        datei = s.makefile("rw", encoding="utf-8", newline="\n")
        datei.readline()  # Begruessung "OK MPD ..."
        for b in befehle:
            datei.write(b + "\n")
        datei.flush()

        ergebnis, liste, aktuell = {}, [], None
        for zeile in datei:
            zeile = zeile.rstrip("\n")
            if zeile.startswith("OK"):
                break
            if zeile.startswith("ACK"):
                ergebnis["fehler"] = zeile
                break
            if ": " not in zeile:
                continue
            schluessel, wert = zeile.split(": ", 1)
            # Beginnt ein neuer Eintrag (bei Listen), den vorigen ablegen.
            if aktuell is not None and schluessel in aktuell:
                liste.append(aktuell)
                aktuell = {}
            if aktuell is None:
                aktuell = {}
            aktuell[schluessel] = wert
            ergebnis[schluessel] = wert
        if aktuell:
            liste.append(aktuell)
        ergebnis["_liste"] = liste
        s.close()
        return ergebnis
    except Exception as e:
        return {"fehler": str(e)}


def musikzustand():
    st = mpd("status")
    lied = mpd("currentsong")
    if "fehler" in st:
        return {"erreichbar": False}

    # Titel und Interpret: MPD liefert Tags, wo vorhanden. Unsere Dateien
    # heissen "Interpret - Titel.mp3" und haben oft keine Tags — dann wird
    # der Dateiname zerlegt.
    titel = lied.get("Title")
    interpret = lied.get("Artist")
    if not titel:
        name = os.path.basename(lied.get("file", ""))
        name = os.path.splitext(name)[0]
        if " - " in name:
            interpret, titel = name.split(" - ", 1)
        else:
            titel = name or "—"

    # Was als Naechstes kommt. Bei Zufallswiedergabe ist die Reihenfolge in
    # der Warteschlange nicht die Abspielreihenfolge — MPD entscheidet das
    # erst beim Weiterschalten. Angezeigt wird deshalb ein Ausschnitt ab der
    # aktuellen Stelle, nicht eine Vorhersage.
    naechste = []
    try:
        pos = int(st.get("song", -1))
        if pos >= 0:
            ab = mpd("playlistinfo %d:%d" % (pos + 1, pos + 9))
            for e in ab.get("_liste", []):
                name = os.path.splitext(os.path.basename(e.get("file", "")))[0]
                if e.get("Title"):
                    name = (e.get("Artist", "") + " — " + e["Title"]).strip(" —")
                elif " - " in name:
                    name = name.replace(" - ", " — ", 1)
                naechste.append({"name": name, "dauer": e.get("Time", "")})
    except Exception:
        pass

    return {
        "erreichbar": True,
        "naechste": naechste,
        "laeuft": st.get("state") == "play",
        "titel": titel or "—",
        "interpret": interpret or "",
        "position": float(st.get("elapsed", 0) or 0),
        "dauer": float(st.get("duration", 0) or 0),
        "lautstaerke": int(st.get("volume", -1) or -1),
        "zufall": st.get("random") == "1",
    }


# --------------------------------------------------------------------------
# Ampel
# --------------------------------------------------------------------------

def erreichbar(adresse, zeit=2.5):
    try:
        s = socket.create_connection(adresse, timeout=zeit)
        s.close()
        return True
    except Exception:
        return False


def ampelschleife():
    """Prueft im Hintergrund, damit die Oberflaeche nie auf einen Zeitablauf
    wartet. Ein nicht erreichbarer Server darf die Musiksteuerung nicht
    langsam machen."""
    while True:
        neu = {}
        for schluessel, name, adresse in PRUEFUNGEN:
            neu[schluessel] = {"name": name, "gut": erreichbar(adresse)}
        with sperre:
            zustand["ampel"] = neu
            zustand["geprueft"] = time.time()
        time.sleep(20)


# --------------------------------------------------------------------------
# Vom Server geholte Daten
# --------------------------------------------------------------------------

def lies(name, ersatz):
    """Liest eine vom Abgleich abgelegte Datei. Fehlt sie oder ist sie
    kaputt, wird der Ersatz geliefert — die Oberflaeche soll auch beim
    allerersten Start etwas anzeigen."""
    pfad = os.path.join(DATEN, name)
    try:
        with open(pfad) as f:
            inhalt = json.load(f)
        return {"daten": inhalt, "alter": time.time() - os.path.getmtime(pfad)}
    except Exception:
        return {"daten": ersatz, "alter": None}


WOCHENTAGE = ["Montag", "Dienstag", "Mittwoch", "Donnerstag",
              "Freitag", "Samstag", "Sonntag"]

MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli",
          "August", "September", "Oktober", "November", "Dezember"]


def arbeitsplan_ansicht():
    """Formt den geholten Arbeitsplan in das um, was die Ansicht anzeigt.

    Gezeigt werden alle Tage des Anlasses. Bei der Chilbi sind das fuenf,
    von Aufbau bis Abbau — wer am Mittwoch dekoriert, will auch sehen, wann
    er am Samstag hinter der Bar steht, ohne dafuer ans Handy zu gehen.

    Warum hier und nicht im Server: Ob eine Schicht gerade laeuft, haengt an
    der Uhr. Wuerde das der Server entscheiden, waere die Anzeige nur bis
    zum naechsten Abgleich richtig — bis zu fuenf Minuten daneben. Hier wird
    es bei jedem Abruf neu bestimmt.
    """
    roh = lies("arbeitsplan.json", {})
    daten = roh["daten"] if isinstance(roh["daten"], dict) else {}
    anlass = (daten.get("anlass") or {}).get("titel") or ""
    if not daten.get("tage"):
        return {"daten": [], "anlass": anlass, "alter": roh["alter"]}

    heute = datetime.date.today().isoformat()
    jetzt = datetime.datetime.now().strftime("%H:%M")
    tage = []

    for tag in daten["tage"]:
        kennung = str(tag.get("tag", ""))
        ist_heute = kennung == heute
        try:
            d = datetime.date.fromisoformat(kennung)
            titel = "%s, %d. %s" % (WOCHENTAGE[d.weekday()], d.day, MONATE[d.month - 1])
        except ValueError:
            titel = kennung

        schichten = []
        for s in tag.get("schichten", []):
            besetzt = s.get("besetzt") or []
            von, bis = s.get("von") or "", s.get("bis") or ""
            # Schichten ueber Mitternacht: Endet die Schicht "frueher" als sie
            # beginnt, laeuft sie in den naechsten Tag. Am Fest ist das der
            # Normalfall, nicht die Ausnahme.
            if von and bis:
                laeuft = (von <= jetzt < bis) if von <= bis else (jetzt >= von or jetzt < bis)
            else:
                laeuft = False

            schichten.append({
                "von": von,
                "bis": bis,
                "aufgabe": s.get("name") or "",
                "bereich": s.get("bereich") or "",
                "leute": ", ".join(besetzt) if besetzt else "niemand eingeteilt",
                "anzahl": len(besetzt),
                "gebraucht": s.get("gebraucht") or 0,
                "laeuft": laeuft and ist_heute,
            })

        tage.append({
            "titel": titel,
            "ist_heute": ist_heute,
            # Vergangene Tage bleiben stehen, werden aber gedaempft: Beim
            # mehrtaegigen Anlass gehoeren sie dazu, und wer nachsehen will,
            # wer am Freitag Aufbau hatte, findet es noch.
            "vorbei": kennung < heute,
            "schichten": schichten,
        })

    return {"daten": tage, "anlass": anlass, "alter": roh["alter"]}


# --------------------------------------------------------------------------
# Licht
# --------------------------------------------------------------------------
#
# Die Lampen haengen NICHT am Hausnetz, sondern am eigenen Zugangspunkt des
# Shelly Pro 3EM (SSID ShellyPro3EM-…, Netz 192.168.33.0/24). Von hier aus
# waeren sie damit unerreichbar — waere da nicht der Range Extender des
# Pro 3EM: Er reicht jeden seiner Klienten unter einem eigenen Port auf
# seiner Hausnetz-Adresse durch.
#
#     192.168.88.84:10760  ->  192.168.33.4  (Lampe)
#
# Diese Ports vergibt der Pro 3EM selbst und kann sie beim Neuverbinden
# aendern. Deshalb wird die Zuordnung bei jedem Durchgang neu erfragt statt
# in eine Datei geschrieben — eine notierte Portnummer waere genau bis zum
# naechsten Stromausfall richtig.
#
# Angesprochen werden die Lampen ueber ihre feste Adresse im AP-Netz
# ("192.168.33.4:1" = Geraet .4, Kanal 2). Die ist statisch vergeben und
# bleibt, auch wenn der Port wechselt.
LICHT_DATEI = os.path.join(DATEN, "licht.json")

LICHT_VORGABE = {
    "zentrale": "192.168.88.84",
    # Uebernommen aus dem Skript "Taster Eingang" auf der Zentrale, das
    # dieselben zwei Gruppen ueber dieselben Kanaele kennt. Bestaetigt durch
    # die Kanalnamen auf den Geraeten: In Gruppe 1 heissen zwei Kanaele
    # "Spot" bzw. "Roter Schopf Regler 1 Spot", in Gruppe 2 heissen drei
    # "Arbeitscheinwerfer" — kein einziger Widerspruch.
    # Die Gruppen liegen als virtuelle Schalter auf der Zentrale. Sie sind
    # die Wahrheit, nicht die einzelnen Lampen: Der BLU-Taster an der Wand
    # legt dieselben Schalter um, und ein Skript auf der Zentrale zieht die
    # Lampen nach. Wuerde diese Seite die Lampen direkt schalten, haetten
    # Taster und Laptop nach dem ersten Mal getrennte Vorstellungen davon,
    # was an ist.
    "schalter": {"Spots": 200, "Arbeitsleuchten": 201, "Girlanden": 202},
    # Womit die Gruppe belegt ist — nur fuer die Anzeige. Geschaltet wird
    # ueber den Schalter oben. Gepflegt wird die Zuordnung im Skript
    # "Lichtgruppen" auf der Zentrale.
    "gruppen": {
        "Spots": ["192.168.33.4:1", "192.168.33.5:0", "192.168.33.6:0",
                  "192.168.33.7:0", "192.168.33.8:1"],
        "Arbeitsleuchten": ["192.168.33.4:0", "192.168.33.6:1",
                            "192.168.33.7:1", "192.168.33.8:0"],
        # Die Girlanden stehen in keinem der alten Skripte. Uebrig bleiben
        # 192.168.33.5:1 sowie die beiden Mini-Schalter .12 und .13; welcher
        # es ist, sagt einem nur das Einschalten.
        "Girlanden": [],
    },
}

lichtzustand = {"lampen": [], "geprueft": 0, "zentrale": False, "schalter": {}}
lichtports = {}


def licht_einstellung():
    try:
        with open(LICHT_DATEI) as f:
            gespeichert = json.load(f)
        return {**LICHT_VORGABE, **gespeichert}
    except (OSError, ValueError):
        return LICHT_VORGABE


def shelly(ziel, methode, **werte):
    """Ruft die RPC-Schnittstelle eines Shelly auf ("host:port" oder "host").

    Kurzer Zeitablauf: Ein Geraet, das schweigt, darf die Anzeige nicht
    aufhalten. Antwortet es nicht, gilt es als nicht erreichbar — was am
    Fest genau die richtige Auskunft ist.
    """
    teile = "&".join("%s=%s" % (k, str(v).lower()) for k, v in werte.items())
    url = "http://%s/rpc/%s%s" % (ziel, methode, ("?" + teile) if teile else "")
    try:
        with urllib.request.urlopen(url, timeout=6) as antwort:
            roh = antwort.read().decode()
        return json.loads(roh) if roh.strip() else {}
    except Exception:
        return None


def lampe_abfragen(auftrag):
    """Fragt ein Geraet hinter der Zentrale ab und liefert seine Kanaele."""
    ap_adresse, port = auftrag
    lampen = []
    for kanal in (0, 1):
        zustand = shelly("192.168.88.84:%d" % port, "Switch.GetStatus", id=kanal)
        # Kanal 2 gibt es nur bei den 2PM. Fehlt er, ist das kein Fehler,
        # sondern ein einkanaliges Geraet.
        if zustand is None:
            if kanal == 0:
                # Antwortet das Geraet sonst, hat es einfach kein Relais —
                # das BLU-Gateway etwa. Es als "nicht erreichbar" zu zeigen
                # waere falsch: Es ist da, es schaltet nur nichts.
                if shelly("192.168.88.84:%d" % port, "Shelly.GetDeviceInfo") is not None:
                    return []
                lampen.append({
                    "kennung": "%s:0" % ap_adresse,
                    "name": "Gerät .%s" % ap_adresse.split(".")[-1],
                    "erreichbar": False, "an": False, "watt": None,
                })
            break
        cfg = shelly("192.168.88.84:%d" % port, "Switch.GetConfig", id=kanal) or {}
        lampen.append({
            "kennung": "%s:%d" % (ap_adresse, kanal),
            # Kein Name auf dem Geraet: Dann sagt die Adresse wenigstens,
            # welches Geraet gemeint ist.
            "name": cfg.get("name") or ("Gerät .%s · Kanal %d"
                                        % (ap_adresse.split(".")[-1], kanal + 1)),
            "erreichbar": True,
            "an": bool(zustand.get("output")),
            "watt": round(zustand.get("apower") or 0),
        })
    return lampen


def lichtschleife():
    """Fragt die Lampen im Hintergrund ab.

    Wie bei der Ampel: Die Oberflaeche soll nie auf einen Zeitablauf warten.
    Parallel ueber die Geraete, weil sonst schon wenige schweigende Lampen
    einen Durchgang auf eine halbe Minute strecken.
    """
    while True:
        zentrale = licht_einstellung().get("zentrale", "192.168.88.84")
        klienten = shelly(zentrale, "WiFi.ListAPClients")
        lampen = []
        if klienten:
            auftraege = [(k["ip"], k["mport"]) for k in klienten.get("ap_clients", [])]
            lichtports.clear()
            lichtports.update({a: p for a, p in auftraege})
            if auftraege:
                # Nur zwei gleichzeitig: Der Range Extender des Pro 3EM
                # ist ein kleines Geraet und laesst bei acht parallelen
                # Verbindungen die Haelfte fallen — die Lampen erschienen
                # dann als "nicht erreichbar", obwohl sie antworten.
                with futures.ThreadPoolExecutor(max_workers=2) as gleichzeitig:
                    for teil in gleichzeitig.map(lampe_abfragen, auftraege):
                        lampen.extend(teil)
            lampen.sort(key=lambda l: l["kennung"])
        # Zustand der Gruppen von der Zentrale holen, nicht aus den Lampen
        # ableiten: Sie ist die Stelle, die ihn haelt.
        schalter = {}
        if klienten is not None:
            for name, nummer in licht_einstellung().get("schalter", {}).items():
                st = shelly(zentrale, "Boolean.GetStatus", id=nummer)
                if st is not None:
                    schalter[name] = bool(st.get("value"))

        with sperre:
            lichtzustand["lampen"] = lampen
            lichtzustand["zentrale"] = klienten is not None
            lichtzustand["schalter"] = schalter
            lichtzustand["geprueft"] = time.time()
        time.sleep(10)


def licht_schalten(kennung, an):
    """Schaltet einen Kanal oder eine Gruppe."""
    einstellung = licht_einstellung()
    zentrale = einstellung.get("zentrale", "192.168.88.84")

    # Gruppen laufen ueber den Schalter auf der Zentrale, nicht ueber die
    # einzelnen Lampen. Von dort zieht das Skript "Lichtgruppen" nach.
    if kennung.startswith("gruppe:"):
        nummer = einstellung.get("schalter", {}).get(kennung[7:])
        if nummer is None:
            return {"geschaltet": 0, "von": 0}
        ergebnis = shelly(zentrale, "Boolean.Set", id=nummer, value=bool(an))
        return {"geschaltet": 1 if ergebnis is not None else 0, "von": 1}

    ziele = [kennung]

    erfolg = 0
    for ziel in ziele:
        try:
            ap_adresse, kanal = ziel.rsplit(":", 1)
        except ValueError:
            continue
        # Nur Geraete, die die Zentrale gerade als ihre Klienten nennt. Die
        # Kennung kommt aus dem Browser, und dieser Dienst soll nicht das
        # Werkzeug sein, mit dem sich beliebige Adressen ansprechen lassen.
        port = lichtports.get(ap_adresse)
        if not port:
            continue
        if shelly("192.168.88.84:%d" % port, "Switch.Set",
                  id=int(kanal), on=bool(an)) is not None:
            erfolg += 1
    return {"geschaltet": erfolg, "von": len(ziele)}


# --------------------------------------------------------------------------
# Zugang zu den Bestellansichten (Bar und Kasse)
# --------------------------------------------------------------------------

# Die Adressen tragen ein Anmeldetoken und werden deshalb nur im Speicher
# gehalten, nicht in /var/lib/kiosk abgelegt. Ein Neustart des Dienstes holt
# sie neu; das dauert einen Wimpernschlag und ist die geringere Sorge.
bestellzugang = {"adressen": None, "geholt": 0}


def bestellsystem():
    """Holt die Adressen von Bar- und Kassenansicht vom Vereinsserver.

    Zwischengespeichert, weil beide Ansichten bei jedem Umschalten danach
    fragen und der Server sonst fuer nichts befragt wuerde. Zwoelf Stunden:
    Das Token laeuft dreissig Tage, ein Fest dauert keine zwoelf.
    """
    if bestellzugang["adressen"] and time.time() - bestellzugang["geholt"] < 12 * 3600:
        return bestellzugang["adressen"]

    schluessel = os.environ.get("KIOSK_KEY", "")
    basis = os.environ.get("KIOSK_API", "https://api.fwv-raura.ch")
    if not schluessel:
        return None
    try:
        anfrage = urllib.request.Request(
            basis + "/kiosk/bestellsystem", headers={"X-Kiosk-Key": schluessel}
        )
        with urllib.request.urlopen(anfrage, timeout=15) as antwort:
            adressen = json.loads(antwort.read().decode())
        if adressen.get("bar") and adressen.get("kasse"):
            bestellzugang["adressen"] = adressen
            bestellzugang["geholt"] = time.time()
            return adressen
        return bestellzugang["adressen"]
    except Exception:
        # Der zuletzt geholte Zugang bleibt gueltig — faellt der Server aus,
        # laufen Bar und Kasse weiter.
        return bestellzugang["adressen"]


# --------------------------------------------------------------------------
# Weboberflaeche
# --------------------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass  # Kein Zugriffsprotokoll — der Rechner soll leise sein.

    def sende(self, code, inhalt, typ="application/json"):
        if isinstance(inhalt, (dict, list)):
            inhalt = json.dumps(inhalt).encode()
        elif isinstance(inhalt, str):
            inhalt = inhalt.encode()
        self.send_response(code)
        self.send_header("Content-Type", typ)
        self.send_header("Content-Length", str(len(inhalt)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(inhalt)

    def do_GET(self):
        pfad = self.path.split("?")[0]

        if pfad == "/api/zustand":
            with sperre:
                ampel = dict(zustand["ampel"])
                lampen_jetzt = list(lichtzustand["lampen"])
                zentrale_da = lichtzustand["zentrale"]
                schalter_jetzt = dict(lichtzustand["schalter"])
            # "Alle Titel" steht immer vorn: Sie braucht keinen Server und
            # keine Pflege. Ohne sie stuende der Rechner beim allerersten
            # Einschalten ohne jede Auswahl da.
            pl = lies("playlists.json", [])
            pl["daten"] = [{"name": "Alle Titel", "eingebaut": True}] + [
                p for p in pl["daten"] if isinstance(p, dict) and p.get("name")
            ]
            se = lies("sender.json", [])
            return self.sende(200, {
                "ampel": ampel,
                "musik": musikzustand(),
                "playlists": pl,
                "sender": se,
                "arbeitsplan": arbeitsplan_ansicht(),
                "licht": {"lampen": lampen_jetzt,
                          "gruppen": licht_einstellung().get("gruppen", {}),
                          "schalter": schalter_jetzt,
                          "zentrale": zentrale_da},
            })

        if pfad == "/api/licht":
            with sperre:
                lampen = list(lichtzustand["lampen"])
                geprueft = lichtzustand["geprueft"]
            return self.sende(200, {
                "lampen": lampen,
                "gruppen": licht_einstellung().get("gruppen", {}),
                "geprueft": geprueft,
            })

        if pfad == "/api/bestellsystem":
            return self.sende(200, bestellsystem() or {})

        # Statische Dateien
        if pfad == "/":
            pfad = "/index.html"
        ziel = os.path.normpath(os.path.join(WEB, pfad.lstrip("/")))
        if not ziel.startswith(WEB) or not os.path.isfile(ziel):
            return self.sende(404, {"fehler": "nicht gefunden"})
        typen = {".html": "text/html; charset=utf-8", ".css": "text/css",
                 ".js": "application/javascript", ".svg": "image/svg+xml"}
        typ = typen.get(os.path.splitext(ziel)[1], "application/octet-stream")
        with open(ziel, "rb") as f:
            return self.sende(200, f.read(), typ)

    def do_POST(self):
        laenge = int(self.headers.get("Content-Length") or 0)
        try:
            daten = json.loads(self.rfile.read(laenge) or b"{}")
        except ValueError:
            daten = {}

        p = self.path.split("?")[0]

        if p == "/api/musik/umschalten":
            mpd("pause")
        elif p == "/api/musik/weiter":
            mpd("next")
        elif p == "/api/musik/lautstaerke":
            wert = max(0, min(100, int(daten.get("wert", 60))))
            mpd("setvol %d" % wert)
        elif p == "/api/musik/playlist":
            name = str(daten.get("name", ""))
            if name == "Alle Titel":
                mpd("clear", 'add ""', "random 1", "play")
            elif name:
                # clear + load + play: die Playlist ersetzt die Warteschlange,
                # statt sich anzuhaengen. Sonst waechst sie ueber einen Abend
                # ins Unendliche.
                mpd("clear", 'load "%s"' % name.replace('"', ""), "random 1", "play")
        elif p == "/api/musik/radio":
            url = str(daten.get("url", ""))
            if url.startswith("http"):
                mpd("clear", 'add "%s"' % url.replace('"', ""), "random 0", "play")
        elif p == "/api/licht":
            return self.sende(200, licht_schalten(
                str(daten.get("kennung", "")), bool(daten.get("an"))))
        elif p == "/api/abmelden":
            # Beendet ALLE Sitzungen des Kiosk-Benutzers.
            #
            # Nicht ueber $XDG_SESSION_ID: Der Dienst laeuft als Systemdienst
            # und hat diese Variable nicht — der Aufruf lief ins Leere und die
            # Sitzung blieb bestehen. "terminate-user" braucht sie nicht und
            # raeumt zugleich liegengebliebene Sitzungen mit weg.
            #
            # Danach erscheint der Anmeldebildschirm, weil LightDM die
            # Autologin-Datei beim Sitzungsende entfernt.
            os.system("loginctl terminate-user roterschopf 2>/dev/null &")
        else:
            return self.sende(404, {"fehler": "unbekannt"})

        return self.sende(200, {"ok": True})


def musik_bereitlegen():
    """Legt die Warteschlange bereit, startet aber NICHT.

    Musik faengt nicht von selbst an — wer den Raum betritt, entscheidet, ob
    und wann sie laeuft. Gefuellt wird die Warteschlange trotzdem, damit ein
    Druck auf Abspielen sofort wirkt statt erst eine Auswahl zu verlangen.

    Nur wenn sie leer ist: Ein Neustart mitten am Abend soll eine getroffene
    Auswahl nicht ueberschreiben."""
    time.sleep(5)  # MPD Zeit lassen, seine Bibliothek zu oeffnen
    st = mpd("status")
    if "fehler" in st:
        return
    if int(st.get("playlistlength", 0) or 0) == 0:
        # 60 statt 100 Prozent: Mit voller Lautstaerke loszulegen ist
        # unangenehm, und nach oben ist der Weg kuerzer als nach unten.
        mpd("clear", 'add ""', "random 1", "repeat 1", "crossfade 2", "setvol 60")


if __name__ == "__main__":
    os.makedirs(DATEN, exist_ok=True)
    threading.Thread(target=musik_bereitlegen, daemon=True).start()
    threading.Thread(target=ampelschleife, daemon=True).start()
    threading.Thread(target=lichtschleife, daemon=True).start()
    # Nur auf 127.0.0.1: Die Oberflaeche wird ausschliesslich vom Browser
    # dieses Rechners aufgerufen. Nach aussen gibt es nichts zu sehen.
    ThreadingHTTPServer(("127.0.0.1", 8080), Handler).serve_forever()
