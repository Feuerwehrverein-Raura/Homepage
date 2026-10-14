// Zugangsdokumente im Mitglied-Detail: Login-Datenblatt (SETZT EIN NEUES
// PASSWORT), Anmeldebon (Bondrucker im Roten Schopf) und App-QR-Codes
// (anlegen, anzeigen, widerrufen). Vorbild: vorstand.html (Mitglied-Modal,
// App-QR-Modal). Backend: siehe mitglieder/zugangs_dokumente.dart.

import 'dart:convert';

import 'package:flutter/services.dart' show Clipboard, ClipboardData;
import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:material_ui/material_ui.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../dienste.dart';
import '../../mitglieder/modelle.dart';
import '../../mitglieder/zugangs_dokumente.dart';
import '../beitraege/beitraege_daten.dart' show datumText;
import '../beitraege/jahreslauf.dart' show zeitText;
import '../bestaetigen.dart';

class ZugangsDokumenteTeil extends StatefulWidget {
  const ZugangsDokumenteTeil({super.key, required this.dienste, required this.mitglied});

  final VorstandDienste dienste;
  final VorstandMitglied mitglied;

  @override
  State<ZugangsDokumenteTeil> createState() => _ZugangsDokumenteTeilState();
}

class _ZugangsDokumenteTeilState extends State<ZugangsDokumenteTeil> {
  String? _laeuft;

  VorstandMitglied get _m => widget.mitglied;
  ZugangsDokumenteDienst get _d => widget.dienste.zugangsDokumente;

  Future<void> _datenblatt() async {
    final ok = await starkNachfragen(
      context,
      titel: 'Login-Datenblatt für ${_m.name}?',
      text: _m.hatKonto
          ? 'Dabei wird ein NEUES Passwort gesetzt. Das bisherige Passwort von ${_m.name} '
                'gilt danach nicht mehr – auch nicht auf der Website, in Nextcloud oder an der '
                'Kasse.\n\nDazu kommt ein QR-Code für die App (ein bestehender wird '
                'wiederverwendet).'
          : '${_m.name} hat kein Login-Konto: das Datenblatt enthält nur den QR-Code für die '
                'App (ein bestehender wird wiederverwendet). Ein Passwort gibt es nicht.',
      haken: _m.hatKonto ? 'Ja, ein neues Passwort setzen' : null,
      ja: _m.hatKonto ? 'Neues Passwort setzen' : 'Datenblatt erstellen',
      gefaehrlich: _m.hatKonto,
    );
    if (!ok || !mounted) return;
    final blatt = await _imNetz('datenblatt', () => _d.datenblatt(_m.id));
    if (blatt == null || !mounted) return;
    await showDialog<void>(
      context: context,
      builder: (_) => DatenblattDialog(blatt: blatt, dienste: widget.dienste),
    );
  }

  /// Aufruf mit drehendem Knopf; Fehler werden gemeldet (dann null).
  Future<T?> _imNetz<T>(String id, Future<T> Function() aufruf) async {
    setState(() => _laeuft = id);
    try {
      return await aufruf();
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
      return null;
    } finally {
      if (mounted) setState(() => _laeuft = null);
    }
  }

  Future<void> _anmeldebon() async {
    final umfang = _m.hatKonto
        ? 'Wer ihn scannt, vergibt ein neues Passwort und ist danach überall angemeldet.'
        : 'Ohne Login-Konto öffnet er nur den Mitgliederbereich (7 Tage angemeldet).';
    final ok = await nachfragen(
      context,
      titel: 'Anmeldebon drucken?',
      text:
          'Druckt auf dem Bondrucker im Roten Schopf einen Bon für ${_m.name} mit einem '
          'Login-QR. Er gilt EINMALIG und nur kurz (eine Stunde); ältere, noch unbenutzte '
          'Bons von ${_m.vorname ?? _m.name} werden dabei ungültig.\n\n'
          '$umfang'
          '\n\nDer Drucker muss eingeschaltet und im Vereinsnetz sein.',
      ja: 'Drucken',
      gefaehrlich: false,
    );
    if (!ok || !mounted) return;
    final bon = await _imNetz('anmeldebon', () => _d.anmeldebon(_m.id));
    if (bon == null || !mounted) return;
    await showDialog<void>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Bon gedruckt'),
        content: Text(
          bon.ueberall
              ? 'Er liegt am Drucker im Roten Schopf und meldet überall an – Nextcloud, '
                    'Kasse, Küche. Beim Scannen wird ein neues Passwort vergeben. Gilt einmalig '
                    'und nur kurz.'
              : 'Nur für den Mitgliederbereich – Authentik hat keinen Anmeldelink geliefert '
                    '(kein Konto oder gerade nicht erreichbar). Gilt einmalig'
                    '${bon.giltBis == null ? '' : ' bis ${zeitText(bon.giltBis!)} Uhr'}, danach '
                    '7 Tage angemeldet.',
          key: const Key('anmeldebon-ergebnis'),
        ),
        actions: [FilledButton(onPressed: () => Navigator.of(c).pop(), child: const Text('OK'))],
      ),
    );
  }

  Future<void> _appQr() => Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) => AppQrScreen(dienste: widget.dienste, mitglied: _m),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    Widget fortschritt(IconData symbol, String id) => _laeuft == id
        ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
        : Icon(symbol);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Zum Ausdrucken oder Scannen, v.a. für Mitglieder, die ihre Zugangsdaten nicht kennen.',
          style: t.textTheme.bodySmall,
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            OutlinedButton.icon(
              key: const Key('zugang-datenblatt'),
              onPressed: _laeuft == null ? _datenblatt : null,
              icon: fortschritt(Icons.description_outlined, 'datenblatt'),
              label: const Text('Login-Datenblatt'),
            ),
            OutlinedButton.icon(
              key: const Key('zugang-anmeldebon'),
              onPressed: _laeuft == null ? _anmeldebon : null,
              icon: fortschritt(Icons.receipt_long_outlined, 'anmeldebon'),
              label: const Text('Anmeldebon drucken'),
            ),
            OutlinedButton.icon(
              key: const Key('zugang-app-qr'),
              onPressed: _laeuft == null ? _appQr : null,
              icon: const Icon(Icons.qr_code_2),
              label: const Text('App-QR-Codes'),
            ),
          ],
        ),
      ],
    );
  }
}

