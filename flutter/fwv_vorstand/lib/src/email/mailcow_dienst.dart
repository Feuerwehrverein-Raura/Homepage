// E-Mail-Verwaltung des Vorstands: Postfaecher und Aliase auf dem Mailcow-
// Server (api-dispatch /mailcow/..., docker/backend-dispatch/src/index.js)
// und die Zustellliste der Mitglieder (api-members /members/emails/...).
//
// Einheiten (wie Mailcow sie liefert und erwartet, vgl. vorstand-android):
// GET liefert `quota` und `quota_used` in BYTES; POST/PUT erwarten `quota`
// in MEGABYTES. vorstand.html liest das falsch (zeigt Bytes als MB).
//
// Fehler: Mailcow antwortet auch bei Fehlern mit 200; das Backend wirft dann
// und schickt `{"error": [{"type": "danger", "msg": ["object_exists", ...]}]}`
// mit Status 500. [mailcowFehlerText] macht daraus einen Satz.

import 'package:fwv_core/fwv_core.dart';

const mailcowDomain = 'fwv-raura.ch';

const _mb = 1024 * 1024;

num _zahl(Object? wert) => switch (wert) {
  num n => n,
  String s => num.tryParse(s.trim()) ?? 0,
  _ => 0,
};

/// Ein Postfach (GET /mailcow/mailboxes).
class Postfach {
  const Postfach({
    required this.adresse,
    this.name,
    this.quotaBytes = 0,
    this.belegtBytes = 0,
    this.aktiv = true,
    this.nachrichten,
  });

  factory Postfach.ausJson(Map<String, dynamic> j) => Postfach(
    adresse: jsonText(j['username']) ?? '${jsonText(j['local_part']) ?? '?'}@$mailcowDomain',
    name: jsonText(j['name']),
    quotaBytes: _zahl(j['quota']),
    belegtBytes: _zahl(j['quota_used']),
    aktiv: jsonWahr(j['active']) ?? jsonWahr(j['active_int']) ?? true,
    nachrichten: jsonZahl(j['messages']),
  );

  final String adresse;
  final String? name;
  final num quotaBytes;
  final num belegtBytes;
  final bool aktiv;
  final int? nachrichten;

  String get lokalTeil => adresse.split('@').first;

  /// Groesse in MB, wie sie beim Bearbeiten zurueckgeht.
  int get quotaMb => (quotaBytes / _mb).round();

  /// 0..1; ohne Grenze 0.
  double get anteil => quotaBytes > 0 ? (belegtBytes / quotaBytes).clamp(0, 1).toDouble() : 0;
}

/// Speicher eines Postfachs (GET /mailcow/quota).
class Speicher {
  const Speicher({
    required this.adresse,
    this.name,
    this.quotaBytes = 0,
    this.belegtBytes = 0,
    this.prozent = 0,
  });

  factory Speicher.ausJson(Map<String, dynamic> j) => Speicher(
    adresse: jsonText(j['email']) ?? '?',
    name: jsonText(j['name']),
    quotaBytes: _zahl(j['quota']),
    belegtBytes: _zahl(j['quota_used']),
    prozent: _zahl(j['percent_used']).toInt(),
  );

  final String adresse;
  final String? name;
  final num quotaBytes;
  final num belegtBytes;
  final int prozent;
}

/// Ein Alias (GET /mailcow/aliases): Adresse -> Ziel(e), mit Komma getrennt.
class Alias {
  const Alias({required this.id, required this.adresse, required this.ziel, this.aktiv = true});

  factory Alias.ausJson(Map<String, dynamic> j) => Alias(
    id: jsonText(j['id']) ?? '',
    adresse: jsonText(j['address']) ?? '?',
    ziel: jsonText(j['goto']) ?? '',
    aktiv: jsonWahr(j['active']) ?? jsonWahr(j['active_int']) ?? true,
  );

  final String id;
  final String adresse;
  final String ziel;
  final bool aktiv;

  /// Die Ziele einzeln.
  List<String> get ziele => zieleAusText(ziel);
}

