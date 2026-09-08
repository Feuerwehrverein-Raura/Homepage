// Lichtgruppen Roter Schopf
//
// Die Zentrale haelt den Zustand, nicht die einzelnen Lampen. Die drei
// virtuellen Schalter sind die Wahrheit:
//
//     boolean:200  Spots (die Girlanden gehoeren dazu)
//     boolean:201  Arbeitsleuchten
//
// boolean:202 hiess "Girlanden" und ist keine eigene Gruppe: Die Girlanden
// laufen mit den Spots. Der Schalter bleibt auf dem Geraet stehen, wird
// aber von niemandem mehr beachtet.
//
// Wer sie umlegt, ist gleich: der BLU-Taster an der Wand oder die
// Lichtseite auf dem Laptop. Dieses Skript hoert auf die Aenderung und
// setzt alle Lampen der Gruppe in denselben Zustand.
//
// Warum ueber den Schalter und nicht direkt auf die Lampen: Sonst haetten
// Taster und Laptop je ein eigenes Bild davon, was an ist, und nach dem
// ersten Umschalten waeren sie sich uneinig.
//
// Die Lampen haengen am eigenen Zugangspunkt dieses Geraets
// (192.168.33.0/24) und sind von hier direkt erreichbar.
//
// Nur ASCII in dieser Datei: Der JSON-Parser des Geraets stolpert ueber
// mehrbyteige Zeichen, sobald eines an einer Stueckgrenze landet.

let GRUPPEN = {
  200: [
    { ip: "192.168.33.4", k: 1 },
    { ip: "192.168.33.5", k: 0 },
    { ip: "192.168.33.6", k: 0 },
    { ip: "192.168.33.7", k: 0 },
    { ip: "192.168.33.8", k: 1 },
    // Die Girlanden laufen mit den Spots: Am Taster ist das eine Stimmung
    // und kein zweiter Handgriff.
    { ip: "192.168.33.5", k: 1 },
    { ip: "192.168.33.12", k: 0 },
    { ip: "192.168.33.13", k: 0 }
  ],
  201: [
    { ip: "192.168.33.4", k: 0 },
    { ip: "192.168.33.6", k: 1 },
    { ip: "192.168.33.7", k: 1 },
    { ip: "192.168.33.8", k: 0 }
  ]
};

// BLU-Taster mit vier Tasten.
//
// Bewusst kein Umschalten, sondern feste Absicht je Taste: Ein
// versehentlicher zweiter Druck auf "ein" laesst das Licht an, statt es
// wieder auszuschalten. Aus demselben Grund gilt jeder Druck - einfach,
// doppelt oder lang - als dieselbe Absicht.
let BLU_ID = 200;
let TASTEN = {
  0: { schalter: 200, wert: true },
  1: { schalter: 200, wert: false },
  2: { schalter: 201, wert: true },
  3: { schalter: 201, wert: false }
};

// Nacheinander, nicht auf einmal.
//
// Die Aufrufwarteschlange eines Shelly-Skripts ist kurz: Bei acht
// gleichzeitigen HTTP-Aufrufen kamen die letzten drei nie an - die
// Girlanden blieben dunkel, waehrend die fuenf Spots angingen. Jeder
// Aufruf loest deshalb im Rueckruf den naechsten aus.
function sendeAb(lampen, i, an, id) {
  if (i >= lampen.length) {
    print("Gruppe", id, an ? "ein" : "aus", "-", lampen.length, "Lampen");
    return;
  }
  let l = lampen[i];
  Shelly.call("HTTP.GET", {
    url: "http://" + l.ip + "/rpc/Switch.Set?id=" + JSON.stringify(l.k) +
         "&on=" + (an ? "true" : "false")
  }, function () {
    sendeAb(lampen, i + 1, an, id);
  });
}

function setzeGruppe(id, an) {
  let lampen = GRUPPEN[id];
  if (!lampen) return;
  sendeAb(lampen, 0, an, id);
}

// Aenderung an einem der drei Schalter: Lampen nachziehen.
Shelly.addStatusHandler(function (e) {
  if (!e.component) return;
  if (e.component.indexOf("boolean:") !== 0) return;
  if (!e.delta) return;
  if (typeof e.delta.value === "undefined") return;
  if (!GRUPPEN[e.id]) return;
  setzeGruppe(e.id, e.delta.value);
});

// Taster: Schalter setzen, nicht die Lampen. So laeuft alles ueber
// denselben Weg, und der Laptop sieht dieselbe Wahrheit.
Shelly.addEventHandler(function (e) {
  if (!e.component) return;
  if (e.component.indexOf("bthomedevice") !== 0) return;
  if (e.id !== BLU_ID) return;
  if (e.event !== "single_push" && e.event !== "double_push" &&
      e.event !== "triple_push" && e.event !== "long_push") return;

  let t = TASTEN[e.idx];
  if (!t) return;
  print("Taste", e.idx + 1, e.event, "->", t.wert ? "ein" : "aus");
  Shelly.call("Boolean.Set", { id: t.schalter, value: t.wert });
});

print("Lichtgruppen bereit");
