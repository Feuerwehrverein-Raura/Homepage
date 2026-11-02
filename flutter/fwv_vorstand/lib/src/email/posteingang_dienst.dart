// Posteingang der Funktions-Postfaecher (aktuar@, kassier@ ...) ueber IMAP
// in api-dispatch (docker/backend-dispatch/src/imap-mail.js):
//
// - GET    imap/accounts                  Postfaecher, die ich sehen darf
// - GET    imap/folders?account=          Ordner mit Anzahl ungelesen
// - GET    imap/messages?account&folder   die neuesten (limit, hoechstens 200)
// - GET    imap/search?account&folder&q   Suche
// - GET    imap/messages/:uid             eine Mail (setzt «gelesen»)
// - GET    imap/messages/:uid/attachments/:index
// - POST   imap/messages/:uid/flags       { add, remove }
// - POST   imap/messages/:uid/move        { target }
// - DELETE imap/messages/:uid             in den Papierkorb (dort: endgueltig)
// - POST   imap/send                      { account, to, cc, subject, body,
//                                          inReplyTo, references, attachments }
// - GET    contacts                       Adressbuch (geteilt, Mitglieder,
//                                          automatisch erkannt)
//
// Welche Postfaecher jemand sieht, entscheidet das Backend aus der Funktion
// des Mitglieds (rollenErgaenzen).

import 'dart:typed_data';

import 'package:fwv_core/fwv_core.dart';

import '../versand/versand.dart' show htmlZuText;
import '../versand/versand_dienst.dart' show Anhang;

/// Ein Ordner (GET imap/folders).
class MailOrdner {
  const MailOrdner({required this.pfad, required this.name, this.besonders, this.ungelesen = 0});

  factory MailOrdner.ausJson(Map<String, dynamic> j) => MailOrdner(
    pfad: jsonText(j['path']) ?? 'INBOX',
    name: jsonText(j['name']) ?? jsonText(j['path']) ?? 'INBOX',
    besonders: jsonText(j['specialUse']),
    ungelesen: jsonZahl(j['unseen']) ?? 0,
  );

  final String pfad;
  final String name;

  /// \Sent, \Trash, \Junk, \Drafts ... (IMAP special-use)
  final String? besonders;
  final int ungelesen;

  bool get istPosteingang => pfad.toUpperCase() == 'INBOX';

  /// Deutscher Name fuer die bekannten Ordner.
  String get anzeige => switch (besonders) {
    _ when istPosteingang => 'Posteingang',
    r'\Sent' => 'Gesendet',
    r'\Trash' => 'Papierkorb',
    r'\Junk' => 'Spam',
    r'\Drafts' => 'Entwürfe',
    r'\Archive' => 'Archiv',
    _ => name,
  };
}

/// Eine Zeile der Liste (GET imap/messages, imap/search).
class MailKopf {
  const MailKopf({
    required this.uid,
    required this.betreff,
    this.von = '',
    this.an = '',
    this.datum,
    this.gelesen = true,
    this.markiert = false,
    this.beantwortet = false,
  });

  factory MailKopf.ausJson(Map<String, dynamic> j) => MailKopf(
    uid: jsonZahl(j['uid']) ?? 0,
    betreff: jsonText(j['subject']) ?? '(ohne Betreff)',
    von: jsonText(j['from']) ?? '',
    an: jsonText(j['to']) ?? '',
    datum: _zeit(j['date']),
    gelesen: j['seen'] == true,
    markiert: j['flagged'] == true,
    beantwortet: j['answered'] == true,
  );

  final int uid;
  final String betreff;
  final String von;
  final String an;
  final DateTime? datum;
  final bool gelesen;
  final bool markiert;
  final bool beantwortet;

  MailKopf mit({bool? gelesen}) => MailKopf(
    uid: uid,
    betreff: betreff,
    von: von,
    an: an,
    datum: datum,
    gelesen: gelesen ?? this.gelesen,
    markiert: markiert,
    beantwortet: beantwortet,
  );
}

class MailAnhang {
  const MailAnhang({required this.index, required this.name, this.typ, this.groesse = 0});

  factory MailAnhang.ausJson(Map<String, dynamic> j) => MailAnhang(
    index: jsonZahl(j['index']) ?? 0,
    name: jsonText(j['filename']) ?? 'Anhang',
    typ: jsonText(j['contentType']),
    groesse: jsonZahl(j['size']) ?? 0,
  );

