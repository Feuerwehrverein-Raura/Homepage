// Ein Mitglied im Detail: Foto, schnelle Wege (Anrufen, Mail, Karte,
// Benachrichtigen), alle Angaben in Gruppen, Zugaenge (Passwort, Cloud-
// Gruppen), Zugangsdokumente (Datenblatt, Anmeldebon, App-QR) und Loeschen
// mit Rueckfrage (Aktuar und Kassier bestaetigen per Mail).

import 'package:flutter/services.dart' show Clipboard, ClipboardData;
import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../../dienste.dart';
import '../../mitglieder/mitglieder_verwaltung.dart';
import '../../mitglieder/modelle.dart';
import 'bausteine.dart';
import 'mitglied_formular_screen.dart';
import 'zugangs_dokumente_teil.dart';

class MitgliedDetailScreen extends StatefulWidget {
  const MitgliedDetailScreen({super.key, required this.dienste, required this.mitglied});

  final VorstandDienste dienste;

  /// Aus der Liste; das Detail laedt den frischen Stand selbst.
  final VorstandMitglied mitglied;

  @override
  State<MitgliedDetailScreen> createState() => _MitgliedDetailScreenState();
}

class _MitgliedDetailScreenState extends State<MitgliedDetailScreen> {
  final _lader = GlobalKey<LadeAnsichtState<VorstandMitglied>>();
  late VorstandMitglied _m = widget.mitglied;
  bool _fotoLaeuft = false;

  MitgliederVerwaltung get _v => widget.dienste.mitglieder;

  Future<VorstandMitglied> _laden() async {
    final m = await _v.laden(widget.mitglied.id);
    // Titelleiste und Menue arbeiten mit dem frischen Stand.
    if (mounted) setState(() => _m = m);
    return m;
  }

  Future<void> _neuLaden() async => _lader.currentState?.neuLaden();

  // ---------------------------------------------------------------------
  // Schnelle Wege

  Future<void> _link(Uri adresse) async {
    final ok = await widget.dienste.umgebung.linkOeffnen(adresse);
    if (!ok && mounted) meldung(context, 'Konnte nicht geöffnet werden.');
  }

  Uri _telefon(String nummer) => Uri(scheme: 'tel', path: nummer.replaceAll(RegExp(r'\s'), ''));

  Uri _karte(VorstandMitglied m) => Uri.https('www.google.com', '/maps/search/', {
    'api': '1',
    'query': [m.strasse, m.plz, m.ort].whereType<String>().join(' '),
  });

  // ---------------------------------------------------------------------
  // Bearbeiten, Loeschen

  Future<void> _bearbeiten() async {
    final neu = await Navigator.of(context).push<VorstandMitglied>(
      MaterialPageRoute(
        builder: (_) => MitgliedFormularScreen(dienste: widget.dienste, mitglied: _m),
      ),
    );
    if (neu != null && mounted) await _neuLaden();
  }

