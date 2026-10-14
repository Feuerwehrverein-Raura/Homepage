// Kleine Bausteine der Mitgliederverwaltung: Rundbild, Status-Chip,
// Datumsfeld, Dialog "Benachrichtigen".

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../../mitglieder/mitglieder_verwaltung.dart';
import '../../mitglieder/modelle.dart';
import '../../push_dienst.dart';
import '../nachricht/push_oeffnen_feld.dart';

/// Profilfoto rund; ohne Foto (oder wenn es nicht laedt) die Initialen.
///
/// Das Backend hat dafuer GET /avatar/:name, liefert aber SVG - das kann
/// Image.network nicht zeichnen. Die Initialen entstehen deshalb hier.
class MitgliedBild extends StatelessWidget {
  const MitgliedBild({super.key, required this.mitglied, required this.api, this.groesse = 40});

  final VorstandMitglied mitglied;
  final ApiClient api;
  final double groesse;

  @override
  Widget build(BuildContext context) {
    final farben = Theme.of(context).colorScheme;
    final ersatz = Text(
      mitglied.initialen,
      style: TextStyle(
        fontSize: groesse * 0.38,
        fontWeight: FontWeight.w600,
        color: farben.onSurfaceVariant,
      ),
    );
    final adresse = mitglied.fotoAdresse(api.basis);
    return CircleAvatar(
      radius: groesse / 2,
      backgroundColor: farben.outlineVariant,
      child: adresse == null
          ? ersatz
          : ClipOval(
              child: Image.network(
                adresse.toString(),
                headers: api.kopfzeilenFuer(adresse),
                width: groesse,
                height: groesse,
                fit: BoxFit.cover,
                excludeFromSemantics: true,
                errorBuilder: (_, _, _) => Center(child: ersatz),
              ),
            ),
    );
  }
}

/// Farbe eines Mitglieder-Status.
HinweisArt statusArt(String? status) => switch (status) {
  'Aktivmitglied' || 'Ehrenmitglied' => HinweisArt.gut,
  'Aufnahme pendent' => HinweisArt.warnung,
  'Ausgetreten' || 'Verstorben' => HinweisArt.schlecht,
  _ => HinweisArt.neutral,
};

class MitgliedStatusChip extends StatelessWidget {
  const MitgliedStatusChip({super.key, required this.status});

  final String? status;

  @override
  Widget build(BuildContext context) =>
      HinweisChip(status ?? 'ohne Status', art: statusArt(status));
}

/// Datum aus dem Datumswaehler, mit "entfernen".
class DatumFeld extends StatelessWidget {
  const DatumFeld({
    super.key,
    required this.titel,
    required this.datum,
    required this.aendern,
    this.ersteAuswahlJahr = false,
  });

  final String titel;
  final DateTime? datum;
  final ValueChanged<DateTime?> aendern;

  /// Ohne Datum zuerst das Jahr waehlen (Geburtstag: sonst Jahrzehnte
  /// blaettern).
  final bool ersteAuswahlJahr;

  Future<void> _waehlen(BuildContext context) async {
    final heute = DateTime.now();
    final gewaehlt = await showDatePicker(
      context: context,
      initialDate: datum ?? (ersteAuswahlJahr ? DateTime(heute.year - 30) : heute),
      firstDate: DateTime(1900),
      lastDate: DateTime(heute.year + 1, 12, 31),
      initialDatePickerMode: datum == null && ersteAuswahlJahr
          ? DatePickerMode.year
          : DatePickerMode.day,
      helpText: titel,
    );
    if (gewaehlt != null) aendern(gewaehlt);
  }

  @override
  Widget build(BuildContext context) {
    return InkWell(
      key: Key('datum-$titel'),
      onTap: () => _waehlen(context),
      borderRadius: BorderRadius.circular(4),
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: titel,
          suffixIcon: datum == null
              ? const Icon(Icons.calendar_today_outlined)
              : IconButton(
                  onPressed: () => aendern(null),
                  icon: const Icon(Icons.clear),
                  tooltip: '$titel entfernen',
                ),
        ),
        isEmpty: datum == null,
        child: Text(datum == null ? '' : schweizerDatum(datum!)),
      ),
    );
  }
}

