"""Stuft ein Release in Google Play von einem Track in einen anderen hoch.

Aufruf: play-hochstufen.py <paket> <versionCode> <von-Track> <nach-Track>
Service-Account-JSON in der Umgebungsvariable PLAY_JSON.

Nimmt das Release mit diesem versionCode aus dem Quell-Track (samt Name und
Versionshinweisen) und setzt es im Ziel-Track als einziges, vollstaendig
ausgerolltes Release — wie "Release hochstufen" in der Play Console.
"""

import json
import os
import sys

from google.auth.transport.requests import AuthorizedSession
from google.oauth2 import service_account

paket, code, von, nach = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
konto = service_account.Credentials.from_service_account_info(
    json.loads(os.environ["PLAY_JSON"]),
    scopes=["https://www.googleapis.com/auth/androidpublisher"],
)
http = AuthorizedSession(konto)
basis = f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{paket}/edits"


def pruefen(antwort):
    if not antwort.ok:
        sys.exit(f"Play-API {antwort.status_code}: {antwort.text}")
    return antwort.json()


edit = pruefen(http.post(basis))["id"]
quelle = pruefen(http.get(f"{basis}/{edit}/tracks/{von}"))
release = next(
    (r for r in quelle.get("releases", []) if code in r.get("versionCodes", [])),
    None,
)
if release is None:
    sys.exit(f"versionCode {code} nicht im Track {von}")

neu = {"versionCodes": [code], "status": "completed"}
for feld in ("name", "releaseNotes"):
    if feld in release:
        neu[feld] = release[feld]
pruefen(http.put(f"{basis}/{edit}/tracks/{nach}", json={"track": nach, "releases": [neu]}))
pruefen(http.post(f"{basis}/{edit}:commit"))
print(f"{paket} {code}: {von} -> {nach} hochgestuft")