  Future<void> _loeschen() async {
    final grund = await showDialog<String>(
      context: context,
      builder: (_) => _LoeschenDialog(name: _m.name),
    );
    if (grund == null || !mounted) return;
    try {
      final text = await _v.loeschenBeantragen(_m.id, grund: grund);
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (c) => AlertDialog(
          title: const Text('Löschanfrage gestellt'),
          content: Text(
            '$text\n\nGelöscht wird erst, wenn beide über den Link in der Mail '
            'bestätigt haben.',
          ),
          actions: [FilledButton(onPressed: () => Navigator.of(c).pop(), child: const Text('OK'))],
        ),
      );
      if (mounted) Navigator.of(context).pop();
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    }
  }

  // ---------------------------------------------------------------------
  // Foto

  Future<void> _fotoNeu({required bool kamera}) async {
    final roh = await widget.dienste.umgebung.fotoWaehlen(kamera: kamera);
    if (roh == null || !mounted) return;
    setState(() => _fotoLaeuft = true);
    try {
      await _v.fotoHochladen(_m.id, roh);
      if (!mounted) return;
      meldung(context, 'Foto gespeichert');
      await _neuLaden();
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _fotoLaeuft = false);
    }
  }

  Future<void> _fotoLoeschen() async {
    final ja = await nachfragen(
      context,
      titel: 'Foto entfernen?',
      text: 'Das Profilfoto von ${_m.name} wird gelöscht.',
      ja: 'Entfernen',
    );
    if (!ja || !mounted) return;
    setState(() => _fotoLaeuft = true);
    try {
      await _v.fotoLoeschen(_m.id);
      if (!mounted) return;
      meldung(context, 'Foto entfernt');
      await _neuLaden();
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _fotoLaeuft = false);
    }
  }

  // ---------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_m.name),
        actions: [
          IconButton(
            key: const Key('mitglied-bearbeiten'),
            onPressed: _bearbeiten,
            icon: const Icon(Icons.edit_outlined),
            tooltip: 'Bearbeiten',
          ),
          PopupMenuButton<String>(
            key: const Key('mitglied-menue'),
            onSelected: (w) => switch (w) {
              'benachrichtigen' => benachrichtigen(context, _v, _m),
              'loeschen' => _loeschen(),
              _ => null,
            },
            itemBuilder: (_) => const [
              PopupMenuItem(
                value: 'benachrichtigen',
                child: ListTile(
                  leading: Icon(Icons.notifications_outlined),
                  title: Text('Benachrichtigen'),
                ),
              ),
              PopupMenuItem(
                value: 'loeschen',
                child: ListTile(leading: Icon(Icons.delete_outline), title: Text('Löschen')),
              ),
            ],
          ),
        ],
      ),
      body: LadeAnsicht<VorstandMitglied>(
        key: _lader,
        laden: _laden,
        bauen: (context, m, _) => _inhalt(context, m),
      ),
    );
  }

  Widget _inhalt(BuildContext context, VorstandMitglied m) {
    final t = Theme.of(context);
    final api = widget.dienste.api;
    final zugehoerigkeit = m.feuerwehrZugehoerigkeit;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: mitSystemleiste(context, const EdgeInsets.fromLTRB(16, 16, 16, 32)),
      children: [
        // Kopf: Foto, Name, Status, Funktionen
        Center(
          child: Stack(
            alignment: Alignment.center,
            children: [
              MitgliedBild(mitglied: m, api: api, groesse: 96),
              if (_fotoLaeuft) const CircularProgressIndicator(),
            ],
          ),
        ),
        const SizedBox(height: 4),
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 4,
          children: [
            TextButton.icon(
              key: const Key('foto-kamera'),
              onPressed: _fotoLaeuft ? null : () => _fotoNeu(kamera: true),
              icon: const Icon(Icons.photo_camera_outlined),
              label: const Text('Kamera'),
            ),
            TextButton.icon(
              key: const Key('foto-galerie'),
              onPressed: _fotoLaeuft ? null : () => _fotoNeu(kamera: false),
              icon: const Icon(Icons.photo_library_outlined),
              label: const Text('Galerie'),
            ),
            if (m.foto != null)
              TextButton.icon(
                key: const Key('foto-entfernen'),
                onPressed: _fotoLaeuft ? null : _fotoLoeschen,
                icon: const Icon(Icons.delete_outline),
                label: const Text('Entfernen'),
              ),
          ],
        ),
        Text(m.name, textAlign: TextAlign.center, style: t.textTheme.headlineSmall),
        const SizedBox(height: 6),
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 6,
          runSpacing: 6,
          children: [
            MitgliedStatusChip(status: m.status),
            for (final f in m.funktionen) HinweisChip(f),
          ],
        ),
        const SizedBox(height: 16),
        // Schnelle Wege
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 8,
          runSpacing: 8,
          children: [
            if (m.nummer case final n?)
              _Weg(
                key: const Key('weg-anrufen'),
                symbol: Icons.call_outlined,
                text: 'Anrufen',
                tun: () => _link(_telefon(n)),
              ),
            if (m.email case final e?)
              _Weg(
                key: const Key('weg-mail'),
                symbol: Icons.mail_outline,
                text: 'Mail',
                tun: () => _link(Uri(scheme: 'mailto', path: e)),
              ),
            if (m.ort != null || m.strasse != null)
              _Weg(
                key: const Key('weg-karte'),
                symbol: Icons.map_outlined,
                text: 'Karte',
                tun: () => _link(_karte(m)),
              ),
            _Weg(
              key: const Key('weg-benachrichtigen'),
              symbol: Icons.notifications_outlined,
              text: 'Benachrichtigen',
              tun: () => benachrichtigen(context, _v, m),
            ),
          ],
        ),
        _gruppe('Kontakt', [
          if (m.mobile case final n?)
            _zeile(Icons.smartphone, 'Mobile', n, () => _link(_telefon(n))),
          if (m.telefon case final n?)
            _zeile(Icons.call_outlined, 'Telefon', n, () => _link(_telefon(n))),
          if (m.email case final e?)
            _zeile(Icons.mail_outline, 'E-Mail', e, () => _link(Uri(scheme: 'mailto', path: e))),
          if (m.versandEmail case final e?)
            _zeile(
              Icons.forward_to_inbox_outlined,
              'Versand-E-Mail',
              e,
              () => _link(Uri(scheme: 'mailto', path: e)),
            ),
        ]),
        _gruppe('Adresse', [
          if (m.adresszeilen.isNotEmpty)
            _zeile(Icons.home_outlined, null, m.adresszeilen.join('\n'), () => _link(_karte(m))),
        ]),
        _gruppe('Persönlich', [
          if (m.anrede != null || m.geschlecht != null)
            InfoZeile(
              symbol: Icons.person_outline,
              titel: 'Anrede · Geschlecht',
              text: [
                ?m.anrede,
                if (m.geschlecht case final g?) textZu(mitgliedGeschlechter, g),
              ].join(' · '),
            ),
          if (m.geburtstag case final g?)
            InfoZeile(symbol: Icons.cake_outlined, titel: 'Geburtstag', text: schweizerDatum(g)),
        ]),
        _gruppe('Mitgliedschaft', [
          InfoZeile(symbol: Icons.badge_outlined, titel: 'Status', text: m.status ?? '–'),
          InfoZeile(
            symbol: Icons.work_outline,
            titel: 'Funktionen',
            text: m.funktionen.isEmpty ? 'keine' : m.funktionen.join(', '),
          ),
          if (zugehoerigkeit != null)
            InfoZeile(
              symbol: Icons.local_fire_department_outlined,
              titel: 'Feuerwehr-Zugehörigkeit',
              text: textZu(feuerwehrZugehoerigkeiten, zugehoerigkeit),
            ),
          if (m.eintrittsdatum case final d?)
            InfoZeile(symbol: Icons.event_outlined, titel: 'Eintritt', text: schweizerDatum(d)),
        ]),
        _gruppe('Zustellung', [
          InfoZeile(
            symbol: Icons.local_post_office_outlined,
            text: [
              if (m.zustellungEmail) 'E-Mail',
              if (m.zustellungPost) 'Post',
            ].join(' und ').ifEmpty('keine'),
          ),
        ]),
        _gruppe('Bemerkungen', [
          if (m.bemerkungen case final b?) SelectableText(b, style: t.textTheme.bodyMedium),
        ]),
        const Abschnitt('Zugänge'),
        _Zugaenge(verwaltung: _v, mitglied: m),
        const Abschnitt('Zugangsdokumente'),
        ZugangsDokumenteTeil(dienste: widget.dienste, mitglied: m),
        const SizedBox(height: 24),
        OutlinedButton.icon(
          key: const Key('mitglied-loeschen'),
          style: OutlinedButton.styleFrom(foregroundColor: t.colorScheme.error),
          onPressed: _loeschen,
          icon: const Icon(Icons.delete_outline),
          label: const Text('Mitglied löschen'),
        ),
      ],
    );
  }

  /// Ueberschrift plus Zeilen; ohne Zeilen faellt die Gruppe weg.
  Widget _gruppe(String titel, List<Widget> zeilen) {
    if (zeilen.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 20, bottom: 4),
          child: Text(
            titel,
            style: Theme.of(context).textTheme.titleSmall
                ?.copyWith(color: Theme.of(context).colorScheme.primary),
          ),
        ),
        ...zeilen,
      ],
    );
  }

  Widget _zeile(IconData symbol, String? titel, String text, VoidCallback tun) => InkWell(
    onTap: tun,
    borderRadius: BorderRadius.circular(8),
    child: InfoZeile(symbol: symbol, titel: titel, text: text),
  );
}