/// QR-Code auf weissem Grund (auch im dunklen Design scanbar).
class LoginQr extends StatelessWidget {
  const LoginQr({super.key, required this.inhalt, this.groesse = 220});

  final String inhalt;
  final double groesse;

  @override
  Widget build(BuildContext context) => ColoredBox(
    color: Colors.white,
    child: QrImageView(
      data: inhalt,
      size: groesse,
      errorCorrectionLevel: QrErrorCorrectLevel.M,
      backgroundColor: Colors.white,
    ),
  );
}

/// Ergebnis des Datenblatts: Passwort (kopierbar), Login-QR, Datenblatt zum
/// Drucken/Teilen (HTML, im Browser druckbar).
class DatenblattDialog extends StatelessWidget {
  const DatenblattDialog({super.key, required this.blatt, required this.dienste});

  final Datenblatt blatt;
  final VorstandDienste dienste;

  String get _dateiname =>
      'login-datenblatt-${blatt.name.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '-')}.html';

  Future<void> _teilen(BuildContext context) async {
    final box = context.findRenderObject() as RenderBox?;
    try {
      await dienste.umgebung.dateiTeilen(
        utf8.encode(datenblattHtml(blatt)),
        _dateiname,
        'text/html',
        ursprung: box == null ? null : box.localToGlobal(Offset.zero) & box.size,
      );
    } on Object catch (e) {
      if (context.mounted) meldung(context, fehlerText(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final pw = blatt.passwort;
    return AlertDialog(
      title: Text('Datenblatt ${blatt.name}'),
      content: SizedBox(
        width: 420,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (pw != null) ...[
                Text('Neues Passwort', style: t.textTheme.titleSmall),
                Row(
                  children: [
                    Expanded(
                      child: SelectableText(
                        pw,
                        key: const Key('datenblatt-passwort'),
                        style: t.textTheme.headlineSmall?.copyWith(fontFamily: 'monospace'),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Passwort kopieren',
                      onPressed: () async {
                        await Clipboard.setData(ClipboardData(text: pw));
                        if (context.mounted) meldung(context, 'Passwort kopiert');
                      },
                      icon: const Icon(Icons.copy),
                    ),
                  ],
                ),
                if (blatt.email != null) Text('Anmeldung mit ${blatt.email}'),
              ] else
                const Text('Kein Login-Konto – Anmeldung nur mit dem QR-Code.'),
              const SizedBox(height: 12),
              Center(child: LoginQr(inhalt: loginQrInhalt(blatt.token))),
              const SizedBox(height: 8),
              Text(
                'In der App «QR-Code scannen» und diesen Code scannen. Zum Ausdrucken das '
                'Datenblatt teilen und im Browser drucken.',
                style: t.textTheme.bodySmall,
              ),
            ],
          ),
        ),
      ),
      actions: [
        Builder(
          builder: (c) => TextButton.icon(
            key: const Key('datenblatt-teilen'),
            onPressed: () => _teilen(c),
            icon: const Icon(Icons.ios_share),
            label: const Text('Datenblatt teilen'),
          ),
        ),
        FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Fertig')),
      ],
    );
  }
}

/// App-QR-Codes eines Mitglieds: Liste, neu (zeigt den QR einmal), widerrufen.
class AppQrScreen extends StatefulWidget {
  const AppQrScreen({super.key, required this.dienste, required this.mitglied});

