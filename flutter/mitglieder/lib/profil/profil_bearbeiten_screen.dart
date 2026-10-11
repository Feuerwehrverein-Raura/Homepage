// Profil bearbeiten (`PUT members/me`) und Profilfoto (`POST/DELETE
// members/me/photo`). Felder wie members-android EditProfileActivity; der
// Geburtstag kommt aus einem Datumswaehler, nicht aus freiem Text.
//
// Speichern sitzt oben in der Titelleiste und ist damit auch bei offener
// Tastatur sichtbar.

import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';
import '../gemeinsam.dart';

class ProfilBearbeitenScreen extends StatefulWidget {
  const ProfilBearbeitenScreen({super.key, required this.dienste, required this.profil});

  final Dienste dienste;
  final MitgliedProfil profil;

  @override
  State<ProfilBearbeitenScreen> createState() => _ProfilBearbeitenScreenState();
}

/// Auswahl fuer die Anrede (wie die alte App).
const anreden = ['Frau', 'Herr', 'Divers'];

class _ProfilBearbeitenScreenState extends State<ProfilBearbeitenScreen> {
  final _formular = GlobalKey<FormState>();
  late final _vorname = TextEditingController(text: widget.profil.vorname);
  late final _nachname = TextEditingController(text: widget.profil.nachname);
  late final _email = TextEditingController(text: widget.profil.email);
  late final _mobile = TextEditingController(text: widget.profil.mobile);
  late final _telefon = TextEditingController(text: widget.profil.telefon);
  late final _strasse = TextEditingController(text: widget.profil.strasse);
  late final _plz = TextEditingController(text: widget.profil.plz);
  late final _ort = TextEditingController(text: widget.profil.ort);
  late String? _anrede = widget.profil.anrede;
  late DateTime? _geburtstag = widget.profil.geburtstag;
  late String? _foto = widget.profil.foto;

  bool _speichert = false;
  bool _fotoLaeuft = false;

  @override
  void dispose() {
    for (final c in [_vorname, _nachname, _email, _mobile, _telefon, _strasse, _plz, _ort]) {
      c.dispose();
    }
    super.dispose();
  }

  // ---------------------------------------------------------------------
  // Speichern