extension on String {
  String ifEmpty(String ersatz) => isEmpty ? ersatz : this;
}

/// Runder Knopf mit Text darunter.
class _Weg extends StatelessWidget {
  const _Weg({super.key, required this.symbol, required this.text, required this.tun});

  final IconData symbol;
  final String text;
  final VoidCallback tun;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 84,
      child: Column(
        children: [
          IconButton.filledTonal(onPressed: tun, icon: Icon(symbol), tooltip: text),
          Text(
            text,
            style: Theme.of(context).textTheme.labelSmall,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

/// Loeschen mit Rueckfrage und optionalem Grund; gibt den Grund zurueck
/// (leer erlaubt), null bei Abbruch.
class _LoeschenDialog extends StatefulWidget {
  const _LoeschenDialog({required this.name});

  final String name;

  @override
  State<_LoeschenDialog> createState() => _LoeschenDialogState();
}

class _LoeschenDialogState extends State<_LoeschenDialog> {
  final _grund = TextEditingController();

  @override
  void dispose() {
    _grund.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final farben = Theme.of(context).colorScheme;
    return AlertDialog(
      title: Text('${widget.name} löschen?'),
      content: SizedBox(
        width: 480,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Aktuar und Kassier bekommen je einen Link per E-Mail. Gelöscht wird '
              'erst, wenn beide bestätigt haben.',
            ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('loeschen-grund'),
              controller: _grund,
              decoration: const InputDecoration(labelText: 'Grund (optional)'),
              maxLines: 2,
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Abbrechen')),
        FilledButton(
          key: const Key('loeschen-bestaetigen'),
          style: FilledButton.styleFrom(
            backgroundColor: farben.error,
            foregroundColor: farben.onError,
          ),
          onPressed: () => Navigator.of(context).pop(_grund.text),
          child: const Text('Löschung beantragen'),
        ),
      ],
    );
  }
}

/// Anmeldename, Passwort zuruecksetzen/setzen, Cloud-Gruppen.
class _Zugaenge extends StatefulWidget {
  const _Zugaenge({required this.verwaltung, required this.mitglied});

  final MitgliederVerwaltung verwaltung;
  final VorstandMitglied mitglied;

  @override
  State<_Zugaenge> createState() => _ZugaengeState();
}

class _ZugaengeState extends State<_Zugaenge> {
  CloudGruppen? _gruppen;
  Object? _fehler;
  bool _gleichtAb = false;

  VorstandMitglied get _m => widget.mitglied;

  @override
  void initState() {
    super.initState();
    _gruppenLaden();
  }

  @override
  void didUpdateWidget(_Zugaenge alt) {
    super.didUpdateWidget(alt);
    // Nach dem Bearbeiten (Funktionen) frisch fragen.
    if (alt.mitglied.funktion != _m.funktion || alt.mitglied.hatKonto != _m.hatKonto) {
      _gruppenLaden();
    }
  }

  Future<void> _gruppenLaden() async {
    setState(() {
      _gruppen = null;
      _fehler = null;
    });
    try {
      final g = await widget.verwaltung.cloudGruppen(_m.id);
      if (mounted) setState(() => _gruppen = g);
    } on Object catch (e) {
      if (mounted) setState(() => _fehler = e);
    }
  }

  Future<void> _abgleichen() async {
    setState(() => _gleichtAb = true);
    try {
      await widget.verwaltung.cloudGruppenAbgleichen(_m.id, _m.funktionen);
      if (!mounted) return;
      meldung(context, 'Cloud-Gruppen abgeglichen');
      await _gruppenLaden();
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _gleichtAb = false);
    }
  }

  Future<void> _zuruecksetzen() async {
    final ja = await nachfragen(
      context,
      titel: 'Passwort zurücksetzen?',
      text:
          '${_m.name} bekommt ein temporäres Passwort. Das bisherige gilt danach '
          'nicht mehr.',
      ja: 'Zurücksetzen',
    );
    if (!ja || !mounted) return;
    try {
      final pw = await widget.verwaltung.passwortZuruecksetzen(_m.id);
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (c) => AlertDialog(
          title: const Text('Temporäres Passwort'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (pw.meldung != null) Text(pw.meldung!),
              const SizedBox(height: 12),
              SelectableText(
                pw.passwort,
                key: const Key('temp-passwort'),
                style: Theme.of(c).textTheme.headlineSmall?.copyWith(fontFamily: 'monospace'),
              ),
              const SizedBox(height: 12),
              const Text('Bitte dem Mitglied mitteilen; es kann es danach selbst ändern.'),
            ],
          ),
          actions: [
            TextButton.icon(
              key: const Key('temp-passwort-kopieren'),
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: pw.passwort));
                if (c.mounted) meldung(c, 'Passwort kopiert');
              },
              icon: const Icon(Icons.copy),
              label: const Text('Kopieren'),
            ),
            FilledButton(onPressed: () => Navigator.of(c).pop(), child: const Text('Fertig')),
          ],
        ),
      );
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    }
  }

  Future<void> _setzen() async {
    final text = await showDialog<String>(
      context: context,
      builder: (_) =>
          _PasswortSetzenDialog(name: _m.name, verwaltung: widget.verwaltung, id: _m.id),
    );
    if (text != null && mounted) meldung(context, text);
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final g = _gruppen;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        InfoZeile(
          symbol: Icons.account_circle_outlined,
          titel: 'Anmeldename (geht anstelle der E-Mail-Adresse)',
          text: _m.benutzername ?? '— noch keiner —',
        ),
        if (_m.hatKonto)
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                key: const Key('passwort-zuruecksetzen'),
                onPressed: _zuruecksetzen,
                icon: const Icon(Icons.lock_reset),
                label: const Text('Passwort zurücksetzen'),
              ),
              OutlinedButton.icon(
                key: const Key('passwort-setzen'),
                onPressed: _setzen,
                icon: const Icon(Icons.password),
                label: const Text('Passwort setzen'),
              ),
            ],
          )
        else
          Text(
            'Kein Login-Konto – es entsteht, sobald eine E-Mail-Adresse hinterlegt ist.',
            style: t.textTheme.bodySmall,
          ),
        const SizedBox(height: 16),
        Text('Cloud-Gruppen', style: t.textTheme.titleSmall),
        Text('Werden nach den Funktionen vergeben.', style: t.textTheme.bodySmall),
        if (_fehler != null)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Row(
              children: [
                Expanded(child: Text(fehlerText(_fehler!))),
                TextButton(onPressed: _gruppenLaden, child: const Text('Erneut')),
              ],
            ),
          )
        else if (g == null)
          const Padding(padding: EdgeInsets.all(12), child: LinearProgressIndicator())
        else if (!g.hatKonto)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Text('Kein Login-Konto vorhanden.'),
          )
        else ...[
          _gruppe('Nextcloud-Admin', 'Admin-Funktion', g.nextcloudAdmin),
          _gruppe('Vorstand-Gruppe', 'Vorstandsfunktionen', g.vorstandGruppe),
          _gruppe('Social-Media-Gruppe', 'Funktion Social Media', g.socialMedia),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: OutlinedButton.icon(
              key: const Key('gruppen-abgleichen'),
              onPressed: _gleichtAb ? null : _abgleichen,
              icon: _gleichtAb
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.sync),
              label: Text(
                g.gleichWie(CloudGruppen.nachFunktion(_m.funktionen))
                    ? 'Nach Funktion abgleichen'
                    : 'Nach Funktion abgleichen (weicht ab)',
              ),
            ),
          ),
        ],
      ],
    );
  }

  Widget _gruppe(String titel, String warum, bool drin) => ListTile(
    key: Key('gruppe-$titel'),
    contentPadding: EdgeInsets.zero,
    dense: true,
    leading: Icon(
      drin ? Icons.check_circle : Icons.cancel_outlined,
      color: drin ? FwvFarben.gruen : Theme.of(context).colorScheme.outline,
    ),
    title: Text(titel),
    subtitle: Text(warum),
    trailing: Text(drin ? 'Mitglied' : 'nicht drin'),
  );
}

