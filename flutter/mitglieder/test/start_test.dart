// Startet die App einmal: faengt ab, dass sie gar nicht erst hochkommt
// (fehlendes Paket, kaputtes Theme, ...).

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_mitglieder/main.dart';

void main() {
  testWidgets('App startet', (tester) async {
    await tester.pumpWidget(const FwvApp());
    expect(find.text('FWV Raura — im Aufbau'), findsOneWidget);
  });
}
