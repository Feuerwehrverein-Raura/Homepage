// Vertragsdatei der Inventar-API (siehe vertrag_test.dart).

import 'dart:convert';
import 'dart:io';

Map<String, dynamic> vertrag() =>
    jsonDecode(File('test/fixtures/inventar-api.json').readAsStringSync()) as Map<String, dynamic>;
