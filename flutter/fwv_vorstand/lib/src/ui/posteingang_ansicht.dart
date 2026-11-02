// Posteingang der Funktions-Postfaecher (aktuar@, kassier@ ...): Ordner,
// Liste mit Suche, Mail lesen mit Anhaengen, Antworten, Allen antworten,
// Weiterleiten, Neue Mail mit Adressbuch und Anhaengen, als ungelesen
// markieren, loeschen (Papierkorb). Backend: api-dispatch /imap und
// /contacts (lib/src/email/posteingang_dienst.dart).
//
// Vorbild: vorstand.html (Reiter Posteingang).

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';
import '../email/posteingang_dienst.dart';
import '../versand/versand_dienst.dart' show Anhang;
import 'nachricht/versand_bausteine.dart' show Hinweis;

class PosteingangAnsicht extends StatelessWidget {
  const PosteingangAnsicht({super.key, required this.dienste});

  final VorstandDienste dienste;

  @override
  Widget build(BuildContext context) => LadeAnsicht<({List<String> konten, List<String> fehlen})>(
    laden: dienste.posteingang.konten,
    bauen: (context, k, neuLaden) => k.konten.isEmpty
        ? ListView(
            padding: mitSystemleiste(context, const EdgeInsets.all(16), maxBreite: kartenBreite),
            children: [
              Hinweis(
                key: const Key('posteingang-keins'),
                art: HinweisArt.neutral,
                text: k.fehlen.isEmpty
                    ? 'Zu deiner Funktion gehört kein Postfach.'
                    : 'Für ${k.fehlen.join(', ')} ist kein Passwort hinterlegt '
                          '(E-Mail › Postfächer).',
              ),
            ],
          )
        : _Postfach(dienste: dienste, konten: k.konten),
  );
}

class _Postfach extends StatefulWidget {
  const _Postfach({required this.dienste, required this.konten});

  final VorstandDienste dienste;
  final List<String> konten;

  @override
  State<_Postfach> createState() => _PostfachState();
}

class _PostfachState extends State<_Postfach> {
  late var _konto = widget.konten.first;
  var _ordner = 'INBOX';
  var _ordnerListe = const <MailOrdner>[];
  final _suche = TextEditingController();
  var _stand = 0;

  PosteingangDienst get _dienst => widget.dienste.posteingang;

  @override
  void initState() {
    super.initState();
    _ordnerLaden();
  }

  @override
  void dispose() {
    _suche.dispose();
    super.dispose();
  }

  Future<void> _ordnerLaden() async {
    try {
      final o = await _dienst.ordner(_konto);
      if (mounted) setState(() => _ordnerListe = o);
    } on Object {
      // ohne Ordnerliste bleibt der Posteingang waehlbar
    }
  }

  void _neu() => setState(() => _stand++);

