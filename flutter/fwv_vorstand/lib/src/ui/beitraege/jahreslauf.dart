// Beitraege Phase 2: der Jahreslauf (Beitraege erzeugen, Briefe an alle per
// E-Mail oder Post, Zahlungserinnerungen) und der geplante Versand
// (api-dispatch /scheduled-jobs). Alles, was etwas verschickt, fragt mit der
// Zahl der Empfaenger nach - gerechnet nach denselben Regeln wie das Backend
// aus Zahlungen und Zustellwunsch der Mitglieder. Laesst sich der
// Zustellwunsch nicht laden, sagt die Rueckfrage das und nennt die
// Hoechstzahl; entscheiden tut dann das Backend.

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../../dienste.dart';
import '../../geplant/geplante_auftraege.dart';
import '../bestaetigen.dart';
import 'beitraege_daten.dart';

class JahresAufgaben extends StatefulWidget {
  const JahresAufgaben({
    super.key,
    required this.dienste,
    required this.daten,
    required this.neuLaden,
    required this.einstellungBearbeiten,
    required this.heute,
    this.kassierId,
  });

  final VorstandDienste dienste;

  /// Absender der Briefe (Auswahl in der Beitragsansicht), null = erster.
  final String? kassierId;
  final BeitragsJahr daten;
  final Future<void> Function() neuLaden;

  /// Oeffnet den Dialog fuer den Jahresbeitrag; true = gespeichert.
  final Future<bool> Function() einstellungBearbeiten;
  final DateTime heute;

  @override
  State<JahresAufgaben> createState() => _JahresAufgabenState();
}

class _JahresAufgabenState extends State<JahresAufgaben> {
  /// Was gerade laeuft (sperrt alle Knoepfe).
  String? _laeuft;
  final _geplant = GlobalKey<_GeplanterVersandState>();

  BeitragsJahr get _d => widget.daten;
  int get _jahr => _d.jahr;
  BeitraegeDienst get _dienst => widget.dienste.beitraege.mitKassier(widget.kassierId);

  /// Zustellwunsch aller Mitglieder (GET /members); null, wenn es nicht ging.
  Future<Map<String, Zustellwunsch>?> _zustellung() async {
    try {
      final alle = await widget.dienste.mitglieder.liste();
      return {for (final m in alle) m.id: (email: m.zustellungEmail, post: m.zustellungPost)};
    } on Object {
      return null;
    }
  }

  /// Wartet gerade auf das Backend (dann dreht der Knopf; waehrend einer
  /// Rueckfrage nicht).
  var _imNetz = false;

  Future<T> _netz<T>(Future<T> Function() aufruf) async {
    setState(() => _imNetz = true);
    try {
      return await aufruf();
    } finally {
      if (mounted) setState(() => _imNetz = false);
    }
  }

  Future<void> _mitSperre(String was, Future<void> Function() tun) async {
    if (_laeuft != null) return;
    setState(() => _laeuft = was);
    try {
      await tun();
    } finally {
      if (mounted) setState(() => _laeuft = null);
    }
  }

  // ---------------------------------------------------------------------
  // Beitraege erzeugen

  Future<void> _erzeugen() => _mitSperre('erzeugen', () async {
    final e = _d.einstellung;
    if (e == null || e.betrag <= 0) {
      meldung(context, 'Zuerst den Jahresbeitrag $_jahr festlegen.');
      if (!await widget.einstellungBearbeiten() || !mounted) return;
      // Der Dialog hat neu geladen; der Betrag kommt beim naechsten Bauen.
      return;
    }
    final ok = await nachfragen(
      context,
      titel: 'Beiträge $_jahr erzeugen?',
      text:
          'Erstellt für jedes Aktiv- und Passivmitglied ohne Beitrag $_jahr einen offenen '
          'Beitrag über ${chf(e.betrag)}. Bestehende bleiben unverändert, Ehrenmitglieder '
          'bekommen keinen.\n\nEs wird nichts verschickt. Die QR-Referenzen der Bank '
          'trägst du danach je Beitrag ein.',
      ja: 'Erzeugen',
      gefaehrlich: false,
    );
    if (!ok || !mounted) return;
    try {
      final vorher = _d.zahlungen.length;
      final (r, nachher) = await _netz(() async {
        final r = await _dienst.erzeugen(_jahr, e.betrag);
        return (r, (await _dienst.jahr(_jahr)).zahlungen.length);
      });
      if (!mounted) return;
      final neu = nachher - vorher;
      meldung(
        context,
        '$neu ${neu == 1 ? 'Beitrag' : 'Beiträge'} neu erzeugt '
        '(${r.mitglieder} Mitglieder geprüft, jetzt $nachher).',
      );
      await widget.neuLaden();
    } on Object catch (f) {
      if (mounted) meldung(context, fehlerText(f));
    }
  });

