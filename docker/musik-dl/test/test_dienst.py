"""musik-dl ohne Netz: spotDL durch ein Ersatzprogramm, Nextcloud durch einen
nachgebauten WebDAV-Server ersetzt.

    python3 -m unittest discover -s docker/musik-dl/test
"""

import importlib.util
import os
import sys
import tempfile
import threading
import unittest
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HIER = os.path.dirname(os.path.abspath(__file__))
ABGELEGT = {}


class NachbauDav(BaseHTTPRequestHandler):
    def _name(self):
        return urllib.parse.unquote(self.path.rsplit("/", 1)[-1])

    def do_HEAD(self):
        self.send_response(200 if self._name() in ABGELEGT else 404)
        self.end_headers()

    def do_PUT(self):
        ok = self.headers.get("Authorization", "").startswith("Basic ")
        ABGELEGT[self._name()] = self.rfile.read(int(self.headers["Content-Length"]))
        self.send_response(201 if ok else 401)
        self.end_headers()

    def log_message(self, *_):
        pass


def dienst_laden(daten, dav):
    os.environ.update(MUSIK_DL_KEY="k", MUSIK_DL_DATEN=daten, MUSIK_DAV_URL=dav,
                      MUSIK_DAV_USER="musik-bot", MUSIK_DAV_TOKEN="t")
    spec = importlib.util.spec_from_file_location("dienst", os.path.join(HIER, "..", "dienst.py"))
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)
    return modul


class DienstTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), NachbauDav)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.tmp = tempfile.mkdtemp()
        bin_ = os.path.join(cls.tmp, "bin")
        os.makedirs(bin_)
        for programm in ("spotdl", "yt-dlp"):
            cls._ersatz(bin_, programm)
        os.environ["PATH"] = bin_ + os.pathsep + os.environ["PATH"]
        cls.d = dienst_laden(os.path.join(cls.tmp, "daten"),
                             "http://127.0.0.1:%d/dav/Musik" % cls.server.server_port)
        os.makedirs(cls.d.ARBEIT, exist_ok=True)

    @staticmethod
    def _ersatz(bin_, programm):
        """Ersatz fuer spotdl/yt-dlp: legt zwei Dateien in den Ordner hinter
        --output, wie die Programme sie benennen. "leer" in der Quelle: nichts."""
        with open(os.path.join(bin_, programm), "w") as f:
            f.write("#!/bin/sh\n"
                    "case \"$*\" in *leer*) exit 1;; esac\n"
                    "while [ $# -gt 0 ]; do [ \"$1\" = --output ] && ziel=$(dirname \"$2\"); shift; done\n"
                    "echo a > \"$ziel/Span - Louenesee.mp3\"\n"
                    "echo b > \"$ziel/Queen - Bohemian Rhapsody.mp3\"\n")
        os.chmod(os.path.join(bin_, programm), 0o755)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def test_quelle_pruefen(self):
        p = self.d.quelle_pruefen
        self.assertEqual(p("  Span Louenesee "), "Span Louenesee")
        self.assertEqual(p("https://www.youtube.com/watch?v=uoym8LBzsPs"),
                         "https://www.youtube.com/watch?v=uoym8LBzsPs")
        p("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")
        p("https://youtu.be/uoym8LBzsPs")
        for schlecht in ("", "--output /etc/x", "file:///etc/passwd",
                         "https://example.com/a.mp3", "a\nb", "x" * 501):
            with self.assertRaises(ValueError, msg=schlecht):
                p(schlecht)

    def test_auftrag_laedt_und_legt_ab_ohne_zu_ueberschreiben(self):
        ABGELEGT.clear()
        ABGELEGT["Queen - Bohemian Rhapsody.mp3"] = b"alt"
        a = self.d.neuer_auftrag("https://www.youtube.com/watch?v=uoym8LBzsPs", "Erika")
        self.d.bearbeiten(a)
        self.assertEqual(a["stand"], "fertig")
        self.assertEqual(a["dateien"], ["Queen - Bohemian Rhapsody.mp3", "Span - Louenesee.mp3"])
        self.assertEqual((a["neu"], a["schon_da"]), (1, 1))
        self.assertEqual(ABGELEGT["Queen - Bohemian Rhapsody.mp3"], b"alt")
        self.assertEqual(ABGELEGT["Span - Louenesee.mp3"], b"a\n")
        # Arbeitsordner ist weg.
        self.assertFalse(os.path.exists(os.path.join(self.d.ARBEIT, a["id"])))

    def test_kanal_zusaetze_fallen_weg(self):
        """"Rammstein Official" stand neben "Rammstein" in der Sammlung."""
        import re
        befehl = self.d.befehl_fuer("https://youtu.be/x", "/x")
        i = befehl.index("--replace-in-metadata")
        self.assertEqual(befehl[i:i + 4],
                         ["--replace-in-metadata", "uploader,channel", self.d.KANAL_ZUSATZ, ""])
        weg = lambda s: re.sub(self.d.KANAL_ZUSATZ, "", s)
        self.assertEqual(weg("Rammstein Official"), "Rammstein")
        self.assertEqual(weg("Rammstein Official Channel"), "Rammstein")
        self.assertEqual(weg("RammsteinVEVO"), "Rammstein")
        self.assertEqual(weg("Die Toten Hosen - Topic"), "Die Toten Hosen")
        self.assertEqual(weg("Official Hige Dandism"), "Official Hige Dandism")
        self.assertEqual(weg("Span"), "Span")

    def test_videotitel_wird_bereinigt(self):
        """Aus Musikvideos wurde "Rammstein - Rammstein - Du Hast (Official 4K Video)"."""
        import re
        befehl = self.d.befehl_fuer("https://youtu.be/x", "/x")
        self.assertIn(self.d.VIDEO_ZUSATZ, befehl)
        i = befehl.index("--parse-metadata")
        self.assertEqual(befehl[i + 1], self.d.TITEL_INTERPRET)
        weg = lambda s: re.sub(self.d.VIDEO_ZUSATZ, "", s)
        self.assertEqual(weg("Rammstein - Du Hast (Official 4K Video)"), "Rammstein - Du Hast")
        self.assertEqual(weg("FiNCH - WENN DU DUMM BiST (Official Music Video)"), "FiNCH - WENN DU DUMM BiST")
        self.assertEqual(weg("Zebrahead - Ignite (Lyric Video)"), "Zebrahead - Ignite")
        self.assertEqual(weg("Bligg - Us Mänsch [HD]"), "Bligg - Us Mänsch")
        self.assertEqual(weg("Adele - Hello (Live at the BBC)"), "Adele - Hello (Live at the BBC)")
        # Wie yt-dlp --parse-metadata: QUELLE ausgefuellt, ZIEL als Ausdruck.
        quelle, ziel = self.d.TITEL_INTERPRET.split(":", 1)
        self.assertNotIn(":", quelle)
        def vorne(interpret, titel):
            m = re.search(ziel, quelle.replace("%(artist,uploader)s", interpret).replace("%(title)s", titel))
            return (m.group("artist"), m.group("title")) if m else None
        self.assertEqual(vorne("Rammstein", "Rammstein - Du Hast"), ("Rammstein", "Du Hast"))
        self.assertEqual(vorne("zebrahead", "Zebrahead - Ignite"), ("Zebrahead", "Ignite"))
        self.assertEqual(vorne("Captain Jack", "Captain Jack - Short Mix"), ("Captain Jack", "Short Mix"))
        self.assertIsNone(vorne("Span", "Louenesee"))
        self.assertIsNone(vorne("SomeLabel", "Bligg - Us Mänsch"))

    def test_youtube_mit_yt_dlp_spotify_mit_spotdl(self):
        yt = self.d.befehl_fuer("https://www.youtube.com/watch?v=uoym8LBzsPs", "/a")
        self.assertEqual(yt[0], "yt-dlp")
        self.assertEqual(yt[-2:], ["--", "https://www.youtube.com/watch?v=uoym8LBzsPs"])
        self.assertEqual(self.d.befehl_fuer("https://open.spotify.com/track/x", "/a")[0], "spotdl")
        self.assertEqual(self.d.befehl_fuer("Span Louenesee", "/a")[0], "spotdl")
        self.assertNotIn("--cookies", yt)
        open(self.d.COOKIES, "w").close()
        try:
            self.assertIn("--cookies", self.d.befehl_fuer("https://youtu.be/x", "/a"))
            self.assertIn("--cookie-file", self.d.befehl_fuer("Span", "/a"))
        finally:
            os.remove(self.d.COOKIES)

    def test_nichts_gefunden_wird_fehler(self):
        a = self.d.neuer_auftrag("leer nichts", "Erika")
        self.d.bearbeiten(a)
        self.assertEqual(a["stand"], "fehler")

    def test_helfer_holt_ab_schickt_dateien_und_meldet_fertig(self):
        ABGELEGT.clear()
        self.d.HELFER = "pjc"
        try:
            del self.d._auftraege[:]
            a = self.d.neuer_auftrag("https://youtu.be/uoym8LBzsPs", "Erika")
            b = self.d.neuer_auftrag("leer", "Erika")
            self.assertEqual(self.d.abholen(), {"id": a["id"], "quelle": a["quelle"]})
            self.assertEqual(self.d.abholen()["id"], b["id"])
            self.assertIsNone(self.d.abholen())
            self.assertTrue(self.d.datei_annehmen(a["id"], "Span - Louenesee.mp3", b"x"))
            self.assertFalse(self.d.datei_annehmen(a["id"], "Span - Louenesee.mp3", b"y"))
            self.assertEqual(ABGELEGT["Span - Louenesee.mp3"], b"x")
            self.assertEqual(self.d.abschliessen(a["id"])["stand"], "fertig")
            self.assertEqual((a["neu"], a["schon_da"]), (1, 1))
            # Ohne Datei gescheitert, mit der Meldung des Helfers.
            self.assertEqual(self.d.abschliessen(b["id"], "YouTube sperrt")["meldung"], "YouTube sperrt")
            # Erledigte nimmt er nicht mehr an.
            with self.assertRaises(LookupError):
                self.d.datei_annehmen(a["id"], "Neu.mp3", b"z")
        finally:
            self.d.HELFER = ""

    def test_helfer_liegengelassenes_kommt_wieder(self):
        self.d.HELFER = "pjc"
        try:
            del self.d._auftraege[:]
            a = self.d.neuer_auftrag("Span Louenesee", "Erika")
            jetzt = 1_000_000
            self.assertEqual(self.d.abholen(jetzt)["id"], a["id"])
            self.assertIsNone(self.d.abholen(jetzt + 60))
            self.assertEqual(self.d.abholen(jetzt + self.d.LEIHFRIST_S + 1)["id"], a["id"])
        finally:
            self.d.HELFER = ""

    def test_dateiname_vom_helfer(self):
        p = self.d.dateiname_pruefen
        self.assertEqual(p("Span - Louenesee.mp3"), "Span - Louenesee.mp3")
        for schlecht in ("../x.mp3", "a/b.mp3", ".x.mp3", "x.sh", "", "a\nb.mp3", "a\\b.mp3"):
            with self.assertRaises(ValueError, msg=schlecht):
                p(schlecht)


if __name__ == "__main__":
    unittest.main()
