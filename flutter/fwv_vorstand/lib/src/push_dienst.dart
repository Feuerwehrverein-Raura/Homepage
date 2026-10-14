// App-Push an alle Mitglieder (api-events POST /push/broadcast, nur Vorstand).
// Das Backend leitet an api-members /internal/push-broadcast weiter (Kanal
// "general" - Mitglieder koennen ihn in der App abschalten).
//
// Optional [PushOeffnen]: wohin das Antippen in der Mitglieder-App fuehrt
// (Body `ziel`, `eventId`; api-events src/push-ziel.js). Ohne Ziel zeigt die
// App die Mitteilung nach dem Oeffnen nochmals als Dialog.

import 'package:fwv_core/fwv_core.dart';

/// Laengen wie im Formular der Website (vorstand.html, push-modal).
const pushTitelMax = 100;
const pushTextMax = 1000;

/// Ab hier schneiden die meisten Sperrbildschirme ab (Richtwert).
const pushTitelSichtbar = 50;
const pushTextSichtbar = 150;

/// Wohin das Antippen der Mitteilung in der Mitglieder-App fuehrt.
class PushOeffnen {
  const PushOeffnen._(this.ziel, {this.anlassId, this.anlassTitel});

  /// Kein Ziel: die App zeigt die Mitteilung nochmals an.
  static const nichts = PushOeffnen._(null);

  /// Reiter Profil.
  static const profil = PushOeffnen._('profil');

  /// Ein Anlass (UUID); der Titel nur fuer die Anzeige.
  const PushOeffnen.anlass(String id, {String? titel})
    : this._('anlass', anlassId: id, anlassTitel: titel);

  /// 'anlass', 'profil' oder null.
  final String? ziel;
  final String? anlassId;
  final String? anlassTitel;

  /// Felder fuer den Body (leer ohne Ziel).
  Map<String, String> get daten => {
    'ziel': ?ziel,
    'eventId': ?anlassId,
  };

  @override
  bool operator ==(Object other) =>
      other is PushOeffnen && other.ziel == ziel && other.anlassId == anlassId;

  @override
  int get hashCode => Object.hash(ziel, anlassId);

  @override
  String toString() => 'PushOeffnen($ziel, $anlassId)';
}

class PushAnAlleDienst {
  const PushAnAlleDienst(this.api);

  final ApiClient api;

  /// Schickt die Mitteilung an alle Geraete mit der App. Gibt die Zahl der
  /// zugestellten Geraete zurueck (`sent`), oder null, wenn das Backend
  /// keine Zahl nennt.
  Future<int?> anAlle({
    required String titel,
    required String text,
    PushOeffnen oeffnen = PushOeffnen.nichts,
  }) async {
    final antwort = await api.post(
      'push/broadcast',
      daten: {'title': titel.trim(), 'body': text.trim(), ...oeffnen.daten},
    );
    final gesendet = antwort is Map ? antwort['sent'] : null;
    return switch (gesendet) {
      num n => n.toInt(),
      String s => int.tryParse(s),
      _ => null,
    };
  }
}