  Future<void> _oeffnen(MailKopf k) async {
    final geaendert = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) =>
            MailScreen(dienste: widget.dienste, konto: _konto, ordner: _ordner, uid: k.uid),
      ),
    );
    if (!mounted) return;
    _ordnerLaden();
    if (geaendert == true || !k.gelesen) _neu();
  }

  Future<void> _schreiben() async {
    final gesendet = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => MailSchreiben(dienste: widget.dienste, konto: _konto),
      ),
    );
    if (gesendet == true && mounted) meldung(context, 'Gesendet.');
  }

  @override
  Widget build(BuildContext context) {
    final ordner = [
      if (!_ordnerListe.any((o) => o.istPosteingang))
        const MailOrdner(pfad: 'INBOX', name: 'INBOX'),
      ..._ordnerListe,
    ];
    return Stack(
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: mitSystemleiste(
                context,
                const EdgeInsets.fromLTRB(12, 8, 12, 4),
                maxBreite: kartenBreite,
              ),
              child: Wrap(
                spacing: 8,
                runSpacing: 4,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  if (widget.konten.length > 1)
                    DropdownButton<String>(
                      key: const Key('posteingang-konto'),
                      value: _konto,
                      items: [
                        for (final k in widget.konten) DropdownMenuItem(value: k, child: Text(k)),
                      ],
                      onChanged: (k) {
                        if (k == null || k == _konto) return;
                        setState(() {
                          _konto = k;
                          _ordner = 'INBOX';
                          _ordnerListe = const [];
                          _stand++;
                        });
                        _ordnerLaden();
                      },
                    )
                  else
                    Text(_konto, style: Theme.of(context).textTheme.titleSmall),
                  DropdownButton<String>(
                    key: const Key('posteingang-ordner'),
                    value: ordner.any((o) => o.pfad == _ordner) ? _ordner : 'INBOX',
                    items: [
                      for (final o in ordner)
                        DropdownMenuItem(
                          value: o.pfad,
                          child: Text(
                            o.ungelesen > 0 ? '${o.anzeige} (${o.ungelesen})' : o.anzeige,
                          ),
                        ),
                    ],
                    onChanged: (p) {
                      if (p == null) return;
                      setState(() {
                        _ordner = p;
                        _stand++;
                      });
                    },
                  ),
                ],
              ),
            ),
            Padding(
              padding: mitSystemleiste(
                context,
                const EdgeInsets.fromLTRB(12, 0, 12, 4),
                maxBreite: kartenBreite,
              ),
              child: TextField(
                key: const Key('posteingang-suche'),
                controller: _suche,
                textInputAction: TextInputAction.search,
                onSubmitted: (_) => _neu(),
                decoration: InputDecoration(
                  isDense: true,
                  prefixIcon: const Icon(Icons.search),
                  hintText: 'Suchen (Absender, Betreff, Text)',
                  border: const OutlineInputBorder(),
                  suffixIcon: _suche.text.isEmpty
                      ? null
                      : IconButton(
                          tooltip: 'Suche löschen',
                          icon: const Icon(Icons.clear),
                          onPressed: () {
                            _suche.clear();
                            _neu();
                          },
                        ),
                ),
              ),
            ),
            Expanded(
              child: LadeAnsicht<List<MailKopf>>(
                key: ValueKey((_konto, _ordner, _stand)),
                laden: () => _dienst.nachrichten(_konto, _ordner, suche: _suche.text),
                leer: _suche.text.isEmpty ? 'Keine Nachrichten.' : 'Nichts gefunden.',
                istLeer: (l) => l.isEmpty,
                bauen: (context, liste, neuLaden) => RefreshIndicator(
                  onRefresh: () async {
                    _ordnerLaden();
                    await neuLaden();
                  },
                  child: ListView.separated(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: mitSystemleiste(
                      context,
                      const EdgeInsets.only(bottom: 88),
                      maxBreite: kartenBreite,
                    ),
                    itemCount: liste.length,
                    separatorBuilder: (_, _) => const Divider(height: 1),
                    itemBuilder: (context, i) =>
                        _Zeile(kopf: liste[i], tippen: () => _oeffnen(liste[i])),
                  ),
                ),
              ),
            ),
          ],
        ),
        Positioned(
          right: 16,
          bottom: 16 + MediaQuery.paddingOf(context).bottom,
          child: FloatingActionButton.extended(
            key: const Key('posteingang-neu'),
            icon: const Icon(Icons.edit_outlined),
            label: const Text('Neue Mail'),
            onPressed: _schreiben,
          ),
        ),
      ],
    );
  }
}

/// `Anna Muster <anna@x>` -> `Anna Muster`.
String nurName(String adresse) {
  final m = RegExp(r'^\s*"?([^"<]+?)"?\s*<').firstMatch(adresse);
  return (m?.group(1) ?? adresse).trim();
}

String kurzDatum(DateTime d, DateTime jetzt) {
  String z(int n) => n.toString().padLeft(2, '0');
  if (d.year == jetzt.year && d.month == jetzt.month && d.day == jetzt.day) {
    return '${z(d.hour)}:${z(d.minute)}';
  }
  return d.year == jetzt.year
      ? '${z(d.day)}.${z(d.month)}.'
      : '${z(d.day)}.${z(d.month)}.${d.year}';
}

class _Zeile extends StatelessWidget {
  const _Zeile({required this.kopf, required this.tippen});

  final MailKopf kopf;
  final VoidCallback tippen;

