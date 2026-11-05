// Gegenstueck zu web_push_web.dart ausserhalb des Browsers.

import 'push_dienst.dart';

class WebPush implements PushDienst {
  Future<String> Function()? schluesselHolen;
  void Function(Map<String, Object?> daten)? beiAntippen;

  @override
  Future<void> starten() async {}

  @override
  bool get verfuegbar => false;

  @override
  set beiNeuemToken(void Function(String token)? rueckruf) {}

  @override
  Future<String?> token() async => null;

  @override
  Future<PushErlaubnis> erlaubnis() async => PushErlaubnis.nichtVerfuegbar;

  @override
  Future<PushErlaubnis> erlaubnisAnfragen() async => PushErlaubnis.nichtVerfuegbar;

  @override
  Future<void> tokenVerwerfen() async {}

  @override
  String get plattform => 'web';
}
