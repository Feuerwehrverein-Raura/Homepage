// Starke Rueckfrage fuer Schritte, die sich nicht zurueckholen lassen
// (Postfach loeschen, neues Passwort im Datenblatt, Massenversand): der Knopf
// wird erst frei, wenn ein Haken gesetzt bzw. ein Wort eingetippt ist.

import 'package:material_ui/material_ui.dart';

/// true nur, wenn bestaetigt. [haken]: Satz neben dem Pflicht-Haken;
/// [eintippen]: Wort, das genau so eingegeben werden muss (Gross/klein egal).
Future<bool> starkNachfragen(
  BuildContext context, {
  required String titel,
  required String text,
  required String ja,
  String? haken,
  String? eintippen,
  bool gefaehrlich = true,
}) async {
  final antwort = await showDialog<bool>(
    context: context,
    builder: (_) => _StarkeRueckfrage(
      titel: titel,
      text: text,
      ja: ja,
      haken: haken,
      eintippen: eintippen,
      gefaehrlich: gefaehrlich,
    ),
  );
  return antwort ?? false;
}

class _StarkeRueckfrage extends StatefulWidget {
  const _StarkeRueckfrage({
    required this.titel,
    required this.text,
    required this.ja,
    required this.haken,
    required this.eintippen,
    required this.gefaehrlich,
  });

  final String titel;
  final String text;
  final String ja;
  final String? haken;
  final String? eintippen;
  final bool gefaehrlich;

  @override
  State<_StarkeRueckfrage> createState() => _StarkeRueckfrageState();
}

class _StarkeRueckfrageState extends State<_StarkeRueckfrage> {
  final _eingabe = TextEditingController();
  var _gesetzt = false;

  @override
  void dispose() {
    _eingabe.dispose();
    super.dispose();
  }

  bool get _frei {
    if (widget.haken != null && !_gesetzt) return false;
    final wort = widget.eintippen;
    if (wort != null && _eingabe.text.trim().toLowerCase() != wort.toLowerCase()) return false;
    return true;
  }

  @override
  Widget build(BuildContext context) {
    final farben = Theme.of(context).colorScheme;
    return AlertDialog(
      title: Text(widget.titel),
      content: SizedBox(
        width: 480,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(widget.text),
              if (widget.haken case final h?) ...[
                const SizedBox(height: 8),
                CheckboxListTile(
                  key: const Key('bestaetigen-haken'),
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  value: _gesetzt,
                  onChanged: (w) => setState(() => _gesetzt = w ?? false),
                  title: Text(h),
                ),
              ],
              if (widget.eintippen case final w?) ...[
                const SizedBox(height: 12),
                TextField(
                  key: const Key('bestaetigen-eingabe'),
                  controller: _eingabe,
                  autocorrect: false,
                  enableSuggestions: false,
                  onChanged: (_) => setState(() {}),
                  decoration: InputDecoration(labelText: 'Zur Bestätigung «$w» eintippen'),
                ),
              ],
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: const Text('Abbrechen'),
        ),
        FilledButton(
          key: const Key('bestaetigen-ja'),
          style: widget.gefaehrlich
              ? FilledButton.styleFrom(
                  backgroundColor: farben.error,
                  foregroundColor: farben.onError,
                )
              : null,
          onPressed: _frei ? () => Navigator.of(context).pop(true) : null,
          child: Text(widget.ja),
        ),
      ],
    );
  }
}
