// Vertragsdatei der Ausleihe (siehe ausleihe_vertrag_test.dart). "Heute"
// ist darin immer der 11.10.2026.

import 'dart:convert';
import 'dart:io';

Map<String, dynamic> ausleiheVertrag() =>
    jsonDecode(File('test/fixtures/ausleihe-api.json').readAsStringSync()) as Map<String, dynamic>;
