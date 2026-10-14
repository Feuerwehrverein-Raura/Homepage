// Benachrichtigungs-Einstellungen: `GET/PUT members/me/notifications`.
//
// Welche Arten es gibt, bestimmt das Backend: neue Mitglieder bekommen
// `shift_reminder`, `event_update`, `newsletter` und `general` (backend-
// members), Push verschicken die Backends mit `shift_reminder`,
// `event_update` und `general`. Die alte iOS-App zeigte stattdessen
// `event_invitation` und `registration_status` — die verwendet kein Backend,
// die Schalter wirkten nie. Hier gelten die Arten des Backends (wie in der
// alten Android-App und auf der Website, mein.html).

import 'json_lesen.dart';

class BenachrichtigungsArt {
  const BenachrichtigungsArt(this.schluessel, this.titel, this.beschreibung);

  /// `notification_type` im Backend.
  final String schluessel;
  final String titel;
  final String beschreibung;

  /// In der Reihenfolge der Website und der alten Android-App.
  static const alle = [
    BenachrichtigungsArt(
      'shift_reminder',
      'Schicht-Erinnerungen',
      'Erinnerung und Änderungen bei deinen Schichten',
    ),
    BenachrichtigungsArt(
      'event_update',
      'Anlass-Änderungen',
      'Anmeldungen, Änderungen und Absagen von Anlässen',
    ),
    BenachrichtigungsArt('newsletter', 'Newsletter', 'Vereins-Newsletter und Rundmails'),
    BenachrichtigungsArt(
      'general',
      'Allgemeine Mitteilungen',
      'Sonstige Informationen vom Vorstand',
    ),
  ];

  /// Nur fuer den Vorstand (nicht in [alle]): neue Antraege, Austritte,
  /// Loeschungen und Anmeldungen (docker/backend-members/src/vorstand-melder.js).
  static const vorstand = BenachrichtigungsArt(
    'vorstand_mitteilungen',
    'Vorstand-Mitteilungen',
    'Neue Anträge, Austritte, Löschungen und Anmeldungen',
  );
}

/// Ein-/Aus je Art. Arten ohne gespeicherten Eintrag gelten als
/// eingeschaltet — so verschickt auch das Backend.
class BenachrichtigungsEinstellungen {
  const BenachrichtigungsEinstellungen([this._werte = const {}]);

  /// Liest die Liste `[{notification_type, enabled, ...}]`.
  factory BenachrichtigungsEinstellungen.ausJson(Object? json) {
    final werte = <String, bool>{};
    if (json is List) {
      for (final e in json) {
        if (e is! Map) continue;
        final art = jsonText(e['notification_type']);
        if (art != null) werte[art] = jsonWahr(e['enabled']) ?? true;
      }
    }
    return BenachrichtigungsEinstellungen(werte);
  }

  final Map<String, bool> _werte;

  bool aktiv(String art) => _werte[art] ?? true;

  BenachrichtigungsEinstellungen mit(String art, bool aktiv) =>
      BenachrichtigungsEinstellungen({..._werte, art: aktiv});

  /// Body fuer PUT: alle bekannten Arten und alles, was das Backend sonst
  /// noch geliefert hat — so geht nichts verloren. `alternative_email` wird
  /// nicht geschickt; das Backend behaelt sie dann.
  Map<String, Object> alsJson() {
    final arten = {for (final a in BenachrichtigungsArt.alle) a.schluessel, ..._werte.keys};
    return {
      'preferences': [
        for (final a in arten) {'notification_type': a, 'enabled': aktiv(a)},
      ],
    };
  }
}