/// "a@x.ch, b@y.ch\nc@z.ch" -> ["a@x.ch", "b@y.ch", "c@z.ch"].
List<String> zieleAusText(String text) => [
  for (final t in text.split(RegExp(r'[,;\s]+')))
    if (t.trim().isNotEmpty) t.trim(),
];

/// Ein Mitglied auf der Zustellliste.
class ZustellEmpfaenger {
  const ZustellEmpfaenger({required this.id, required this.name, required this.email, this.status});

  factory ZustellEmpfaenger.ausJson(Map<String, dynamic> j) => ZustellEmpfaenger(
    id: jsonText(j['id']) ?? '',
    name: [jsonText(j['vorname']), jsonText(j['nachname'])].whereType<String>().join(' '),
    email: jsonText(j['email']) ?? '',
    status: jsonText(j['status']),
  );

  final String id;
  final String name;
  final String email;
  final String? status;
}

/// GET /members/emails/zustellung: Mitglieder mit E-Mail-Zustellung (ohne
/// Ausgetretene und Verstorbene), Versand-E-Mail vor Haupt-E-Mail.
class Zustellliste {
  const Zustellliste({required this.empfaenger, required this.adressen});

  factory Zustellliste.ausJson(Object? json) {
    final j = json is Map ? json : const {};
    final empfaenger = jsonListe(j['members'], ZustellEmpfaenger.ausJson);
    final adressen = j['emails'] is List
        ? [for (final e in j['emails'] as List) ?jsonText(e)]
        : [for (final e in empfaenger) e.email];
    return Zustellliste(empfaenger: empfaenger, adressen: adressen);
  }

  final List<ZustellEmpfaenger> empfaenger;
  final List<String> adressen;

  /// Zum Einfuegen ins An-/BCC-Feld.
  String get alsText => adressen.join(', ');
}

/// Ergebnis von POST /members/emails/sync-alias.
typedef AliasAbgleich = ({bool neu, int empfaenger, String alias});

/// Mailcow-Fehlercodes in Saetzen (wie parseMailcowError in vorstand.html).
const _mailcowCodes = {
  'max_mailbox_exceeded': 'Maximale Anzahl Postfächer erreicht (Domain-Limit).',
  'mailbox_quota_exceeded': 'Speichergrenze überschritten.',
  'max_quota_in_use': 'Speichergrenze der Domain überschritten.',
  'mailbox_quota_left_exceeded': 'Auf der Domain ist nicht mehr so viel Speicher frei.',
  'object_exists': 'Diese Adresse gibt es schon.',
  'password_complexity': 'Passwort zu schwach (Gross-/Kleinbuchstaben und Zahl).',
  'password_mismatch': 'Die Passwörter stimmen nicht überein.',
  'is_alias': 'Die Adresse ist schon ein Alias.',
  'is_alias_or_mailbox': 'Die Adresse ist schon ein Alias oder Postfach.',
  'domain_not_found': 'Domain nicht gefunden.',
  'is_spam_alias': 'Die Adresse ist ein temporärer Alias.',
  'alias_domain_exists': 'Die Domain ist eine Alias-Domain.',
  'goto_invalid': 'Eine Zieladresse ist ungültig.',
  'alias_invalid': 'Die Alias-Adresse ist ungültig.',
  'mailbox_invalid': 'Die Adresse ist ungültig.',
  'access_denied': 'Mailcow verweigert den Zugriff.',
};

/// Text fuer Menschen aus einem Fehler eines Mailcow-Aufrufs.
String mailcowFehlerText(Object fehler) {
  if (fehler is ApiFehler && fehler.daten is Map) {
    final code = _mailcowCode((fehler.daten as Map)['error']);
    if (code != null) return _mailcowCodes[code] ?? 'Mailcow meldet: $code';
  }
  if (fehler is ApiFehler) return fehler.meldung;
  return 'Etwas ist schiefgegangen. Bitte erneut versuchen.';
}

String? _mailcowCode(Object? e) {
  if (e is String) return e.isEmpty ? null : e;
  if (e is List) return e.isEmpty ? null : _mailcowCode(e.first);
  if (e is Map) return _mailcowCode(e['msg']);
  return null;
}

/// Aufrufe der E-Mail-Verwaltung (nur Vorstand).
class MailcowDienst {
  const MailcowDienst(this.api);

