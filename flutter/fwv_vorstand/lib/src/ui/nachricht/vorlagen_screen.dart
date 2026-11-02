// Vorlagen verwalten (Nachricht > Verfassen > Vorlagen): anlegen, aendern,
// loeschen in dispatch_templates (api-dispatch /templates).
//
// Schutz: Die Vorlagen, die api-members per Namen benutzt ([systemVorlagen]),
// lassen sich nicht umbenennen oder loeschen - sonst kaemen Willkommens- und
// Bestaetigungsmails nicht mehr. Als HTML gespeicherte Vorlagen (alte Briefe)
// werden beim Speichern zu Text; davor warnt die Ansicht.

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:material_ui/material_ui.dart';

import '../../versand/versand.dart';
import '../../versand/versand_dienst.dart';
import 'versand_bausteine.dart';

class VorlagenScreen extends StatelessWidget {
  const VorlagenScreen({super.key, required this.dienst});

  final VersandDienst dienst;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Vorlagen')),
    body: _VorlagenListe(dienst: dienst),
  );
}

class _VorlagenListe extends StatefulWidget {
  const _VorlagenListe({required this.dienst});

  final VersandDienst dienst;

  @override
  State<_VorlagenListe> createState() => _VorlagenListeState();
}

class _VorlagenListeState extends State<_VorlagenListe> {
  var _stand = 0;

  Future<void> _bearbeiten(Vorlage? v) async {
    final gespeichert = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => VorlageFormular(dienst: widget.dienst, vorlage: v),
      ),
    );
    if (gespeichert == true && mounted) setState(() => _stand++);
  }

  String _typText(String? typ) =>
      vorlagenTypen.where((t) => t.$1 == typ).firstOrNull?.$2 ?? typ ?? 'ohne Typ';

  @override
  Widget build(BuildContext context) => Stack(
    children: [
      LadeAnsicht<List<Vorlage>>(
        key: ValueKey(_stand),
        laden: widget.dienst.vorlagen,
        leer: 'Noch keine Vorlagen.',
        istLeer: (l) => l.isEmpty,
        bauen: (context, liste, neuLaden) => RefreshIndicator(
          onRefresh: neuLaden,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: mitSystemleiste(
              context,
              const EdgeInsets.only(bottom: 88),
              maxBreite: kartenBreite,
            ),
            children: [
              for (final v in liste)
                ListTile(
                  key: Key('vorlage-${v.id}'),
                  leading: Icon(v.istSystem ? Icons.lock_outline : Icons.description_outlined),
                  title: Text(v.name),
                  subtitle: Text(
                    [
                      _typText(v.typ),
                      if (v.istSystem) 'für Benachrichtigungen',
                      if (v.betreff.isNotEmpty) v.betreff,
                    ].join(' · '),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  onTap: () => _bearbeiten(v),
                ),
            ],
          ),
        ),
      ),
      Positioned(
        right: 16,
        bottom: 16 + MediaQuery.paddingOf(context).bottom,
        child: FloatingActionButton.extended(
          key: const Key('vorlage-neu'),
          icon: const Icon(Icons.add),
          label: const Text('Neue Vorlage'),
          onPressed: () => _bearbeiten(null),
        ),
      ),
    ],
  );
}

/// Eine Vorlage anlegen oder aendern; gibt `true` zurueck, wenn gespeichert
/// oder geloescht wurde.
class VorlageFormular extends StatefulWidget {
  const VorlageFormular({super.key, required this.dienst, this.vorlage});

  final VersandDienst dienst;
  final Vorlage? vorlage;

  @override
  State<VorlageFormular> createState() => _VorlageFormularState();
}

class _VorlageFormularState extends State<VorlageFormular> {
  late final _name = TextEditingController(text: widget.vorlage?.name ?? '');
  late final _betreff = TextEditingController(text: widget.vorlage?.betreff ?? '');
  late final _text = TextEditingController(text: widget.vorlage?.text ?? '');
  late var _typ = widget.vorlage?.typ ?? 'email';
  var _arbeitet = false;

  bool get _system => widget.vorlage?.istSystem ?? false;

  @override
  void dispose() {
    _name.dispose();
    _betreff.dispose();
    _text.dispose();
    super.dispose();
  }