/// Dialog "Benachrichtigen": Titel, Nachricht, optional per E-Mail und was
/// das Antippen in der App oeffnet.
/// Schickt selbst und meldet das Ergebnis.
Future<void> benachrichtigen(
  BuildContext context,
  MitgliederVerwaltung verwaltung,
  VorstandMitglied m,
) async {
  final gesendet = await showDialog<Benachrichtigt>(
    context: context,
    builder: (_) => _BenachrichtigenDialog(verwaltung: verwaltung, mitglied: m),
  );
  if (gesendet == null || !context.mounted) return;
  meldung(
    context,
    'Benachrichtigung gesendet (Push: ${gesendet.perPush}'
    '${gesendet.perEmail > 0 ? ', E-Mail: ${gesendet.perEmail}' : ''})',
  );
}

class _BenachrichtigenDialog extends StatefulWidget {
  const _BenachrichtigenDialog({required this.verwaltung, required this.mitglied});

  final MitgliederVerwaltung verwaltung;
  final VorstandMitglied mitglied;

  @override
  State<_BenachrichtigenDialog> createState() => _BenachrichtigenDialogState();
}

class _BenachrichtigenDialogState extends State<_BenachrichtigenDialog> {
  final _formular = GlobalKey<FormState>();
  final _titel = TextEditingController();
  final _text = TextEditingController();
  bool _auchEmail = false;
  bool _sendet = false;
  PushOeffnen _oeffnen = PushOeffnen.nichts;

  @override
  void dispose() {
    _titel.dispose();
    _text.dispose();
    super.dispose();
  }

  Future<void> _senden() async {
    if (!_formular.currentState!.validate()) return;
    setState(() => _sendet = true);
    try {
      final r = await widget.verwaltung.benachrichtigen(
        [widget.mitglied.id],
        titel: _titel.text,
        text: _text.text,
        auchEmail: _auchEmail,
        oeffnen: _oeffnen,
      );
      if (mounted) Navigator.of(context).pop(r);
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _sendet = false);
      meldung(context, fehlerText(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final hatEmail = widget.mitglied.email != null;
    return AlertDialog(
      title: Text('${widget.mitglied.name} benachrichtigen'),
      content: SizedBox(
        width: 480,
        child: Form(
          key: _formular,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextFormField(
                  key: const Key('push-titel'),
                  controller: _titel,
                  decoration: const InputDecoration(labelText: 'Titel *'),
                  textInputAction: TextInputAction.next,
                  validator: (t) => (t ?? '').trim().isEmpty ? 'Bitte einen Titel angeben.' : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  key: const Key('push-text'),
                  controller: _text,
                  decoration: const InputDecoration(labelText: 'Nachricht *'),
                  minLines: 3,
                  maxLines: 8,
                  validator: (t) =>
                      (t ?? '').trim().isEmpty ? 'Bitte eine Nachricht angeben.' : null,
                ),
                const SizedBox(height: 8),
                SwitchListTile(
                  key: const Key('push-email'),
                  contentPadding: EdgeInsets.zero,
                  value: _auchEmail && hatEmail,
                  onChanged: hatEmail ? (v) => setState(() => _auchEmail = v) : null,
                  title: const Text('Zusätzlich per E-Mail'),
                  subtitle: hatEmail ? null : const Text('Keine E-Mail-Adresse hinterlegt'),
                ),
                const SizedBox(height: 8),
                PushOeffnenFeld(
                  api: widget.verwaltung.api,
                  wert: _oeffnen,
                  aktiv: !_sendet,
                  geaendert: (w) => setState(() => _oeffnen = w),
                ),
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
          key: const Key('push-senden'),
          onPressed: _sendet ? null : _senden,
          child: Text(_sendet ? 'Wird gesendet …' : 'Senden'),
        ),
      ],
    );
  }
}
