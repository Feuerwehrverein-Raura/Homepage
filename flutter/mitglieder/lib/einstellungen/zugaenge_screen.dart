// Zugaenge (`GET members/me/accesses`): Systeme, Funktions-Mails mit
// Passwort, Nextcloud-Ordner und geteilte Konten. Passwoerter bleiben
// verdeckt, bis man sie antippt; Kopieren geht ohne Aufdecken.
// Passwort einer Funktions-Mail aendern: `PUT members/me/function-email-
// password` (mindestens 12 Zeichen).

import 'package:flutter/services.dart';
import 'package:fwv_anlass/fwv_anlass.dart' show mitSystemleiste;
import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';
import '../gemeinsam.dart';

class ZugaengeScreen extends StatefulWidget {
  const ZugaengeScreen({super.key, required this.dienste});

  final Dienste dienste;

  @override
  State<ZugaengeScreen> createState() => _ZugaengeScreenState();
}

class _ZugaengeScreenState extends State<ZugaengeScreen> {
  Zugaenge? _z;
  String? _fehler;

  @override
  void initState() {
    super.initState();
    _laden();
  }

  Future<void> _laden() async {
    setState(() => _fehler = null);
    try {
      final z = await widget.dienste.mitglieder.zugaenge();
      if (mounted) setState(() => _z = z);
    } on Object catch (e) {
      if (mounted) setState(() => _fehler = fehlerText(e));
    }
  }

  Future<void> _passwortAendern(FunktionsMail mail) async {
    final geaendert = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => FunktionsMailPasswortScreen(dienste: widget.dienste, email: mail.email),
      ),
    );
    if (geaendert == true) await _laden();
  }

  @override
  Widget build(BuildContext context) {
    final z = _z;
    return Scaffold(
      appBar: AppBar(title: const Text('Zugänge')),
      body: z == null
          ? (_fehler == null
                ? const Center(child: CircularProgressIndicator())
                : FehlerAnsicht(meldung: _fehler!, erneut: _laden))
          : RefreshIndicator(
              onRefresh: _laden,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: mitSystemleiste(context, const EdgeInsets.only(bottom: 24)),
                children: [
                  if (z.leer)
                    const Padding(
                      padding: EdgeInsets.all(24),
                      child: Text('Keine Zugänge hinterlegt.', textAlign: TextAlign.center),
                    ),
                  if (z.systeme.isNotEmpty) ...[
                    const Abschnitt('Systeme'),
                    for (final s in z.systeme)
                      ListTile(
                        leading: const Icon(Icons.language),
                        title: Text(s.system),
                        subtitle: s.rolle == null ? null : Text(s.rolle!),
                        trailing: s.url == null ? null : const Icon(Icons.open_in_new),
                        onTap: s.url == null
                            ? null
                            : () => widget.dienste.linkOeffnen(Uri.parse(s.url!)),
                      ),
                  ],
                  if (z.funktionsMails.isNotEmpty) ...[
                    const Abschnitt('Funktions-E-Mails'),
                    for (final m in z.funktionsMails)
                      _Karte(
                        titel: m.email,
                        untertitel: m.funktion,
                        zeilen: [
                          if (m.server != null)
                            _Zeile(
                              'Server',
                              '${m.server}'
                                  '${m.imapPort != null ? ' · IMAP ${m.imapPort}' : ''}'
                                  '${m.smtpPort != null ? ' · SMTP ${m.smtpPort}' : ''}',
                            ),
                          if (m.passwort != null)
                            GeheimZeile(titel: 'Passwort', wert: m.passwort!)
                          else
                            const _Zeile('Passwort', 'nicht hinterlegt'),
                        ],
                        aktionen: [
                          if (m.webmail != null)
                            TextButton.icon(
                              onPressed: () => widget.dienste.linkOeffnen(Uri.parse(m.webmail!)),
                              icon: const Icon(Icons.open_in_new),
                              label: const Text('Webmail'),
                            ),
                          TextButton.icon(
                            onPressed: () => _passwortAendern(m),
                            icon: const Icon(Icons.password),
                            label: const Text('Passwort ändern'),
                          ),
                        ],
                      ),
                  ],
                  if (z.cloudOrdner.isNotEmpty) ...[
                    const Abschnitt('Cloud-Ordner'),
                    for (final o in z.cloudOrdner)
                      ListTile(
                        leading: const Icon(Icons.folder_outlined),
                        title: Text(o.name),
                        subtitle: o.gruppen.isEmpty ? null : Text(o.gruppen.join(', ')),
                      ),
                  ],
                  if (z.netzlaufwerk != null) ...[
                    const Abschnitt('Netzlaufwerk'),
                    _Karte(
                      titel: z.netzlaufwerk!.server ?? 'Netzlaufwerk',
                      untertitel: z.netzlaufwerk!.freigaben.isEmpty
                          ? null
                          : 'Freigaben: ${z.netzlaufwerk!.freigaben.join(', ')}',
                      zeilen: [
                        if (z.netzlaufwerk!.adresse != null)
                          KopierZeile(titel: 'Adresse', wert: z.netzlaufwerk!.adresse!),
                        if (z.netzlaufwerk!.benutzer != null)
                          KopierZeile(titel: 'Benutzer', wert: z.netzlaufwerk!.benutzer!),
                        if (z.netzlaufwerk!.passwort != null)
                          GeheimZeile(titel: 'Passwort', wert: z.netzlaufwerk!.passwort!),
                        if (z.netzlaufwerk!.naechsterWechsel != null)
                          _Zeile(
                            'Nächster Wechsel',
                            schweizerDatum(z.netzlaufwerk!.naechsterWechsel!),
                          ),
                      ],
                    ),
                  ],
                  if (z.geteilteKonten.isNotEmpty) ...[
                    const Abschnitt('Geteilte Konten'),
                    for (final k in z.geteilteKonten)
                      _Karte(
                        titel: k.titel,
                        untertitel: k.beschreibung,
                        zeilen: [
                          if (k.benutzername != null)
                            KopierZeile(titel: 'Benutzer', wert: k.benutzername!),
                          if (k.passwort != null) GeheimZeile(titel: 'Passwort', wert: k.passwort!),
                          if (k.naechsterWechsel != null)
                            _Zeile('Nächster Wechsel', schweizerDatum(k.naechsterWechsel!)),
                        ],
                      ),
                  ],
                ],
              ),
            ),
    );
  }
}

