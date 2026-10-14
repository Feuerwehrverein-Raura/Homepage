// Mitglied anlegen (POST /members) oder bearbeiten (PUT /members/:id, nur
// die geaenderten Felder). Felder und Regeln wie das Formular in
// vorstand.html: Revisor schliesst Vorstandsfunktionen aus, bei
// "Feuerwehr Raurica" ist das Eintrittsdatum heute (falls leer). Nach dem
// Speichern werden die Cloud-Gruppen nach den Funktionen abgeglichen.
//
// Speichern sitzt oben in der Titelleiste und ist damit auch bei offener
// Tastatur sichtbar. Gibt das gespeicherte Mitglied zurueck.

import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:material_ui/material_ui.dart';

import '../../dienste.dart';
import '../../mitglieder/modelle.dart';
import 'bausteine.dart';

class MitgliedFormularScreen extends StatefulWidget {
  const MitgliedFormularScreen({super.key, required this.dienste, this.mitglied});

  final VorstandDienste dienste;

  /// Null: neues Mitglied.
  final VorstandMitglied? mitglied;

  @override
  State<MitgliedFormularScreen> createState() => _MitgliedFormularScreenState();
}

class _MitgliedFormularScreenState extends State<MitgliedFormularScreen> {
  final _formular = GlobalKey<FormState>();
  late final MitgliedEntwurf _original = widget.mitglied == null
      ? const MitgliedEntwurf()
      : MitgliedEntwurf.aus(widget.mitglied!);

  late final _vorname = TextEditingController(text: _original.vorname);
  late final _nachname = TextEditingController(text: _original.nachname);
  late final _email = TextEditingController(text: _original.email);
  late final _versandEmail = TextEditingController(text: _original.versandEmail);
  late final _telefon = TextEditingController(text: _original.telefon);
  late final _mobile = TextEditingController(text: _original.mobile);
  late final _strasse = TextEditingController(text: _original.strasse);
  late final _adresszusatz = TextEditingController(text: _original.adresszusatz);
  late final _plz = TextEditingController(text: _original.plz);
  late final _ort = TextEditingController(text: _original.ort);
  late final _bemerkungen = TextEditingController(text: _original.bemerkungen);

  late String? _anrede = _original.anrede;
  late String? _geschlecht = _original.geschlecht;
  late DateTime? _geburtstag = _original.geburtstag;
  late String _status = _original.status;
  late String _zugehoerigkeit = _original.feuerwehrZugehoerigkeit;
  late List<String> _funktionen = _original.funktionen;
  late DateTime? _eintritt = _original.eintrittsdatum;
  late bool _zustellungEmail = _original.zustellungEmail;
  late bool _zustellungPost = _original.zustellungPost;

  bool _speichert = false;

  bool get _neu => widget.mitglied == null;