  @override
  Widget build(BuildContext context) {
    final fett = kopf.gelesen ? null : FontWeight.bold;
    return ListTile(
      key: Key('mail-${kopf.uid}'),
      onTap: tippen,
      leading: Icon(
        kopf.beantwortet
            ? Icons.reply
            : kopf.gelesen
            ? Icons.drafts_outlined
            : Icons.mark_email_unread_outlined,
        color: kopf.gelesen ? null : Theme.of(context).colorScheme.primary,
      ),
      title: Text(
        nurName(kopf.von),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(fontWeight: fett),
      ),
      subtitle: Text(
        kopf.betreff,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(fontWeight: fett),
      ),
      trailing: kopf.datum == null ? null : Text(kurzDatum(kopf.datum!, DateTime.now())),
    );
  }
}

/// Eine Mail lesen. Gibt `true` zurueck, wenn sie geloescht oder als
/// ungelesen markiert wurde (Liste neu laden).
class MailScreen extends StatefulWidget {
  const MailScreen({
    super.key,
    required this.dienste,
    required this.konto,
    required this.ordner,
    required this.uid,
  });

  final VorstandDienste dienste;
  final String konto;
  final String ordner;
  final int uid;

  @override
  State<MailScreen> createState() => _MailScreenState();
}

class _MailScreenState extends State<MailScreen> {
  late final Future<Mail> _mail = _dienst.lesen(widget.konto, widget.ordner, widget.uid);

  PosteingangDienst get _dienst => widget.dienste.posteingang;

  Future<void> _antworten(Mail m, {bool allen = false, bool weiter = false}) async {
    final gesendet = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => MailSchreiben(
          dienste: widget.dienste,
          konto: widget.konto,
          entwurf: antwortEntwurf(m, ich: widget.konto, allen: allen, weiter: weiter),
        ),
      ),
    );
    if (gesendet == true && mounted) meldung(context, 'Gesendet.');
  }

  Future<void> _ungelesen() async {
    try {
      await _dienst.ungelesen(widget.konto, widget.ordner, widget.uid);
      if (mounted) Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    }
  }

  Future<void> _loeschen() async {
    final papierkorb = RegExp('trash|papierkorb', caseSensitive: false).hasMatch(widget.ordner);
    if (papierkorb) {
      final ok = await nachfragen(
        context,
        titel: 'Endgültig löschen?',
        text: 'Die Mail ist schon im Papierkorb und ist danach weg.',
        ja: 'Löschen',
      );
      if (!ok || !mounted) return;
    }
    try {
      await _dienst.loeschen(widget.konto, widget.ordner, widget.uid);
      if (mounted) Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    }
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<Mail>(
    future: _mail,
    builder: (context, s) {
      final m = s.data;
      return Scaffold(
        appBar: AppBar(
          title: const Text('Mail'),
          actions: [
            if (m != null) ...[
              IconButton(
                key: const Key('mail-antworten'),
                tooltip: 'Antworten',
                icon: const Icon(Icons.reply),
                onPressed: () => _antworten(m),
              ),
              PopupMenuButton<String>(
                key: const Key('mail-mehr'),
                onSelected: (w) => switch (w) {
                  'allen' => _antworten(m, allen: true),
                  'weiter' => _antworten(m, weiter: true),
                  'ungelesen' => _ungelesen(),
                  _ => _loeschen(),
                },
                itemBuilder: (_) => const [
                  PopupMenuItem(value: 'allen', child: Text('Allen antworten')),
                  PopupMenuItem(value: 'weiter', child: Text('Weiterleiten')),
                  PopupMenuItem(value: 'ungelesen', child: Text('Als ungelesen markieren')),
                  PopupMenuItem(value: 'loeschen', child: Text('Löschen')),
                ],
              ),
            ],
          ],
        ),
        body: switch (s) {
          AsyncSnapshot(:final error?) => Center(
            child: Padding(padding: const EdgeInsets.all(24), child: Text(fehlerText(error))),
          ),
          _ when m == null => const Center(child: CircularProgressIndicator()),
          _ => _inhalt(context, m),
        },
      );
    },
  );

  Widget _inhalt(BuildContext context, Mail m) {
    final t = Theme.of(context);
    String z(int n) => n.toString().padLeft(2, '0');
    final d = m.datum;
    return ListView(
      padding: mitSystemleiste(context, const EdgeInsets.all(16), maxBreite: kartenBreite),
      children: [
        SelectableText(m.betreff, style: t.textTheme.titleLarge),
        const SizedBox(height: 8),
        SelectableText('Von: ${m.von}'),
        SelectableText('An: ${m.an}'),
        if (m.cc.isNotEmpty) SelectableText('Cc: ${m.cc}'),
        if (d != null)
          Text(
            '${z(d.day)}.${z(d.month)}.${d.year} ${z(d.hour)}:${z(d.minute)}',
            style: t.textTheme.bodySmall,
          ),
        if (m.anhaenge.isNotEmpty) ...[
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 4,
            children: [
              for (final a in m.anhaenge)
                ActionChip(
                  key: Key('mail-anhang-${a.index}'),
                  avatar: const Icon(Icons.attach_file, size: 18),
                  label: Text('${a.name} (${(a.groesse / 1024).ceil()} KB)'),
                  onPressed: () => _anhangTeilen(context, m, a),
                ),
            ],
          ),
        ],
        const Divider(height: 24),
        SelectableText(m.text.isEmpty ? '(kein Text)' : m.text, key: const Key('mail-text')),
      ],
    );
  }

  Future<void> _anhangTeilen(BuildContext context, Mail m, MailAnhang a) async {
    final ursprung = stelleVon(context);
    try {
      final bytes = await _dienst.anhang(widget.konto, widget.ordner, m.uid, a.index);
      await widget.dienste.umgebung.dateiTeilen(
        bytes,
        a.name,
        a.typ ?? 'application/octet-stream',
        ursprung: ursprung,
      );
    } on Object catch (e) {
      if (context.mounted) meldung(context, fehlerText(e));
    }
  }
}