  final ApiClient api;

  static String _e(String s) => Uri.encodeComponent(s);

  /// Postfaecher, nach Adresse sortiert.
  Future<List<Postfach>> postfaecher() async =>
      jsonListe(await api.get('mailcow/mailboxes'), Postfach.ausJson)
        ..sort((a, b) => a.adresse.compareTo(b.adresse));

  /// Neues Postfach @fwv-raura.ch. [quotaMb] in Megabytes.
  Future<void> postfachAnlegen({
    required String lokalTeil,
    required String name,
    required String passwort,
    required int quotaMb,
    bool aktiv = true,
  }) => api.post(
    'mailcow/mailboxes',
    daten: {
      'local_part': lokalTeil.trim().toLowerCase(),
      'name': name.trim(),
      'password': passwort,
      'quota': quotaMb,
      'active': aktiv ? 1 : 0,
    },
  );

  /// Nur die angegebenen Felder; ein leeres Passwort bleibt unveraendert.
  Future<void> postfachAendern(
    String adresse, {
    String? name,
    int? quotaMb,
    bool? aktiv,
    String? passwort,
  }) => api.put(
    'mailcow/mailboxes/${_e(adresse)}',
    daten: {
      'name': ?name?.trim(),
      'quota': ?quotaMb,
      if (aktiv != null) 'active': aktiv ? 1 : 0,
      if (passwort != null && passwort.isNotEmpty) 'password': passwort,
    },
  );

  /// Loescht das Postfach mit allen Mails.
  Future<void> postfachLoeschen(String adresse) => api.delete('mailcow/mailboxes/${_e(adresse)}');

  /// Aliase, nach Adresse sortiert.
  Future<List<Alias>> aliase() async =>
      jsonListe(await api.get('mailcow/aliases'), Alias.ausJson)
        ..sort((a, b) => a.adresse.compareTo(b.adresse));

  /// [adresse] mit oder ohne @fwv-raura.ch; [ziele] mit Komma verbunden.
  Future<void> aliasAnlegen({
    required String adresse,
    required List<String> ziele,
    bool aktiv = true,
  }) => api.post(
    'mailcow/aliases',
    daten: {
      'address': adresse.trim().toLowerCase(),
      'goto': ziele.join(','),
      'active': aktiv ? 1 : 0,
    },
  );

  Future<void> aliasAendern(String id, {List<String>? ziele, bool? aktiv}) => api.put(
    'mailcow/aliases/${_e(id)}',
    daten: {if (ziele != null) 'goto': ziele.join(','), if (aktiv != null) 'active': aktiv ? 1 : 0},
  );

  Future<void> aliasLoeschen(String id) => api.delete('mailcow/aliases/${_e(id)}');

  /// Speicher aller Postfaecher, die vollsten zuerst.
  Future<List<Speicher>> speicher() async =>
      jsonListe(await api.get('mailcow/quota'), Speicher.ausJson)
        ..sort((a, b) => b.prozent.compareTo(a.prozent));

  Future<Zustellliste> zustellliste() async =>
      Zustellliste.ausJson(await api.get('members/emails/zustellung'));

  /// Setzt den Alias mitglieder@fwv-raura.ch auf alle Adressen der
  /// Zustellliste (legt ihn an, falls es ihn nicht gibt).
  Future<AliasAbgleich> mitgliederAliasAbgleichen() async {
    final j = await api.post('members/emails/sync-alias');
    final m = j is Map ? j : const {};
    return (
      neu: jsonText(m['action']) == 'created',
      empfaenger: jsonZahl(m['recipients']) ?? 0,
      alias: jsonText(m['alias']) ?? 'mitglieder@$mailcowDomain',
    );
  }
}

/// "1.5 GB", "320 MB", "12 KB".
String groesseText(num bytes) {
  if (bytes >= 1024 * _mb) {
    final gb = bytes / (1024 * _mb);
    return '${gb.toStringAsFixed(gb >= 10 ? 0 : 1)} GB';
  }
  if (bytes >= _mb) return '${(bytes / _mb).round()} MB';
  if (bytes >= 1024) return '${(bytes / 1024).round()} KB';
  return '$bytes B';
}