  @override
  void dispose() {
    for (final c in [
      _vorname,
      _nachname,
      _email,
      _versandEmail,
      _telefon,
      _mobile,
      _strasse,
      _adresszusatz,
      _plz,
      _ort,
      _bemerkungen,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  MitgliedEntwurf get _entwurf => MitgliedEntwurf(
    anrede: _anrede,
    geschlecht: _geschlecht,
    vorname: _vorname.text,
    nachname: _nachname.text,
    geburtstag: _geburtstag,
    email: _email.text,
    versandEmail: _versandEmail.text,
    telefon: _telefon.text,
    mobile: _mobile.text,
    strasse: _strasse.text,
    adresszusatz: _adresszusatz.text,
    plz: _plz.text,
    ort: _ort.text,
    status: _status,
    feuerwehrZugehoerigkeit: _zugehoerigkeit,
    funktionen: _funktionen,
    eintrittsdatum: _eintritt,
    zustellungEmail: _zustellungEmail,
    zustellungPost: _zustellungPost,
    bemerkungen: _bemerkungen.text,
  );

  void _zugehoerigkeitWaehlen(String? wert) {
    if (wert == null) return;
    setState(() {
      _zugehoerigkeit = wert;
      // Wie vorstand.html: Eintritt in die Feuerwehr Raurica = heute,
      // wenn noch keiner eingetragen ist.
      if (wert == 'feuerwehr_raurica' && _eintritt == null) {
        final heute = DateTime.now();
        _eintritt = DateTime(heute.year, heute.month, heute.day);
      }
    });
  }

  Future<void> _speichern() async {
    if (!_formular.currentState!.validate()) return;
    final v = widget.dienste.mitglieder;
    final neu = _entwurf;
    setState(() => _speichert = true);
    try {
      final VorstandMitglied gespeichert;
      if (_neu) {
        gespeichert = await v.anlegen(neu);
      } else {
        final g = await v.aendern(widget.mitglied!.id, _original, neu);
        if (g == null) {
          if (!mounted) return;
          meldung(context, 'Keine Änderungen');
          Navigator.of(context).pop();
          return;
        }
        gespeichert = g;
      }
      // Cloud-Gruppen nach Funktion (wie vorstand.html nach dem Speichern).
      final funktionGeaendert = _neu
          ? neu.funktionen.isNotEmpty
          : neu.funktionen.join(',') != _original.funktionen.join(',');
      var gruppenFehler = false;
      if (funktionGeaendert && gespeichert.hatKonto) {
        try {
          await v.cloudGruppenAbgleichen(gespeichert.id, gespeichert.funktionen);
        } on Object {
          gruppenFehler = true;
        }
      }
      if (!mounted) return;
      meldung(
        context,
        gruppenFehler
            ? 'Gespeichert – Cloud-Gruppen konnten nicht abgeglichen werden.'
            : (_neu ? 'Mitglied angelegt' : 'Gespeichert'),
      );
      Navigator.of(context).pop(gespeichert);
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _speichert = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(_neu ? 'Neues Mitglied' : 'Mitglied bearbeiten'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: _speichert
                ? const Padding(
                    padding: EdgeInsets.all(12),
                    child: SizedBox.square(
                      dimension: 24,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  )
                : TextButton(
                    key: const Key('mitglied-speichern'),
                    onPressed: _speichern,
                    child: const Text('Speichern'),
                  ),
          ),
        ],
      ),
      body: SafeArea(
        child: Form(
          key: _formular,
          // Kein ListView: dessen Felder ausserhalb des Bildschirms gibt es
          // nicht, und das Formular koennte sie dann nicht pruefen.
          child: SingleChildScrollView(
            padding: mitSystemleiste(context, const EdgeInsets.fromLTRB(16, 0, 16, 32)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _titel('Persönliche Daten'),
                Row(
                  children: [
                    Expanded(
                      child: _auswahl('Anrede', _anrede, [
                        for (final a in mitgliedAnreden) (a, a),
                      ], (w) => setState(() => _anrede = w)),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _auswahl(
                        'Geschlecht',
                        _geschlecht,
                        mitgliedGeschlechter,
                        (w) => setState(() => _geschlecht = w),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                _feld(_vorname, 'Vorname', pflicht: true),
                _feld(_nachname, 'Nachname', pflicht: true),
                DatumFeld(
                  titel: 'Geburtstag',
                  datum: _geburtstag,
                  ersteAuswahlJahr: true,
                  aendern: (d) => setState(() => _geburtstag = d),
                ),
                _titel('Kontakt'),
                _feld(
                  _email,
                  'E-Mail',
                  tastatur: TextInputType.emailAddress,
                  pruefen: _emailPruefen,
                  hinweis: _neu ? 'Mit E-Mail-Adresse entsteht gleich das Login.' : null,
                ),
                _feld(
                  _versandEmail,
                  'Versand-E-Mail',
                  tastatur: TextInputType.emailAddress,
                  pruefen: _emailPruefen,
                  hinweis: 'Nur wenn Rundschreiben an eine andere Adresse gehen sollen.',
                ),
                _feld(_mobile, 'Mobile', tastatur: TextInputType.phone),
                _feld(_telefon, 'Telefon', tastatur: TextInputType.phone),
                _titel('Adresse'),
                _feld(_strasse, 'Strasse'),
                _feld(_adresszusatz, 'Adresszusatz'),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(width: 110, child: _feld(_plz, 'PLZ', tastatur: TextInputType.number)),
                    const SizedBox(width: 12),
                    Expanded(child: _feld(_ort, 'Ort')),
                  ],
                ),
                _titel('Mitgliedschaft'),
                _auswahl(
                  'Status',
                  _status,
                  [for (final s in mitgliedStatusWerte) (s, s)],
                  (w) => setState(() => _status = w ?? _status),
                  leerErlaubt: false,
                  feldKey: const Key('feld-status'),
                ),
                const SizedBox(height: 12),
                _auswahl(
                  'Feuerwehr-Zugehörigkeit',
                  _zugehoerigkeit,
                  feuerwehrZugehoerigkeiten,
                  _zugehoerigkeitWaehlen,
                  leerErlaubt: false,
                  feldKey: const Key('feld-zugehoerigkeit'),
                ),
                const SizedBox(height: 12),
                DatumFeld(
                  titel: 'Eintritt',
                  datum: _eintritt,
                  aendern: (d) => setState(() => _eintritt = d),
                ),
                const SizedBox(height: 16),
                Text('Funktionen', style: t.textTheme.titleSmall),
                Text(
                  'Mehrfachauswahl. Revisor schliesst Vorstandsfunktionen aus.',
                  style: t.textTheme.bodySmall,
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  children: [
                    for (final (f, erklaerung) in mitgliedFunktionen)
                      FilterChip(
                        key: Key('funktion-$f'),
                        label: Text(erklaerung.isEmpty ? f : '$f ($erklaerung)'),
                        selected: _funktionen.contains(f),
                        onSelected: (an) =>
                            setState(() => _funktionen = funktionUmschalten(_funktionen, f, an)),
                      ),
                    // Was das Backend sonst noch kennt (z.B. Webmaster),
                    // bleibt erhalten und laesst sich abwaehlen.
                    for (final f in _funktionen)
                      if (!mitgliedFunktionen.any((e) => e.$1 == f))
                        FilterChip(
                          label: Text(f),
                          selected: true,
                          onSelected: (an) =>
                              setState(() => _funktionen = funktionUmschalten(_funktionen, f, an)),
                        ),
                  ],
                ),
                _titel('Zustellung'),
                SwitchListTile(
                  key: const Key('zustellung-email'),
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Per E-Mail'),
                  value: _zustellungEmail,
                  onChanged: (v) => setState(() => _zustellungEmail = v),
                ),
                SwitchListTile(
                  key: const Key('zustellung-post'),
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Per Post'),
                  value: _zustellungPost,
                  onChanged: (v) => setState(() => _zustellungPost = v),
                ),
                _titel('Bemerkungen'),
                TextFormField(
                  key: const Key('feld-Bemerkungen'),
                  controller: _bemerkungen,
                  decoration: const InputDecoration(labelText: 'Bemerkungen'),
                  minLines: 2,
                  maxLines: 6,
                ),
                if (!_neu) ...[
                  _titel('Login'),
                  InputDecorator(
                    decoration: const InputDecoration(
                      labelText: 'Benutzername',
                      helperText: 'Vergibt das System; geht anstelle der E-Mail-Adresse.',
                    ),
                    child: SelectableText(widget.mitglied!.benutzername ?? '— noch keiner —'),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _titel(String text) => Padding(
    padding: const EdgeInsets.only(top: 24, bottom: 8),
    child: Text(
      text,
      style: Theme.of(context).textTheme.titleSmall
          ?.copyWith(color: Theme.of(context).colorScheme.primary),
    ),
  );

  /// Auswahlfeld; ein unbekannter Wert vom Backend bleibt waehlbar.
  Widget _auswahl(
    String titel,
    String? wert,
    List<(String, String)> werte,
    ValueChanged<String?> aendern, {
    bool leerErlaubt = true,
    Key? feldKey,
  }) {
    final alle = [...werte, if (wert != null && !werte.any((e) => e.$1 == wert)) (wert, wert)];
    return DropdownButtonFormField<String?>(
      key: feldKey ?? Key('feld-$titel'),
      initialValue: wert,
      isExpanded: true,
      decoration: InputDecoration(labelText: titel),
      items: [
        if (leerErlaubt) const DropdownMenuItem<String?>(value: null, child: Text('–')),
        for (final (w, text) in alle)
          DropdownMenuItem<String?>(
            value: w,
            child: Text(text, overflow: TextOverflow.ellipsis),
          ),
      ],
      onChanged: aendern,
    );
  }

  Widget _feld(
    TextEditingController c,
    String titel, {
    bool pflicht = false,
    TextInputType? tastatur,
    String? Function(String)? pruefen,
    String? hinweis,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextFormField(
        key: Key('feld-$titel'),
        controller: c,
        decoration: InputDecoration(
          labelText: pflicht ? '$titel *' : titel,
          helperText: hinweis,
          helperMaxLines: 2,
        ),
        keyboardType: tastatur,
        textInputAction: TextInputAction.next,
        validator: (wert) {
          final t = (wert ?? '').trim();
          if (t.isEmpty) return pflicht ? 'Bitte $titel angeben.' : null;
          return pruefen?.call(t);
        },
      ),
    );
  }
}

/// Einfache Pruefung gegen Tippfehler; die echte macht der Mailserver.
String? _emailPruefen(String t) => RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(t)
    ? null
    : 'Bitte eine gültige E-Mail-Adresse angeben.';
