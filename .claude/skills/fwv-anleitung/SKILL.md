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
`ios/` (01-anlaesse … 21-austritt, gleiche Namen) und `web/mein-*`
(Mein Bereich im Browser, 1280x800). `web/01–09` sind die oeffentlichen
Seiten (von Hand). Nach jeder sichtbaren App-Aenderung Tour laufen lassen,
geaenderte Bilder committen, betroffene PDFs neu erzeugen. Neue Bildschirme
in `test/tour/bildschirmfotos_test.dart` ergaenzen (Daten in `tour_daten.dart`).

Bilder einbinden immer mit `src` auf `ios/…` plus `data-ios`/`data-android`
(nur die App-Anleitung hat ein Android-PDF).

## QR-Codes

`qrcode` ist nicht installiert — in den Scratchpad legen:
```sh
python3 -m pip install -q --target $SCRATCH/py "qrcode[pil]"
PYTHONPATH=$SCRATCH/py python3 -I -c "import sys; sys.path.insert(0,'$SCRATCH/py'); import qrcode
q=qrcode.QRCode(border=2,box_size=10); q.add_data('<url>'); q.make(fit=True)
q.make_image().save('docker/frontend-website/images/anleitung/qr-<name>.png')"
```

## PDFs neu erzeugen (nach jeder Textaenderung)

Die App-Anleitung gibt es zweimal: iPhone-Bilder (Standard) und
Android-Bilder (`data-android`). Fuer Android eine Zwischenkopie im selben
Ordner mit getauschten `src`, drucken, loeschen:
```sh
cd docker/frontend-website
python3 -I -c "
import re; s=open('anleitung-app.html').read()
open('_tmp-android.html','w').write(re.sub(r'src=\"[^\"]*\" (data-ios=\"[^\"]*\") data-android=\"([^\"]*)\"', r'src=\"\2\" \1 data-android=\"\2\"', s))"
C="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for p in android:_tmp-android.html iphone:anleitung-app.html; do
  "$C" --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=8000 \
    --print-to-pdf="anleitungen/anleitung-app-${p%%:*}.pdf" "file://$PWD/${p#*:}"
done; rm _tmp-android.html
```
Andere Anleitungen: direkt `anleitung-<name>.html` → `anleitungen/anleitung-<name>.pdf`.
Erste Seite pruefen: `sips -s format png <pdf> --out $SCRATCH/p1.png` und ansehen.

Danach ausliefern mit dem Skill `fwv-website-deploy`.