class _PasswortSetzenDialog extends StatefulWidget {
  const _PasswortSetzenDialog({required this.name, required this.verwaltung, required this.id});

  final String name;
  final MitgliederVerwaltung verwaltung;
  final String id;

  @override
  State<_PasswortSetzenDialog> createState() => _PasswortSetzenDialogState();
}

class _PasswortSetzenDialogState extends State<_PasswortSetzenDialog> {
  final _formular = GlobalKey<FormState>();
  final _pw = TextEditingController();
  bool _sendet = false;
  bool _zeigen = false;

  @override
  void dispose() {
    _pw.dispose();
    super.dispose();
  }

  Future<void> _setzen() async {
    if (!_formular.currentState!.validate()) return;
    setState(() => _sendet = true);
    try {
      final text = await widget.verwaltung.passwortSetzen(widget.id, _pw.text);
      if (mounted) Navigator.of(context).pop(text);
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _sendet = false);
      meldung(context, fehlerText(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    const min = MitgliederVerwaltung.passwortMinLaenge;
    return AlertDialog(
      title: Text('Passwort für ${widget.name}'),
      content: SizedBox(
        width: 420,
        child: Form(
          key: _formular,
          child: TextFormField(
            key: const Key('neues-passwort'),
            controller: _pw,
            obscureText: !_zeigen,
            autocorrect: false,
            enableSuggestions: false,
            decoration: InputDecoration(
              labelText: 'Neues Passwort',
              helperText: 'Mindestens $min Zeichen',
              suffixIcon: IconButton(
                onPressed: () => setState(() => _zeigen = !_zeigen),
                icon: Icon(_zeigen ? Icons.visibility_off : Icons.visibility),
                tooltip: _zeigen ? 'Verbergen' : 'Anzeigen',
              ),
            ),
            validator: (t) => (t ?? '').length < min ? 'Mindestens $min Zeichen.' : null,
            onFieldSubmitted: (_) => _setzen(),
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _sendet ? null : () => Navigator.of(context).pop(),
          child: const Text('Abbrechen'),
        ),
        FilledButton(
          key: const Key('passwort-setzen-ok'),
          onPressed: _sendet ? null : _setzen,
          child: const Text('Setzen'),
        ),
      ],
    );
  }
}