/// Neue Mail, Antwort oder Weiterleitung aus [konto]. Gibt `true` zurueck,
/// wenn gesendet wurde.
class MailSchreiben extends StatefulWidget {
  const MailSchreiben({super.key, required this.dienste, required this.konto, this.entwurf});

  final VorstandDienste dienste;
  final String konto;
  final MailEntwurf? entwurf;

  @override
  State<MailSchreiben> createState() => _MailSchreibenState();
}

class _MailSchreibenState extends State<MailSchreiben> {
  late final _an = TextEditingController(text: widget.entwurf?.an ?? '');
  late final _cc = TextEditingController(text: widget.entwurf?.cc ?? '');
  late final _betreff = TextEditingController(text: widget.entwurf?.betreff ?? '');
  late final _text = TextEditingController(text: widget.entwurf?.text ?? '');
  final _anhaenge = <Anhang>[];
  var _kontakte = const <Kontakt>[];
  var _sendet = false;

  PosteingangDienst get _dienst => widget.dienste.posteingang;

  @override
  void initState() {
    super.initState();
    _dienst.adressbuch().then((k) => mounted ? setState(() => _kontakte = k) : null).ignore();
  }

  @override
  void dispose() {
    _an.dispose();
    _cc.dispose();
    _betreff.dispose();
    _text.dispose();
    super.dispose();
  }

  Future<void> _anhangWaehlen() async {
    final waehlen = widget.dienste.umgebung.anhangWaehlen;
    if (waehlen == null) return;
    try {
      final d = await waehlen();
      if (d != null && mounted) setState(() => _anhaenge.add(Anhang(d.dateiname, d.bytes)));
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    }
  }

  Future<void> _senden() async {
    if (_an.text.trim().isEmpty || _betreff.text.trim().isEmpty) {
      meldung(context, 'An und Betreff fehlen.');
      return;
    }
    setState(() => _sendet = true);
    try {
      await _dienst.senden(
        konto: widget.konto,
        an: _an.text,
        cc: _cc.text,
        betreff: _betreff.text,
        text: _text.text,
        inReplyTo: widget.entwurf?.inReplyTo,
        references: widget.entwurf?.references,
        anhaenge: _anhaenge,
      );
      if (mounted) Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (mounted) {
        meldung(context, fehlerText(e));
        setState(() => _sendet = false);
      }
    }
  }

