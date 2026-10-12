// Ob der Reiter "Schopf" wegen einer Schicht erscheint.
//
// Ueber die Gruppen (Roter Schopf, Vorstand, admin) entscheidet die App
// selbst. Ohne Gruppe fragt sie den Server: Wer eine bestaetigte Schicht hat,
// darf von 1 Stunde vor Beginn bis 1 Stunde nach Ende hinein
// (GET kiosk/roter-schopf/zugang, api-members src/schicht-zugang.js). Der
// Server prueft das ohnehin bei jedem Zugriff - die App blendet nur den
// Reiter ein und wieder aus.
//
// Nachgefragt wird beim Start, danach alle 10 Minuten und genau zum Ende
// des Zugangs.

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:fwv_roterschopf/fwv_roterschopf.dart';

class SchopfPruefung extends ChangeNotifier {
  SchopfPruefung(
    this._sitzung,
    this._zugang, {
    DateTime Function()? jetzt,
    this.takt = const Duration(minutes: 10),
  }) : _jetzt = jetzt ?? DateTime.now;

  final SitzungsVerwaltung _sitzung;
  final RoterSchopfZugang Function() _zugang;
  final DateTime Function() _jetzt;

  /// Wie oft ohne Schicht nachgefragt wird (null in Tests: nie von selbst).
  final Duration? takt;

  SchopfFreigabe _freigabe = SchopfFreigabe.keine;
  Timer? _wecker;

  /// Die Schicht, die gerade Zugang gibt - nur wenn nicht schon die Gruppe.
  SchopfFreigabe? get schicht {
    final f = _freigabe;
    if (!f.zugang || !f.ueberSchicht) return null;
    final bis = f.bis;
    return bis == null || _jetzt().isBefore(bis) ? f : null;
  }

  Future<void> pruefen() async {
    _wecker?.cancel();
    final s = _sitzung.sitzung;
    var neu = SchopfFreigabe.keine;
    if (s != null && s.kontotyp == Kontotyp.mitglied && !hatRoterSchopfZugang(s)) {
      try {
        neu = await _zugang().freigabe();
      } on ApiFehler {
        neu = _freigabe; // ohne Netz bleibt der letzte Stand
      }
    }
    // Immer melden: Auch ohne neue Antwort kann die Zeit abgelaufen sein.
    _freigabe = neu;
    notifyListeners();
    _weckerStellen();
  }

  void _weckerStellen() {
    final bis = schicht?.bis;
    Duration? warten = takt;
    if (bis != null) {
      // Kurz nach dem Ende nochmals fragen - vielleicht folgt gleich die
      // naechste Schicht.
      final bisEnde = bis.difference(_jetzt()) + const Duration(seconds: 5);
      warten = warten == null || bisEnde < warten ? bisEnde : warten;
    }
    if (warten != null) _wecker = Timer(warten, pruefen);
  }

  @override
  void dispose() {
    _wecker?.cancel();
    super.dispose();
  }
}
