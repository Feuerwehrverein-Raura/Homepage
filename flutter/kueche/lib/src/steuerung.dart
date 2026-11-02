// Steuerung der Anzeige - Verhalten wie die fruehere native App (kds-v3.x),
// damit niemand mehr von Hand neu laden muss:
//
// - WebSocket mit Ping und Neuverbindung (3 s .. 60 s), dazu alle 30 s alle
//   Bestellungen abrufen als Rueckfallebene.
// - Waechter alle 15 s: seit 60 s nichts vom Server -> Leiste «Keine
//   Verbindung», Server neu suchen, neu verbinden. Seit 10 min nichts ->
//   alles verwerfen und frisch aufbauen.
// - Alle 20 s den T400 im Schopf suchen: hin sofort, zurueck in die Cloud
//   erst nach zwei Fehlschlaegen.
// - Token stuendlich pruefen und taeglich erneuern (gegen die Cloud: der
//   T400 hat ein anderes Geheimnis). Lehnt der Server es ab, erst erneuern,
//   und nur wenn das scheitert zur Anmeldung.
// - Neu: Bon nicht gedruckt (print_failed) zeigt eine Leiste.

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';

import 'geraet.dart';
import 'modelle.dart';
import 'netz.dart';
import 'token.dart';

typedef SystemFabrik = Bestellsystem Function(String url, String? token);

class AnzeigeSteuerung extends ChangeNotifier {
  AnzeigeSteuerung({
    required this.einstellungen,
    required this.system,
    required this.live,
    required this.vorOrt,
    required this.erneuern,
    required this.abgemeldet,
    this.ton,
    this.updateSuche,
    DateTime Function()? jetzt,
  }) : jetzt = jetzt ?? DateTime.now,
       station = einstellungen.station ?? Station.kueche;

  final Einstellungen einstellungen;
  final SystemFabrik system;
  final LiveVerbinder live;
  final Future<bool> Function() vorOrt;
  final Future<AuthErgebnis> Function(String url, String token) erneuern;

  /// Zur Anmeldung, mit Hinweis.
  final void Function(String hinweis) abgemeldet;
  final Future<void> Function()? ton;
  final Future<NeueVersion?> Function()? updateSuche;
  final DateTime Function() jetzt;

  static const abrufTakt = Duration(seconds: 30);
  static const ortTakt = Duration(seconds: 20);
  static const wachTakt = Duration(seconds: 15);
  static const still = Duration(seconds: 60);
  static const neuAufbau = Duration(minutes: 10);
  static const tokenTakt = Duration(hours: 1);
  static const updateTakt = Duration(hours: 2);

  static const hinweisAbgelaufen =
      'Die Anmeldung ist abgelaufen (Display war länger als 30 Tage offline). '
      'Bitte einmal das aktuelle Passwort eingeben.';
  static const hinweisAbgelehnt =
      'Der Server hat die Anmeldung nicht mehr akzeptiert. Bitte einmal das aktuelle Passwort eingeben.';

  // --- Zustand fuer die Oberflaeche ---------------------------------------

  Station station;
  final _bestellungen = <Bestellung>[];
  String serverUrl = '';
  bool verbunden = false;
  bool blitz = false;
  final druckfehler = <Druckfehler>[];
  NeueVersion? update;

  bool get vorOrtVerbunden => serverUrl == lokalUrl;

  /// Bestellungen mit offenen Positionen fuer die gewaehlte Station.
  List<Bestellung> get sichtbar =>
      _bestellungen.where((b) => b.offenFuer(station)).toList()..sort((a, b) => a.id.compareTo(b.id));

  /// Text der roten Leiste oder null.
  String? get warnung {
    final s = jetzt().difference(_letzterErfolg);
    if (s > still) {
      return 'Keine Verbindung zum Bestellsystem (seit ${s.inMinutes} min) – versuche erneut …';
    }
    return null;
  }

  // --- Ablauf -------------------------------------------------------------

  bool _laeuft = false;
  late DateTime _letzterErfolg;
  late DateTime _gestartet;
  DateTime _letzteNeuverbindung = DateTime.fromMillisecondsSinceEpoch(0);
  final _timer = <Timer>[];
  Bestellsystem? _system;
  LiveVerbindung? _live;
  int _generation = 0;
  int _ortFehler = 0;
  bool _authLaeuft = false;

