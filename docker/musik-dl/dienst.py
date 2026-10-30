#!/usr/bin/env python3
"""Songs fuer die Musiksammlung ergaenzen - mit spotDL.

Laeuft als Container neben api-members und ist nur von dort erreichbar
(Docker-Netz, Schluessel MUSIK_DL_KEY). Wer ergaenzen darf, prueft
api-members (Gruppe Roter Schopf, Vorstand, admin).

  GET  /suche?q=...           YouTube durchsuchen (yt-dlp, nur Treffer)
  POST /auftraege             {quelle, wer} - Link (YouTube, Spotify) oder
                              Suchbegriff; kommt in die Warteschlange
  GET  /auftraege             die letzten Auftraege mit Stand

YouTube-Links laedt yt-dlp direkt: spotDL sucht dazu erst ein passendes
Spotify-Stueck und griff dabei daneben (aus "Span - Louenesee" wurde ein
fremder Song). Spotify-Links und Suchbegriffe gehen ueber spotDL.

YouTube sperrt Rechenzentrums-Adressen ("Sign in to confirm you're not a
bot"). Liegt /daten/youtube-cookies.txt (Netscape-Format, von einem eigenen
Google-Konto), bekommen beide Programme sie mit.

Ein Auftrag laedt in einen eigenen Arbeitsordner und legt jede
fertige Datei per WebDAV in den Nextcloud-Gruppenordner "Musik" (Konto
musik-bot). Was dort schon liegt, wird nicht ueberschrieben. Von dort holt
sich der Laptop im Roten Schopf die Sammlung (kiosk-abgleich).

Ohne Fremdbibliotheken ausser spotDL und yt-dlp, die als Programme laufen.
"""

import json
import os
import queue
import re
import shutil
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from base64 import b64encode
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SCHLUESSEL = os.environ.get("MUSIK_DL_KEY", "")
DAV = os.environ.get(
    "MUSIK_DAV_URL", "https://nextcloud.fwv-raura.ch/remote.php/dav/files/musik-bot/Musik"
).rstrip("/")
DAV_ANMELDUNG = "Basic " + b64encode(
    ("%s:%s" % (os.environ.get("MUSIK_DAV_USER", ""), os.environ.get("MUSIK_DAV_TOKEN", ""))).encode()
).decode()
DATEN = os.environ.get("MUSIK_DL_DATEN", "/daten")
ARBEIT = os.path.join(DATEN, "arbeit")
VERZEICHNIS = os.path.join(DATEN, "auftraege.json")
COOKIES = os.path.join(DATEN, "youtube-cookies.txt")
YOUTUBE_SEITEN = ("youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be")

# Wie lange ein Auftrag hoechstens laufen darf - eine grosse Playlist ueber
# eine langsame Quelle soll die Warteschlange nicht fuer immer belegen.
HOECHSTENS_S = 6 * 3600
BEHALTEN = 100  # so viele Auftraege bleiben in der Liste

ERLAUBTE_SEITEN = YOUTUBE_SEITEN + ("open.spotify.com",)

_auftraege = []
_sperre = threading.Lock()
_schlange = queue.Queue()


def melde(text):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), text, flush=True)


# --------------------------------------------------------------------------
# Auftraege
# --------------------------------------------------------------------------

def _sichern():
    vorlaeufig = VERZEICHNIS + ".neu"
    with open(vorlaeufig, "w") as f:
        json.dump(_auftraege[-BEHALTEN:], f, ensure_ascii=False)
    os.replace(vorlaeufig, VERZEICHNIS)


def _laden():
    try:
        with open(VERZEICHNIS) as f:
            _auftraege.extend(json.load(f))
    except (OSError, ValueError):
        return
    # Nach einem Neustart: Unterbrochenes von vorn, Wartendes bleibt dran.
    for a in _auftraege:
        if a["stand"] in ("wartet", "laedt"):
            a["stand"] = "wartet"
            _schlange.put(a["id"])


def quelle_pruefen(quelle):
    """Gibt die bereinigte Quelle zurueck oder wirft ValueError.

    Erlaubt sind Links von YouTube und Spotify und einfache Suchbegriffe.
    Nichts, was spotDL als Option lesen koennte (fuehrendes "-").
    """
    q = str(quelle or "").strip()
    if not q or len(q) > 500:
        raise ValueError("Bitte einen Link oder Suchbegriff angeben.")
    if q.startswith("-") or "\n" in q:
        raise ValueError("Ungueltige Eingabe.")
    if re.match(r"^[a-z]+://", q, re.I):
        teile = urllib.parse.urlsplit(q)
        if teile.scheme not in ("http", "https") or teile.hostname not in ERLAUBTE_SEITEN:
            raise ValueError("Nur Links von YouTube und Spotify.")
    return q


