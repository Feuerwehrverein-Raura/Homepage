// Ob der Reiter "Organisator" erscheint.
//
// Externe Organisatoren (Anmeldung ueber `events/login`) immer. Mitglieder,
// wenn sie mindestens einen Anlass organisieren — das sagt
// `GET events/organized-by-me` (Entscheidung 2 in
// docs/flutter-mitglieder-app-plan.md).

import 'package:flutter/foundation.dart';
import 'package:fwv_core/fwv_core.dart';

class OrganisatorPruefung extends ChangeNotifier {
  OrganisatorPruefung(this._sitzung);

  final SitzungsVerwaltung _sitzung;
  bool _organisiert = false;

  bool get organisiert => _organisiert;

  /// Fragt das Backend (nur bei Mitgliedern). Ohne Netz bleibt der letzte
  /// Stand.
  Future<void> pruefen() async {
    final s = _sitzung.sitzung;
    bool neu;
    if (s == null) {
      neu = false;
    } else if (s.kontotyp == Kontotyp.organisator) {
      neu = true;
    } else {
      try {
        neu = await MitgliederDienst(_sitzung.api).organisiertAnlaesse();
      } on ApiFehler {
        neu = _organisiert;
      }
    }
    if (neu != _organisiert) {
      _organisiert = neu;
      notifyListeners();
    }
  }
}
