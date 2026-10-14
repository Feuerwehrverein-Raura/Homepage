// Nachricht per E-Mail und Brief (docs/vorstand-funktionen.md, Abschnitt 7,
// Phase 2): Empfaenger bestimmen, nach Versandart aufteilen, Platzhalter,
// Vorlagen. Reine Logik ohne Oberflaeche - die Zahlen in der Rueckfrage
// kommen von hier und muessen zu dem passen, was das Backend wirklich tut:
//
// - E-Mail (POST /email/bulk): nur Mitglieder mit `email`; ohne
//   `praeferenz_ignorieren` zusaetzlich nur mit `zustellung_email`.
// - Brief (POST /dispatch/brief + /dispatch/send-post): Strasse, PLZ, Ort.
// - Auto: E-Mail an alle mit E-Mail-Zustellung, Brief an alle mit
//   Post-Zustellung - wer beides will, bekommt beides (wie Website/Desktop).
//
// Statusfilter mit den echten Werten aus `members.status` (Aktivmitglied,
// Aufnahme pendent, Ehrenmitglied, ...) - in vorstand.html/-android passten
// die Werte nicht und der Filter lieferte niemanden.

import '../mitglieder/modelle.dart';

enum Versandart {
  auto('Auto', 'Nach Wunsch des Mitglieds: E-Mail oder Brief'),
  email('E-Mail', 'An alle mit E-Mail-Adresse'),
  post('Brief', 'Per Post (Pingen, kostet)');

  const Versandart(this.text, this.erklaerung);

  final String text;
  final String erklaerung;
}

enum EmpfaengerArt {
  alle('Alle'),
  status('Nach Status'),
  zustellart('Nach Zustellart'),
  einzeln('Auswahl');

  const EmpfaengerArt(this.text);

  final String text;
}

enum Zustellart {
  email('E-Mail-Zustellung'),
  post('Post-Zustellung');

  const Zustellart(this.text);

  final String text;
}

/// Status, die «Alle» nicht erreicht: keine Mitglieder (mehr) bzw.
/// Testkonten. Wer sie anschreiben will, waehlt sie einzeln oder per Status.
const nichtImVersand = {'Ausgetreten', 'Verstorben', 'Testkonto'};

/// Geschaetzte Kosten pro Brief in CHF (Pingen Economy inkl. Porto) - dieselbe
/// Zahl nennt das Backend dem Kassier (sendPingenBulkCostNotification).
const pingenKostenProBrief = 1.00;

/// Platzhalter, die Backend-E-Mail (/email/bulk) und Brief
/// (nachricht-layout.js) pro Mitglied ersetzen.
const versandPlatzhalter = ['vorname', 'nachname', 'anrede', 'strasse', 'plz', 'ort', 'email'];

/// Wer bekommt die Nachricht? Je nach [art] zaehlt nur das passende Feld.
class Empfaengerwahl {
  const Empfaengerwahl({
    this.art = EmpfaengerArt.alle,
    this.status = 'Aktivmitglied',
    this.zustellart = Zustellart.email,
    this.ids = const {},
  });

  final EmpfaengerArt art;
  final String status;
  final Zustellart zustellart;
  final Set<String> ids;

  Empfaengerwahl mit({
    EmpfaengerArt? art,
    String? status,
    Zustellart? zustellart,
    Set<String>? ids,
  }) => Empfaengerwahl(
    art: art ?? this.art,
    status: status ?? this.status,
    zustellart: zustellart ?? this.zustellart,
    ids: ids ?? this.ids,
  );
}

bool hatEmail(VorstandMitglied m) => (m.email ?? '').trim().isNotEmpty;

bool hatPostadresse(VorstandMitglied m) =>
    [m.strasse, m.plz, m.ort].every((f) => (f ?? '').trim().isNotEmpty);

String mitgliedName(VorstandMitglied m) =>
    [m.vorname, m.nachname].whereType<String>().join(' ').trim();

/// Die gewaehlten Empfaenger (vor der Aufteilung nach Kanal).
List<VorstandMitglied> empfaengerWaehlen(List<VorstandMitglied> alle, Empfaengerwahl w) {
  bool aktuell(VorstandMitglied m) => !nichtImVersand.contains(m.status);
  return switch (w.art) {
    EmpfaengerArt.alle => alle.where(aktuell).toList(),
    EmpfaengerArt.status => alle.where((m) => m.status == w.status).toList(),
    EmpfaengerArt.zustellart =>
      alle
          .where(aktuell)
          .where((m) => w.zustellart == Zustellart.email ? m.zustellungEmail : m.zustellungPost)
          .toList(),
    EmpfaengerArt.einzeln => alle.where((m) => w.ids.contains(m.id)).toList(),
  };
}

/// Aufteilung nach Kanal - die Zahlen der Rueckfrage.
class Versandplan {
  const Versandplan({
    required this.art,
    required this.email,
    required this.post,
    required this.ohne,
  });

  final Versandart art;
  final List<VorstandMitglied> email;
  final List<VorstandMitglied> post;

  /// Gewaehlt, aber auf keinem Kanal erreichbar (keine Adresse/kein Wunsch).
  final List<VorstandMitglied> ohne;

  bool get leer => email.isEmpty && post.isEmpty;

  /// Bekommen E-Mail UND Brief (Auto, beide Wuensche gesetzt).
  int get beides {
    final ids = {for (final m in email) m.id};
    return post.where((m) => ids.contains(m.id)).length;
  }

  double get kosten => post.length * pingenKostenProBrief;
}