  final VorstandDienste dienste;
  final VorstandMitglied mitglied;

  @override
  State<AppQrScreen> createState() => _AppQrScreenState();
}

class _AppQrScreenState extends State<AppQrScreen> {
  final _lader = GlobalKey<LadeAnsichtState<List<AppZugang>>>();

  ZugangsDokumenteDienst get _d => widget.dienste.zugangsDokumente;
  VorstandMitglied get _m => widget.mitglied;

  Future<void> _neu() async {
    final bezeichnung = await showDialog<String>(
      context: context,
      builder: (_) => const _BezeichnungDialog(),
    );
    if (bezeichnung == null || !mounted) return;
    try {
      final neu = await _d.appZugangErstellen(_m.id, bezeichnung: bezeichnung);
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (c) => AlertDialog(
          title: Text('App-QR für ${_m.name}'),
          content: SizedBox(
            width: 380,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                LoginQr(key: const Key('app-qr-bild'), inhalt: loginQrInhalt(neu.token)),
                const SizedBox(height: 8),
                const Text(
                  'In der Mitglieder-App auf der Anmeldeseite «QR-Code scannen» wählen und '
                  'diesen Code scannen. Er wird nur jetzt angezeigt – bei Verlust widerrufen '
                  'und neu erstellen.',
                ),
              ],
            ),
          ),
          actions: [
            FilledButton(onPressed: () => Navigator.of(c).pop(), child: const Text('Fertig')),
          ],
        ),
      );
      await _lader.currentState?.neuLaden();
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    }
  }

  Future<void> _widerrufen(AppZugang z) async {
    final ok = await nachfragen(
      context,
      titel: 'QR-Code widerrufen?',
      text:
          '«${z.bezeichnung ?? 'ohne Bezeichnung'}» von ${_m.name} gilt danach nicht mehr. '
          'Wer damit in der App angemeldet ist, muss sich neu anmelden.',
      ja: 'Widerrufen',
    );
    if (!ok || !mounted) return;
    try {
      await _d.appZugangWiderrufen(z.id);
      if (!mounted) return;
      meldung(context, 'QR-Code widerrufen');
      await _lader.currentState?.neuLaden();
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('App-QR · ${_m.name}')),
      floatingActionButton: FloatingActionButton.extended(
        key: const Key('app-qr-neu'),
        onPressed: _neu,
        icon: const Icon(Icons.add),
        label: const Text('Neuer QR-Code'),
      ),
      body: LadeAnsicht<List<AppZugang>>(
        key: _lader,
        laden: () => _d.appZugaenge(_m.id),
        bauen: (context, liste, _) {
          final t = Theme.of(context);
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: mitSystemleiste(context, const EdgeInsets.fromLTRB(16, 12, 16, 96)),
            children: [
              Text(
                'Dauerhafte Anmeldung in der Mitglieder-App ohne Passwort. Der Code selbst wird '
                'nur beim Erstellen angezeigt.',
                style: t.textTheme.bodySmall,
              ),
              const SizedBox(height: 8),
              if (liste.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Text('Noch keine QR-Codes.', textAlign: TextAlign.center),
                ),
              for (final z in liste)
                ListTile(
                  key: Key('app-qr-${z.id}'),
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.qr_code_2),
                  title: Text(z.bezeichnung ?? '(ohne Bezeichnung)'),
                  subtitle: Text(
                    [
                      if (z.erstellt != null) 'erstellt ${datumText(z.erstellt!)}',
                      if (z.zuletztBenutzt != null) 'zuletzt ${datumText(z.zuletztBenutzt!)}',
                      if (z.erstelltVon != null) 'von ${z.erstelltVon}',
                    ].join(' · '),
                  ),
                  trailing: TextButton(
                    key: Key('app-qr-widerrufen-${z.id}'),
                    onPressed: () => _widerrufen(z),
                    child: const Text('Widerrufen'),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _BezeichnungDialog extends StatefulWidget {
  const _BezeichnungDialog();

  @override
  State<_BezeichnungDialog> createState() => _BezeichnungDialogState();
}

class _BezeichnungDialogState extends State<_BezeichnungDialog> {
  final _text = TextEditingController();

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Neuer App-QR-Code'),
    content: TextField(
      key: const Key('app-qr-bezeichnung'),
      controller: _text,
      maxLength: 200,
      decoration: const InputDecoration(
        labelText: 'Bezeichnung (optional)',
        hintText: 'z.B. Handy Erika',
      ),
    ),
    actions: [
      TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Abbrechen')),
      FilledButton(
        key: const Key('app-qr-erstellen'),
        onPressed: () => Navigator.of(context).pop(_text.text.trim()),
        child: const Text('Erstellen'),
      ),
    ],
  );
}