  // ---------------------------------------------------------------------
  // Briefe an alle

  /// Text fuer die Rueckfrage: wer bekommt etwas, wer nicht.
  String _vorschauText(VersandVorschau v, {required bool geplant}) {
    final art = v.kanal == BriefKanal.email ? 'E-Mail' : 'Brief';
    final regel = v.kanal == BriefKanal.email
        ? 'offen, Zustellung per E-Mail, mit E-Mail-Adresse'
        : 'offen, Zustellung per Post, mit ganzer Adresse';
    final b = StringBuffer(
      geplant
          ? 'Nach heutigem Stand ${v.empfaenger.length} × $art. Massgebend ist der Stand '
                'zum geplanten Zeitpunkt.'
          : '${v.empfaenger.length} × $art mit dem Beitragsbrief $_jahr (QR-Rechnung).',
    );
    b.write('\n\nRegel: $regel, mit Referenz, ohne Ehrenmitglieder.');
    if (v.ohneReferenz.isNotEmpty) {
      b.write(
        '\n\n${v.ohneReferenz.length} weitere ohne Referenz werden übersprungen: '
        '${v.ohneReferenz.take(5).map((z) => z.anzeigeName).join(', ')}'
        '${v.ohneReferenz.length > 5 ? ' …' : ''}',
      );
    }
    if (v.unbekannt.isNotEmpty) {
      b.write(
        '\n\nBei ${v.unbekannt.length} ist der Zustellwunsch unbekannt – das Backend '
        'entscheidet. Höchstens ${v.hoechstens} insgesamt.',
      );
    }
    if (v.kanal == BriefKanal.post && !geplant) {
      b.write('\n\nPost über Pingen kostet ca. CHF 1.– pro Brief.');
    }
    return b.toString();
  }

  Future<void> _anAlle(BriefKanal kanal) => _mitSperre('an-alle-${kanal.wert}', () async {
    final zustellung = await _netz(_zustellung);
    if (!mounted) return;
    final v = versandVorschau(_d.zahlungen, kanal, zustellung);
    final art = kanal == BriefKanal.email ? 'E-Mail' : 'Brief';
    final mehrzahl = v.empfaenger.length == 1
        ? art
        : kanal == BriefKanal.email
        ? 'E-Mails'
        : 'Briefe';
    if (zustellung != null && v.empfaenger.isEmpty) {
      meldung(context, 'Niemand bekäme einen $art – nichts zu senden.');
      return;
    }
    final ok = await starkNachfragen(
      context,
      titel: zustellung == null
          ? 'Beitragsbriefe $_jahr per $art an alle?'
          : 'Beitragsbriefe $_jahr: ${v.empfaenger.length} $mehrzahl senden?',
      text: zustellung == null
          ? 'Der Zustellwunsch der Mitglieder liess sich nicht laden. Wer etwas bekommt, '
                'entscheidet das Backend (offen, Zustellung per $art, mit Referenz, ohne '
                'Ehrenmitglieder) – höchstens ${v.hoechstens}.\n\nDas geht sofort raus.'
          : '${_vorschauText(v, geplant: false)}\n\nDas geht sofort raus und lässt sich '
                'nicht zurückholen.',
      haken: 'Ja, jetzt an alle senden',
      ja: zustellung == null ? 'An alle senden' : '${v.empfaenger.length} $mehrzahl senden',
    );
    if (!ok || !mounted) return;
    try {
      final r = await _netz(() => _dienst.anAlleSenden(_jahr, kanal));
      if (!mounted) return;
      await _ergebnisZeigen(r, art);
      await widget.neuLaden();
    } on ApiFehler catch (f) {
      if (!mounted) return;
      if (f.status == null) {
        // Keine Antwort: der Server arbeitet womoeglich weiter.
        await _hinweis(
          'Keine Antwort erhalten',
          'Der Versand läuft auf dem Server möglicherweise weiter. Bitte NICHT erneut '
              'auslösen, sondern später den Versandverlauf auf der Website prüfen.',
        );
      } else {
        meldung(context, f.meldung);
      }
    } on Object catch (f) {
      if (mounted) meldung(context, fehlerText(f));
    }
  });