  Future<void> _speichern() async {
    if (_name.text.trim().isEmpty) {
      meldung(context, 'Bitte einen Namen eingeben.');
      return;
    }
    if (widget.vorlage?.istHtml ?? false) {
      final ok = await nachfragen(
        context,
        titel: 'Als Text speichern?',
        text:
            'Diese Vorlage ist als HTML gespeichert. Nach dem Speichern ist sie reiner Text – '
            'Schriften, Farben und Tabellen gehen verloren. Absätze und Platzhalter bleiben.',
        ja: 'Als Text speichern',
      );
      if (!ok || !mounted) return;
    }
    setState(() => _arbeitet = true);
    try {
      await widget.dienst.vorlageSpeichern(
        id: widget.vorlage?.id,
        // Benachrichtigungs-Vorlagen behalten ihren Namen.
        name: _system ? widget.vorlage!.name : _name.text,
        typ: _typ,
        betreff: _betreff.text,
        text: _text.text,
        variablen: widget.vorlage?.variablen,
      );
      if (mounted) Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _arbeitet = false);
    }
  }

  Future<void> _loeschen() async {
    final v = widget.vorlage!;
    final ok = await nachfragen(
      context,
      titel: 'Vorlage löschen?',
      text: '«${v.name}» ist danach für alle weg.',
      ja: 'Löschen',
    );
    if (!ok || !mounted) return;
    setState(() => _arbeitet = true);
    try {
      await widget.dienst.vorlageLoeschen(v.id);
      if (mounted) Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (mounted) {
        meldung(context, fehlerText(e));
        setState(() => _arbeitet = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final v = widget.vorlage;
    final typen = [
      ...vorlagenTypen,
      // unbekannter Typ aus der Datenbank bleibt waehlbar
      if (!vorlagenTypen.any((t) => t.$1 == _typ)) (_typ, _typ),
    ];
    return Scaffold(
      appBar: AppBar(
        title: Text(v == null ? 'Neue Vorlage' : 'Vorlage bearbeiten'),
        actions: [
          if (v != null && !_system)
            IconButton(
              key: const Key('vorlage-loeschen'),
              tooltip: 'Löschen',
              icon: const Icon(Icons.delete_outline),
              onPressed: _arbeitet ? null : _loeschen,
            ),
        ],
      ),
      body: ListView(
        padding: mitSystemleiste(context, const EdgeInsets.all(16), maxBreite: kartenBreite),
        children: [
          if (_system) ...[
            const Hinweis(
              key: Key('vorlage-system'),
              art: HinweisArt.neutral,
              text:
                  'Diese Vorlage verschickt die App selbst (Benachrichtigung an Mitglieder). '
                  'Name und Vorlage bleiben – Betreff und Text lassen sich anpassen.',
            ),
            const SizedBox(height: 12),
          ],
          if (v?.istHtml ?? false) ...[
            const Hinweis(
              key: Key('vorlage-html'),
              text: 'Als HTML gespeichert: Beim Speichern wird daraus Text (Formatierung geht verloren).',
            ),
            const SizedBox(height: 12),
          ],
          TextField(
            key: const Key('vorlage-name'),
            controller: _name,
            enabled: !_system && !_arbeitet,
            decoration: const InputDecoration(labelText: 'Name', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            key: const Key('vorlage-typ'),
            initialValue: _typ,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Art', border: OutlineInputBorder()),
            items: [
              for (final (wert, text) in typen) DropdownMenuItem(value: wert, child: Text(text)),
            ],
            onChanged: _arbeitet ? null : (t) => setState(() => _typ = t ?? _typ),
          ),
          const SizedBox(height: 12),
          TextField(
            key: const Key('vorlage-betreff'),
            controller: _betreff,
            enabled: !_arbeitet,
            decoration: const InputDecoration(labelText: 'Betreff', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 12),
          TextField(
            key: const Key('vorlage-text'),
            controller: _text,
            enabled: !_arbeitet,
            minLines: 8,
            maxLines: 20,
            keyboardType: TextInputType.multiline,
            decoration: InputDecoration(
              labelText: 'Text',
              alignLabelWithHint: true,
              border: const OutlineInputBorder(),
              helperText: 'Platzhalter: ${versandPlatzhalter.map((p) => '{{$p}}').join(' ')}',
              helperMaxLines: 3,
            ),
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            key: const Key('vorlage-speichern'),
            icon: const Icon(Icons.save_outlined),
            label: const Text('Speichern'),
            onPressed: _arbeitet ? null : _speichern,
          ),
        ],
      ),
    );
  }
}
