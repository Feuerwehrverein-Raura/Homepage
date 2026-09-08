import json, sys, time, urllib.request

ZENTRALE = "192.168.88.84"

def rpc(methode, koerper=None):
    url = "http://%s/rpc/%s" % (ZENTRALE, methode)
    daten = json.dumps(koerper).encode() if koerper is not None else None
    a = urllib.request.Request(url, data=daten,
        headers={"Content-Type": "application/json"} if daten else {})
    with urllib.request.urlopen(a, timeout=15) as r:
        roh = r.read().decode()
    return json.loads(roh) if roh.strip() else {}

code = open("/tmp/lichtgruppen.js").read()
NAME = "Lichtgruppen"

# Vorhandenes Skript gleichen Namens wiederverwenden statt Dubletten anlegen.
vorhanden = None
for s in rpc("Script.List")["scripts"]:
    if s["name"] == NAME:
        vorhanden = s["id"]

if vorhanden is None:
    vorhanden = rpc("Script.Create", {"name": NAME})["id"]
    print("Skript angelegt, id", vorhanden)
else:
    print("Skript vorhanden, id", vorhanden)
    rpc("Script.Stop", {"id": vorhanden})

# In Stuecken schreiben: PutCode nimmt nicht beliebig viel auf einmal.
# Das erste Stueck ohne append ersetzt den alten Inhalt — ein leeres
# PutCode zum Loeschen quittiert das Geraet mit 500.
schritt = 400
for i in range(0, len(code), schritt):
    rpc("Script.PutCode", {"id": vorhanden, "code": code[i:i+schritt],
                           "append": i > 0})

gespeichert = rpc("Script.GetCode", {"id": vorhanden})["data"]
print("uebertragen:", len(gespeichert), "von", len(code), "Zeichen",
      "— gleich" if gespeichert == code else "— UNTERSCHIEDLICH")

rpc("Script.SetConfig", {"id": vorhanden, "config": {"enable": True}})
rpc("Script.Start", {"id": vorhanden})
time.sleep(2)
for s in rpc("Script.List")["scripts"]:
    print("  id %d  %-18s enable=%s running=%s" % (s["id"], s["name"], s["enable"], s["running"]))