  Future<void> _ergebnisZeigen(MassenversandErgebnis r, String art) => showDialog<void>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text('$art-Versand abgeschlossen'),
      content: SizedBox(
        width: 460,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${r.gesendet} gesendet, ${r.fehlgeschlagen} fehlgeschlagen '
                '(von ${r.empfaenger} Empfängern; ${r.uebersprungen} übersprungen).',
                key: const Key('versand-ergebnis'),
              ),
              if (r.fehler.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text('Fehlgeschlagen:', style: Theme.of(c).textTheme.titleSmall),
                for (final f in r.fehler) Text('• $f'),
              ],
            ],
          ),
        ),
      ),
      actions: [FilledButton(onPressed: () => Navigator.of(c).pop(), child: const Text('OK'))],
    ),
  );

  Future<void> _hinweis(String titel, String text) => showDialog<void>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(titel),
      content: Text(text),
      actions: [FilledButton(onPressed: () => Navigator.of(c).pop(), child: const Text('OK'))],
    ),
  );

  // ---------------------------------------------------------------------
  // Zahlungserinnerungen

  Future<void> _erinnern() => _mitSperre('erinnern', () async {
    final faellig = erinnerungFaellig(_d.zahlungen, _d.einstellung, widget.heute);
    final ok = await nachfragen(
      context,
      titel: 'Zahlungserinnerungen senden?',
      text:
          'Erinnert alle Mitglieder mit offenem, fälligem Beitrag per App-Mitteilung und – '
          'bei Zustellung per E-Mail – zusätzlich per E-Mail. Wer in den letzten 30 Tagen '
          'schon erinnert wurde, wird übersprungen.\n\n'
          'Für $_jahr wären es nach heutigem Stand ${faellig.length}'
          '${_d.einstellung?.faellig == null ? ' (ohne Fälligkeit keine)' : ''}. Das Backend '
          'erinnert für alle Jahre.\n\nDas geht sofort raus.',
      ja: 'Erinnerungen senden',
    );
    if (!ok || !mounted) return;
    try {
      final r = await _netz(_dienst.erinnerungenSenden);
      if (!mounted) return;
      await _hinweis(
        'Erinnerungen gesendet',
        '${r.faellig} fällig: ${r.push} App-Mitteilungen, ${r.email} E-Mails.',
      );
      await widget.neuLaden();
    } on Object catch (f) {
      if (mounted) meldung(context, fehlerText(f));
    }
  });

  // ---------------------------------------------------------------------
  // Versand planen

  Future<void> _planen() => _mitSperre('planen', () async {
    final wahl = await showDialog<(BriefKanal, DateTime)>(
      context: context,
      builder: (_) => _PlanenDialog(jahr: _jahr, jetzt: DateTime.now()),
    );
    if (wahl == null || !mounted) return;
    final (kanal, zeitpunkt) = wahl;
    final zustellung = await _netz(_zustellung);
    if (!mounted) return;
    final v = versandVorschau(_d.zahlungen, kanal, zustellung);
    final art = kanal == BriefKanal.email ? 'E-Mail' : 'Post';
    final wer = zustellung == null
        ? 'Zustellwunsch nicht geladen – das Backend entscheidet.'
        : _vorschauText(v, geplant: true);
    final ok = await nachfragen(
      context,
      titel: 'Versand per $art planen?',
      text:
          'Am ${zeitText(zeitpunkt)} gehen die Beitragsbriefe $_jahr per $art an alle raus.\n\n'
          '$wer'
          '\n\nBis dahin lässt sich der Auftrag stornieren.',
      ja: 'Planen',
      gefaehrlich: false,
    );
    if (!ok || !mounted) return;
    try {
      await _netz(
        () => widget.dienste.geplant.beitragsversandPlanen(
          art: kanal == BriefKanal.email ? AuftragsArt.beitragEmail : AuftragsArt.beitragPost,
          jahr: _jahr,
          zeitpunkt: zeitpunkt,
        ),
      );
      if (!mounted) return;
      meldung(context, 'Versand per $art geplant: ${zeitText(zeitpunkt)}');
      await _geplant.currentState?.laden();
    } on Object catch (f) {
      if (mounted) meldung(context, fehlerText(f));
    }
  });

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final frei = _laeuft == null;
    final keine = _d.zahlungen.isEmpty;
    Widget knopf(String id, IconData symbol, String text, VoidCallback? tun) => OutlinedButton.icon(
      key: Key('jahreslauf-$id'),
      onPressed: frei ? tun : null,
      icon: _laeuft == id && _imNetz
          ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
          : Icon(symbol),
      label: Text(text),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Card(
          color: t.colorScheme.surfaceContainerLow,
          margin: EdgeInsets.zero,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Jahreslauf $_jahr', style: t.textTheme.titleMedium),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    knopf(
                      'einstellung',
                      Icons.tune,
                      'Jahresbeitrag festlegen',
                      () => _mitSperre('einstellung', () async {
                        await widget.einstellungBearbeiten();
                      }),
                    ),
                    knopf('erzeugen', Icons.playlist_add, 'Beiträge erzeugen', _erzeugen),
                  ],
                ),
                const SizedBox(height: 12),
                Text('Beitragsbriefe an alle', style: t.textTheme.titleSmall),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    knopf(
                      'an-alle-email',
                      Icons.mail_outline,
                      'Per E-Mail',
                      keine ? null : () => _anAlle(BriefKanal.email),
                    ),
                    knopf(
                      'an-alle-post',
                      Icons.local_post_office_outlined,
                      'Per Post',
                      keine ? null : () => _anAlle(BriefKanal.post),
                    ),
                    knopf('planen', Icons.schedule, 'Versand planen', keine ? null : _planen),
                    knopf(
                      'erinnern',
                      Icons.notifications_active_outlined,
                      'Zahlungserinnerungen',
                      _erinnern,
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        GeplanterVersand(key: _geplant, dienst: widget.dienste.geplant),
      ],
    );
  }
}

