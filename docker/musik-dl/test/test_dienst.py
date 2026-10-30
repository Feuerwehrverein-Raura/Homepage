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
        # Ersatz fuer spotdl: legt zwei Dateien an, wie spotDL sie benennt.
        bin_ = os.path.join(cls.tmp, "bin")
        os.makedirs(bin_)
        with open(os.path.join(bin_, "spotdl"), "w") as f:
            f.write("#!/bin/sh\n"
                    "ziel=$(dirname \"$4\")\n"
                    "case \"$2\" in *leer*) exit 1;; esac\n"
                    "echo a > \"$ziel/Span - Louenesee.mp3\"\n"
                    "echo b > \"$ziel/Queen - Bohemian Rhapsody.mp3\"\n")
        os.chmod(os.path.join(bin_, "spotdl"), 0o755)
        os.environ["PATH"] = bin_ + os.pathsep + os.environ["PATH"]
        cls.d = dienst_laden(os.path.join(cls.tmp, "daten"),
                             "http://127.0.0.1:%d/dav/Musik" % cls.server.server_port)
        os.makedirs(cls.d.ARBEIT, exist_ok=True)

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

    def test_nichts_gefunden_wird_fehler(self):
        a = self.d.neuer_auftrag("leer nichts", "Erika")
        self.d.bearbeiten(a)
        self.assertEqual(a["stand"], "fehler")


if __name__ == "__main__":
    unittest.main()
