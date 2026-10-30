"""Spiegeln der Sammlung (bin/kiosk-abgleich) ohne Server und ohne MPD.

    python3 -m unittest discover -s roterschopf-kiosk/test
"""

import importlib.machinery
import importlib.util
import os
import tempfile
import unittest

HIER = os.path.dirname(os.path.abspath(__file__))
_lader = importlib.machinery.SourceFileLoader("abgleich", os.path.join(HIER, "..", "bin", "kiosk-abgleich"))
_spec = importlib.util.spec_from_loader("abgleich", _lader)
abgleich = importlib.util.module_from_spec(_spec)
_lader.exec_module(abgleich)
abgleich.mpd_befehl = lambda *b: None  # kein MPD im Test


def schreibe(wurzel, pfad, inhalt):
    voll = os.path.join(wurzel, pfad)
    os.makedirs(os.path.dirname(voll), exist_ok=True)
    with open(voll, "w") as f:
        f.write(inhalt)


def eintrag(pfad, inhalt):
    return {"pfad": pfad, "groesse": len(inhalt), "geaendert": 1700000000}


class SpiegelnTest(unittest.TestCase):
    def setUp(self):
        self.wurzel = tempfile.mkdtemp()
        self.geladen = []

    def laden(self, pfad, ziel, geaendert):
        self.geladen.append(pfad)
        schreibe(self.wurzel, os.path.relpath(ziel, self.wurzel), "neu:" + pfad)

    def spiegeln(self, liste, uhr=None):
        return abgleich.sammlung_spiegeln(self.wurzel, liste, self.laden,
                                          **({"uhr": uhr} if uhr else {}))

    def test_holt_neues_und_geaendertes_entfernt_weggefallenes(self):
        for i in range(20):
            schreibe(self.wurzel, "T%02d.mp3" % i, "x")
        schreibe(self.wurzel, ".sync_1.db", "nextcloud-rest")
        schreibe(self.wurzel, "Playlists.md", "notiz")
        liste = [eintrag("T%02d.mp3" % i, "x") for i in range(1, 20)]  # T00 weg
        liste[0]["groesse"] = 99                                       # T01 anders
        liste.append(eintrag("Neu - Titel.mp3", "abc"))
        self.assertEqual(self.spiegeln(liste), (2, 1))
        self.assertEqual(sorted(self.geladen), ["Neu - Titel.mp3", "T01.mp3"])
        self.assertFalse(os.path.exists(os.path.join(self.wurzel, "T00.mp3")))
        # Was keine Musik ist oder versteckt, bleibt.
        self.assertTrue(os.path.exists(os.path.join(self.wurzel, ".sync_1.db")))
        self.assertTrue(os.path.exists(os.path.join(self.wurzel, "Playlists.md")))

    def test_leere_oder_kurze_liste_loescht_nichts(self):
        for i in range(20):
            schreibe(self.wurzel, "T%02d.mp3" % i, "x")
        self.assertEqual(self.spiegeln([]), (0, 0))
        self.assertEqual(self.spiegeln([eintrag("T%02d.mp3" % i, "x") for i in range(10)]), (0, 0))
        self.assertEqual(len(os.listdir(self.wurzel)), 20)

    def test_nie_mehr_als_zehn_prozent_auf_einmal(self):
        for i in range(100):
            schreibe(self.wurzel, "T%03d.mp3" % i, "x")
        # 91 von 100 da: 9 zu loeschen ist erlaubt ...
        self.assertEqual(self.spiegeln([eintrag("T%03d.mp3" % i, "x") for i in range(91)]), (0, 9))
        # ... aber wenn auch noch neue fehlen und 11 von 101 weg waeren, nicht.
        for i in range(91, 101):
            schreibe(self.wurzel, "T%03d.mp3" % i, "x")
        liste = [eintrag("T%03d.mp3" % i, "x") for i in range(11, 101)] + \
                [eintrag("N%02d.mp3" % i, "y") for i in range(10)]
        geholt, weg = self.spiegeln(liste)
        self.assertEqual((geholt, weg), (10, 0))

    def test_pfade_ausserhalb_werden_ignoriert(self):
        liste = [eintrag(p, "x") for p in ("../etc/passwd", "/etc/passwd", "a/../../b.mp3",
                                            ".versteckt.mp3", "ok/Titel.mp3")]
        self.assertEqual(self.spiegeln(liste), (1, 0))
        self.assertEqual(self.geladen, ["ok/Titel.mp3"])

    def test_zeitgrenze_laedt_rest_im_naechsten_lauf(self):
        zeit = iter(range(0, 10000, 200))
        liste = [eintrag("N%02d.mp3" % i, "neu:N%02d.mp3" % i) for i in range(5)]
        geholt, _ = self.spiegeln(liste, uhr=lambda: next(zeit))
        self.assertLess(geholt, 5)
        geholt2, _ = self.spiegeln(liste)
        self.assertEqual(geholt + geholt2, 5)


if __name__ == "__main__":
    unittest.main()