  void starten() {
    if (_laeuft) return;
    _laeuft = true;
    _gestartet = jetzt();
    _letzterErfolg = _gestartet;
    serverUrl = einstellungen.serverUrl;
    _verbinden(serverUrl);
    unawaited(_ortPruefen(sofort: true));
    _timer
      ..add(Timer.periodic(abrufTakt, (_) => abrufen()))
      ..add(Timer.periodic(ortTakt, (_) => _ortPruefen()))
      ..add(Timer.periodic(wachTakt, (_) => _wachen()))
      ..add(Timer.periodic(const Duration(minutes: 1), (_) => notifyListeners())) // Minuten
      ..add(Timer(const Duration(seconds: 5), _tokenPruefen))
      ..add(Timer.periodic(tokenTakt, (_) => _tokenPruefen()))
      ..add(Timer(const Duration(seconds: 15), _updateSuchen))
      ..add(Timer.periodic(updateTakt, (_) => _updateSuchen()));
  }

  void stoppen() {
    _laeuft = false;
    for (final t in _timer) {
      t.cancel();
    }
    _timer.clear();
    _generation++;
    _live?.schliessen();
    _live = null;
    verbunden = false;
  }

  @override
  void dispose() {
    stoppen();
    super.dispose();
  }

  void _erfolg() {
    final war = warnung;
    _letzterErfolg = jetzt();
    if (war != null) notifyListeners();
  }

  void _verbinden(String url) {
    serverUrl = url;
    _system = system(url, einstellungen.token);
    _live?.schliessen();
    _live = null;
    verbunden = false;
    unawaited(_liveSchleife(++_generation, url));
    unawaited(abrufen());
    notifyListeners();
  }

  Future<void> _liveSchleife(int gen, String url) async {
    var pause = const Duration(seconds: 3);
    while (_laeuft && gen == _generation) {
      try {
        final v = await live(url, einstellungen.token);
        if (!_laeuft || gen != _generation) {
          v.schliessen();
          return;
        }
        _live = v;
        verbunden = true;
        pause = const Duration(seconds: 3);
        _erfolg();
        notifyListeners();
        unawaited(abrufen());
        await for (final n in v.nachrichten) {
          if (gen != _generation) break;
          _erfolg();
          if (n != null) _nachricht(n);
        }
      } on Object catch (e) {
        debugPrint('WebSocket: $e');
      }
      if (gen != _generation) return;
      verbunden = false;
      notifyListeners();
      await Future<void>.delayed(pause);
      pause = Duration(seconds: math.min(pause.inSeconds * 2, 60));
    }
  }

  Future<void> abrufen() async {
    final s = _system;
    if (s == null || !_laeuft) return;
    try {
      final liste = await s.bestellungen();
      if (!identical(s, _system)) return;
      _erfolg();
      _bestellungen
        ..clear()
        ..addAll(liste.where((b) => b.offen));
      notifyListeners();
    } on AnmeldungAbgelehnt {
      unawaited(_anmeldungAbgelehnt());
    } on Object catch (e) {
      debugPrint('Abruf: $e');
      notifyListeners();
    }
  }

  void _nachricht(WsNachricht n) {
    switch (n) {
      case NeueBestellung(:final bestellung):
        if (_bestellungen.any((b) => b.id == bestellung.id)) return;
        _bestellungen.add(bestellung);
        if (bestellung.offenFuer(station)) _melden();
      case BestellungErledigt(:final id):
        _bestellungen.removeWhere((b) => b.id == id);
      case BestellungGeaendert(:final id, :final status):
        // Wie die Web-Anzeige: im Zweifel frisch abrufen
        if (status == 'completed' || status == 'cancelled') _bestellungen.removeWhere((b) => b.id == id);
        unawaited(abrufen());
      case PositionenErledigt(:final id, :final positionen):
        // Eine andere Anzeige (z.B. die Bar) hat Positionen erledigt
        for (final b in _bestellungen.where((b) => b.id == id)) {
          for (final p in b.positionen) {
            if (positionen.contains(p.id)) p.erledigt = true;
          }
        }
      case Druckfehlermeldung(:final fehler):
        druckfehler.addAll(
          fehler.where((f) => station == Station.alle || f.station.toLowerCase() == station.kennung),
        );
    }
    notifyListeners();
  }

  void _melden() {
    if (einstellungen.ton) unawaited(ton?.call());
    blitz = true;
    Timer(const Duration(milliseconds: 200), () {
      blitz = false;
      notifyListeners();
    });
  }

