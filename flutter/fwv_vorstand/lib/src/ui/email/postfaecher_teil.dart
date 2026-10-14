// Postfaecher @fwv-raura.ch: Liste mit Speicherbalken, anlegen, bearbeiten
// (Name, Groesse, aktiv, Passwort), loeschen mit starker Rueckfrage.

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:material_ui/material_ui.dart';

import '../../email/mailcow_dienst.dart';
import '../bestaetigen.dart';

class PostfaecherTeil extends StatefulWidget {
  const PostfaecherTeil({super.key, required this.dienst});

  final MailcowDienst dienst;

  @override
  State<PostfaecherTeil> createState() => _PostfaecherTeilState();
}

class _PostfaecherTeilState extends State<PostfaecherTeil> {
  final _lader = GlobalKey<LadeAnsichtState<List<Postfach>>>();

  MailcowDienst get _d => widget.dienst;

  Future<void> _neuLaden() async => _lader.currentState?.neuLaden();

  Future<void> _anlegen() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => PostfachDialog(dienst: _d),
    );
    if (ok == true && mounted) {
      meldung(context, 'Postfach angelegt');
      await _neuLaden();
    }
  }

  Future<void> _bearbeiten(Postfach p) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => PostfachDialog(dienst: _d, postfach: p),
    );
    if (ok == true && mounted) {
      meldung(context, 'Postfach gespeichert');
      await _neuLaden();
    }
  }

  Future<void> _loeschen(Postfach p) async {
    final ja = await starkNachfragen(
      context,
      titel: '${p.adresse} löschen?',
      text:
          'Das Postfach wird mit ALLEN E-Mails darin gelöscht. Das lässt sich nicht '
          'rückgängig machen.',
      eintippen: p.lokalTeil,
      ja: 'Endgültig löschen',
    );
    if (!ja || !mounted) return;
    try {
      await _d.postfachLoeschen(p.adresse);
      if (!mounted) return;
      meldung(context, '${p.adresse} gelöscht');
      await _neuLaden();
    } on Object catch (e) {
      if (mounted) meldung(context, mailcowFehlerText(e));
    }
  }

  Future<void> _aktionen(Postfach p) async {
    final wahl = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(title: Text(p.adresse), subtitle: p.name == null ? null : Text(p.name!)),
            ListTile(
              leading: const Icon(Icons.edit_outlined),
              title: const Text('Bearbeiten'),
              subtitle: const Text('Name, Grösse, aktiv, Passwort'),
              onTap: () => Navigator.of(c).pop('bearbeiten'),
            ),
            ListTile(
              leading: Icon(Icons.delete_outline, color: Theme.of(c).colorScheme.error),
              title: const Text('Löschen'),
              onTap: () => Navigator.of(c).pop('loeschen'),
            ),
          ],
        ),
      ),
    );
    if (!mounted) return;
    switch (wahl) {
      case 'bearbeiten':
        await _bearbeiten(p);
      case 'loeschen':
        await _loeschen(p);
    }
  }

  @override
  Widget build(BuildContext context) {
    return LadeAnsicht<List<Postfach>>(
      key: _lader,
      laden: _d.postfaecher,
      bauen: (context, liste, _) {
        final t = Theme.of(context);
        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: mitSystemleiste(context, const EdgeInsets.fromLTRB(16, 12, 16, 24)),
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    '${liste.length} Postfächer @$mailcowDomain',
                    style: t.textTheme.titleSmall,
                  ),
                ),
                FilledButton.icon(
                  key: const Key('postfach-neu'),
                  onPressed: _anlegen,
                  icon: const Icon(Icons.add),
                  label: const Text('Neues Postfach'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (liste.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Text('Keine Postfächer gefunden.', textAlign: TextAlign.center),
              ),
            for (final (i, p) in liste.indexed) ...[
              if (i > 0) const Divider(height: 1),
              _PostfachZeile(postfach: p, antippen: () => _aktionen(p)),
            ],
          ],
        );
      },
    );
  }
}

class _PostfachZeile extends StatelessWidget {
  const _PostfachZeile({required this.postfach, required this.antippen});

  final Postfach postfach;
  final VoidCallback antippen;

  @override
  Widget build(BuildContext context) {
    final p = postfach;
    final t = Theme.of(context);
    return InkWell(
      key: Key('postfach-${p.adresse}'),
      onTap: antippen,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    p.adresse,
                    style: t.textTheme.titleSmall,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 8),
                HinweisChip(
                  p.aktiv ? 'aktiv' : 'inaktiv',
                  art: p.aktiv ? HinweisArt.gut : HinweisArt.schlecht,
                ),
              ],
            ),
            if (p.name != null) Text(p.name!, style: t.textTheme.bodySmall),
            const SizedBox(height: 6),
            SpeicherBalken(anteil: p.anteil),
            const SizedBox(height: 2),
            Text(
              '${groesseText(p.belegtBytes)} von ${groesseText(p.quotaBytes)} belegt'
              '${p.nachrichten == null ? '' : ' · ${p.nachrichten} Mails'}',
              style: t.textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}

/// Balken gruen / orange (ab 70 %) / rot (ab 90 %), wie vorstand.html.
class SpeicherBalken extends StatelessWidget {
  const SpeicherBalken({super.key, required this.anteil});

  final double anteil;

  @override
  Widget build(BuildContext context) {
    final farbe = anteil >= 0.9
        ? FwvFarben.fehler
        : anteil >= 0.7
        ? FwvFarben.orange
        : FwvFarben.gruen;
    return ClipRRect(
      borderRadius: BorderRadius.circular(4),
      child: LinearProgressIndicator(
        value: anteil,
        minHeight: 8,
        color: farbe,
        backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
      ),
    );
  }
}

