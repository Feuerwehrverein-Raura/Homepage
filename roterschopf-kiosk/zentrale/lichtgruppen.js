// Lichtgruppen Roter Schopf
//
// Zwei Gruppen, je ein virtueller Schalter auf dieser Zentrale:
//
//     boolean:200  Spots (die Girlanden gehoeren dazu)
//     boolean:201  Arbeitsleuchten
//
// boolean:202 "Girlanden" ist keine eigene Gruppe mehr und wird nicht
// beachtet.
//
// Die Lampen haengen am eigenen Zugangspunkt dieses Geraets
// (192.168.33.0/24) und sind von hier direkt erreichbar.
//
// Nur ASCII in dieser Datei: Der JSON-Parser des Geraets stolpert ueber
// mehrbyteige Zeichen, sobald eines an einer Stueckgrenze landet.
//
// Fassung 12.10.2026. Was die vorige falsch machte:
//
// * Der Taster setzte nur den Schalter, und die Lampen folgten erst bei
//   einer Aenderung. Stand der Schalter schon auf "aus", die Lampen
//   brannten aber (nach der Sicherung starten die Arbeitsleuchten mit
//   "ein"), tat "aus" gar nichts. Jetzt schaltet der Taster die Lampen
//   immer.
// * Eine verlorene Anfrage blieb verloren. Jetzt wird jede geprueft und
//   bis zu dreimal versucht.
// * Der Schalter wusste nichts vom wirklichen Zustand. Jetzt wird er alle
//   zwei Minuten nach den Lampen gestellt, damit auch die Lichtseite am
//   Laptop wieder in beide Richtungen schalten kann.

