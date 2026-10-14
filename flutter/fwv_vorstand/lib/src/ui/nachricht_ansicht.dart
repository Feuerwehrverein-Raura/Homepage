// Nachricht im Vorstand-Bereich (docs/vorstand-funktionen.md, Abschnitt 7,
// Phase 1): App-Push an alle - Titel und Text, Vorschau, Rueckfrage,
// Ergebnis. E-Mail und Brief (Vorlagen, Empfaenger, Vorschau) kommen mit
// Phase 2; bis dahin fuehrt ein Knopf auf die Website.
//
// Vorbild: vorstand.html (push-modal). Backend: api-events POST
// /push/broadcast {title, body} -> {success, sent}.

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';
import '../push_dienst.dart';

class NachrichtAnsicht extends StatefulWidget {
  const NachrichtAnsicht({super.key, required this.dienste});

  final VorstandDienste dienste;

  @override
  State<NachrichtAnsicht> createState() => _NachrichtAnsichtState();
}

/// Ergebnis des letzten Versands.
class _Versand {
  const _Versand({required this.titel, required this.geraete});

  final String titel;

  /// Zugestellte Geraete laut Backend; null = unbekannt.
  final int? geraete;
}

class _NachrichtAnsichtState extends State<NachrichtAnsicht> {
  final _titel = TextEditingController();
  final _text = TextEditingController();
  var _sendet = false;
  _Versand? _ergebnis;

  @override
  void initState() {
    super.initState();
    // Vorschau und Senden-Knopf folgen der Eingabe.
    _titel.addListener(_neu);
    _text.addListener(_neu);
  }

  void _neu() => setState(() {});

  @override
  void dispose() {
    _titel.dispose();
    _text.dispose();
    super.dispose();
  }

  bool get _vollstaendig => _titel.text.trim().isNotEmpty && _text.text.trim().isNotEmpty;

  Future<void> _senden() async {
    final titel = _titel.text.trim();
    final text = _text.text.trim();
    if (titel.isEmpty || text.isEmpty) {
      meldung(context, 'Bitte Titel und Text ausfüllen.');
      return;
    }
    final ok = await nachfragen(
      context,
      titel: 'An alle App-Nutzer senden?',
      text:
          '«$titel»\n\nDie Mitteilung geht sofort an alle Mitglieder mit installierter App '
          'und erlaubten Benachrichtigungen. Zurückholen geht nicht.',
      ja: 'An alle senden',
      gefaehrlich: false,
    );
    if (!ok || !mounted) return;
    setState(() => _sendet = true);
    try {
      final geraete = await widget.dienste.push.anAlle(titel: titel, text: text);
      if (!mounted) return;
      setState(() {
        _ergebnis = _Versand(titel: titel, geraete: geraete);
        _titel.clear();
        _text.clear();
      });
    } on Object catch (e) {
      if (mounted) meldung(context, 'Push fehlgeschlagen: ${fehlerText(e)}');
    } finally {
      if (mounted) setState(() => _sendet = false);
    }
  }