/// Anlegen (ohne [postfach]) oder bearbeiten. Speichert selbst und gibt
/// true zurueck; Fehler bleiben im Dialog stehen.
class PostfachDialog extends StatefulWidget {
  const PostfachDialog({super.key, required this.dienst, this.postfach});

  final MailcowDienst dienst;
  final Postfach? postfach;

  @override
  State<PostfachDialog> createState() => _PostfachDialogState();
}

class _PostfachDialogState extends State<PostfachDialog> {
  final _formular = GlobalKey<FormState>();
  late final _lokal = TextEditingController(text: widget.postfach?.lokalTeil ?? '');
  late final _name = TextEditingController(text: widget.postfach?.name ?? '');
  final _passwort = TextEditingController();
  late final _quota = TextEditingController(text: '${widget.postfach?.quotaMb ?? 1024}');
  late bool _aktiv = widget.postfach?.aktiv ?? true;
  var _zeigen = false;
  var _sendet = false;
  String? _fehler;

  bool get _neu => widget.postfach == null;

  /// Mindestlaenge fuer neue Passwoerter (Mailcow prueft ausserdem die
  /// Zusammensetzung).
  static const _minLaenge = 8;

  @override
  void dispose() {
    _lokal.dispose();
    _name.dispose();
    _passwort.dispose();
    _quota.dispose();
    super.dispose();
  }

  Future<void> _speichern() async {
    if (!_formular.currentState!.validate()) return;
    setState(() {
      _sendet = true;
      _fehler = null;
    });
    final quota = int.parse(_quota.text.trim());
    try {
      final p = widget.postfach;
      if (p == null) {
        await widget.dienst.postfachAnlegen(
          lokalTeil: _lokal.text,
          name: _name.text,
          passwort: _passwort.text,
          quotaMb: quota,
          aktiv: _aktiv,
        );
      } else {
        final name = _name.text.trim() == (p.name ?? '') ? null : _name.text;
        final neueQuota = quota == p.quotaMb ? null : quota;
        final aktiv = _aktiv == p.aktiv ? null : _aktiv;
        // Nichts geaendert: nichts schicken.
        if (name == null && neueQuota == null && aktiv == null && _passwort.text.isEmpty) {
          Navigator.of(context).pop(false);
          return;
        }
        await widget.dienst.postfachAendern(
          p.adresse,
          name: name,
          quotaMb: neueQuota,
          aktiv: aktiv,
          passwort: _passwort.text,
        );
      }
      if (mounted) Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (mounted) {
        setState(() {
          _sendet = false;
          _fehler = mailcowFehlerText(e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(_neu ? 'Neues Postfach' : widget.postfach!.adresse),
      content: SizedBox(
        width: 460,
        child: Form(
          key: _formular,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_neu)
                  TextFormField(
                    key: const Key('postfach-lokal'),
                    controller: _lokal,
                    autocorrect: false,
                    enableSuggestions: false,
                    decoration: const InputDecoration(
                      labelText: 'Adresse',
                      suffixText: '@$mailcowDomain',
                    ),
                    validator: (t) {
                      final s = (t ?? '').trim();
                      if (s.isEmpty) return 'Bitte eine Adresse angeben.';
                      if (!RegExp(r'^[a-zA-Z0-9._-]+$').hasMatch(s)) {
                        return 'Nur Buchstaben, Ziffern, Punkt, - und _.';
                      }
                      return null;
                    },
                  ),
                TextFormField(
                  key: const Key('postfach-name'),
                  controller: _name,
                  decoration: const InputDecoration(labelText: 'Name (z.B. Kassier)'),
                  validator: (t) => _neu && (t ?? '').trim().isEmpty ? 'Bitte einen Namen.' : null,
                ),
                TextFormField(
                  key: const Key('postfach-passwort'),
                  controller: _passwort,
                  obscureText: !_zeigen,
                  autocorrect: false,
                  enableSuggestions: false,
                  decoration: InputDecoration(
                    labelText: _neu ? 'Passwort' : 'Neues Passwort',
                    helperText: _neu
                        ? 'Mindestens $_minLaenge Zeichen, Gross-/Kleinbuchstaben und Zahl'
                        : 'Leer lassen, um es nicht zu ändern',
                    suffixIcon: IconButton(
                      onPressed: () => setState(() => _zeigen = !_zeigen),
                      icon: Icon(_zeigen ? Icons.visibility_off : Icons.visibility),
                      tooltip: _zeigen ? 'Verbergen' : 'Anzeigen',
                    ),
                  ),
                  validator: (t) {
                    final s = t ?? '';
                    if (s.isEmpty) return _neu ? 'Bitte ein Passwort.' : null;
                    return s.length < _minLaenge ? 'Mindestens $_minLaenge Zeichen.' : null;
                  },
                ),
                TextFormField(
                  key: const Key('postfach-quota'),
                  controller: _quota,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Grösse', suffixText: 'MB'),
                  validator: (t) {
                    final n = int.tryParse((t ?? '').trim());
                    return n == null || n <= 0 ? 'Bitte eine Zahl in MB.' : null;
                  },
                ),
                SwitchListTile(
                  key: const Key('postfach-aktiv'),
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Aktiv'),
                  value: _aktiv,
                  onChanged: (w) => setState(() => _aktiv = w),
                ),
                if (_fehler != null)
                  Text(_fehler!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ],
            ),
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _sendet ? null : () => Navigator.of(context).pop(false),
          child: const Text('Abbrechen'),
        ),
        FilledButton(
          key: const Key('postfach-speichern'),
          onPressed: _sendet ? null : _speichern,
          child: Text(_neu ? 'Anlegen' : 'Speichern'),
        ),
      ],
    );
  }
}
