# Kiosk im Roten Schopf

Der Laptop im Vereinslokal (ThinkPad T400, Linux Mint) laeuft im
Festbetrieb als Bedienpult: Musik, Arbeitsplan und die Bestellansichten,
ohne Desktop, ohne Startmenue, ohne Dateimanager.

Diese Dateien liegen im Betrieb ueber das System verteilt. Sie stehen
hier, damit sie versioniert sind und nach einem Neuaufsetzen nicht neu
erfunden werden muessen — **nicht**, weil hier automatisch ausgerollt
wuerde. Wer etwas aendert, spielt es von Hand ein (siehe unten).

## Was wohin gehoert

| Hier | Auf dem Laptop |
| --- | --- |
| `dienst/kiosk.py` | `/usr/local/lib/kiosk/kiosk.py` |
| `dienst/web/index.html` | `/usr/local/lib/kiosk/web/index.html` |
| `bin/*` | `/usr/local/bin/` (Modus 755) |
| `systemd/*` | `/etc/systemd/system/` |
| `system/kiosk.desktop` | `/usr/share/xsessions/kiosk.desktop` |
| `system/lightdm.conf.d/*` | `/etc/lightdm/lightdm.conf.d/` |
| `system/firefox-policies.json` | `/etc/firefox/policies/policies.json` |
| `system/mpd.conf` | `/etc/mpd.conf` |
| `system/sudoers.d/vereinsrollen` | `/etc/sudoers.d/vereinsrollen` (440) |
| `system/openbox-rc.xml` | `/home/roterschopf/.config/openbox/rc.xml` |
| `system/sssd.conf.beispiel` | `/etc/sssd/sssd.conf` (Modus 600) |

Die beiden x11vnc-Dienste liegen nicht hier, sondern bei
[`docker/novnc/`](../docker/novnc/) — dort, wo auch der Gegenpart auf dem
Server steht.

## Was nicht hier steht

- **`/etc/kiosk/umgebung`** (Modus 600, root) traegt `KIOSK_KEY` und
  `KIOSK_API`. Der Schluessel steht im `.env` des Vereinsservers unter
  `/opt/docker/fwv-website/`.
- **Das Passwort des LDAP-Suchkontos** in `sssd.conf`. Die Datei hier ist
  eine Vorlage mit geschwaerztem Wert; das echte Passwort steht in
  Vaultwarden.
- **Die VNC-Passwortdateien** `/etc/x11vnc-schauen.pass` und
  `/etc/x11vnc-steuern.pass`.
- **Die Musik** unter `/Musik` (1153 Titel, 3.7 GB).

## Wie es zusammenhaengt

Der **Kiosk-Dienst** (`kiosk.py`) lauscht auf `127.0.0.1:8080` und macht
zweierlei: Er liefert die Oberflaeche aus und steuert dahinter MPD. Er
spricht nie mit dem Vereinsserver — faellt der aus, laeuft die Musik
weiter.

Der **Abgleich** (`kiosk-abgleich`, Timer alle fuenf Minuten) holt vom
Vereinsserver, was sich dort aendert: Playlists, Radiosender, Arbeitsplan.
Und er meldet dorthin, welche Titel der Laptop hat — sonst wuesste der
Mitgliederbereich nicht, woraus man Playlists bauen kann. Die Richtung ist
Absicht: Der Laptop holt, der Server schiebt nicht. So braucht der Laptop
keinen erreichbaren Port.

Die **Sitzung** startet ueber LightDM. Der `lightdm-sitzungswaechter`
sorgt dafuer, dass `roterschopf` immer den Kiosk bekommt und nie den
Cinnamon-Desktop — unabhaengig davon, was im Anmeldebildschirm gewaehlt
wird. Autologin gilt nur beim Hochfahren; nach einem Abmelden erscheint
der Anmeldebildschirm, und dort meldet man sich mit seinem
Vereinskonto an (SSSD gegen Authentik).

Alles Weitere — Entscheidungen, Fallstricke, Betriebsnotizen — steht in
`memory/servers/RoterSchopf-T400/memory.md`.

## Einspielen

Ohne Automatik, absichtlich: Auf diesem Rechner laeuft am Festabend die
Musik, und ein Skript, das im falschen Moment durchlaeuft, macht mehr
kaputt als es spart.

    scp dienst/kiosk.py stefan@192.168.88.10:/tmp/
    ssh stefan@192.168.88.10 \
      'sudo install -m 755 /tmp/kiosk.py /usr/local/lib/kiosk/kiosk.py && \
       sudo systemctl restart kiosk'

Nach einer Aenderung an der Oberflaeche muss Firefox neu laden — ein
Neustart des Dienstes reicht nicht, die alte Seite laeuft im Browser
weiter:

    ssh stefan@192.168.88.10 \
      'sudo -u roterschopf env DISPLAY=:0 xdotool key ctrl+shift+r'
