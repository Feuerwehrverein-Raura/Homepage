// Jahreseinstellung bearbeiten: Jahresbeitrag, GV (freier Text), Faelligkeit,
// Beschreibung. Speichert selbst (POST /membership-fees/settings, Upsert) und
// gibt die neue Einstellung zurueck.

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:material_ui/material_ui.dart';

import 'beitraege_daten.dart';

class EinstellungDialog extends StatefulWidget {
  const EinstellungDialog({
    super.key,
    required this.dienst,
    required this.jahr,
    this.einstellung,
    this.hatBeitraege = false,
  });

  final BeitraegeDienst dienst;
  final int jahr;
  final BeitragsEinstellung? einstellung;

  /// Gibt es schon Beitraege? Dann aendert ein neuer Betrag sie nicht.
  final bool hatBeitraege;

  @override
  State<EinstellungDialog> createState() => _EinstellungDialogState();
}

class _EinstellungDialogState extends State<EinstellungDialog> {
  final _formular = GlobalKey<FormState>();
  late final _betrag = TextEditingController(
    text: widget.einstellung == null ? '' : widget.einstellung!.betrag.toStringAsFixed(2),
  );
  late final _gv = TextEditingController(text: widget.einstellung?.gv ?? '');
  late final _beschreibung = TextEditingController(text: widget.einstellung?.beschreibung ?? '');
  late DateTime? _faellig = widget.einstellung?.faellig;
  var _sendet = false;
  String? _fehler;

  @override
  void dispose() {
    _betrag.dispose();
    _gv.dispose();
    _beschreibung.dispose();
    super.dispose();
  }

  static num? _betragAus(String text) {
    final s = text.trim().replaceAll('’', '').replaceAll("'", '').replaceAll(',', '.');
    final n = num.tryParse(s);
    return n == null || n <= 0 ? null : n;
  }

  Future<void> _datumWaehlen() async {
    final d = await showDatePicker(
      context: context,
      initialDate: _faellig ?? DateTime(widget.jahr, 3, 31),
      firstDate: DateTime(widget.jahr - 1),
      lastDate: DateTime(widget.jahr + 1, 12, 31),
      helpText: 'Fällig am',
    );
    if (d != null) setState(() => _faellig = d);
  }

  Future<void> _speichern() async {
    if (!_formular.currentState!.validate()) return;
    setState(() {
      _sendet = true;
      _fehler = null;
    });
    try {
      final neu = await widget.dienst.einstellungSpeichern(
        jahr: widget.jahr,
        betrag: _betragAus(_betrag.text)!,
        gv: _gv.text,
        faellig: _faellig,
        beschreibung: _beschreibung.text,
      );
      if (mounted) Navigator.of(context).pop(neu);
    } on Object catch (e) {
      if (mounted) {
        setState(() {
          _sendet = false;
          _fehler = fehlerText(e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final f = _faellig;
    return AlertDialog(
      title: Text('Jahresbeitrag ${widget.jahr}'),
      content: SizedBox(
        width: 460,
        child: Form(
          key: _formular,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextFormField(
                  key: const Key('einstellung-betrag'),
                  controller: _betrag,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(
                    labelText: 'Betrag',
                    prefixText: 'CHF ',
                    helperText: widget.hatBeitraege
                        ? 'Ändert die schon erzeugten Beiträge nicht.'
                        : null,
                    helperMaxLines: 2,
                  ),
                  validator: (w) => _betragAus(w ?? '') == null ? 'Bitte einen Betrag.' : null,
                ),
                TextFormField(
                  key: const Key('einstellung-gv'),
                  controller: _gv,
                  decoration: const InputDecoration(
                    labelText: 'Generalversammlung',
                    helperText: 'Freier Text, z.B. «14. März 2026»',
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        f == null ? 'Fällig am: –' : 'Fällig am ${datumText(f)}',
                        key: const Key('einstellung-faellig'),
                        style: t.textTheme.bodyLarge,
                      ),
                    ),
                    TextButton(
                      key: const Key('einstellung-faellig-waehlen'),
                      onPressed: _datumWaehlen,
                      child: const Text('Wählen'),
                    ),
                    if (f != null)
                      IconButton(
                        tooltip: 'Fälligkeit entfernen',
                        onPressed: () => setState(() => _faellig = null),
                        icon: const Icon(Icons.clear),
                      ),
                  ],
                ),
                Text(
                  'Ohne Fälligkeit gibt es keine Zahlungserinnerungen.',
                  style: t.textTheme.bodySmall,
                ),
                TextFormField(
                  key: const Key('einstellung-beschreibung'),
                  controller: _beschreibung,
                  maxLines: 2,
                  decoration: const InputDecoration(labelText: 'Beschreibung (optional)'),
                ),
                if (_fehler != null) ...[
                  const SizedBox(height: 8),
                  Text(_fehler!, style: TextStyle(color: t.colorScheme.error)),
                ],
              ],
            ),
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _sendet ? null : () => Navigator.of(context).pop(),
          child: const Text('Abbrechen'),
        ),
        FilledButton(
          key: const Key('einstellung-speichern'),
          onPressed: _sendet ? null : _speichern,
          child: const Text('Speichern'),
        ),
      ],
    );
  }
}
