---
name: fwv-anleitung
description: Anleitungen fuer Mitglieder auf der Website pflegen (docker/frontend-website/anleitung-*.html) und die zugehoerigen PDFs plus QR-Codes neu erzeugen. Verwenden, wenn eine Anleitung fuer Endanwender geschrieben oder geaendert wird ("Anleitung fuer die Mitglieder", "im Vereinsdesign").
---

# Anleitungen fuer Mitglieder

"In unserem Design" heisst: bestehende Anleitungsseite erweitern, nicht ein
neues Dokument bauen. Vorhanden: `anleitung-app.html`,
`anleitung-website.html`, `anleitung-nextcloud.html`,
`anleitung-passwort.html`. Aus jeder Seite entsteht auch ein PDF in
`docker/frontend-website/anleitungen/`.

## Bausteine (CSS steht im Kopf jeder Seite)

- Kapitel: `<section class="chapter bg-white rounded-lg shadow p-6 md:p-8" id="…">`
  mit `<h2>`, `<h3>`, `<p>` ohne Klassen.
- Schritte in fester Reihenfolge: `<ol class="steps">`.
- Hinweis: `<aside class="note"><b>Kernsatz.</b> Erklaerung</aside>`.
- Nur am Bildschirm: Klasse `nur-bildschirm`; nur im PDF: `nur-druck`
  (per `display:none`, im `@media print` sichtbar).
- Ton: du-Form, kurze Saetze, Schweizer Schreibweise (ss statt ß,
  «Guillemets»). Knopfnamen fett, so wie sie in der App heissen.

## Bildschirmfotos der App (Foto-Tour)

Nie echte Mitgliederdaten fotografieren. Die Bilder der Mitglieder-App
erzeugt eine Tour mit erfundenen Daten (Erika Muster), reproduzierbar:
```sh
cd flutter/mitglieder && TOUR=1 flutter test test/tour/bildschirmfotos_test.dart
```
Schreibt nach `docker/frontend-website/images/anleitung/`: `android/` und
`ios/` (01-anlaesse … 29-gruppen) und `web/mein-*` (Browser bzw.
Computer-Programm, 1280x800) - auf allen drei Geraeten dieselben Namen
(ausser `20-hilfe`, das es nur auf dem Handy gibt). Die Organisator-Bilder
(11, 13, 24-26) entstehen mit einem Konto ohne Vorstand, weil der Vorstand
statt "Organisator" den Reiter "Vorstand" sieht. `web/01–13` sind die
oeffentlichen Seiten (von Hand). Nach jeder sichtbaren App-Aenderung Tour
laufen lassen, geaenderte Bilder committen, betroffene PDFs neu erzeugen.
Neue Bildschirme in `test/tour/bildschirmfotos_test.dart` ergaenzen (Daten
in `tour_daten.dart`).

Die iPhone-Bilder zeigen die native iPhone-App (in Entwicklung, noch nicht
im App Store); iPhone-Nutzer verwenden bis dahin «Mein Bereich» in Safari.

Bilder einbinden immer mit `src` auf `ios/…` plus `data-ios`,
`data-android` und `data-web` (`web/mein-…`). Die Umschaltung oben auf
`anleitung-app.html` (Android | iPhone | Computer) tauscht nur das `src`;
"Computer" setzt zusaetzlich `body.bilder-web` (eine Spalte, breite
Bilder).

## QR-Codes

`qrcode` ist nicht installiert — in den Scratchpad legen:
```sh
python3 -m pip install -q --target $SCRATCH/py "qrcode[pil]"
PYTHONPATH=$SCRATCH/py python3 -I -c "import sys; sys.path.insert(0,'$SCRATCH/py'); import qrcode
q=qrcode.QRCode(border=2,box_size=10); q.add_data('<url>'); q.make(fit=True)
q.make_image().save('docker/frontend-website/images/anleitung/qr-<name>.png')"
```

## PDFs neu erzeugen (nach jeder Textaenderung)

Die App-Anleitung gibt es dreimal: `anleitung-app-android.pdf`,
`-iphone.pdf` und `-computer.pdf`. Pro Variante eine Zwischenkopie im
selben Ordner mit getauschten `src` (Computer zusaetzlich mit
`bilder-web`), drucken, loeschen:
```sh
cd docker/frontend-website
python3 -I - <<'PY'
import re, subprocess, os
C = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
s = open('anleitung-app.html').read()
for p, name in [('android', 'android'), ('ios', 'iphone'), ('web', 'computer')]:
    def tausch(m):
        t = re.search(r'data-%s="([^"]*)"' % p, m.group(1))
        return 'src="%s"%s' % (t.group(1), m.group(1)) if t else m.group(0)
    v = re.sub(r'src="[^"]*"((?: data-[a-z]+="[^"]*")*)', tausch, s)
    if p == 'web':
        v = v.replace('guide-app">', 'guide-app bilder-web">')
    open('_tmp.html', 'w').write(v)
    subprocess.run([C, '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
                    '--virtual-time-budget=8000',
                    '--print-to-pdf=anleitungen/anleitung-app-%s.pdf' % name,
                    'file://' + os.path.abspath('_tmp.html')], check=True)
os.remove('_tmp.html')
PY
```
Andere Anleitungen: direkt `anleitung-<name>.html` → `anleitungen/anleitung-<name>.pdf`.
Erste Seite pruefen: `sips -s format png <pdf> --out $SCRATCH/p1.png` und ansehen.

Danach ausliefern mit dem Skill `fwv-website-deploy`.
