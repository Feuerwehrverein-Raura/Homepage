// FWV Raura — eine App fuer Mitglieder, Organisatoren und (spaeter) Vorstand.
// Ersetzt schrittweise members-android, members-ios, vorstand-android und
// vorstand-desktop. Hintergrund: docs/flutter-entscheidung.md.
//
// Material kommt aus dem eigenstaendigen Paket material_ui, nicht aus
// package:flutter/material.dart — die eingebauten Importe werden ab November
// 2026 abgekuendigt.

import 'package:material_ui/material_ui.dart';

/// Vereinsrot der bisherigen Apps (members-android colors.xml: primary).
const vereinsRot = Color(0xFFB91C1C);

void main() {
  runApp(const FwvApp());
}

class FwvApp extends StatelessWidget {
  const FwvApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'FWV Raura',
      theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: vereinsRot)),
      darkTheme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: vereinsRot, brightness: Brightness.dark),
      ),
      home: const Scaffold(
        body: Center(child: Text('FWV Raura — im Aufbau')),
      ),
    );
  }
}