def neuer_auftrag(quelle, wer):
    a = {
        "id": uuid.uuid4().hex[:12],
        "quelle": quelle_pruefen(quelle),
        "wer": str(wer or "")[:120],
        "stand": "wartet",
        "meldung": None,
        "dateien": [],
        "neu": 0,
        "schon_da": 0,
        "erstellt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "fertig": None,
    }
    with _sperre:
        _auftraege.append(a)
        del _auftraege[:-BEHALTEN]
        _sichern()
    _schlange.put(a["id"])
    return a


def _auftrag(id_):
    for a in _auftraege:
        if a["id"] == id_:
            return a
    return None


def _setzen(a, **werte):
    with _sperre:
        a.update(werte)
        _sichern()


# --------------------------------------------------------------------------
# Nextcloud
# --------------------------------------------------------------------------

def _dav(methode, name, daten=None):
    adresse = DAV + "/" + urllib.parse.quote(name)
    anfrage = urllib.request.Request(adresse, data=daten, method=methode,
                                     headers={"Authorization": DAV_ANMELDUNG})
    try:
        with urllib.request.urlopen(anfrage, timeout=300) as antwort:
            return antwort.status
    except urllib.error.HTTPError as e:
        return e.code


def ablegen(pfad):
    """Datei in den Gruppenordner. True: neu, False: lag schon dort."""
    name = os.path.basename(pfad)
    if _dav("HEAD", name) == 200:
        return False
    with open(pfad, "rb") as f:
        status = _dav("PUT", name, f.read())
    if status not in (200, 201, 204):
        raise RuntimeError("Nextcloud antwortet %s fuer %s" % (status, name))
    return True


# --------------------------------------------------------------------------
# spotDL
# --------------------------------------------------------------------------

def _cookies(option):
    return [option, COOKIES] if os.path.isfile(COOKIES) else []


def ist_youtube(quelle):
    if not re.match(r"^https?://", quelle, re.I):
        return False
    return urllib.parse.urlsplit(quelle).hostname in YOUTUBE_SEITEN


def befehl_fuer(quelle, ordner):
    """Wie die Sammlung: "Interpret - Titel.mp3", alles in einem Ordner."""
    if ist_youtube(quelle):
        return [
            "yt-dlp", "--extract-audio", "--audio-format", "mp3", "--audio-quality", "0",
            "--embed-metadata", "--no-progress",
            # Offizielle Tonspuren heissen "<Interpret> - Topic".
            "--replace-in-metadata", "uploader,channel", r" - Topic$", "",
            "--output", os.path.join(ordner, "%(artist,uploader,channel)s - %(track,title)s.%(ext)s"),
            *_cookies("--cookies"),
            "--", quelle,
        ]
    return [
        "spotdl", "download", quelle,
        # Wie die Sammlung: "Interpret - Titel.mp3", alles in einem Ordner.
        "--output", os.path.join(ordner, "{artists} - {title}.{output-ext}"),
        "--format", "mp3",
        # Die Quelle nicht kuenstlich aufblasen: so gut wie YouTube liefert.
        "--bitrate", "auto",
        "--overwrite", "skip",
        "--threads", "2",
        "--print-errors",
        "--simple-tui",
        *_cookies("--cookie-file"),
    ]