Versandplan versandPlanen(List<VorstandMitglied> empfaenger, Versandart art) {
  final email = <VorstandMitglied>[];
  final post = <VorstandMitglied>[];
  for (final m in empfaenger) {
    switch (art) {
      case Versandart.auto:
        if (hatEmail(m) && m.zustellungEmail) email.add(m);
        if (hatPostadresse(m) && m.zustellungPost) post.add(m);
      case Versandart.email:
        if (hatEmail(m)) email.add(m);
      case Versandart.post:
        if (hatPostadresse(m)) post.add(m);
    }
  }
  final erreicht = {
    for (final m in [...email, ...post]) m.id,
  };
  return Versandplan(
    art: art,
    email: email,
    post: post,
    ohne: [
      for (final m in empfaenger)
        if (!erreicht.contains(m.id)) m,
    ],
  );
}

/// "CHF 12.00"
String franken(double betrag) => 'CHF ${betrag.toStringAsFixed(2)}';

/// Text der Rueckfrage vor dem Versand: Zahl pro Kanal, Kosten, Staging.
String versandRueckfrage(Versandplan p, {required String betreff, required bool staging}) {
  final zeilen = <String>['«${betreff.trim().isEmpty ? '(ohne Betreff)' : betreff.trim()}»', ''];
  if (p.email.isNotEmpty) zeilen.add('• ${anzahl(p.email.length, 'E-Mail', 'E-Mails')}');
  if (p.post.isNotEmpty) {
    zeilen.add(
      '• ${anzahl(p.post.length, 'Brief', 'Briefe')} per Post – '
      '${staging ? 'Staging (Test, kostet nichts, kommt nicht an)' : 'ca. ${franken(p.kosten)}'}',
    );
  }
  if (p.beides > 0) {
    zeilen.add('  (${anzahl(p.beides, 'Mitglied wünscht', 'Mitglieder wünschen')} beides)');
  }
  if (p.ohne.isNotEmpty) {
    zeilen.add('• ${p.ohne.length} ohne passende Adresse – erhalten nichts');
  }
  zeilen
    ..add('')
    ..add(
      p.post.isNotEmpty && !staging
          ? 'Briefe gehen sofort an Pingen und werden gedruckt. Zurückholen geht nicht.'
          : 'Zurückholen geht nicht.',
    );
  return zeilen.join('\n');
}

String anzahl(int n, String eins, String viele) => n == 1 ? '1 $eins' : '$n $viele';

final _platzhalterMuster = RegExp(r'\{\{\s*([A-Za-z0-9_]+)\s*\}\}');

/// {{vorname}} usw. fuer die Vorschau ersetzen - wie das Backend.
String platzhalterErsetzen(String text, VorstandMitglied m) =>
    text.replaceAllMapped(_platzhalterMuster, (t) {
      final wert = switch (t.group(1)) {
        'vorname' => m.vorname,
        'nachname' => m.nachname,
        'anrede' => m.anrede,
        'strasse' => m.strasse,
        'plz' => m.plz,
        'ort' => m.ort,
        'email' => m.email,
        _ => t.group(0),
      };
      return wert ?? '';
    });

/// Platzhalter im Text, die das Backend NICHT ersetzt (z.B. {{event_title}}
/// aus einer Vorlage) - sie kaemen woertlich beim Mitglied an.
List<String> unbekanntePlatzhalter(String text) => {
  for (final t in _platzhalterMuster.allMatches(text))
    if (!versandPlatzhalter.contains(t.group(1))) '{{${t.group(1)}}}',
}.toList();

/// Vorlage aus GET /templates (dispatch_templates).
class Vorlage {
  const Vorlage({
    required this.id,
    required this.name,
    this.typ,
    this.betreff = '',
    this.text = '',
  });

  factory Vorlage.ausJson(Map<String, dynamic> j) => Vorlage(
    id: '${j['id'] ?? ''}',
    name: '${j['name'] ?? 'Vorlage'}',
    typ: j['type'] is String ? j['type'] as String : null,
    betreff: j['subject'] is String ? j['subject'] as String : '',
    text: htmlZuText(j['body'] is String ? j['body'] as String : ''),
  );

  final String id;
  final String name;

  /// email, brief_ch, brief_de, letter ...
  final String? typ;
  final String betreff;

  /// Als reiner Text (HTML-Vorlagen werden umgewandelt).
  final String text;
}

/// Vorlagen-Text als reiner Text. In der Datenbank stehen teils HTML-Briefe,
/// teils Text mit woertlichem "\n" (SQL ohne E'...').
String htmlZuText(String roh) {
  var t = roh.replaceAll(r'\n', '\n').replaceAll('\r\n', '\n');
  if (!RegExp(r'<[a-zA-Z/!]').hasMatch(t)) return t.trim();
  t = t
      .replaceAll(RegExp(r'<(style|head|script)[^>]*>[\s\S]*?</\1>', caseSensitive: false), '')
      .replaceAll(RegExp(r'<br\s*/?>', caseSensitive: false), '\n')
      .replaceAll(RegExp(r'<li[^>]*>', caseSensitive: false), '• ')
      .replaceAll(RegExp(r'</(p|div|h[1-6]|li|tr)>', caseSensitive: false), '\n')
      .replaceAll(RegExp(r'<[^>]+>'), '')
      .replaceAll('&nbsp;', ' ')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'")
      .replaceAll('&amp;', '&');
  final zeilen = [for (final z in t.split('\n')) z.trim()];
  return zeilen.join('\n').replaceAll(RegExp(r'\n{3,}'), '\n\n').trim();
}
