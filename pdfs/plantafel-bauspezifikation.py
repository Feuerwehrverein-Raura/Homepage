# -*- coding: utf-8 -*-
"""Bauspezifikation Plantafel Roter Schopf als PDF."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfgen import canvas

BREITE, HOEHE = A4
RAND = 20 * mm

FEUER = colors.HexColor("#C4342B")
GRAU = colors.HexColor("#555555")
HELL = colors.HexColor("#8A8A8A")
LINIE = colors.HexColor("#C8C8C8")
FLAECHE = colors.HexColor("#F2F2F0")

c = canvas.Canvas("Plantafel-Bauspezifikation.pdf", pagesize=A4)
c.setTitle("Plantafel Roter Schopf - Bauspezifikation")
c.setAuthor("Feuerwehrverein Raura Kaiseraugst")

y = [HOEHE - RAND]


def platz(hoehe_mm):
    """Sorgt fuer genug Platz, sonst neue Seite."""
    if y[0] - hoehe_mm * mm < RAND + 12 * mm:
        fusszeile()
        c.showPage()
        y[0] = HOEHE - RAND


def fusszeile():
    c.setFont("Helvetica", 7.5)
    c.setFillColor(HELL)
    c.drawString(RAND, RAND - 4 * mm,
                 "Feuerwehrverein Raura Kaiseraugst – Plantafel, Bauspezifikation")
    c.drawRightString(BREITE - RAND, RAND - 4 * mm, "Stand 21.09.2026")


def titel(text, unter=None):
    platz(24)
    c.setFont("Helvetica-Bold", 19)
    c.setFillColor(colors.black)
    c.drawString(RAND, y[0], text)
    y[0] -= 7 * mm
    if unter:
        c.setFont("Helvetica", 10)
        c.setFillColor(GRAU)
        c.drawString(RAND, y[0], unter)
        y[0] -= 5 * mm
    c.setStrokeColor(FEUER)
    c.setLineWidth(1.6)
    c.line(RAND, y[0], BREITE - RAND, y[0])
    y[0] -= 9 * mm


def kapitel(text, braucht=16):
    """braucht: Hoehe in mm, die NACH der Ueberschrift noch frei sein muss.

    Ohne das landet ein Abschnittstitel allein am Seitenende und seine
    Tabelle auf der naechsten Seite.
    """
    platz(braucht)
    y[0] -= 3 * mm
    c.setFont("Helvetica-Bold", 12)
    c.setFillColor(FEUER)
    c.drawString(RAND, y[0], text)
    y[0] -= 6.5 * mm


def absatz(text, fett_bis=0, groesse=9.5, abstand=4.6):
    """Bricht Text auf die Seitenbreite um."""
    platz(10)
    c.setFillColor(colors.black)
    maxbreite = BREITE - 2 * RAND
    worte = text.split()
    zeile = ""
    for wort in worte:
        probe = (zeile + " " + wort).strip()
        c.setFont("Helvetica", groesse)
        if c.stringWidth(probe, "Helvetica", groesse) > maxbreite:
            platz(8)
            c.setFont("Helvetica", groesse)
            c.setFillColor(colors.black)
            c.drawString(RAND, y[0], zeile)
            y[0] -= abstand * mm
            zeile = wort
        else:
            zeile = probe
    if zeile:
        platz(8)
        c.setFont("Helvetica", groesse)
        c.setFillColor(colors.black)
        c.drawString(RAND, y[0], zeile)
        y[0] -= abstand * mm
    y[0] -= 1.5 * mm


def merksatz(text):
    """Hervorgehobener Kasten fuer das, was man beim Bauen nicht vergessen darf."""
    maxbreite = BREITE - 2 * RAND - 12 * mm
    zeilen, zeile = [], ""
    for wort in text.split():
        probe = (zeile + " " + wort).strip()
        if c.stringWidth(probe, "Helvetica-Bold", 9.5) > maxbreite:
            zeilen.append(zeile)
            zeile = wort
        else:
            zeile = probe
    if zeile:
        zeilen.append(zeile)

    h = len(zeilen) * 4.8 + 6
    platz(h + 4)
    c.setFillColor(FLAECHE)
    c.rect(RAND, y[0] - h * mm + 3 * mm, BREITE - 2 * RAND, h * mm, stroke=0, fill=1)
    c.setFillColor(FEUER)
    c.rect(RAND, y[0] - h * mm + 3 * mm, 1.6 * mm, h * mm, stroke=0, fill=1)
    c.setFont("Helvetica-Bold", 9.5)
    c.setFillColor(colors.black)
    yy = y[0]
    for z in zeilen:
        c.drawString(RAND + 6 * mm, yy, z)
        yy -= 4.8 * mm
    y[0] -= (h + 3) * mm


def tabelle(kopf, zeilen, spalten_mm):
    gesamt = sum(spalten_mm)
    h = (len(zeilen) + 1) * 6.5 + 2
    platz(h + 4)
    x0 = RAND
    yy = y[0]

    c.setFillColor(colors.HexColor("#333333"))
    c.rect(x0, yy - 4.6 * mm, gesamt * mm, 6.2 * mm, stroke=0, fill=1)
    c.setFont("Helvetica-Bold", 8.5)
    c.setFillColor(colors.white)
    x = x0
    for i, k in enumerate(kopf):
        c.drawString(x + 2 * mm, yy - 3 * mm, k)
        x += spalten_mm[i] * mm
    yy -= 6.2 * mm

    for n, zeile in enumerate(zeilen):
        if n % 2 == 0:
            c.setFillColor(FLAECHE)
            c.rect(x0, yy - 4.6 * mm, gesamt * mm, 6.2 * mm, stroke=0, fill=1)
        x = x0
        for i, feld in enumerate(zeile):
            fett = feld.startswith("*")
            txt = feld[1:] if fett else feld
            c.setFont("Helvetica-Bold" if fett else "Helvetica", 8.5)
            c.setFillColor(colors.black)
            c.drawString(x + 2 * mm, yy - 3 * mm, txt)
            x += spalten_mm[i] * mm
        yy -= 6.2 * mm
    y[0] = yy - 3 * mm


def raster_zeichnen():
    """Das Grundraster massstaeblich, mit den vier Kartenplaetzen je Zelle."""
    spalten = ["KÜCHE", "BAR", "SERVICE", "SPRINGER"]
    zeiten = ["12–14", "14–16", "16–18", "18–20",
              "20–22", "22–00", "00–02"]

    zeit_b = 16 * mm
    spalte_b = 30 * mm
    zeile_h = 11 * mm
    kopf_h = 8 * mm
    gesamt_b = zeit_b + len(spalten) * spalte_b
    gesamt_h = kopf_h + len(zeiten) * zeile_h

    platz(gesamt_h / mm + 16)
    x0 = RAND + (BREITE - 2 * RAND - gesamt_b - 24 * mm) / 2
    yo = y[0]

    # Kopfzeile
    c.setFillColor(colors.HexColor("#333333"))
    c.rect(x0 + zeit_b, yo - kopf_h, len(spalten) * spalte_b, kopf_h, stroke=0, fill=1)
    c.setFont("Helvetica-Bold", 8.5)
    c.setFillColor(colors.white)
    for i, s in enumerate(spalten):
        c.drawCentredString(x0 + zeit_b + i * spalte_b + spalte_b / 2, yo - 5.4 * mm, s)

    # Zellen
    for r, z in enumerate(zeiten):
        ytop = yo - kopf_h - r * zeile_h
        c.setFillColor(FLAECHE)
        c.rect(x0, ytop - zeile_h, zeit_b, zeile_h, stroke=0, fill=1)
        c.setFont("Helvetica-Bold", 8)
        c.setFillColor(colors.black)
        c.drawCentredString(x0 + zeit_b / 2, ytop - zeile_h / 2 - 1 * mm, z)

        for s in range(len(spalten)):
            xl = x0 + zeit_b + s * spalte_b
            c.setStrokeColor(LINIE)
            c.setLineWidth(0.7)
            c.rect(xl, ytop - zeile_h, spalte_b, zeile_h, stroke=1, fill=0)
            # vier Kartenplaetze
            for k in range(4):
                kx = xl + 2.4 * mm + k * 6.5 * mm
                c.setStrokeColor(colors.HexColor("#9A9A9A"))
                c.setLineWidth(0.5)
                c.rect(kx, ytop - zeile_h + 3 * mm, 5 * mm, 5 * mm, stroke=1, fill=0)

    # Aussenrahmen der bestehenden vier Spalten
    c.setStrokeColor(colors.black)
    c.setLineWidth(1.2)
    c.rect(x0, yo - gesamt_h, gesamt_b, gesamt_h, stroke=1, fill=0)

    # Andeutung der Erweiterung nach rechts
    xe = x0 + gesamt_b
    c.setStrokeColor(FEUER)
    c.setLineWidth(1.0)
    c.setDash(3, 2)
    c.rect(xe, yo - gesamt_h, 20 * mm, gesamt_h, stroke=1, fill=0)
    c.setDash()
    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(FEUER)
    c.saveState()
    c.translate(xe + 12 * mm, yo - gesamt_h + 6 * mm)
    c.rotate(90)
    c.drawString(0, 0, "KASSE / weitere – nachrüstbar")
    c.restoreState()

    # Legende
    c.setFont("Helvetica", 7.5)
    c.setFillColor(HELL)
    c.drawString(x0, yo - gesamt_h - 5 * mm,
                 "Jede Zelle nimmt vier Namenskarten auf. Zeit- und Bereichsschilder sind gesteckt, nicht aufgedruckt.")
    y[0] = yo - gesamt_h - 11 * mm


# ---------------------------------------------------------------- Seite 1
titel("Plantafel Roter Schopf",
      "Bauspezifikation – Raster, Stückzahlen und was daraus folgt")

absatz("Eine Tafel pro Festtag. Am Festabend hängt damit genau das, was "
       "heute gilt – niemand sucht zwischen zwei Tagen. Die Zahlen unten "
       "stammen aus den tatsächlich erfassten Schichten der Chilbi 2026 und "
       "des Fasnachtssamstigs 2026, nicht aus einer Schätzung.")

kapitel("Das Grundraster", braucht=110)
raster_zeichnen()

tabelle(
    ["Maß", "Zahl", "Begründung"],
    [["*Spalten", "*4", "Küche, Bar, Service, Springer – erweiterbar, siehe unten"],
     ["*Zeilen", "*7", "12–02 Uhr in Zwei-Stunden-Schritten; Maximum der Fasnacht"],
     ["*Karten je Zelle", "*4", "Heute stehen überall 2 Personen – das Doppelte als Reserve"],
     ["Zellen", "28", "4 × 7"],
     ["*Kartenplätze", "*112", "28 × 4"]],
    [34, 18, 118])

kapitel("Erweiterbar bauen")
absatz("Vier Spalten decken ab, was heute gefahren wird. Das System kennt "
       "aber neun Bereiche, und fünf davon können gleichzeitig laufen: "
       "Küche, Bar, Service, Kasse und Springer. Eine Kasse-Spalte ist "
       "heute nicht geplant, kann aber kommen.")

merksatz("Deshalb keine geschlossene Rahmenkonstruktion: Jede Spalte ist ein "
         "eigenes Modul, das rechts angesetzt wird. Die Zeitleiste links "
         "bleibt stehen, die Grundschiene ist länger als die vier Module.")

absatz("Konkret heißt das: Die tragende Schiene oben und unten über die "
       "volle spätere Breite auslegen, nicht nur über die vier Module. "
       "Ein fünftes Modul wird dann angeschraubt statt eingepasst.")

fusszeile()
c.showPage()
y[0] = HOEHE - RAND

# ---------------------------------------------------------------- Seite 2
titel("Einsatz und Grenzen", "Wie viele Tafeln, und was nicht darauf passt")

kapitel("Wie viele Tafeln je Anlass", braucht=40)
tabelle(
    ["Anlass", "Tafeln", "Belegung"],
    [["*Fasnachtssamstig", "*1", "Die Nacht 12:00–02:00 füllt alle 7 Zeilen"],
     ["*Chilbi", "*2", "Samstag und Sonntag, je 6 der 7 Zeilen"],
     ["Fasnachtsauftakt", "1", "3 Zeitfenster, 2 Bereiche"]],
    [42, 22, 106])

absatz("Zur Einordnung der Auslastung: Am Fasnachtssamstig sind 40 Karten zu "
       "stecken, an einem Chilbi-Festtag 22. Die Tafel ist also nie mehr als "
       "zu gut einem Drittel voll. Das ist Absicht – die Reserve fängt "
       "größere Schichten ab, ohne dass neu gebaut werden muss.")

kapitel("Was nicht ins Raster passt", braucht=40)
tabelle(
    ["Schicht", "Personen", "Warum sie nicht ins Raster gehört"],
    [["*Aufbau", "*10", "Ein eigener Tag, eine einzige Schicht über 5 Stunden"],
     ["Dekorieren", "5", "Ein eigener Tag, eine einzige Schicht"],
     ["*Abbau", "*10", "Ein eigener Tag, eine einzige Schicht"]],
    [36, 24, 110])

merksatz("Zehn Personen sprengen eine Vier-Karten-Zelle um mehr als das "
         "Doppelte. Diese drei Schichten brauchen einen eigenen Streifen mit "
         "10 Plätzen in einer Reihe – oder sie bleiben bei einer Liste.")

kapitel("Wechselbare Schilder, nicht aufgedruckt")
absatz("Die Zeitfenster sind nicht bei jedem Anlass gleich. Die Chilbi hat "
       "22:00–02:00 als einen Block, die Fasnacht teilt dieselbe Zeit in "
       "22–00 und 00–02. Auch die Bereiche wechseln: Die Chilbi fährt nur "
       "mit Bar und Küche, die Fasnacht mit vier.")

merksatz("Beschriftet man Zeiten oder Bereiche fest, taugt die Tafel nur für "
         "einen Anlass. Beide Leisten brauchen gesteckte Schilder.")

kapitel("Namenskarten")
absatz("Der Verein hat 61 Mitglieder. Wer zwei Schichten übernimmt, braucht "
       "zwei Karten. Mit rund 100 Karten ist man auf der sicheren Seite, "
       "Gäste und Doppelungen eingerechnet.")

kapitel("Noch offen")
absatz("Die Kartengröße. Sie bestimmt Zellenbreite, Zeilenhöhe und damit "
       "die Außenmaße der Tafel. Steht sie fest, lässt sich alles Weitere "
       "daraus ableiten.")

kapitel("Datengrundlage")
absatz("Chilbi 2026 (14.–19. Oktober): 27 Schichten, 69 Personenplätze, "
       "Bereiche Bar und Küche sowie Aufbau, Dekorieren, Abbau. "
       "Fasnachtssamstig 2026 (14./15. Februar): 23 Schichten, 46 "
       "Personenplätze, Bereiche Bar, Küche, Springer, Service, "
       "Vorbereitung. Abgefragt am 21.09.2026 aus der Vereinsdatenbank.",
       groesse=8.5, abstand=4.2)

fusszeile()
c.showPage()
y[0] = HOEHE - RAND

# ---------------------------------------------------------------- Seite 3
titel("Stecksystem und St\u00fcckliste",
      "Was gedruckt werden muss, und wie viel davon")

absatz("Alles Beschriftete wird gesteckt, nichts aufgedruckt. Das ist keine "
       "Bequemlichkeit, sondern die Bedingung daf\u00fcr, dass dieselbe Tafel "
       "f\u00fcr Chilbi und Fasnacht taugt: Die beiden haben unterschiedliche "
       "Zeitfenster und unterschiedliche Bereiche.")

kapitel("Die f\u00fcnf Teilearten", braucht=52)
tabelle(
    ["Teil", "Was darauf steht", "Wechselt"],
    [["*Bereichsschild", "K\u00fcche, Bar, Service, Springer \u2026", "je Anlass"],
     ["*Schichtschild", "Ein Zeitfenster, z.B. 18\u201320", "je Anlass"],
     ["*Tagesschild", "Wochentag, z.B. Samstag", "je Tafel"],
     ["*Ziffernpl\u00e4ttchen", "Eine Ziffer 0\u20139, f\u00fcr das Datum", "je Tafel"],
     ["*Namenskarte", "Ein Vereinsmitglied", "beim Einteilen"]],
    [34, 78, 58])

kapitel("St\u00fcckliste", braucht=72)
tabelle(
    ["Teil", "Anzahl", "Warum gerade so viele"],
    [["*Spaltenmodule", "*4", "K\u00fcche, Bar, Service, Springer \u2013 Schiene f\u00fcr 6 auslegen"],
     ["*Zeitleiste links", "*1", "Tr\u00e4gt die sieben Schichtschilder"],
     ["*Bereichsschilder", "*14", "5 Betriebsbereiche doppelt (Chilbi: 2 Tafeln), 4 Sonderbereiche einfach"],
     ["*Schichtschilder", "*28", "2 S\u00e4tze \u00e0 14 Zeitfenster \u2013 die Chilbi braucht 7 davon an beiden Tagen"],
     ["*Tagesschilder", "*7", "Eine volle Woche; zwei Tafeln zeigen nie denselben Tag"],
     ["*Ziffernpl\u00e4ttchen", "*40", "4 St\u00fcck je Ziffer 0\u20139, Format TT.MM. auf zwei Tafeln"],
     ["*Jahresschild", "*1", "Statt vier Ziffern \u2013 das Jahr wechselt einmal j\u00e4hrlich"],
     ["*Namenskarten", "*100", "61 Mitglieder, plus Doppelschichten und G\u00e4ste"]],
    [38, 22, 110])

merksatz("Die 40 Ziffernpl\u00e4ttchen decken jedes Datum ab, das kein "
         "Zahlendreher ist. Der 11.11. braucht allein acht Einsen, wenn zwei "
         "Tafeln h\u00e4ngen \u2013 wer das abdecken will, druckt 8 je Ziffer.")

kapitel("Warum das Jahr ein Schild ist und kein Zifferngesteck")
absatz("Das Datum aus Ziffern zu stecken ist richtig f\u00fcr Tag und Monat: "
       "Die \u00e4ndern sich bei jedem Anlass. Das Jahr \u00e4ndert sich einmal "
       "j\u00e4hrlich. Als Zifferngesteck kostet es vier Pl\u00e4ttchen, vier "
       "Steckpl\u00e4tze und die H\u00e4lfte der Kopfbreite \u2013 als ein Schild "
       "kostet es einen Druck pro Jahr.")

kapitel("Die 14 Zeitfenster, die tats\u00e4chlich vorkommen", braucht=70)
tabelle(
    ["Zeitfenster", "Wo", "Zeitfenster", "Wo"],
    [["*12\u201314", "beide", "22\u201300", "Fasnacht"],
     ["*14\u201316", "beide", "*22\u201302", "Chilbi"],
     ["*16\u201318", "beide", "00\u201302", "Fasnacht"],
     ["*18\u201320", "beide", "09\u201312", "Fasnacht"],
     ["*20\u201322", "beide", "17\u201322", "Chilbi, Auf-/Abbau"],
     ["18\u201322", "Chilbi, Deko", "19\u201321", "Auftakt"],
     ["21\u201323", "Auftakt", "23\u201301", "Auftakt"]],
    [30, 45, 30, 65])

absatz("Fett gesetzt sind die sieben, welche die Chilbi an Samstag UND "
       "Sonntag gleichzeitig braucht \u2013 von denen also zwei St\u00fcck. Die "
       "\u00fcbrigen sieben reichen einfach; wer es einheitlich mag, druckt von "
       "allen zwei.", groesse=8.5, abstand=4.2)

fusszeile()
c.showPage()
y[0] = HOEHE - RAND

# ---------------------------------------------------------------- Seite 5
titel("Ma\u00dfe", "Abgeleitet aus der Lesbarkeit auf einen Meter")

absatz("DIN 1450 nennt als Mindestwert: Schrifth\u00f6he in Millimetern = "
       "Leseabstand in Metern geteilt durch 0,3. F\u00fcr einen Meter sind das "
       "3,3 mm Versalh\u00f6he. Die gebr\u00e4uchliche Faustregel nennt 5 bis 10 mm "
       "je Meter.")

merksatz("Gew\u00e4hlt: 8 mm Versalh\u00f6he. Deutlich \u00fcber dem Minimum, am oberen "
         "Ende der Faustregel \u2013 damit liest sich die Tafel auch im "
         "ged\u00e4mpften Licht und noch aus zwei Metern.")

kapitel("Namenskarte", braucht=46)
tabelle(
    ["Ma\u00df", "Wert", "Woraus"],
    [["*Versalh\u00f6he", "*8 mm", "Lesbarkeit auf 1 m, siehe oben"],
     ["Schriftgrad", "ca. 11 mm", "Geviert bei 8 mm Versalh\u00f6he"],
     ["Zeilen", "2", "Vorname \u00fcber Nachname"],
     ["*Karte", "*70 \u00d7 26 mm", "l\u00e4ngster Nachname: Grossenbacher, 13 Zeichen"],
     ["Dicke", "2 mm", "steif genug, d\u00fcnn genug zum Stapeln"]],
    [32, 26, 112])

absatz("Einzeilig w\u00e4re \u201eNicolas Niederberger\u201c mit 20 Zeichen rund 95 mm "
       "breit \u2013 zu viel. Eine schmale Groteske (Barlow Condensed oder "
       "\u00c4hnliches) statt einer normalen spart ein Sechstel der Breite.",
       groesse=8.5, abstand=4.2)

kapitel("Vier Karten \u00fcbereinander, nicht nebeneinander", braucht=36)
tabelle(
    ["Aufbau", "Breite", "H\u00f6he"],
    [["*Zelle", "*74 mm", "*108 mm (4 \u00d7 26 mm + Luft)"],
     ["4 Spalten", "296 mm", ""],
     ["Zeitleiste links", "56 mm", "tr\u00e4gt \u201e22:00\u201302:00\u201c bei 8 mm"],
     ["Kopfzeile Bereiche", "", "22 mm"],
     ["Tages- und Datumsleiste", "", "40 mm"],
     ["7 Zeilen", "", "756 mm"],
     ["*Tafel gesamt", "*352 mm", "*818 mm"]],
    [56, 34, 80])

merksatz("St\u00fcnden die vier Karten nebeneinander, w\u00e4re die Tafel 1,24 m "
         "breit statt 35 cm. \u00dcbereinander gestapelt passt sie an jede Wand "
         "und jeder Name steht auf voller Kartenbreite.")

fusszeile()
c.showPage()
y[0] = HOEHE - RAND

# ---------------------------------------------------------------- Seite 6
titel("Bauart der F\u00fchrung", "Empfehlung: offene Tasche, kein Schwalbenschwanz")

merksatz("Empfohlen: offene Tasche mit niedriger Vorderwand. Nicht "
         "Schwalbenschwanz, nicht T-Nut.")

kapitel("Warum nicht Schwalbenschwanz oder T-Nut")
absatz("Beide sind im 3D-Druck die klassische Quelle f\u00fcr Teile, die nicht "
       "passen. Eine schr\u00e4ge F\u00fchrungsfl\u00e4che addiert den Ma\u00dffehler \u00fcber "
       "zwei Ebenen, und die Schichtlinien des Drucks laufen quer zur "
       "Bewegungsrichtung \u2013 es klemmt oder es schlackert, selten passt es "
       "auf Anhieb. Bei rund 150 Teilen hei\u00dft Nacharbeiten: Stunden.")

absatz("Dazu der Betrieb: Wer mit kalten Fingern um zehn Uhr abends eine "
       "Karte umsteckt, will sie fallen lassen k\u00f6nnen und nicht in eine "
       "Schiene einf\u00e4deln.")

kapitel("Die Tasche", braucht=44)
tabelle(
    ["Ma\u00df", "Wert", "Begr\u00fcndung"],
    [["*Taschenbreite", "*70,6 mm", "Karte 70 mm + 0,3 mm Luft je Seite"],
     ["*Taschentiefe", "*2,4 mm", "Karte 2 mm + 0,2 mm Luft je Seite"],
     ["*Vorderwand", "*16 mm", "60 % der Kartenh\u00f6he \u2013 Name lesbar, Karte greifbar"],
     ["R\u00fcckwand", "26 mm", "volle Kartenh\u00f6he"],
     ["Neigung", "5\u00b0", "nach hinten, damit nichts herausf\u00e4llt"]],
    [34, 24, 112])

absatz("Gedruckt wird die Tasche mit der \u00d6ffnung nach oben: keine "
       "\u00dcberh\u00e4nge, keine St\u00fctzen, keine Br\u00fccken. Dasselbe Prinzip gilt "
       "f\u00fcr alle Schilder und die Ziffernpl\u00e4ttchen \u2013 ein System, eine "
       "Toleranz, ein Testdruck.")

kapitel("Druckbare Teilung", braucht=32)
absatz("Eine Tafel von 35 \u00d7 82 cm passt auf kein \u00fcbliches Druckbett. Die "
       "kleinste sinnvolle Einheit ist eine Zelle: 74 \u00d7 108 mm, gedruckt "
       "wird sie auf jedem Ger\u00e4t. 28 gleiche Zellen lassen sich stapelweise "
       "drucken, und eine besch\u00e4digte wird einzeln ersetzt statt der halben "
       "Tafel.")

merksatz("Erst eine Zelle und drei Karten drucken, Passung pr\u00fcfen, dann die "
         "\u00fcbrigen 27. Eine falsche Toleranz mal 28 ist ein verlorener Tag.")

kapitel("Offen")
absatz("Wie die Zellen am Rahmen h\u00e4ngen \u2013 geschraubt, geklipst oder auf "
       "eine Profilschiene geschoben. Das h\u00e4ngt davon ab, woraus der Rahmen "
       "wird: gedruckt, Holz oder Aluprofil.")

fusszeile()
c.save()
print("PDF geschrieben")
