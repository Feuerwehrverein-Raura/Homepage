// Austritt aus dem Verein beantragen (`POST members/me/austritt`).
//
// Der Antrag loescht nichts — der Vorstand entscheidet gemaess Statuten. Das
// steht auch so da, damit niemand glaubt, mit dem Tippen sei die
// Mitgliedschaft beendet. Danach wird abgemeldet (wie die alte Android-App).

import 'package:fwv_anlass/fwv_anlass.dart' show mitSystemleiste;
import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';
import '../gemeinsam.dart';

class AustrittScreen extends StatefulWidget {
  const AustrittScreen({super.key, required this.dienste});

  final Dienste dienste;

  @override
  State<AustrittScreen> createState() => _AustrittScreenState();
}

class _AustrittScreenState extends State<AustrittScreen> {
  final _grund = TextEditingController();
  DateTime? _datum;
  bool _sendet = false;

  @override
  void dispose() {
    _grund.dispose();
    super.dispose();
  }

  Future<void> _datumWaehlen() async {
    final heute = DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: _datum ?? heute,
      firstDate: DateTime(heute.year, heute.month, heute.day),
      lastDate: DateTime(heute.year + 3, 12, 31),
      helpText: 'Gewünschtes Austrittsdatum',
    );
    if (d != null) setState(() => _datum = d);
  }

  Future<void> _senden() async {
    final ja = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Austritt beantragen?'),
        content: const Text('Der Vorstand wird über deinen Antrag informiert.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Abbrechen')),
          TextButton(
            onPressed: () => Navigator.pop(c, true),
            style: TextButton.styleFrom(foregroundColor: Theme.of(c).colorScheme.error),
            child: const Text('Antrag senden'),
          ),
        ],
      ),
    );
    if (ja != true || !mounted) return;

    setState(() => _sendet = true);
    try {
      final text = await widget.dienste.mitglieder.austrittBeantragen(
        grund: _grund.text,
        wunschdatum: _datum,
      );
      if (!mounted) return;
      setState(() => _sendet = false);
      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (c) => AlertDialog(
          title: const Text('Austritts-Antrag gesendet'),
          content: Text('$text\n\nDu wirst nun abgemeldet.'),
          actions: [TextButton(onPressed: () => Navigator.pop(c), child: const Text('OK'))],
        ),
      );
      await widget.dienste.sitzung.abmelden();
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _sendet = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final fehlerFarbe = Theme.of(context).colorScheme.error;
    return Scaffold(
      appBar: AppBar(title: const Text('Austritt')),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: mitSystemleiste(context, const EdgeInsets.all(16)),
                children: [
                  const Text(
                    'Möchtest du aus dem Feuerwehrverein Raura austreten? Der Antrag '
                    'geht an den Vorstand. Deine Mitgliedschaft und deine Daten '
                    'bleiben bestehen, bis der Vorstand gemäss Statuten darüber '
                    'entschieden hat.',
                  ),
                  const SizedBox(height: 24),
                  InkWell(
                    onTap: _datumWaehlen,
                    child: InputDecorator(
                      decoration: InputDecoration(
                        labelText: 'Wunschdatum (optional)',
                        suffixIcon: _datum == null
                            ? const Icon(Icons.calendar_today_outlined)
                            : IconButton(
                                onPressed: () => setState(() => _datum = null),
                                icon: const Icon(Icons.clear),
                                tooltip: 'Datum entfernen',
                              ),
                      ),
                      isEmpty: _datum == null,
                      child: Text(_datum == null ? '' : schweizerDatum(_datum!)),
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _grund,
                    decoration: const InputDecoration(labelText: 'Begründung (optional)'),
                    minLines: 3,
                    maxLines: 6,
                  ),
                ],
              ),
            ),
            // Unter der Liste statt in der Navigationsleiste: bleibt so auch
            // bei offener Tastatur sichtbar.
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: fehlerFarbe,
                    foregroundColor: Theme.of(context).colorScheme.onError,
                  ),
                  onPressed: _sendet ? null : _senden,
                  icon: _sendet
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.exit_to_app),
                  label: const Text('Austritt beantragen'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
