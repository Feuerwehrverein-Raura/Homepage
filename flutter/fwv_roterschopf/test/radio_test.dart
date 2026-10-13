// Radio-Adressen aufloesen: Weiterleitungen folgen, http auf https heben,
// Sender ohne https klar melden. Gegen einen nachgebauten Server.

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_roterschopf/fwv_roterschopf.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  final abgerufen = <String>[];
  final client = MockClient.streaming((anfrage, _) async {
    abgerufen.add(anfrage.url.toString());
    http.StreamedResponse weiter(String ziel) =>
        http.StreamedResponse(const Stream.empty(), 302, headers: {'location': ziel});
    http.StreamedResponse audio() => http.StreamedResponse(
      Stream.value([0xff, 0xfb]),
      200,
      headers: {'content-type': 'audio/mpeg'},
    );
    return switch (anfrage.url.toString()) {
      // Alte SRG-Adresse: leitet auf http um, das es auch als https gibt.
      'https://stream.srg-ssr.ch/m/drs3/mp3_128' => weiter(
        'http://stream.srg-ssr.ch/srgssr/srf3/mp3/128',
      ),
      'https://stream.srg-ssr.ch/srgssr/srf3/mp3/128' => weiter(
        'https://livestreaming-node-2.srg-ssr.ch/srgssr/srf3/mp3/128',
      ),
      'https://livestreaming-node-2.srg-ssr.ch/srgssr/srf3/mp3/128' => audio(),
      'https://energybasel.ice.infomaniak.ch/energybasel-high.mp3' => audio(),
      _ => http.StreamedResponse(const Stream.empty(), 404),
    };
  });

  setUp(abgerufen.clear);

  test('SRG: Sprung auf http wird zu https, Ziel liefert Audio', () async {
    final u = await senderAufloesen(
      Uri.parse('https://stream.srg-ssr.ch/m/drs3/mp3_128'),
      client: client,
    );
    expect(u.toString(), 'https://livestreaming-node-2.srg-ssr.ch/srgssr/srf3/mp3/128');
    expect(abgerufen.every((a) => a.startsWith('https://')), isTrue);
  });

  test('Direkte https-Adresse bleibt', () async {
    final u = await senderAufloesen(
      Uri.parse('https://energybasel.ice.infomaniak.ch/energybasel-high.mp3'),
      client: client,
    );
    expect(u.toString(), 'https://energybasel.ice.infomaniak.ch/energybasel-high.mp3');
    expect(abgerufen, hasLength(1));
  });

  test('Eingetragen als http: zuerst https versuchen', () async {
    final u = await senderAufloesen(
      Uri.parse('http://energybasel.ice.infomaniak.ch/energybasel-high.mp3'),
      client: client,
    );
    expect(u.scheme, 'https');
  });

  test('Nur http moeglich: verstaendliche Meldung statt Source error', () async {
    final nurHttp = MockClient.streaming((anfrage, _) async {
      if (anfrage.url.scheme == 'https') throw const SocketFehler();
      return http.StreamedResponse(Stream.value([0xff]), 200);
    });
    expect(
      () => senderAufloesen(Uri.parse('http://nur-http.example/stream'), client: nurHttp),
      throwsA(isA<UnverschluesselterSender>()),
    );
    expect(const UnverschluesselterSender().message, contains('unverschlüsselt'));
  });
}

class SocketFehler implements Exception {
  const SocketFehler();
}
