// Tiefkuehl-Waechter
//
// Laeuft auf dem Shelly 1PM Gen4 eines Tiefkuehlers (Relais = Strom des
// Geraets, DS18B20 am Addon = temperature:100).
//
// Ist das Relais aus und es wird zu warm, schaltet das Skript es wieder
// ein. Liefert der Fuehler nichts mehr, ebenfalls: Im Zweifel soll der
// Tiefkuehler laufen. Es schaltet nur ein, nie aus.
//
// Zusaetzlich steht auf dem Geraet auto_on nach 60 s und initial_state
// "on". Das Skript ist das zweite Netz, falls jemand auto_on abschaltet,
// um das Geraet laenger aus zu lassen.
//
// Nur ASCII in dieser Datei: Der JSON-Parser des Geraets stolpert ueber
// mehrbyteige Zeichen, sobald eines an einer Stueckgrenze landet.

let GRENZE_C = -12;      // waermer als das und aus -> einschalten
let PRUEFEN_MS = 60000;  // zusaetzlich jede Minute

function pruefe(grund) {
  let s = Shelly.getComponentStatus("switch:0");
  if (!s || s.output) return;
  let t = Shelly.getComponentStatus("temperature:100");
  let tc = t ? t.tC : null;
  if (tc === null || typeof tc === "undefined") {
    print("Fuehler liefert nichts, Relais ein -", grund);
  } else if (tc > GRENZE_C) {
    print("Zu warm:", tc, "C ueber", GRENZE_C, "C, Relais ein -", grund);
  } else {
    return;
  }
  Shelly.call("Switch.Set", { id: 0, on: true });
}

Shelly.addStatusHandler(function (e) {
  if (e.component === "temperature:100" || e.component === "switch:0") {
    pruefe(e.component);
  }
});

Timer.set(PRUEFEN_MS, true, function () {
  pruefe("Takt");
});

pruefe("Start");
print("Tiefkuehl-Waechter bereit, Grenze", GRENZE_C, "C");
