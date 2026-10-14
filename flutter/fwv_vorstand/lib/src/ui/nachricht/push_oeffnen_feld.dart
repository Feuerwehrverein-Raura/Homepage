// Auswahl "Beim Antippen öffnen" fuer App-Push (an alle, Benachrichtigen):
// nichts (die App zeigt die Mitteilung nochmals), ein kommender Anlass
// (`GET events?aktuell=true`) oder das Profil. Laden die Anlaesse nicht,
// bleiben nichts und Profil waehlbar.

import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../../push_dienst.dart';

class PushOeffnenFeld extends StatefulWidget {
  const PushOeffnenFeld({
    super.key,
    required this.api,
    required this.wert,
    required this.geaendert,
    this.aktiv = true,
  });

  final ApiClient api;
  final PushOeffnen wert;
  final ValueChanged<PushOeffnen> geaendert;
  final bool aktiv;

  @override
  State<PushOeffnenFeld> createState() => _PushOeffnenFeldState();
}

class _PushOeffnenFeldState extends State<PushOeffnenFeld> {
  /// null: laedt noch.
  List<Anlass>? _anlaesse;
  var _fehler = false;

  @override
  void initState() {
    super.initState();
    _laden();
  }

  Future<void> _laden() async {
    try {
      final alle = await AnlaesseDienst(widget.api).aktuelle();
      if (!mounted) return;
      setState(
        () => _anlaesse = [
          for (final a in alle)
            if (a.app.gruppe == AnlassGruppe.kommend && a.id.isNotEmpty) a,
        ],
      );
    } on Object {
      if (mounted) {
        setState(() {
          _anlaesse = const [];
          _fehler = true;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final anlaesse = _anlaesse;
    final eintraege = <PushOeffnen, String>{
      PushOeffnen.nichts: 'Nichts – Mitteilung in der App zeigen',
      PushOeffnen.profil: 'Profil',
      for (final a in anlaesse ?? const <Anlass>[])
        PushOeffnen.anlass(a.id, titel: a.titel): [
          'Anlass: ${a.titel}',
          ?a.app.datumText,
        ].join(' · '),
      // Gewaehlter Anlass, der (noch) nicht in der Liste steht.
      if (widget.wert.anlassId != null &&
          !(anlaesse ?? []).any((a) => a.id == widget.wert.anlassId))
        widget.wert: 'Anlass: ${widget.wert.anlassTitel ?? widget.wert.anlassId}',
    };
    final String hilfe;
    if (anlaesse == null) {
      hilfe = 'Anlässe werden geladen …';
    } else if (_fehler) {
      hilfe = 'Anlässe konnten nicht geladen werden.';
    } else if (widget.wert == PushOeffnen.nichts) {
      hilfe = 'Die App zeigt die Mitteilung nach dem Öffnen nochmals an.';
    } else {
      hilfe = 'Antippen der Mitteilung öffnet diese Stelle in der App.';
    }
    // Neu aufbauen, wenn der Wert von aussen wechselt (z.B. nach dem Senden
    // zurueck auf nichts) - initialValue gilt sonst nur beim ersten Mal.
    return KeyedSubtree(key: ValueKey(widget.wert), child: _feld(eintraege, hilfe));
  }

  Widget _feld(Map<PushOeffnen, String> eintraege, String hilfe) {
    return DropdownButtonFormField<PushOeffnen>(
      key: const Key('push-oeffnen'),
      initialValue: widget.wert,
      isExpanded: true,
      decoration: InputDecoration(
        labelText: 'Beim Antippen öffnen',
        border: const OutlineInputBorder(),
        helperText: hilfe,
        helperMaxLines: 2,
      ),
      items: [
        for (final MapEntry(key: wert, value: text) in eintraege.entries)
          DropdownMenuItem(
            value: wert,
            child: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis),
          ),
      ],
      onChanged: widget.aktiv ? (w) => widget.geaendert(w ?? PushOeffnen.nichts) : null,
    );
  }
}
