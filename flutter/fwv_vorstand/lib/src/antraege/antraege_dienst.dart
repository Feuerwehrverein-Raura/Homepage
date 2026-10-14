// Mitgliedschaftsantraege bei api-members (docker/backend-members/src/index.js,
// authenticateVorstand: persoenliches Token mit Gruppe Vorstand/admin).

import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import 'antrag.dart';

class AntraegeDienst {
  const AntraegeDienst(this.api);

  final ApiClient api;

  /// Antraege mit [status], neueste zuerst; null = alle. Ohne Angabe
  /// liefert das Backend nur die offenen, darum immer mitschicken.
  Future<List<Antrag>> liste(AntragStatus? status) async => jsonListe(
    await api.get('member-registrations', abfrage: {'status': status?.code ?? 'all'}),
    Antrag.ausJson,
  );

  Future<Antrag> antrag(String id) async {
    final j = await _deutsch(() => api.get('member-registrations/$id'));
    if (j is! Map) throw const FormatException('Antrag nicht lesbar.');
    return Antrag.ausJson(Map<String, dynamic>.from(j));
  }

  /// Zahl der offenen Antraege (fuer einen Zaehler am Reiter).
  Future<int> anzahlOffen() async {
    final j = await api.get('member-registrations/count/pending');
    return (j is Map ? jsonZahl(j['count']) : null) ?? 0;
  }

  /// Genehmigen legt das Mitglied an. Den Status bestimmt das Backend aus der
  /// Feuerwehr-Angabe: "Ja (aktiv)" wird Aktivmitglied (mit Login und
  /// Willkommensmail), alle anderen "Aufnahme pendent" bis zur GV - ausser
  /// der Vorstand waehlt den [status] selbst (seit 14.10.2026 liest das
  /// Backend memberStatus, nur diese zwei Werte). Liefert die ID des neuen
  /// Mitglieds.
  Future<String?> genehmigen(String id, {String? status}) async {
    final j = await _deutsch(
      () => api.post(
        'member-registrations/$id/approve',
        daten: <String, Object?>{'memberStatus': ?status},
      ),
    );
    return j is Map ? jsonText(j['member_id']) : null;
  }

  /// Ablehnen; der [grund] geht in der Ablehnungsmail an die Person und den
  /// Aktuar (leer = "Keine Begruendung angegeben").
  Future<void> ablehnen(String id, {String? grund}) async {
    final g = grund?.trim();
    await _deutsch(
      () => api.post(
        'member-registrations/$id/reject',
        daten: {'reason': (g == null || g.isEmpty) ? null : g},
      ),
    );
  }

  /// Die Fehlertexte dieser Routen sind englisch - die bekannten uebersetzen.
  Future<dynamic> _deutsch(Future<dynamic> Function() aufruf) async {
    try {
      return await aufruf();
    } on ApiFehler catch (f) {
      final text = switch (f.meldung) {
        'Registration already processed' => 'Dieser Antrag wurde bereits bearbeitet.',
        'Registration not found' => 'Diesen Antrag gibt es nicht mehr.',
        _ => null,
      };
      if (text == null || f is SitzungAbgelaufen) rethrow;
      throw ApiFehler(text, status: f.status);
    }
  }
}

/// Zahl der offenen Antraege zum Anzeigen, z.B. als Badge am Reiter
/// "Vorstand". Die [AntraegeAnsicht] aktualisiert ihn nach jedem Laden und
/// jeder Entscheidung; wer ihn teilen will, gibt dieselbe Instanz mit.
class AntraegeZaehler extends ChangeNotifier {
  AntraegeZaehler(this._dienst);

  final AntraegeDienst _dienst;

  /// null, solange noch nichts geladen ist (oder das Laden scheiterte).
  int? get anzahl => _anzahl;
  int? _anzahl;

  /// Fragt das Backend; Fehler bleiben still (der Zaehler ist Beiwerk).
  Future<void> aktualisieren() async {
    try {
      setzen(await _dienst.anzahlOffen());
    } on Object {
      // alter Wert bleibt
    }
  }

  void setzen(int anzahl) {
    if (anzahl == _anzahl) return;
    _anzahl = anzahl;
    notifyListeners();
  }
}