String _zwei(int n) => n.toString().padLeft(2, '0');

/// "15.10.2026, 09:00".
String zeitText(DateTime z) => '${datumText(z)}, ${_zwei(z.hour)}:${_zwei(z.minute)}';

/// Kanal, Tag und Uhrzeit fuer den geplanten Versand.
class _PlanenDialog extends StatefulWidget {
  const _PlanenDialog({required this.jahr, required this.jetzt});

  final int jahr;
  final DateTime jetzt;

  @override
  State<_PlanenDialog> createState() => _PlanenDialogState();
}

class _PlanenDialogState extends State<_PlanenDialog> {
  var _kanal = BriefKanal.email;
  late DateTime _tag = DateTime(widget.jetzt.year, widget.jetzt.month, widget.jetzt.day + 1);
  var _zeit = const TimeOfDay(hour: 9, minute: 0);

  DateTime get _zeitpunkt => DateTime(_tag.year, _tag.month, _tag.day, _zeit.hour, _zeit.minute);

  bool get _inZukunft => _zeitpunkt.isAfter(widget.jetzt);

  Future<void> _tagWaehlen() async {
    final heute = DateTime(widget.jetzt.year, widget.jetzt.month, widget.jetzt.day);
    final d = await showDatePicker(
      context: context,
      initialDate: _tag.isBefore(heute) ? heute : _tag,
      firstDate: heute,
      lastDate: heute.add(const Duration(days: 365)),
      helpText: 'Versand am',
    );
    if (d != null) setState(() => _tag = d);
  }

  Future<void> _zeitWaehlen() async {
    final z = await showTimePicker(context: context, initialTime: _zeit, helpText: 'Uhrzeit');
    if (z != null) setState(() => _zeit = z);
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return AlertDialog(
      title: Text('Beitragsbriefe ${widget.jahr} planen'),
      content: SizedBox(
        width: 420,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SegmentedButton<BriefKanal>(
              key: const Key('planen-kanal'),
              segments: [
                for (final k in BriefKanal.values) ButtonSegment(value: k, label: Text(k.titel)),
              ],
              selected: {_kanal},
              onSelectionChanged: (w) => setState(() => _kanal = w.first),
            ),
            const SizedBox(height: 12),
            ListTile(
              key: const Key('planen-tag'),
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.event_outlined),
              title: Text(datumText(_tag)),
              trailing: const Icon(Icons.edit_outlined),
              onTap: _tagWaehlen,
            ),
            ListTile(
              key: const Key('planen-zeit'),
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.schedule),
              title: Text('${_zwei(_zeit.hour)}:${_zwei(_zeit.minute)} Uhr'),
              trailing: const Icon(Icons.edit_outlined),
              onTap: _zeitWaehlen,
            ),
            if (!_inZukunft)
              Text(
                'Der Zeitpunkt liegt in der Vergangenheit.',
                style: TextStyle(color: t.colorScheme.error),
              ),
            Text(
              'Der Server prüft jede Minute; der Versand startet also bis zu einer '
              'Minute später.',
              style: t.textTheme.bodySmall,
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Abbrechen')),
        FilledButton(
          key: const Key('planen-weiter'),
          onPressed: _inZukunft ? () => Navigator.of(context).pop((_kanal, _zeitpunkt)) : null,
          child: const Text('Weiter'),
        ),
      ],
    );
  }
}