class _Karte extends StatelessWidget {
  const _Karte({
    required this.titel,
    this.untertitel,
    this.zeilen = const [],
    this.aktionen = const [],
  });

  final String titel;
  final String? untertitel;
  final List<Widget> zeilen;
  final List<Widget> aktionen;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(titel, style: text.titleMedium),
            if (untertitel != null) Text(untertitel!, style: text.bodySmall),
            const SizedBox(height: 8),
            ...zeilen,
            if (aktionen.isNotEmpty) Wrap(spacing: 4, children: aktionen),
          ],
        ),
      ),
    );
  }
}

class _Zeile extends StatelessWidget {
  const _Zeile(this.titel, this.wert);

  final String titel;
  final String wert;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6, right: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(titel, style: Theme.of(context).textTheme.labelSmall),
          Text(wert),
        ],
      ),
    );
  }
}

/// Wert mit Kopier-Knopf.
class KopierZeile extends StatelessWidget {
  const KopierZeile({super.key, required this.titel, required this.wert});

  final String titel;
  final String wert;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: _Zeile(titel, wert)),
        _KopierKnopf(titel: titel, wert: wert),
      ],
    );
  }
}

/// Passwort: verdeckt, bis man es antippt; kopieren geht auch verdeckt.
class GeheimZeile extends StatefulWidget {
  const GeheimZeile({super.key, required this.titel, required this.wert});

  final String titel;
  final String wert;

  @override
  State<GeheimZeile> createState() => _GeheimZeileState();
}

