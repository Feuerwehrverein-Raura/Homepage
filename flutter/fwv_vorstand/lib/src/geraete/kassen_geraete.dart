// Kassen-Geraete und Kassen-Anmeldebon (vorstand.html, App-QR-Fenster):
// api-members leitet an das order-backend weiter
// (docker/backend-members/src/index.js, simple-order-system/backend/src/
// geraete.ts und kassenbon.ts).
//
// * GET /vorstand/kassen-geraete: {modus: an|aus, geraete: [...]}
// * PUT /vorstand/kassen-geraete/:id {freigegeben?, gesperrt?, name?}
// * PUT /vorstand/kassen-geraete/modus {an}: ist die Freigabe an, buchen
//   und bezahlen nur freigegebene Geraete (die Kueche ist nicht betroffen).
// * POST /vorstand/kassenbon: druckt am Bondrucker einen QR-Bon, mit dem
//   sich ein Kassen-/Kuechengeraet einmal (1 h) anmeldet.

import 'package:fwv_core/fwv_core.dart';

import '../zeit.dart';

enum KassenGeraetStand {
  neu('neu'),
  freigegeben('freigegeben'),
  gesperrt('gesperrt');

  const KassenGeraetStand(this.text);

  final String text;
}

class KassenGeraet {
  const KassenGeraet({
    required this.id,
    required this.code,
    this.name,
    this.typ,
    this.zuletzt,
    this.freigegeben = false,
    this.gesperrt = false,
  });

  factory KassenGeraet.ausJson(Map<String, dynamic> j) => KassenGeraet(
    id: jsonText(j['id']) ?? '',
    code: jsonText(j['code']) ?? '',
    name: jsonText(j['name']),
    typ: jsonText(j['typ']),
    zuletzt: utcZeitpunkt(j['zuletzt']),
    freigegeben: jsonWahr(j['freigegeben']) ?? false,
    gesperrt: jsonWahr(j['gesperrt']) ?? false,
  );

  final String id;

  /// Kurzcode, den die Kasse selbst anzeigt (App: Menue, Web: Einstellungen).
  final String code;
  final String? name;

  /// `app` (Kassen-App) oder `pwa` (Web-Kasse).
  final String? typ;
  final DateTime? zuletzt;
  final bool freigegeben;
  final bool gesperrt;

  KassenGeraetStand get stand => gesperrt
      ? KassenGeraetStand.gesperrt
      : freigegeben
      ? KassenGeraetStand.freigegeben
      : KassenGeraetStand.neu;

  String get typText => switch (typ) {
    'app' => 'App',
    'pwa' => 'Web-Kasse',
    _ => 'Kasse',
  };
}

typedef KassenGeraeteStand = ({bool freigabeAn, List<KassenGeraet> geraete});

/// Antwort von POST /vorstand/kassenbon. [warteschlange]: der Bon geht an
/// den Bar-Drucker im Schopf (T400) und kommt in wenigen Sekunden.
typedef Kassenbon = ({DateTime? giltBis, bool warteschlange});

class KassenGeraeteDienst {
  const KassenGeraeteDienst(this.api);

  final ApiClient api;

  Future<KassenGeraeteStand> laden() async {
    final j = await api.get('vorstand/kassen-geraete');
    final m = j is Map ? j : const {};
    return (
      freigabeAn: jsonText(m['modus']) == 'an',
      geraete: jsonListe(m['geraete'], KassenGeraet.ausJson),
    );
  }

  Future<void> freigeben(String id) => _aendern(id, {'freigegeben': true, 'gesperrt': false});

  Future<void> sperren(String id) => _aendern(id, {'gesperrt': true});

  Future<void> umbenennen(String id, String name) => _aendern(id, {'name': name.trim()});

  Future<void> _aendern(String id, Map<String, Object> daten) =>
      api.put('vorstand/kassen-geraete/${Uri.encodeComponent(id)}', daten: daten);

  Future<void> freigabeSetzen({required bool an}) =>
      api.put('vorstand/kassen-geraete/modus', daten: {'an': an});

  /// Druckt den Bon; der Drucker braucht etwas laenger.
  Future<Kassenbon> anmeldebon() async {
    final j = await api.post('vorstand/kassenbon', zeitlimit: const Duration(seconds: 45));
    final m = j is Map ? j : const {};
    return (
      giltBis: utcZeitpunkt(m['gilt_bis']),
      warteschlange: jsonWahr(m['warteschlange']) ?? false,
    );
  }
}
