"""Zeigt, was Google Play pro Track gespeichert hat: Releases, Status,
versionCodes und Versionshinweise je Sprache. Nur lesen - das Edit wird
verworfen, nie committet.

Aufruf: play-zeigen.py <paket>   (Service-Account-JSON in PLAY_JSON)
"""

import json
import os
import sys

from google.auth.transport.requests import AuthorizedSession
from google.oauth2 import service_account

paket = sys.argv[1]
konto = service_account.Credentials.from_service_account_info(
    json.loads(os.environ["PLAY_JSON"]),
    scopes=["https://www.googleapis.com/auth/androidpublisher"],
)
http = AuthorizedSession(konto)
basis = f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{paket}/edits"

edit = http.post(basis).json()["id"]
try:
    details = http.get(f"{basis}/{edit}/details").json()
    print("Standardsprache:", details.get("defaultLanguage"))
    sprachen = http.get(f"{basis}/{edit}/listings").json().get("listings", [])
    print("Store-Eintraege:", [l.get("language") for l in sprachen])
    for track in http.get(f"{basis}/{edit}/tracks").json().get("tracks", []):
        for r in track.get("releases", []):
            print(f"\n[{track['track']}] {r.get('name')} {r.get('status')} {r.get('versionCodes')}")
            for n in r.get("releaseNotes", []) or [{"language": "-", "text": "(keine Versionshinweise)"}]:
                print(f"  {n['language']}: {n['text']!r}")
finally:
    http.delete(f"{basis}/{edit}")