  Future<void> _websiteOeffnen() async {
    final ok = await widget.dienste.umgebung.linkOeffnen(vorstandWebseite);
    if (!ok && mounted) meldung(context, 'Die Website liess sich nicht öffnen.');
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final ergebnis = _ergebnis;
    return ListView(
      padding: mitSystemleiste(context, const EdgeInsets.fromLTRB(16, 16, 16, 24), maxBreite: 1000),
      children: [
        Text('App-Push an alle', style: t.textTheme.titleLarge),
        const SizedBox(height: 4),
        Text(
          'Erreicht nur Mitglieder mit installierter App und erlaubten Benachrichtigungen '
          '(Kanal «Allgemein», in der App abschaltbar). Für alle anderen: E-Mail oder Brief.',
          style: t.textTheme.bodySmall,
        ),
        const SizedBox(height: 12),
        if (ergebnis != null) ...[
          _ErgebnisKarte(versand: ergebnis, schliessen: () => setState(() => _ergebnis = null)),
          const SizedBox(height: 12),
        ],
        KartenSpalten(
          children: [
            _formular(context),
            _Vorschau(titel: _titel.text.trim(), text: _text.text.trim()),
          ],
        ),
        const SizedBox(height: 16),
        Card(
          color: t.colorScheme.surfaceContainerLow,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('E-Mail und Brief', style: t.textTheme.titleSmall),
                const SizedBox(height: 4),
                Text(
                  'Versand per E-Mail oder Post (Vorlagen, Empfänger, Vorschau) folgt in '
                  'Phase 2. Bis dahin auf der Website.',
                  style: t.textTheme.bodySmall,
                ),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton.icon(
                    onPressed: _websiteOeffnen,
                    icon: const Icon(Icons.open_in_new, size: 18),
                    label: const Text('Website öffnen'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _formular(BuildContext context) {
    final titelLang = _titel.text.trim().length > pushTitelSichtbar;
    final textLang = _text.text.trim().length > pushTextSichtbar;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              key: const Key('push-titel'),
              controller: _titel,
              enabled: !_sendet,
              maxLength: pushTitelMax,
              textInputAction: TextInputAction.next,
              decoration: InputDecoration(
                labelText: 'Titel',
                hintText: 'z.B. Erinnerung: Übung am Samstag',
                border: const OutlineInputBorder(),
                helperText: titelLang
                    ? 'Über $pushTitelSichtbar Zeichen: wird oft abgeschnitten.'
                    : 'Kurz halten – bis etwa $pushTitelSichtbar Zeichen sind sichtbar.',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('push-text'),
              controller: _text,
              enabled: !_sendet,
              maxLength: pushTextMax,
              minLines: 4,
              maxLines: 8,
              keyboardType: TextInputType.multiline,
              decoration: InputDecoration(
                labelText: 'Text',
                alignLabelWithHint: true,
                border: const OutlineInputBorder(),
                helperText: textLang
                    ? 'Auf dem Sperrbildschirm sind nur die ersten ~$pushTextSichtbar Zeichen '
                          'sichtbar.'
                    : 'Das Wichtigste zuerst.',
                helperMaxLines: 2,
              ),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              key: const Key('push-senden'),
              onPressed: _vollstaendig && !_sendet ? _senden : null,
              icon: _sendet
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.send),
              label: Text(_sendet ? 'Wird gesendet …' : 'An alle senden …'),
            ),
          ],
        ),
      ),
    );
  }
}

/// So etwa sieht die Mitteilung auf dem Handy aus.
class _Vorschau extends StatelessWidget {
  const _Vorschau({required this.titel, required this.text});

  final String titel;
  final String text;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final leer = titel.isEmpty && text.isEmpty;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 4, 4, 8),
          child: Text(
            'Vorschau',
            style: t.textTheme.labelMedium?.copyWith(color: t.colorScheme.outline),
          ),
        ),
        Card(
          key: const Key('push-vorschau'),
          margin: const EdgeInsets.only(bottom: 12),
          color: t.colorScheme.surfaceContainerHighest,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CircleAvatar(
                  radius: 16,
                  backgroundColor: t.colorScheme.primary,
                  child: Icon(
                    Icons.local_fire_department,
                    size: 18,
                    color: t.colorScheme.onPrimary,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('FWV Raura · jetzt', style: t.textTheme.labelSmall),
                      const SizedBox(height: 2),
                      if (leer)
                        Text(
                          'Titel und Text erscheinen hier.',
                          style: t.textTheme.bodyMedium?.copyWith(color: t.colorScheme.outline),
                        )
                      else ...[
                        Text(
                          titel.isEmpty ? '(ohne Titel)' : titel,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: t.textTheme.titleSmall,
                        ),
                        if (text.isNotEmpty)
                          Text(
                            text,
                            maxLines: 4,
                            overflow: TextOverflow.ellipsis,
                            style: t.textTheme.bodyMedium,
                          ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _ErgebnisKarte extends StatelessWidget {
  const _ErgebnisKarte({required this.versand, required this.schliessen});

  final _Versand versand;
  final VoidCallback schliessen;

  @override
  Widget build(BuildContext context) {
    final (hinten, vorne) = hinweisFarben(context, HinweisArt.gut);
    final g = versand.geraete;
    final zahl = g == null
        ? 'Das Backend nennt keine Zahl.'
        : g == 1
        ? 'An 1 Gerät zugestellt.'
        : 'An $g Geräte zugestellt.';
    return Card(
      key: const Key('push-ergebnis'),
      color: hinten,
      margin: EdgeInsets.zero,
      child: ListTile(
        leading: Icon(Icons.check_circle, color: vorne),
        title: Text('Gesendet: «${versand.titel}»'),
        subtitle: Text(zahl),
        trailing: IconButton(
          tooltip: 'Ausblenden',
          icon: const Icon(Icons.close),
          onPressed: schliessen,
        ),
      ),
    );
  }
}