  Future<void> _ortPruefen({bool sofort = false}) async {
    if (!_laeuft) return;
    final lokal = await vorOrt();
    if (!_laeuft) return;
    if (lokal) {
      _ortFehler = 0;
      if (serverUrl != lokalUrl) _verbinden(lokalUrl);
    } else {
      _ortFehler++;
      if (serverUrl == lokalUrl && (_ortFehler >= 2 || sofort)) _verbinden(einstellungen.serverUrl);
    }
  }

  void _wachen() {
    if (!_laeuft) return;
    final n = jetzt();
    final s = n.difference(_letzterErfolg);
    notifyListeners();
    if (s > neuAufbau && n.difference(_gestartet) > neuAufbau) {
      debugPrint('Seit ${s.inSeconds}s nichts vom Server - alles neu');
      _bestellungen.clear();
      _gestartet = n;
      _letzteNeuverbindung = n;
      _verbinden(einstellungen.serverUrl);
      unawaited(_ortPruefen(sofort: true));
      return;
    }
    if (s > still && n.difference(_letzteNeuverbindung) > still) {
      debugPrint('Seit ${s.inSeconds}s nichts vom Server - neu verbinden');
      _letzteNeuverbindung = n;
      _verbinden(einstellungen.serverUrl);
      unawaited(_ortPruefen(sofort: true));
    }
  }

  // --- Anmeldung ----------------------------------------------------------

  Future<void> _tokenPruefen() async {
    if (!_laeuft) return;
    final t = einstellungen.token;
    if (!tokenGueltig(t, jetzt())) {
      _abmelden(hinweisAbgelaufen);
      return;
    }
    if (!tokenErneuern(t, jetzt())) return;
    final r = await erneuern(einstellungen.serverUrl, t!);
    if (r is AuthOk && _laeuft) {
      await einstellungen.tokenSetzen(r.token);
      _verbinden(serverUrl);
    }
    // Ablehnung hier ist kein Grund zur Abmeldung (Vor-Ort-Betrieb o.ae.) -
    // das alte Token gilt weiter.
  }

  Future<void> _anmeldungAbgelehnt() async {
    if (_authLaeuft || !_laeuft) return;
    _authLaeuft = true;
    try {
      final t = einstellungen.token;
      if (!tokenGueltig(t, jetzt())) {
        _abmelden(hinweisAbgelaufen);
        return;
      }
      switch (await erneuern(serverUrl, t!)) {
        case AuthOk(:final token):
          await einstellungen.tokenSetzen(token);
          if (_laeuft) _verbinden(serverUrl);
        case AuthUnerreichbar():
          break; // spaeter erneut
        case AuthAbgelehnt():
          await einstellungen.tokenSetzen(null);
          _abmelden(hinweisAbgelehnt);
      }
    } finally {
      _authLaeuft = false;
    }
  }

  void _abmelden(String hinweis) {
    stoppen();
    abgemeldet(hinweis);
  }

  // --- Bedienung ----------------------------------------------------------

  Future<void> stationWaehlen(Station s) async {
    station = s;
    await einstellungen.stationSetzen(s); // bleibt nach Neustart erhalten
    notifyListeners();
  }

  /// «Erledigt»: bei «Alle» die ganze Bestellung, sonst die offenen Positionen
  /// dieser Station. Wirft bei Fehlern (die Oberflaeche zeigt sie).
  Future<void> bestellungErledigen(Bestellung b) async {
    final s = _system;
    if (s == null) return;
    try {
      if (station == Station.alle) {
        await s.bestellungErledigt(b.id);
        _bestellungen.removeWhere((x) => x.id == b.id);
      } else {
        final offen = b.fuer(station).where((p) => !p.erledigt).toList();
        if (offen.isEmpty) return;
        await s.positionenErledigt(b.id, [for (final p in offen) p.id]);
        for (final p in offen) {
          p.erledigt = true;
        }
      }
      notifyListeners();
    } on AnmeldungAbgelehnt {
      unawaited(_anmeldungAbgelehnt());
      rethrow;
    }
  }

  Future<void> positionErledigen(Bestellung b, Position p) async {
    final s = _system;
    if (s == null || p.erledigt) return;
    try {
      await s.positionenErledigt(b.id, [p.id]);
      p.erledigt = true;
      notifyListeners();
    } on AnmeldungAbgelehnt {
      unawaited(_anmeldungAbgelehnt());
      rethrow;
    }
  }

  void druckfehlerWeg() {
    druckfehler.clear();
    notifyListeners();
  }

  Future<void> _updateSuchen() async {
    final v = await updateSuche?.call();
    if (v != null && _laeuft) {
      update = v;
      notifyListeners();
    }
  }
}
