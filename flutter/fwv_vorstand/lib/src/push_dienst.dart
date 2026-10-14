// App-Push an alle Mitglieder (api-events POST /push/broadcast, nur Vorstand).
// Das Backend leitet an api-members /internal/push-broadcast weiter (Kanal
// "general" - Mitglieder koennen ihn in der App abschalten).

import 'package:fwv_core/fwv_core.dart';

/// Laengen wie im Formular der Website (vorstand.html, push-modal).
const pushTitelMax = 100;
const pushTextMax = 1000;

/// Ab hier schneiden die meisten Sperrbildschirme ab (Richtwert).
const pushTitelSichtbar = 50;
const pushTextSichtbar = 150;

class PushAnAlleDienst {
  const PushAnAlleDienst(this.api);

  final ApiClient api;

  /// Schickt die Mitteilung an alle Geraete mit der App. Gibt die Zahl der
  /// zugestellten Geraete zurueck (`sent`), oder null, wenn das Backend
  /// keine Zahl nennt.
  Future<int?> anAlle({required String titel, required String text}) async {
    final antwort = await api.post(
      'push/broadcast',
      daten: {'title': titel.trim(), 'body': text.trim()},
    );
    final gesendet = antwort is Map ? antwort['sent'] : null;
    return switch (gesendet) {
      num n => n.toInt(),
      String s => int.tryParse(s),
      _ => null,
    };
  }
}