let GRUPPEN = {
  // Zuerst die direkt geschalteten Lampen: Sie haengen nicht an den
  // Sicherungen der Regler und sollen sofort reagieren, auch wenn die
  // Regler gerade stromlos sind.
  200: [
    // Die Girlanden laufen mit den Spots: Am Taster ist das eine Stimmung
    // und kein zweiter Handgriff.
    { ip: "192.168.33.12", k: 0 },
    { ip: "192.168.33.13", k: 0 },
    { ip: "192.168.33.4", k: 1 },
    { ip: "192.168.33.5", k: 0 },
    { ip: "192.168.33.5", k: 1 },
    { ip: "192.168.33.6", k: 0 },
    { ip: "192.168.33.7", k: 0 },
    { ip: "192.168.33.8", k: 1 }
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
//
// Belegung am 12.10.2026 vor Ort ausprobiert: idx 0/1 sind an der Wand
// die Arbeitsleuchten (ein/aus), idx 2/3 die Spots.
let TASTEN = {
  0: { gruppe: 201, an: true },   // Arbeitsleuchten ein
  1: { gruppe: 201, an: false },  // Arbeitsleuchten aus ("Licht aus")
  2: { gruppe: 200, an: true },   // Spots ein
  3: { gruppe: 200, an: false }   // Spots aus
};

// Ein Druck schaltet jede Lampe genau einmal (Zeitlimit 2 s). Was fehlt,
// wird danach alle 10 s nachgefasst, hoechstens 30 min.
//
// Antwortet ein Regler nicht, gilt er fuer BEIDE Gruppen als tot und wird
// bis zum naechsten Nachfass-Takt (hoechstens 10 s) sofort uebersprungen,
// statt erneut abgewartet zu werden. Frueher wartete die
// Zentrale bei ausgeschalteter Sicherung je toter Lampe dreimal 3 s - fast
// eine Minute, bevor die Girlande Raum drankam, und ein neuer Druck fing
// wieder von vorn an.
//
// Nachgefasst werden nur die fehlenden Lampen, nie die ganze Gruppe - wer
// eine Lampe in der App bewusst umlegt, wird nicht ueberstimmt. Ein neuer
// Druck ersetzt das Nachfassen der Gruppe.
let ZEITLIMIT = 2;          // Sekunden je Anfrage
let ABGLEICH_MS = 120000;   // Schalter nach den Lampen stellen
let NACHFASSEN_MS = 10000;
let NACHFASSEN_RUNDEN = 180;

// Eine Warteschlange, ein Arbeiter: Es ist immer hoechstens EINE
// HTTP-Anfrage unterwegs. Das Geraet erlaubt nur wenige gleichzeitige
// Aufrufe; bei schnell gedrueckten Tasten liefen frueher mehrere
// Durchgaenge nebeneinander, und das Skript brach mit "Too many calls in
// progress" ab und blieb stehen.
//
// Je Gruppe gilt nur der letzte Wunsch. Ein neuer Druck setzt die Gruppe
// auf Anfang; die gerade laufende Anfrage darf zu Ende laufen, ihr
// Ergebnis wird dann verworfen (Nummer passt nicht mehr). Ein frischer
// Druck geht vor dem Nachfassen.
function neuerJob() {
  return { an: false, liste: [], i: 0, fehlend: [], rest: 0, nr: 0,
           offen: false, frisch: false, prio: 0 };
}
let job = { 200: neuerJob(), 201: neuerJob() };
let beschaeftigt = false;
let tot = {};        // IP -> true, geleert im Nachfass-Takt
let druecke = 0;     // der neueste Druck kommt zuerst dran

// Abgleich als eigener, niedrigerer Auftrag.
let abgleich = { offen: false, id: 200, i: 0, an: 0, aus: 0 };

// Setzt dieses Skript selbst einen Schalter, darf der Status-Handler das
// nicht als neuen Wunsch lesen und die Gruppe noch einmal schalten.
let eigenerWert = { 200: null, 201: null };

function url(l, pfad) {
  return "http://" + l.ip + "/rpc/" + pfad;
}

function rufe(methode, param, cb) {
  try {
    Shelly.call(methode, param, cb);
    return true;
  } catch (err) {
    print("Aufruf abgelehnt:", methode);
    return false;
  }
}

function setzeSchalter(id, an) {
  let s = Shelly.getComponentStatus("boolean:" + JSON.stringify(id));
  if (s && s.value === an) return;
  eigenerWert[id] = an;
  rufe("Boolean.Set", { id: id, value: an });
}

function weiter() {
  if (beschaeftigt) return;
  // Frische Druecke vor Nachfassen, unter ihnen der neueste zuerst.
  let a = job[200];
  let b = job[201];
  let id = null;
  if (a.offen && a.frisch && (!b.offen || !b.frisch || a.prio > b.prio)) id = 200;
  else if (b.offen && b.frisch) id = 201;
  else if (a.offen) id = 200;
  else if (b.offen) id = 201;
  if (id !== null) return schalteNaechste(id);
  if (abgleich.offen) return misseNaechste();
}

function rundeFertig(id) {
  let j = job[id];
  let n = GRUPPEN[id].length;
  let vorher = j.liste.length;
  let warFrisch = j.frisch;
  j.offen = false;
  j.frisch = false;
  if (warFrisch) {
    print("Gruppe", id, j.an ? "ein" : "aus", "-", n - j.fehlend.length,
          "von", n, "Lampen");
    if (j.fehlend.length > 0) {
      print("Fasse nach: Gruppe", id, "-", j.fehlend.length, "Lampen");
    }
  } else if (j.fehlend.length < vorher) {
    print("Nachgefasst: Gruppe", id, "-", vorher - j.fehlend.length,
          "Lampen jetzt richtig,", j.fehlend.length, "fehlen noch");
  }
}

function schalteNaechste(id) {
  let j = job[id];
  let lampen = GRUPPEN[id];
  // Uebersprungene Lampen ohne Anfrage abhaken.
  while (j.i < j.liste.length && tot[lampen[j.liste[j.i]].ip]) {
    j.fehlend.push(j.liste[j.i]);
    j.i++;
  }
  if (j.i >= j.liste.length) {
    rundeFertig(id);
    return weiter();
  }
  let idx = j.liste[j.i];
  let l = lampen[idx];
  let nr = j.nr;
  beschaeftigt = true;
  let ok = rufe("HTTP.GET", {
    url: url(l, "Switch.Set?id=" + JSON.stringify(l.k) +
                "&on=" + (j.an ? "true" : "false")),
    timeout: ZEITLIMIT
  }, function (res, err) {
    beschaeftigt = false;
    if (j.nr === nr) {
      if (!(err === 0 && res && res.code === 200)) {
        if (j.frisch) print("Nicht erreicht:", l.ip);
        tot[l.ip] = true;
        j.fehlend.push(idx);
      }
      j.i++;
    }
    weiter();
  });
  if (!ok) {
    beschaeftigt = false;
    Timer.set(500, false, weiter);
  }
}

function schalteGruppe(id, an, woher) {
  if (!GRUPPEN[id]) return;
  let j = job[id];
  // Derselbe Wunsch, waehrend er noch frisch ausgefuehrt wird: nichts Neues.
  if (j.offen && j.frisch && j.an === an) return;
  print(woher, "-> Gruppe", id, an ? "ein" : "aus");
  j.nr++;
  j.an = an;
  j.liste = [];
  for (let n = 0; n < GRUPPEN[id].length; n++) j.liste.push(n);
  j.i = 0;
  j.fehlend = [];
  j.rest = NACHFASSEN_RUNDEN;
  j.prio = ++druecke;
  j.frisch = true;
  j.offen = true;
  setzeSchalter(id, an);
  weiter();
}

function fasseNach() {
  tot = {};
  for (let id in job) {
    let j = job[id];
    if (j.offen || j.fehlend.length === 0) continue;
    if (j.rest <= 0) {
      print("Gebe auf nach 30 min: Gruppe", id, "-", j.fehlend.length,
            "Lampen nicht erreicht");
      j.fehlend = [];
      continue;
    }
    j.rest--;
    j.liste = j.fehlend;
    j.fehlend = [];
    j.i = 0;
    j.frisch = false;
    j.offen = true;
  }
  weiter();
}

// Abgleich: Brennen alle erreichbaren Lampen einer Gruppe, steht der
// Schalter auf ein; sind alle aus, auf aus. Gemischt bleibt er, wie er
// ist. Laeuft nur, wenn nichts geschaltet wird; ein Druck unterbricht
// ihn, dann beginnt er beim naechsten Mal von vorn.
function starteAbgleich() {
  if (abgleich.offen) return;
  abgleich.offen = true;
  abgleich.id = 200;
  abgleich.i = 0;
  abgleich.an = 0;
  abgleich.aus = 0;
  weiter();
}

function misseNaechste() {
  let a = abgleich;
  let lampen = GRUPPEN[a.id];
  if (a.i >= lampen.length) {
    if (a.an > 0 && a.aus === 0) setzeSchalter(a.id, true);
    if (a.aus > 0 && a.an === 0) setzeSchalter(a.id, false);
    if (a.id === 200) {
      a.id = 201; a.i = 0; a.an = 0; a.aus = 0;
    } else {
      a.offen = false;
      return;
    }
    return weiter();
  }
  let l = lampen[a.i];
  beschaeftigt = true;
  let ok = rufe("HTTP.GET", {
    url: url(l, "Switch.GetStatus?id=" + JSON.stringify(l.k)),
    timeout: ZEITLIMIT
  }, function (res, err) {
    beschaeftigt = false;
    if (job[200].offen || job[201].offen) {
      // Es wird geschaltet - Messung waere halbfertig. Neu anfangen.
      a.offen = false;
    } else {
      if (err === 0 && res && res.code === 200) {
        let st = JSON.parse(res.body);
        if (st.output) a.an++; else a.aus++;
      }
      a.i++;
    }
    weiter();
  });
  if (!ok) {
    beschaeftigt = false;
    a.offen = false;
  }
}

// Wunsch von aussen, etwa von der Lichtseite auf dem Laptop.
Shelly.addStatusHandler(function (e) {
  if (!e.component) return;
  if (e.component.indexOf("boolean:") !== 0) return;
  if (!e.delta || typeof e.delta.value === "undefined") return;
  if (!GRUPPEN[e.id]) return;
  if (eigenerWert[e.id] === e.delta.value) {
    eigenerWert[e.id] = null;
    return;
  }
  eigenerWert[e.id] = null;
  schalteGruppe(e.id, e.delta.value, "Schalter");
});

// Taster: schaltet die Lampen immer, auch wenn der Schalter schon auf
// dem Zielwert steht.
//
// Ereignis und Taste stehen in e.info, nicht in e selbst. Die vorige
// Fassung las e.event und e.idx - beide leer - und hat deshalb nie auf
// einen Druck reagiert.
Shelly.addEventHandler(function (e) {
  if (!e.component) return;
  if (e.component.indexOf("bthomedevice") !== 0) return;
  if (e.id !== BLU_ID) return;
  let info = e.info || e;
  let ev = info.event;
  if (ev !== "single_push" && ev !== "double_push" &&
      ev !== "triple_push" && ev !== "long_push") return;
  let t = TASTEN[info.idx];
  if (!t) return;
  schalteGruppe(t.gruppe, t.an, "Taste " + JSON.stringify(info.idx + 1));
});

// Erzwingen von aussen: /script/<id>/gruppe?id=200&an=true
// Schaltet wie der Taster, auch ohne Aenderung am Schalter.
HTTPServer.registerEndpoint("gruppe", function (req, antwort) {
  let q = req.query || "";
  let id = null;
  let an = null;
  let teile = q.split("&");
  for (let i = 0; i < teile.length; i++) {
    let kv = teile[i].split("=");
    if (kv[0] === "id") id = JSON.parse(kv[1]);
    if (kv[0] === "an") an = kv[1] === "true";
  }
  if (!GRUPPEN[id] || an === null) {
    antwort.code = 400;
    antwort.body = "id=200|201 und an=true|false";
    antwort.send();
    return;
  }
  schalteGruppe(id, an, "HTTP");
  antwort.code = 200;
  antwort.body = "ok";
  antwort.send();
});

Timer.set(ABGLEICH_MS, true, starteAbgleich);
Timer.set(NACHFASSEN_MS, true, fasseNach);
Timer.set(20000, false, starteAbgleich);

print("Lichtgruppen bereit");
