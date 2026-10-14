// Aliase @fwv-raura.ch: Liste, anlegen, Ziele und aktiv aendern, loeschen.
// mitglieder@ wird aus der Zustellliste gefuellt (dort abgleichen).

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:material_ui/material_ui.dart';

import '../../email/mailcow_dienst.dart';

/// Dieser Alias wird vom Abgleich in der Zustellliste ueberschrieben.
const mitgliederAlias = 'mitglieder@$mailcowDomain';

class AliaseTeil extends StatefulWidget {
  const AliaseTeil({super.key, required this.dienst});

  final MailcowDienst dienst;

  @override
  State<AliaseTeil> createState() => _AliaseTeilState();
}

class _AliaseTeilState extends State<AliaseTeil> {
  final _lader = GlobalKey<LadeAnsichtState<List<Alias>>>();
  final _suche = TextEditingController();

  MailcowDienst get _d => widget.dienst;

  @override
  void dispose() {
    _suche.dispose();
    super.dispose();
  }

  Future<void> _neuLaden() async => _lader.currentState?.neuLaden();

  Future<void> _bearbeiten([Alias? a]) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AliasDialog(dienst: _d, alias: a),
    );
    if (ok == true && mounted) {
      meldung(context, a == null ? 'Alias angelegt' : 'Alias gespeichert');
      await _neuLaden();
    }
  }

  Future<void> _loeschen(Alias a) async {
    final ja = await nachfragen(
      context,
      titel: '${a.adresse} löschen?',
      text:
          'Mails an ${a.adresse} kommen danach nicht mehr an (${a.ziele.length} '
          '${a.ziele.length == 1 ? 'Ziel' : 'Ziele'}).',
      ja: 'Löschen',
    );
    if (!ja || !mounted) return;
    try {
      await _d.aliasLoeschen(a.id);
      if (!mounted) return;
      meldung(context, '${a.adresse} gelöscht');
      await _neuLaden();
    } on Object catch (e) {
      if (mounted) meldung(context, mailcowFehlerText(e));
    }
  }

  Future<void> _aktionen(Alias a) async {
    final wahl = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (c) => SafeArea(
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ListTile(title: Text(a.adresse), subtitle: Text(a.ziele.join('\n'))),
              ListTile(
                leading: const Icon(Icons.edit_outlined),
                title: const Text('Bearbeiten'),
                subtitle: const Text('Ziele, aktiv'),
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
      ),
    );
    if (!mounted) return;
    switch (wahl) {
      case 'bearbeiten':
        await _bearbeiten(a);
      case 'loeschen':
        await _loeschen(a);
    }
  }

  @override
  Widget build(BuildContext context) {
    return LadeAnsicht<List<Alias>>(
      key: _lader,
      laden: _d.aliase,
      bauen: (context, alle, _) {
        final t = Theme.of(context);
        final s = _suche.text.trim().toLowerCase();
        final liste = [
          for (final a in alle)
            if (s.isEmpty ||
                a.adresse.toLowerCase().contains(s) ||
                a.ziel.toLowerCase().contains(s))
              a,
        ];
        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: mitSystemleiste(context, const EdgeInsets.fromLTRB(16, 12, 16, 24)),
          children: [
            Row(
              children: [
                Expanded(child: Text('${alle.length} Aliase', style: t.textTheme.titleSmall)),
                FilledButton.icon(
                  key: const Key('alias-neu'),
                  onPressed: _bearbeiten,
                  icon: const Icon(Icons.add),
                  label: const Text('Neuer Alias'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            TextField(
              key: const Key('alias-suche'),
              controller: _suche,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.search),
                hintText: 'Adresse oder Ziel',
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
            const SizedBox(height: 4),
            if (liste.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Text('Keine Aliase.', textAlign: TextAlign.center),
              ),
            for (final (i, a) in liste.indexed) ...[
              if (i > 0) const Divider(height: 1),
              ListTile(
                key: Key('alias-${a.adresse}'),
                contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                title: Text(a.adresse),
                subtitle: Text(
                  a.ziele.length <= 3
                      ? a.ziele.join(', ')
                      : '${a.ziele.take(2).join(', ')} und ${a.ziele.length - 2} weitere',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                trailing: a.aktiv ? null : const HinweisChip('inaktiv', art: HinweisArt.schlecht),
                onTap: () => _aktionen(a),
              ),
            ],
          ],
        );
      },
    );
  }
}

/// Anlegen (ohne [alias]) oder bearbeiten; speichert selbst, true = gespeichert.
class AliasDialog extends StatefulWidget {
  const AliasDialog({super.key, required this.dienst, this.alias});

  final MailcowDienst dienst;
  final Alias? alias;

  @override
  State<AliasDialog> createState() => _AliasDialogState();
}

class _AliasDialogState extends State<AliasDialog> {
  final _formular = GlobalKey<FormState>();
  final _adresse = TextEditingController();
  late final _ziele = TextEditingController(text: widget.alias?.ziele.join('\n') ?? '');
  late bool _aktiv = widget.alias?.aktiv ?? true;
  var _sendet = false;
  String? _fehler;

  bool get _neu => widget.alias == null;

  static final _email = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

  @override
  void dispose() {
    _adresse.dispose();
    _ziele.dispose();
    super.dispose();
  }

  Future<void> _speichern() async {
    if (!_formular.currentState!.validate()) return;
    final ziele = zieleAusText(_ziele.text);
    setState(() {
      _sendet = true;
      _fehler = null;
    });
    try {
      final a = widget.alias;
      if (a == null) {
        await widget.dienst.aliasAnlegen(adresse: _adresse.text, ziele: ziele, aktiv: _aktiv);
      } else {
        final zieleNeu = ziele.join(',') == a.ziele.join(',') ? null : ziele;
        final aktivNeu = _aktiv == a.aktiv ? null : _aktiv;
        if (zieleNeu == null && aktivNeu == null) {
          Navigator.of(context).pop(false);
          return;
        }
        await widget.dienst.aliasAendern(a.id, ziele: zieleNeu, aktiv: aktivNeu);
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
    final t = Theme.of(context);
    return AlertDialog(
      title: Text(_neu ? 'Neuer Alias' : widget.alias!.adresse),
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
                    key: const Key('alias-adresse'),
                    controller: _adresse,
                    autocorrect: false,
                    enableSuggestions: false,
                    decoration: const InputDecoration(
                      labelText: 'Adresse',
                      helperText: 'z.B. info – ohne Domain wird @$mailcowDomain ergänzt',
                    ),
                    validator: (w) {
                      final s = (w ?? '').trim();
                      if (s.isEmpty) return 'Bitte eine Adresse.';
                      if (s.contains('@') && !_email.hasMatch(s)) return 'Ungültige Adresse.';
                      if (!s.contains('@') && !RegExp(r'^[a-zA-Z0-9._-]+$').hasMatch(s)) {
                        return 'Nur Buchstaben, Ziffern, Punkt, - und _.';
                      }
                      return null;
                    },
                  )
                else if (widget.alias!.adresse == mitgliederAlias)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(
                      'Dieser Alias wird beim Abgleich in der Zustellliste überschrieben.',
                      style: t.textTheme.bodySmall?.copyWith(color: FwvFarben.orange),
                    ),
                  ),
                TextFormField(
                  key: const Key('alias-ziele'),
                  controller: _ziele,
                  minLines: 2,
                  maxLines: 6,
                  autocorrect: false,
                  enableSuggestions: false,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(
                    labelText: 'Weiterleiten an',
                    helperText: 'Eine Adresse pro Zeile oder mit Komma getrennt',
                  ),
                  validator: (w) {
                    final ziele = zieleAusText(w ?? '');
                    if (ziele.isEmpty) return 'Mindestens eine Zieladresse.';
                    final falsch = ziele.where((z) => !_email.hasMatch(z)).toList();
                    return falsch.isEmpty ? null : 'Ungültig: ${falsch.join(', ')}';
                  },
                ),
                SwitchListTile(
                  key: const Key('alias-aktiv'),
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Aktiv'),
                  value: _aktiv,
                  onChanged: (w) => setState(() => _aktiv = w),
                ),
                if (_fehler != null) Text(_fehler!, style: TextStyle(color: t.colorScheme.error)),
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
          key: const Key('alias-speichern'),
          onPressed: _sendet ? null : _speichern,
          child: Text(_neu ? 'Anlegen' : 'Speichern'),
        ),
      ],
    );
  }
}