/// Liste der geplanten Auftraege mit Status; geplante lassen sich stornieren.
class GeplanterVersand extends StatefulWidget {
  const GeplanterVersand({super.key, required this.dienst});

  final GeplanteAuftraegeDienst dienst;

  @override
  State<GeplanterVersand> createState() => _GeplanterVersandState();
}

class _GeplanterVersandState extends State<GeplanterVersand> {
  List<GeplanterAuftrag>? _liste;
  Object? _fehler;
  var _alle = false;

  @override
  void initState() {
    super.initState();
    laden();
  }

  Future<void> laden() async {
    setState(() => _fehler = null);
    try {
      final l = await widget.dienst.liste();
      if (mounted) setState(() => _liste = l);
    } on Object catch (e) {
      if (mounted) setState(() => _fehler = e);
    }
  }

  Future<void> _stornieren(GeplanterAuftrag a) async {
    final ok = await nachfragen(
      context,
      titel: 'Auftrag stornieren?',
      text:
          '«${a.titel}» am ${a.zeitpunkt == null ? '?' : zeitText(a.zeitpunkt!)} wird nicht '
          'ausgeführt.',
      ja: 'Stornieren',
    );
    if (!ok || !mounted) return;
    try {
      await widget.dienst.stornieren(a.id);
      if (!mounted) return;
      meldung(context, 'Auftrag storniert');
      await laden();
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final liste = _liste;
    // Offene zuerst sichtbar; erledigte nur auf Wunsch.
    final offen = [
      for (final a in liste ?? const <GeplanterAuftrag>[])
        if (a.status == AuftragsStatus.geplant || a.status == AuftragsStatus.laeuft) a,
    ];
    final zeigen = _alle ? (liste ?? const <GeplanterAuftrag>[]).reversed.toList() : offen;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(child: Text('Geplanter Versand', style: t.textTheme.titleMedium)),
            if (liste != null && liste.length > offen.length)
              TextButton(
                key: const Key('geplant-alle'),
                onPressed: () => setState(() => _alle = !_alle),
                child: Text(_alle ? 'Nur offene' : 'Alle (${liste.length})'),
              ),
            IconButton(tooltip: 'Neu laden', onPressed: laden, icon: const Icon(Icons.refresh)),
          ],
        ),
        if (_fehler != null)
          Text(fehlerText(_fehler!), style: TextStyle(color: t.colorScheme.error))
        else if (liste == null)
          const Padding(padding: EdgeInsets.all(12), child: LinearProgressIndicator())
        else if (zeigen.isEmpty)
          Text('Nichts geplant.', style: t.textTheme.bodyMedium)
        else
          for (final a in zeigen)
            ListTile(
              key: Key('geplant-${a.id}'),
              contentPadding: EdgeInsets.zero,
              leading: Icon(switch (a.status) {
                AuftragsStatus.geplant => Icons.schedule,
                AuftragsStatus.laeuft => Icons.sync,
                AuftragsStatus.erledigt => Icons.check_circle_outline,
                AuftragsStatus.fehlgeschlagen => Icons.error_outline,
                _ => Icons.block,
              }),
              title: Text(a.titel),
              subtitle: Text(
                [
                  if (a.zeitpunkt != null) zeitText(a.zeitpunkt!),
                  a.status.titel,
                  ?a.ergebnisText,
                  if (a.erstelltVon != null) 'von ${a.erstelltVon}',
                ].join(' · '),
              ),
              trailing: a.stornierbar
                  ? TextButton(
                      key: Key('geplant-stornieren-${a.id}'),
                      onPressed: () => _stornieren(a),
                      child: const Text('Stornieren'),
                    )
                  : null,
            ),
      ],
    );
  }
}