class _GeheimZeileState extends State<GeheimZeile> {
  bool _sichtbar = false;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: InkWell(
            onTap: () => setState(() => _sichtbar = !_sichtbar),
            child: Padding(
              padding: const EdgeInsets.only(bottom: 6, right: 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(widget.titel, style: Theme.of(context).textTheme.labelSmall),
                  Text(
                    _sichtbar ? widget.wert : '••••••••••',
                    style: const TextStyle(fontFamily: 'monospace'),
                  ),
                ],
              ),
            ),
          ),
        ),
        IconButton(
          onPressed: () => setState(() => _sichtbar = !_sichtbar),
          icon: Icon(_sichtbar ? Icons.visibility_off_outlined : Icons.visibility_outlined),
          tooltip: _sichtbar ? 'Verbergen' : 'Anzeigen',
        ),
        _KopierKnopf(titel: widget.titel, wert: widget.wert),
      ],
    );
  }
}

class _KopierKnopf extends StatelessWidget {
  const _KopierKnopf({required this.titel, required this.wert});

  final String titel;
  final String wert;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      onPressed: () async {
        await Clipboard.setData(ClipboardData(text: wert));
        if (context.mounted) meldung(context, '$titel kopiert');
      },
      icon: const Icon(Icons.copy),
      tooltip: '$titel kopieren',
    );
  }
}

/// Neues Passwort fuer eine Funktions-Mail.
class FunktionsMailPasswortScreen extends StatefulWidget {
  const FunktionsMailPasswortScreen({super.key, required this.dienste, required this.email});

  final Dienste dienste;
  final String email;

  @override
  State<FunktionsMailPasswortScreen> createState() => _FunktionsMailPasswortScreenState();
}

class _FunktionsMailPasswortScreenState extends State<FunktionsMailPasswortScreen> {
  final _formular = GlobalKey<FormState>();
  final _neu = TextEditingController();
  final _wiederholung = TextEditingController();
  bool _sendet = false;
  bool _sichtbar = false;

  @override
  void dispose() {
    _neu.dispose();
    _wiederholung.dispose();
    super.dispose();
  }

  Future<void> _speichern() async {
    if (!_formular.currentState!.validate()) return;
    setState(() => _sendet = true);
    try {
      final text = await widget.dienste.mitglieder.funktionsMailPasswortAendern(
        email: widget.email,
        passwort: _neu.text,
      );
      if (!mounted) return;
      meldung(context, text);
      Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _sendet = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Passwort ändern')),
      body: SafeArea(
        child: Form(
          key: _formular,
          child: Column(
            children: [
              Expanded(
                child: ListView(
                  padding: mitSystemleiste(context, const EdgeInsets.all(16)),
                  children: [
                    Text(widget.email, style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 4),
                    const Text(
                      'Das neue Passwort gilt sofort für alle, die dieses Postfach '
                      'nutzen. Mindestens $funktionsMailPasswortMindestlaenge Zeichen.',
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _neu,
                      obscureText: !_sichtbar,
                      autocorrect: false,
                      enableSuggestions: false,
                      decoration: InputDecoration(
                        labelText: 'Neues Passwort',
                        suffixIcon: IconButton(
                          onPressed: () => setState(() => _sichtbar = !_sichtbar),
                          icon: Icon(
                            _sichtbar ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                          ),
                          tooltip: _sichtbar ? 'Verbergen' : 'Anzeigen',
                        ),
                      ),
                      validator: (w) => (w ?? '').length < funktionsMailPasswortMindestlaenge
                          ? 'Mindestens $funktionsMailPasswortMindestlaenge Zeichen.'
                          : null,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _wiederholung,
                      obscureText: !_sichtbar,
                      autocorrect: false,
                      enableSuggestions: false,
                      decoration: const InputDecoration(labelText: 'Wiederholen'),
                      validator: (w) =>
                          w != _neu.text ? 'Die Wiederholung stimmt nicht überein.' : null,
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                child: SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _sendet ? null : _speichern,
                    child: _sendet
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Passwort setzen'),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
