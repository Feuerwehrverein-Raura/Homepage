// Zugang zum Roten Schopf — die einzige Stelle, ueber die die Oberflaeche
// dieses Pakets mit dem Backend spricht (wie LagerZugang in fwv_lager).
// Die Screens kennen keine Routen.
//
// Heute gibt es einen Zugang: [ApiRoterSchopfZugang] auf api-members
// (https://api.fwv-raura.ch/kiosk/roter-schopf). Der Server erreicht das
// Vereinslokal ueber den WireGuard-Tunnel.

import 'package:fwv_core/fwv_core.dart';

import 'modelle.dart';

/// Authentik-Gruppen, die Licht schalten und die Tiefkuehler sehen
/// (Gross-/Kleinschreibung egal). Dieselbe Regel prueft api-members
/// (src/roter-schopf.js) — die App entscheidet damit nur, ob sie den
/// Reiter zeigt.
const roterSchopfGruppen = ['Roter Schopf', 'Vorstand', 'admin'];

/// Darf diese Sitzung ueber ihre Gruppen in den Roten Schopf? Ueber
/// Authentik oder per QR-Code angemeldet gleich (die Gruppen stehen in
/// beiden Tokens); externe Organisatoren nie. Wer gerade Schicht hat, darf
/// auch ohne Gruppe - das sagt erst der Server ([RoterSchopfZugang.freigabe]).
bool hatRoterSchopfZugang(Sitzung? sitzung) => sitzung?.hatGruppe(roterSchopfGruppen) ?? false;

abstract class RoterSchopfZugang {
  const RoterSchopfZugang();

  /// Lampen, Lichtgruppen und Tiefkuehler.
  Future<RoterSchopfZustand> zustand();

  /// Schaltet eine Gruppe ("gruppe:spots") oder eine Lampe
  /// ("192.168.33.4:1"). Wirft [ApiFehler], wenn es nicht ging.
  Future<void> schalten(String kennung, {required bool an});

  /// Darf ich gerade in den Roten Schopf (Gruppe oder Schicht)?
  Future<SchopfFreigabe> freigabe();

  /// SMS-Alarm der Tiefkuehler (Gruppe Roter Schopf, Vorstand, admin).
  Future<KuehlerAlarm> kuehlerAlarm() => throw UnsupportedError('Kein SMS-Alarm');

  /// Scharf stellen, oder entschaerfen fuer [stunden] (null: bis von Hand).
  Future<KuehlerAlarm> kuehlerAlarmSetzen({required bool scharf, int? stunden}) =>
      throw UnsupportedError('Kein SMS-Alarm');
}

class ApiRoterSchopfZugang extends RoterSchopfZugang {
  const ApiRoterSchopfZugang(this.api);

  /// `SitzungsVerwaltung.api` (api-members).
  final ApiClient api;

  @override
  Future<RoterSchopfZustand> zustand() async {
    final json = await api.get('kiosk/roter-schopf');
    if (json is! Map) throw const FormatException('Unerwartete Antwort vom Server.');
    return RoterSchopfZustand.ausJson(Map<String, dynamic>.from(json));
  }

  @override
  Future<void> schalten(String kennung, {required bool an}) async {
    await api.post('kiosk/roter-schopf/licht', daten: {'kennung': kennung, 'an': an});
  }

  @override
  Future<SchopfFreigabe> freigabe() async =>
      SchopfFreigabe.ausJson(await api.get('kiosk/roter-schopf/zugang'));

  @override
  Future<KuehlerAlarm> kuehlerAlarm() async =>
      KuehlerAlarm.ausJson(await api.get('kiosk/kuehler-alarm'));

  @override
  Future<KuehlerAlarm> kuehlerAlarmSetzen({required bool scharf, int? stunden}) async =>
      KuehlerAlarm.ausJson(
        await api.put('kiosk/kuehler-alarm', daten: {'scharf': scharf, 'stunden': stunden}),
      );
}