  final int index;
  final String name;
  final String? typ;
  final int groesse;
}

/// Eine ganze Mail (GET imap/messages/:uid).
class Mail {
  const Mail({
    required this.uid,
    required this.betreff,
    this.von = '',
    this.an = '',
    this.cc = '',
    this.datum,
    this.text = '',
    this.messageId,
    this.referenzen,
    this.anhaenge = const [],
  });

  factory Mail.ausJson(Map<String, dynamic> j) {
    final text = jsonText(j['text']);
    final html = jsonText(j['html']);
    return Mail(
      uid: jsonZahl(j['uid']) ?? 0,
      betreff: jsonText(j['subject']) ?? '(ohne Betreff)',
      von: jsonText(j['from']) ?? '',
      an: jsonText(j['to']) ?? '',
      cc: jsonText(j['cc']) ?? '',
      datum: _zeit(j['date']),
      // Reine HTML-Mails (ohne Textteil) lesbar machen.
      text: (text != null && text.trim().isNotEmpty) ? text.trim() : htmlZuText(html ?? ''),
      messageId: jsonText(j['messageId']),
      referenzen: jsonText(j['inReplyTo']),
      anhaenge: [
        if (j['attachments'] is List)
          for (final a in j['attachments'] as List)
            if (a is Map) MailAnhang.ausJson(Map<String, dynamic>.from(a)),
      ],
    );
  }

  final int uid;
  final String betreff;
  final String von;
  final String an;
  final String cc;
  final DateTime? datum;
  final String text;
  final String? messageId;

  /// In-Reply-To dieser Mail (fuer die Kette der Antwort).
  final String? referenzen;
  final List<MailAnhang> anhaenge;
}

/// Adressbuch-Eintrag (GET contacts).
class Kontakt {
  const Kontakt({required this.name, required this.email, this.quelle = ''});

  final String name;
  final String email;

  /// shared, member, discovered
  final String quelle;

  /// `Name <adresse>` fuer das An-Feld.
  String get adresse => name.isEmpty || name == email ? email : '$name <$email>';
}

/// Was eine Antwort braucht: An, Betreff, zitierter Text, Kette.
typedef MailEntwurf = ({
  String an,
  String cc,
  String betreff,
  String text,
  String? inReplyTo,
  String? references,
});

/// Antwort (an den Absender, mit [allen] auch an alle anderen ausser mir),
/// Weiterleitung ohne Empfaenger. Der alte Text steht zitiert darunter.
MailEntwurf antwortEntwurf(Mail m, {required String ich, bool allen = false, bool weiter = false}) {
  String ohnePraefix(String b) =>
      b.replaceFirst(RegExp(r'^((re|aw|wg|fwd?):\s*)+', caseSensitive: false), '');
  final datum = m.datum == null ? '' : '${_datumText(m.datum!)} ';
  if (weiter) {
    return (
      an: '',
      cc: '',
      betreff: 'WG: ${ohnePraefix(m.betreff)}',
      text:
          '\n\n---------- Weitergeleitete Nachricht ----------\n'
          'Von: ${m.von}\nDatum: $datum\nBetreff: ${m.betreff}\nAn: ${m.an}\n\n${m.text}',
      inReplyTo: null,
      references: null,
    );
  }
  bool nichtIch(String a) => !a.toLowerCase().contains(ich.toLowerCase());
  final weitere = allen
      ? [
          ...adressenTeilen(m.an),
          ...adressenTeilen(m.cc),
        ].where((a) => nichtIch(a) && a != m.von).toList()
      : <String>[];
  final zitat = m.text.split('\n').map((z) => '> $z').join('\n');
  return (
    an: m.von,
    cc: weitere.join(', '),
    betreff: 'AW: ${ohnePraefix(m.betreff)}',
    text: '\n\nAm $datum schrieb ${m.von}:\n$zitat',
    inReplyTo: m.messageId,
    references: [?m.referenzen, ?m.messageId].join(' '),
  );
}