  /// Adressfeld mit Vorschlaegen aus dem Adressbuch (fuer den letzten Eintrag
  /// nach dem Komma).
  Widget _adressfeld(
    String feldKey,
    String titel,
    TextEditingController c,
  ) => RawAutocomplete<Kontakt>(
    key: Key(feldKey),
    textEditingController: c,
    focusNode: FocusNode(),
    optionsBuilder: (wert) {
      final letzter = wert.text.split(RegExp('[,;]')).last.trim().toLowerCase();
      if (letzter.length < 2) return const [];
      return _kontakte
          .where(
            (k) =>
                k.name.toLowerCase().contains(letzter) || k.email.toLowerCase().contains(letzter),
          )
          .take(8);
    },
    displayStringForOption: (k) {
      final teile = c.text.split(RegExp('[,;]'));
      final davor = teile.take(teile.length - 1).map((t) => t.trim()).where((t) => t.isNotEmpty);
      return [...davor, k.adresse].join(', ');
    },
    fieldViewBuilder: (context, controller, fokus, fertig) => TextField(
      key: Key('$feldKey-feld'),
      controller: controller,
      focusNode: fokus,
      enabled: !_sendet,
      keyboardType: TextInputType.emailAddress,
      decoration: InputDecoration(labelText: titel, border: const OutlineInputBorder()),
    ),
    optionsViewBuilder: (context, waehlen, optionen) => Align(
      alignment: Alignment.topLeft,
      child: Material(
        elevation: 4,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 240, maxWidth: 480),
          child: ListView(
            padding: EdgeInsets.zero,
            shrinkWrap: true,
            children: [
              for (final k in optionen)
                ListTile(
                  dense: true,
                  title: Text(k.name),
                  subtitle: Text(k.email),
                  onTap: () => waehlen(k),
                ),
            ],
          ),
        ),
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final w = widget.entwurf;
    return Scaffold(
      appBar: AppBar(
        title: Text(
          w == null
              ? 'Neue Mail'
              : w.inReplyTo == null
              ? 'Weiterleiten'
              : 'Antworten',
        ),
        actions: [
          if (widget.dienste.umgebung.anhangWaehlen != null)
            IconButton(
              key: const Key('mail-anhang-waehlen'),
              tooltip: 'Datei anhängen',
              icon: const Icon(Icons.attach_file),
              onPressed: _sendet ? null : _anhangWaehlen,
            ),
          IconButton(
            key: const Key('mail-senden'),
            tooltip: 'Senden',
            icon: const Icon(Icons.send),
            onPressed: _sendet ? null : _senden,
          ),
        ],
      ),
      body: ListView(
        padding: mitSystemleiste(context, const EdgeInsets.all(16), maxBreite: kartenBreite),
        children: [
          Text('Von: ${widget.konto}', style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 12),
          _adressfeld('mail-an', 'An', _an),
          const SizedBox(height: 12),
          _adressfeld('mail-cc', 'Cc', _cc),
          const SizedBox(height: 12),
          TextField(
            key: const Key('mail-betreff'),
            controller: _betreff,
            enabled: !_sendet,
            decoration: const InputDecoration(labelText: 'Betreff', border: OutlineInputBorder()),
          ),
          if (_anhaenge.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              children: [
                for (final (i, a) in _anhaenge.indexed)
                  InputChip(
                    label: Text(a.dateiname),
                    deleteButtonTooltipMessage: 'Entfernen',
                    onDeleted: _sendet ? null : () => setState(() => _anhaenge.removeAt(i)),
                  ),
              ],
            ),
          ],
          const SizedBox(height: 12),
          TextField(
            key: const Key('mail-text'),
            controller: _text,
            enabled: !_sendet,
            minLines: 10,
            maxLines: null,
            keyboardType: TextInputType.multiline,
            decoration: const InputDecoration(
              labelText: 'Text',
              alignLabelWithHint: true,
              border: OutlineInputBorder(),
            ),
          ),
          if (_sendet) ...[const SizedBox(height: 12), const LinearProgressIndicator()],
        ],
      ),
    );
  }
}