  Future<void> _speichern() async {
    if (!_formular.currentState!.validate()) return;
    setState(() => _speichert = true);
    try {
      final neu = await widget.dienste.mitglieder.profilSpeichern(
        ProfilAenderung(
          anrede: _anrede,
          vorname: _vorname.text,
          nachname: _nachname.text,
          email: _email.text,
          geburtstag: _geburtstag,
          mobile: _mobile.text,
          telefon: _telefon.text,
          strasse: _strasse.text,
          plz: _plz.text,
          ort: _ort.text,
        ),
      );
      if (!mounted) return;
      meldung(context, 'Profil gespeichert');
      Navigator.of(context).pop(neu);
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _speichert = false);
    }
  }

  Future<void> _geburtstagWaehlen() async {
    final heute = DateTime.now();
    final gewaehlt = await showDatePicker(
      context: context,
      initialDate: _geburtstag ?? DateTime(heute.year - 30),
      firstDate: DateTime(1900),
      lastDate: heute,
      // Ohne Datum zuerst das Jahr waehlen — sonst muss man Jahrzehnte
      // zurueckblaettern.
      initialDatePickerMode: _geburtstag == null ? DatePickerMode.year : DatePickerMode.day,
      helpText: 'Geburtstag',
    );
    if (gewaehlt != null) setState(() => _geburtstag = gewaehlt);
  }

  // ---------------------------------------------------------------------
  // Foto

  Future<void> _fotoNeu(FotoQuelle quelle) async {
    final roh = await widget.dienste.fotoWaehlen(quelle);
    if (roh == null || !mounted) return;
    setState(() => _fotoLaeuft = true);
    try {
      final jpeg = await fotoVerkleinernImHintergrund(roh);
      final pfad = await widget.dienste.mitglieder.fotoHochladen(jpeg);
      if (!mounted) return;
      setState(() => _foto = pfad);
      meldung(context, 'Profilfoto aktualisiert');
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _fotoLaeuft = false);
    }
  }

  Future<void> _fotoLoeschen() async {
    final ja = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Profilfoto entfernen?'),
        content: const Text('Möchtest du dein Profilfoto wirklich löschen?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Abbrechen')),
          TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Entfernen')),
        ],
      ),
    );
    if (ja != true || !mounted) return;
    setState(() => _fotoLaeuft = true);
    try {
      await widget.dienste.mitglieder.fotoLoeschen();
      if (!mounted) return;
      setState(() => _foto = null);
      meldung(context, 'Profilfoto entfernt');
    } on Object catch (e) {
      if (mounted) meldung(context, fehlerText(e));
    } finally {
      if (mounted) setState(() => _fotoLaeuft = false);
    }
  }

  // ---------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final api = widget.dienste.sitzung.api;
    final beschaeftigt = _speichert || _fotoLaeuft;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Profil bearbeiten'),
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
                    key: const Key('profil-speichern'),
                    onPressed: beschaeftigt ? null : _speichern,
                    child: const Text('Speichern'),
                  ),
          ),
        ],
      ),
      body: SafeArea(
        child: Form(
          key: _formular,
          // Kein ListView: dessen Felder ausserhalb des Bildschirms gibt es nicht,
          // und das Formular koennte sie dann nicht pruefen.
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      ProfilFoto(adresse: profilFotoAdresse(_foto, api.basis), api: api),
                      if (_fotoLaeuft) const CircularProgressIndicator(),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 8,
                  runSpacing: 4,
                  children: [
                    TextButton.icon(
                      onPressed: beschaeftigt ? null : () => _fotoNeu(FotoQuelle.kamera),
                      icon: const Icon(Icons.photo_camera_outlined),
                      label: const Text('Kamera'),
                    ),
                    TextButton.icon(
                      onPressed: beschaeftigt ? null : () => _fotoNeu(FotoQuelle.galerie),
                      icon: const Icon(Icons.photo_library_outlined),
                      label: const Text('Galerie'),
                    ),
                    if (_foto != null)
                      TextButton.icon(
                        onPressed: beschaeftigt ? null : _fotoLoeschen,
                        icon: const Icon(Icons.delete_outline),
                        label: const Text('Entfernen'),
                      ),
                  ],
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  initialValue: _anrede,
                  decoration: const InputDecoration(labelText: 'Anrede'),
                  items: [
                    for (final a in {...anreden, ?_anrede})
                      DropdownMenuItem(value: a, child: Text(a)),
                  ],
                  onChanged: (a) => setState(() => _anrede = a),
                ),
                const SizedBox(height: 12),
                _feld(_vorname, 'Vorname', pflicht: true, autofill: AutofillHints.givenName),
                _feld(_nachname, 'Nachname', pflicht: true, autofill: AutofillHints.familyName),
                _feld(
                  _email,
                  'E-Mail',
                  pflicht: true,
                  tastatur: TextInputType.emailAddress,
                  pruefen: emailPruefen,
                  autofill: AutofillHints.email,
                ),
                _GeburtstagFeld(
                  datum: _geburtstag,
                  waehlen: _geburtstagWaehlen,
                  leeren: () => setState(() => _geburtstag = null),
                ),
                const SizedBox(height: 12),
                _feld(
                  _mobile,
                  'Mobile',
                  tastatur: TextInputType.phone,
                  pruefen: telefonPruefen,
                  autofill: AutofillHints.telephoneNumber,
                ),
                _feld(_telefon, 'Telefon', tastatur: TextInputType.phone, pruefen: telefonPruefen),
                _feld(_strasse, 'Strasse', autofill: AutofillHints.streetAddressLine1),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      width: 110,
                      child: _feld(
                        _plz,
                        'PLZ',
                        tastatur: TextInputType.number,
                        pruefen: plzPruefen,
                        autofill: AutofillHints.postalCode,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(child: _feld(_ort, 'Ort', autofill: AutofillHints.addressCity)),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _feld(
    TextEditingController c,
    String titel, {
    bool pflicht = false,
    TextInputType? tastatur,
    String? Function(String)? pruefen,
    String? autofill,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextFormField(
        controller: c,
        decoration: InputDecoration(labelText: pflicht ? '$titel *' : titel),
        keyboardType: tastatur,
        textInputAction: TextInputAction.next,
        autofillHints: autofill == null ? null : [autofill],
        validator: (wert) {
          final t = (wert ?? '').trim();
          if (t.isEmpty) return pflicht ? 'Bitte $titel angeben.' : null;
          return pruefen?.call(t);
        },
      ),
    );
  }
}

/// Einfache Pruefung, genug gegen Tippfehler; die echte Pruefung macht der
/// Mailserver.
String? emailPruefen(String t) => RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(t)
    ? null
    : 'Bitte eine gültige E-Mail-Adresse angeben.';

/// Ziffern, Leerzeichen und + / - ( ) . — das Backend formatiert selbst.
String? telefonPruefen(String t) =>
    RegExp(r'^\+?[0-9 /().-]{6,}$').hasMatch(t) ? null : 'Bitte eine gültige Nummer angeben.';

/// Schweiz 4, Deutschland/Frankreich 5 Ziffern; andere Laender mit
/// Buchstaben sind selten, aber erlaubt.
String? plzPruefen(String t) =>
    RegExp(r'^[A-Za-z0-9 -]{3,10}$').hasMatch(t) ? null : 'Ungültige PLZ.';

class _GeburtstagFeld extends StatelessWidget {
  const _GeburtstagFeld({required this.datum, required this.waehlen, required this.leeren});

  final DateTime? datum;
  final VoidCallback waehlen;
  final VoidCallback leeren;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      key: const Key('geburtstag'),
      onTap: waehlen,
      borderRadius: BorderRadius.circular(4),
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: 'Geburtstag',
          suffixIcon: datum == null
              ? const Icon(Icons.calendar_today_outlined)
              : IconButton(
                  onPressed: leeren,
                  icon: const Icon(Icons.clear),
                  tooltip: 'Geburtstag entfernen',
                ),
        ),
        isEmpty: datum == null,
        child: Text(datum == null ? '' : schweizerDatum(datum!)),
      ),
    );
  }
}
