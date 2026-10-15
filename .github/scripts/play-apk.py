"""Von Google Play signierte APK einer Version (generatedApks).

Play signiert die ausgelieferte App mit dem eigenen App-Signaturschluessel
(Play App Signing), nicht mit unserem Upload-Schluessel. Eine selbst
signierte APK auf der Website laesst sich deshalb nicht ueber eine
Play-Installation installieren (und umgekehrt). Mit der APK, die Play selbst
erzeugt und signiert, passen App-ID und Signatur ueberall.

Aufruf (Service-Account-JSON in PLAY_JSON):
  play-apk.py zeigen <paket> <versionCode>        Signaturen anzeigen
  play-apk.py laden  <paket> <versionCode> <ziel> universelle APK speichern

Play erzeugt die APKs erst nach dem Upload; "laden" wartet bis ~10 Minuten.
"""

import json
import os
import sys
import time

from google.auth.transport.requests import AuthorizedSession
from google.oauth2 import service_account

modus, paket, version = sys.argv[1], sys.argv[2], sys.argv[3]
konto = service_account.Credentials.from_service_account_info(
    json.loads(os.environ["PLAY_JSON"]),
    scopes=["https://www.googleapis.com/auth/androidpublisher"],
)
http = AuthorizedSession(konto)
basis = f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{paket}/generatedApks/{version}"


def liste():
    r = http.get(basis)
    if r.status_code != 200:
        return None, f"HTTP {r.status_code}: {r.text[:300]}"
    return r.json().get("generatedApks", []), None


if modus == "zeigen":
    apks, fehler = liste()
    if fehler:
        sys.exit(fehler)
    for a in apks:
        print("Signatur SHA-256:", a.get("certificateSha256Hash"))
        print("  universelle APK:", (a.get("generatedUniversalApk") or {}).get("downloadId", "keine"))
    sys.exit(0)

if modus == "laden":
    ziel = sys.argv[4]
    for versuch in range(40):
        apks, fehler = liste()
        kennung = None
        for a in apks or []:
            kennung = (a.get("generatedUniversalApk") or {}).get("downloadId") or kennung
        if kennung:
            r = http.get(f"{basis}/downloads/{kennung}:download", params={"alt": "media"})
            if r.status_code == 200 and r.content[:2] == b"PK":
                with open(ziel, "wb") as f:
                    f.write(r.content)
                print(f"Play-signierte APK gespeichert: {ziel} ({len(r.content)} Bytes)")
                sys.exit(0)
            fehler = f"Download HTTP {r.status_code}: {r.text[:200]}"
        print(f"Noch keine APK von Play ({fehler or 'wird erzeugt'}), warte ...", flush=True)
        time.sleep(15)
    sys.exit("Play hat keine universelle APK geliefert.")

sys.exit(f"unbekannter Modus {modus}")
