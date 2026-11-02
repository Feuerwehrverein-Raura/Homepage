// Bestellungen, wie GET /api/orders und die WebSocket-Nachrichten des
// order-backends (simple-order-system/backend) sie liefern. Weitere Felder
// des Servers (event_id, paid_amount, ...) werden ignoriert.
//
// Der Server ist nicht immer streng: items kann null sein, order_id kommt
// teils als Text ("7"), Zeiten ohne Zeitzone sind UTC.

/// Station dieses Displays: Kueche, Bar oder alles.
enum Station {
  kueche('kitchen', 'Küche'),
  bar('bar', 'Bar'),
  alle('all', 'Alle');

  const Station(this.kennung, this.text);

  /// Wert wie in der frueheren App und beim Server (printer_station).
  final String kennung;
  final String text;

  static Station? ausKennung(String? k) {
    for (final s in values) {
      if (s.kennung == k) return s;
    }
    return null;
  }
}

int? ganz(Object? v) => switch (v) {
  int i => i,
  num n => n.toInt(),
  String s => int.tryParse(s.trim()),
  _ => null,
};

double? zahl(Object? v) => switch (v) {
  num n => n.toDouble(),
  String s => double.tryParse(s.trim()),
  _ => null,
};

/// "2026-11-02T13:05:00.123Z" oder ohne Zone (dann UTC).
DateTime? zeitpunkt(Object? v) {
  if (v is! String || v.isEmpty) return null;
  final t = DateTime.tryParse(v);
  if (t == null) return null;
  return t.isUtc ? t : DateTime.utc(t.year, t.month, t.day, t.hour, t.minute, t.second, t.millisecond);
}

class Position {
  Position({
    required this.id,
    required this.name,
    required this.menge,
    this.notiz,
    this.station = 'bar',
    this.erledigt = false,
  });

  factory Position.ausJson(Map<String, dynamic> j) => Position(
    id: ganz(j['id']) ?? 0,
    name: '${j['item_name'] ?? ''}',
    menge: ganz(j['quantity']) ?? 1,
    notiz: (j['notes'] is String && (j['notes'] as String).trim().isNotEmpty)
        ? (j['notes'] as String).trim()
        : null,
    station: '${j['printer_station'] ?? 'bar'}',
    erledigt: j['completed'] == true,
  );

  final int id;
  final String name;
  final int menge;
  final String? notiz;

  /// printer_station des Servers: "kitchen" oder "bar".
  final String station;
  bool erledigt;

  bool get istBar => station.toLowerCase() == 'bar';

  bool gehoertZu(Station s) => s == Station.alle || station.toLowerCase() == s.kennung;

  /// Allergie-Hinweis in der Notiz (rot statt gelb).
  bool get allergie {
    final n = notiz?.toLowerCase();
    if (n == null) return false;
    return const ['allergi', 'laktose', 'gluten', 'nuss', 'vegan'].any(n.contains);
  }
}

class Bestellung {
  Bestellung({required this.id, required this.tisch, this.status, this.erstellt, List<Position>? positionen})
    : positionen = positionen ?? [];

  factory Bestellung.ausJson(Map<String, dynamic> j) => Bestellung(
    id: ganz(j['id']) ?? 0,
    tisch: ganz(j['table_number']) ?? 0,
    status: j['status'] is String ? j['status'] as String : null,
    erstellt: zeitpunkt(j['created_at']),
    positionen: [
      for (final p in (j['items'] is List ? j['items'] as List : const []))
        if (p is Map) Position.ausJson(Map<String, dynamic>.from(p)),
    ],
  );

  final int id;

  /// 0 = Theke
  final int tisch;
  final String? status;
  final DateTime? erstellt;
  final List<Position> positionen;

  String get ort => tisch == 0 ? 'Theke' : 'Tisch $tisch';

  /// Offen fuer die Kueche: ausstehend, bezahlt oder ohne Status.
  bool get offen => status == null || status == 'pending' || status == 'paid';

  int minuten(DateTime jetzt) {
    final e = erstellt;
    if (e == null) return 0;
    final m = jetzt.difference(e).inMinutes;
    return m < 0 ? 0 : m;
  }

  /// Nach 10 Minuten rot.
  bool dringend(DateTime jetzt) => minuten(jetzt) > 10;

  List<Position> fuer(Station s) => positionen.where((p) => p.gehoertZu(s)).toList();

  /// Gibt es fuer diese Station noch etwas zu tun?
  bool offenFuer(Station s) => positionen.any((p) => p.gehoertZu(s) && !p.erledigt);
}

/// Bon nicht gedruckt (print_failed): Station und Meldung des Druckers.
class Druckfehler {
  const Druckfehler({required this.bestellung, required this.station, required this.meldung});

  final int bestellung;
  final String station;
  final String meldung;

  String get stationText => switch (station.toLowerCase()) {
    'kitchen' => 'Küche',
    'bar' => 'Bar',
    _ => station,
  };
}

/// Nachricht ueber /ws.
sealed class WsNachricht {
  const WsNachricht();

  static WsNachricht? ausJson(Object? roh) {
    if (roh is! Map) return null;
    final j = Map<String, dynamic>.from(roh);
    final id = ganz(j['order_id']);
    switch (j['type']) {
      case 'new_order':
        final o = j['order'];
        return o is Map ? NeueBestellung(Bestellung.ausJson(Map<String, dynamic>.from(o))) : null;
      case 'order_completed':
        return id == null ? null : BestellungErledigt(id);
      case 'order_updated':
        return id == null
            ? null
            : BestellungGeaendert(id, j['status'] is String ? j['status'] as String : null);
      case 'items_completed':
        final ids = [for (final i in (j['item_ids'] is List ? j['item_ids'] as List : const [])) ?ganz(i)];
        return id == null ? null : PositionenErledigt(id, ids);
      case 'print_failed':
        if (id == null) return null;
        return Druckfehlermeldung([
          for (final f in (j['druckfehler'] is List ? j['druckfehler'] as List : const []))
            if (f is Map)
              Druckfehler(
                bestellung: id,
                station: '${f['station'] ?? ''}',
                meldung: '${f['meldung'] ?? 'Drucker antwortet nicht'}',
              ),
        ]);
    }
    return null;
  }
}

class NeueBestellung extends WsNachricht {
  const NeueBestellung(this.bestellung);
  final Bestellung bestellung;
}

class BestellungErledigt extends WsNachricht {
  const BestellungErledigt(this.id);
  final int id;
}

class BestellungGeaendert extends WsNachricht {
  const BestellungGeaendert(this.id, this.status);
  final int id;
  final String? status;
}

class PositionenErledigt extends WsNachricht {
  const PositionenErledigt(this.id, this.positionen);
  final int id;
  final List<int> positionen;
}

class Druckfehlermeldung extends WsNachricht {
  const Druckfehlermeldung(this.fehler);
  final List<Druckfehler> fehler;
}
