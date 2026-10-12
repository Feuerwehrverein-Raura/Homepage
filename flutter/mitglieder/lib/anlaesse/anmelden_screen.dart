// Anmelden an einem Anlass (`POST registrations/public`): als Helfer fuer
// eine oder mehrere Schichten oder als Teilnehmer. Name, E-Mail und Telefon
// kommen aus dem eigenen Profil (`members/me`) und bleiben aenderbar.
// Waehlbar sind nur Schichten, die das Backend `waehlbar` nennt.
//
// Gibt `true` zurueck, wenn die Anmeldung angenommen wurde.

import 'package:fwv_anlass/fwv_anlass.dart' show mitSystemleiste;
import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';
import '../gemeinsam.dart';

final _emailMuster = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

class AnmeldenScreen extends StatefulWidget {
  const AnmeldenScreen({super.key, required this.dienste, required this.anlass});

  final Dienste dienste;
  final Anlass anlass;

  @override
  State<AnmeldenScreen> createState() => _AnmeldenScreenState();
}

class _AnmeldenScreenState extends State<AnmeldenScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _telefon = TextEditingController();
  final _bemerkung = TextEditingController();
  final _allergien = TextEditingController();
  final _gewaehlt = <String>{};
  var _personen = 1;
  var _sendet = false;
  var _geprueft = false;
  String? _fehler;

  bool get _alsHelfer => widget.anlass.app.anmeldung.art == AnmeldeArt.schicht;

  List<Schicht> get _waehlbar => [
    for (final s in widget.anlass.schichten)
      if (s.app.waehlbar) s,
  ];

  @override
  void initState() {
    super.initState();
    final s = widget.dienste.sitzung.sitzung;
    _name.text = s?.name ?? '';
    _email.text = s?.email ?? '';
    _vorbelegen();
  }

  @override
  void dispose() {
    for (final c in [_name, _email, _telefon, _bemerkung, _allergien]) {
      c.dispose();
    }
    super.dispose();
  }

  /// Aus dem Profil vorbelegen; klappt das nicht, bleibt das Formular leer
  /// bzw. bei den Angaben der Sitzung.
  Future<void> _vorbelegen() async {
    if (!widget.dienste.alsMitglied) return;
    try {
      final p = await widget.dienste.mitglieder.profil();
      if (!mounted) return;
      setState(() {
        final n = [p.vorname, p.nachname].whereType<String>().join(' ').trim();
        if (n.isNotEmpty) _name.text = n;
        if (p.email != null) _email.text = p.email!;
        if (_telefon.text.isEmpty) _telefon.text = p.mobile ?? p.telefon ?? '';
      });
    } on Object {
      // Vorbelegen ist Komfort.
    }
  }

  Future<void> _senden() async {
    setState(() {
      _geprueft = true;
      _fehler = null;
    });
    final formOk = _form.currentState!.validate();
    final schichtOk = !_alsHelfer || _gewaehlt.isNotEmpty;
    if (!formOk || !schichtOk) return;

    setState(() => _sendet = true);
    try {
      final ergebnis = await widget.dienste.anlaesse.anmelden(
        AnmeldeAnfrage(
          art: _alsHelfer ? AnmeldeArt.schicht : AnmeldeArt.teilnahme,
          anlassId: widget.anlass.id,
          name: _name.text,
          email: _email.text,
          telefon: _telefon.text,
          bemerkung: _bemerkung.text,
          personen: _alsHelfer ? null : _personen,
          allergien: _alsHelfer ? null : _allergien.text,
          // In der Reihenfolge der Schichten, nicht des Antippens.
          schichtIds: [
            for (final s in _waehlbar)
              if (_gewaehlt.contains(s.id)) s.id,
          ],
        ),
      );
      if (!mounted) return;
      setState(() => _sendet = false);
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          icon: Icon(
            ergebnis.mussBestaetigen ? Icons.mark_email_unread_outlined : Icons.check_circle,
          ),
          title: Text(ergebnis.mussBestaetigen ? 'Bitte bestätigen' : 'Angemeldet'),
          content: Text(ergebnis.meldung),
          actions: [
            FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('OK')),
          ],
        ),
      );
      if (mounted) Navigator.of(context).pop(true);
    } on Object catch (f) {
      if (mounted) setState(() => _fehler = fehlerText(f));
    } finally {
      if (mounted) setState(() => _sendet = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final a = widget.anlass;
    final waehlbar = _waehlbar;
    return Scaffold(
      appBar: AppBar(title: Text(_alsHelfer ? 'Helfen' : 'Anmelden')),
      body: Form(
        key: _form,
        autovalidateMode: _geprueft
            ? AutovalidateMode.onUserInteraction
            : AutovalidateMode.disabled,
        // Kein ListView: alle Felder muessen gebaut bleiben, sonst prueft
        // validate() die weggescrollten nicht.
        child: SingleChildScrollView(
          padding: mitSystemleiste(context, const EdgeInsets.fromLTRB(16, 12, 16, 24)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(a.titel, style: t.textTheme.titleLarge),
              if ([?a.app.datumText, ?a.app.zeitText].join(' · ') case final w when w.isNotEmpty)
                Text(w, style: t.textTheme.bodyMedium),
              if (_alsHelfer) ...[
                const Abschnitt('Schichten'),
                if (waehlbar.isEmpty)
                  const Text('Keine Schicht mehr frei.')
                else
                  for (final s in waehlbar)
                    CheckboxListTile(
                      key: Key('schicht-${s.id}'),
                      contentPadding: EdgeInsets.zero,
                      controlAffinity: ListTileControlAffinity.leading,
                      value: _gewaehlt.contains(s.id),
                      onChanged: _sendet
                          ? null
                          : (an) => setState(
                              () => an == true ? _gewaehlt.add(s.id) : _gewaehlt.remove(s.id),
                            ),
                      title: Text(s.app.bereichText ?? s.name ?? ''),
                      subtitle: Text(
                        [
                          [?s.app.datumText, ?s.app.zeitText].join(' · '),
                          ?s.app.belegung.text,
                        ].where((z) => z.isNotEmpty).join('\n'),
                      ),
                      isThreeLine: true,
                    ),
                if (_geprueft && _gewaehlt.isEmpty)
                  Text(
                    'Bitte mindestens eine Schicht wählen.',
                    style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.error),
                  ),
              ],
              const Abschnitt('Kontakt'),
              TextFormField(
                controller: _name,
                enabled: !_sendet,
                decoration: const InputDecoration(labelText: 'Name *'),
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.name],
                validator: (v) => (v ?? '').trim().isEmpty ? 'Bitte den Namen angeben.' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _email,
                enabled: !_sendet,
                decoration: const InputDecoration(labelText: 'E-Mail *'),
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.email],
                validator: (v) {
                  final e = (v ?? '').trim();
                  if (e.isEmpty) return 'Bitte die E-Mail angeben.';
                  return _emailMuster.hasMatch(e) ? null : 'Keine gültige E-Mail-Adresse.';
                },
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _telefon,
                enabled: !_sendet,
                decoration: const InputDecoration(labelText: 'Telefon'),
                keyboardType: TextInputType.phone,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.telephoneNumber],
              ),
              if (!_alsHelfer) ...[
                const Abschnitt('Teilnahme'),
                Row(
                  children: [
                    const Expanded(child: Text('Personen')),
                    IconButton(
                      onPressed: _sendet || _personen <= 1
                          ? null
                          : () => setState(() => _personen--),
                      icon: const Icon(Icons.remove_circle_outline),
                      tooltip: 'Weniger Personen',
                    ),
                    Text('$_personen', key: const Key('personen'), style: t.textTheme.titleMedium),
                    IconButton(
                      onPressed: _sendet || _personen >= 20
                          ? null
                          : () => setState(() => _personen++),
                      icon: const Icon(Icons.add_circle_outline),
                      tooltip: 'Mehr Personen',
                    ),
                  ],
                ),
                TextFormField(
                  controller: _allergien,
                  enabled: !_sendet,
                  decoration: const InputDecoration(labelText: 'Allergien / Unverträglichkeiten'),
                ),
              ],
              const Abschnitt('Bemerkung'),
              TextFormField(
                controller: _bemerkung,
                enabled: !_sendet,
                decoration: const InputDecoration(hintText: 'Optional'),
                minLines: 2,
                maxLines: 5,
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: Material(
        color: t.colorScheme.surfaceContainer,
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_fehler != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      key: const Key('anmelden-fehler'),
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.error_outline, color: t.colorScheme.error, size: 20),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(_fehler!, style: TextStyle(color: t.colorScheme.error)),
                        ),
                      ],
                    ),
                  ),
                FilledButton(
                  key: const Key('anmelden-senden'),
                  onPressed: _sendet || (_alsHelfer && waehlbar.isEmpty) ? null : _senden,
                  child: _sendet
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Anmeldung senden'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
