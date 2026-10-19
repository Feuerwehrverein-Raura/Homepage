"""Ziffern 0-9 als 1-Bit-ePOS-Rasterbilder fuer die Tischkarten (src/tischkarten.ts).

Erzeugt assets/ziffern-bon.json mit zwei Groessen (Druckerpunkte, 8 pro mm):
  gross: 320 Punkte = 4 cm hoch (ein- und zweistellige Nummern)
  klein: 224 Punkte = 2,8 cm hoch (dreistellige, damit sie in 72 mm passen)
Je Ziffer: Breite, Hoehe und Raster (Base64, Bit 1 = schwarz, MSB links,
Zeilen auf ganze Bytes aufgefuellt - wie assets/logo-bon.json).

Aufruf (Pillow noetig):  python3 scripts/ziffern-bon.py [Schrift.ttf]
"""
import base64
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

SCHRIFT = sys.argv[1] if len(sys.argv) > 1 else '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
ZIEL = os.path.join(os.path.dirname(__file__), '..', 'assets', 'ziffern-bon.json')
HOEHEN = {'gross': 320, 'klein': 224}


def ziffern(hoehe):
    # Schriftgroesse so waehlen, dass die Ziffern (Tinte) genau [hoehe] hoch sind
    groesse = hoehe
    for _ in range(20):
        font = ImageFont.truetype(SCHRIFT, groesse)
        oben = min(font.getbbox(z)[1] for z in '0123456789')
        unten = max(font.getbbox(z)[3] for z in '0123456789')
        if unten - oben == hoehe:
            break
        groesse = round(groesse * hoehe / (unten - oben))
    ergebnis = {}
    for z in '0123456789':
        l, _, r, _ = font.getbbox(z)
        bild = Image.new('L', (r - l, hoehe), 255)
        ImageDraw.Draw(bild).text((-l, -oben), z, font=font, fill=0)
        # Bit 1 = schwarz: in PIL-'1' ist 1 weiss, also vorher umkehren
        mono = bild.point(lambda v: 255 if v < 128 else 0).convert('1')
        ergebnis[z] = {
            'width': mono.width,
            'height': mono.height,
            'raster': base64.b64encode(mono.tobytes()).decode(),
        }
    return ergebnis


daten = {name: ziffern(h) for name, h in HOEHEN.items()}
with open(ZIEL, 'w') as f:
    json.dump(daten, f, separators=(',', ':'))
for name, s in daten.items():
    print(name, {z: s[z]['width'] for z in s}, 'Hoehe', HOEHEN[name])