/// `A <a@x>, b@y` -> `["A <a@x>", "b@y"]` (Kommas in Anfuehrungszeichen bleiben).
List<String> adressenTeilen(String feld) {
  final teile = <String>[];
  var aktuell = StringBuffer();
  var inZitat = false;
  for (final z in feld.split('')) {
    if (z == '"') inZitat = !inZitat;
    if ((z == ',' || z == ';') && !inZitat) {
      teile.add(aktuell.toString().trim());
      aktuell = StringBuffer();
    } else {
      aktuell.write(z);
    }
  }
  teile.add(aktuell.toString().trim());
  return teile.where((t) => t.isNotEmpty).toList();
}

String _datumText(DateTime d) {
  String z(int n) => n.toString().padLeft(2, '0');
  final l = d.toLocal();
  return '${z(l.day)}.${z(l.month)}.${l.year} ${z(l.hour)}:${z(l.minute)}';
}

DateTime? _zeit(Object? wert) => DateTime.tryParse(jsonText(wert) ?? '')?.toLocal();

class PosteingangDienst {
  const PosteingangDienst(this.api);

  final ApiClient api;

  Map<String, String> _wo(String konto, String ordner) => {'account': konto, 'folder': ordner};

  /// Postfaecher, die ich sehen darf, und solche ohne hinterlegtes Passwort.
  Future<({List<String> konten, List<String> fehlen})> konten() async {
    final j = await api.get('imap/accounts');
    List<String> liste(Object? w) => [
      if (w is List)
        for (final a in w) ?jsonText(a),
    ];
    return j is Map
        ? (konten: liste(j['accounts']), fehlen: liste(j['missing']))
        : (konten: <String>[], fehlen: <String>[]);
  }

  Future<List<MailOrdner>> ordner(String konto) async =>
      jsonListe(await api.get('imap/folders', abfrage: {'account': konto}), MailOrdner.ausJson);

  Future<List<MailKopf>> nachrichten(String konto, String ordner, {String? suche}) async {
    final s = suche?.trim() ?? '';
    final j = await api.get(
      s.isEmpty ? 'imap/messages' : 'imap/search',
      abfrage: {..._wo(konto, ordner), 'limit': '100', if (s.isNotEmpty) 'q': s},
    );
    return jsonListe(j is Map ? j['messages'] : null, MailKopf.ausJson);
  }

  Future<Mail> lesen(String konto, String ordner, int uid) async {
    final j = await api.get('imap/messages/$uid', abfrage: _wo(konto, ordner));
    return Mail.ausJson(j is Map ? Map<String, dynamic>.from(j) : const {});
  }

  Future<Uint8List> anhang(String konto, String ordner, int uid, int index) =>
      api.datei('imap/messages/$uid/attachments/$index', abfrage: _wo(konto, ordner));

  Future<void> ungelesen(String konto, String ordner, int uid) => api.post(
    'imap/messages/$uid/flags',
    daten: {
      ..._wo(konto, ordner),
      'remove': [r'\Seen'],
    },
  );

  /// In den Papierkorb (im Papierkorb: endgueltig).
  Future<void> loeschen(String konto, String ordner, int uid) => api.delete(
    'imap/messages/$uid?account=${Uri.encodeQueryComponent(konto)}'
    '&folder=${Uri.encodeQueryComponent(ordner)}',
  );

  Future<void> senden({
    required String konto,
    required String an,
    String cc = '',
    required String betreff,
    required String text,
    String? inReplyTo,
    String? references,
    List<Anhang> anhaenge = const [],
  }) => api.post(
    'imap/send',
    daten: {
      'account': konto,
      'to': an.trim(),
      if (cc.trim().isNotEmpty) 'cc': cc.trim(),
      'subject': betreff.trim(),
      'body': text,
      'inReplyTo': ?inReplyTo,
      if (references != null && references.isNotEmpty) 'references': references,
      if (anhaenge.isNotEmpty) 'attachments': [for (final a in anhaenge) a.json],
    },
  );

  /// Adressbuch: geteilte Kontakte, Mitglieder, automatisch erkannte.
  Future<List<Kontakt>> adressbuch() async {
    final j = await api.get('contacts');
    if (j is! Map) return const [];
    return [
      for (final teil in ['shared', 'members', 'discovered'])
        if (j[teil] is List)
          for (final k in j[teil] as List)
            if (k is Map && jsonText(k['email']) != null)
              Kontakt(
                name: jsonText(k['name']) ?? '',
                email: jsonText(k['email'])!,
                quelle: jsonText(k['source']) ?? teil,
              ),
    ];
  }
}
