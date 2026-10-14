// Audit-Log bei api-members: GET /audit (authenticateVorstand).
//
// Das Backend kennt: action (genau), email (enthaelt, gross/klein egal),
// since (nach Zeitpunkt), limit, offset; neueste zuerst. Jeder Aufruf ohne
// since schreibt selbst einen Eintrag AUDIT_VIEW.

import 'package:fwv_core/fwv_core.dart';

import 'audit_eintrag.dart';

class AuditDienst {
  const AuditDienst(this.api);

  final ApiClient api;

  Future<List<AuditEintrag>> liste({
    String? aktion,
    String? email,
    int anzahl = 50,
    int ab = 0,
  }) async => jsonListe(
    await api.get(
      'audit',
      abfrage: {
        'limit': '$anzahl',
        'offset': '$ab',
        if (aktion != null && aktion.isNotEmpty) 'action': aktion,
        if (email != null && email.trim().isNotEmpty) 'email': email.trim(),
      },
    ),
    AuditEintrag.ausJson,
  );
}