def bearbeiten(a):
    ordner = os.path.join(ARBEIT, a["id"])
    shutil.rmtree(ordner, ignore_errors=True)
    os.makedirs(ordner)
    _setzen(a, stand="laedt", meldung=None)
    befehl = befehl_fuer(a["quelle"], ordner)
    melde("Auftrag %s: %s" % (a["id"], a["quelle"]))
    try:
        lauf = subprocess.run(befehl, cwd=ordner, capture_output=True, text=True,
                              timeout=HOECHSTENS_S)
        ausgabe = (lauf.stdout + lauf.stderr)[-4000:]
    except subprocess.TimeoutExpired:
        ausgabe = "Zeit abgelaufen"
    dateien = sorted(n for n in os.listdir(ordner) if n.lower().endswith(".mp3"))
    neu = schon = 0
    try:
        for n in dateien:
            if ablegen(os.path.join(ordner, n)):
                neu += 1
            else:
                schon += 1
    except Exception as e:
        _setzen(a, stand="fehler", meldung=str(e)[:300], dateien=dateien)
        melde("Auftrag %s: %s" % (a["id"], e))
        return
    finally:
        shutil.rmtree(ordner, ignore_errors=True)
    if not dateien:
        melde("Auftrag %s ohne Datei:\n%s" % (a["id"], ausgabe))
        gesperrt = "confirm you" in ausgabe and "not a bot" in ausgabe
        _setzen(a, stand="fehler", meldung=(
            "YouTube sperrt den Server gerade (Anmeldung verlangt)." if gesperrt
            else "Nichts gefunden oder Laden gescheitert."))
        return
    _setzen(a, stand="fertig", dateien=dateien, neu=neu, schon_da=schon,
            fertig=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    melde("Auftrag %s fertig: %d neu, %d schon da" % (a["id"], neu, schon))


def arbeiter():
    while True:
        a = _auftrag(_schlange.get())
        if a is None or a["stand"] != "wartet":
            continue
        try:
            bearbeiten(a)
        except Exception as e:  # Ein kaputter Auftrag haelt die Schlange nicht an.
            melde("Auftrag %s: %s" % (a["id"], e))
            _setzen(a, stand="fehler", meldung=str(e)[:300])


def youtube_suchen(begriff, anzahl=12):
    b = str(begriff or "").strip()[:200]
    if not b:
        return []
    lauf = subprocess.run(
        ["yt-dlp", "--flat-playlist", "-J", *_cookies("--cookies"), "--", "ytsearch%d:%s" % (anzahl, b)],
        capture_output=True, text=True, timeout=60,
    )
    if lauf.returncode != 0:
        raise RuntimeError("YouTube-Suche gescheitert")
    treffer = []
    for e in json.loads(lauf.stdout).get("entries") or []:
        if not e.get("id"):
            continue
        bilder = e.get("thumbnails") or []
        kanal = e.get("channel") or e.get("uploader") or ""
        treffer.append({
            "id": e["id"],
            "titel": e.get("title") or "",
            "kanal": kanal,
            "dauer": e.get("duration"),
            "aufrufe": e.get("view_count"),
            "url": "https://www.youtube.com/watch?v=" + e["id"],
            "bild": bilder[-1].get("url") if bilder else None,
            # "<Interpret> - Topic" sind die offiziellen Tonspuren.
            "offiziell": kanal.endswith(" - Topic"),
        })
    return treffer


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------

class Anfrage(BaseHTTPRequestHandler):
    def _antwort(self, status, inhalt):
        roh = json.dumps(inhalt, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(roh)))
        self.end_headers()
        self.wfile.write(roh)

    def _erlaubt(self):
        if SCHLUESSEL and self.headers.get("X-Intern-Key") == SCHLUESSEL:
            return True
        self._antwort(401, {"error": "Kein Zugang"})
        return False

    def do_GET(self):
        teile = urllib.parse.urlsplit(self.path)
        if teile.path == "/gesund":
            return self._antwort(200, {"ok": True})
        if not self._erlaubt():
            return
        if teile.path == "/suche":
            q = urllib.parse.parse_qs(teile.query).get("q", [""])[0]
            try:
                return self._antwort(200, {"treffer": youtube_suchen(q)})
            except Exception as e:
                return self._antwort(502, {"error": str(e)})
        if teile.path == "/auftraege":
            with _sperre:
                liste = list(reversed(_auftraege[-50:]))
            return self._antwort(200, {"auftraege": liste})
        self._antwort(404, {"error": "Unbekannt"})

    def do_POST(self):
        if not self._erlaubt():
            return
        if self.path != "/auftraege":
            return self._antwort(404, {"error": "Unbekannt"})
        try:
            laenge = int(self.headers.get("Content-Length") or 0)
            koerper = json.loads(self.rfile.read(min(laenge, 10000)) or b"{}")
            a = neuer_auftrag(koerper.get("quelle"), koerper.get("wer"))
        except ValueError as e:
            return self._antwort(400, {"error": str(e)})
        self._antwort(200, a)

    def log_message(self, *_):
        pass  # Jede Anfrage ins Log waere nur Rauschen; Auftraege melden selbst.


if __name__ == "__main__":
    if not SCHLUESSEL:
        raise SystemExit("MUSIK_DL_KEY fehlt")
    os.makedirs(ARBEIT, exist_ok=True)
    _laden()
    threading.Thread(target=arbeiter, daemon=True).start()
    melde("musik-dl bereit")
    ThreadingHTTPServer(("0.0.0.0", 8080), Anfrage).serve_forever()
