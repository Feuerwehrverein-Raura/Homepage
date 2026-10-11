// Benachrichtigungs-Einstellungen (`GET/PUT members/me/notifications`).
//
// Die Schalter wirken beim Backend auf Push (und teils E-Mail); sie sind
// auch ohne Push-Erlaubnis auf diesem Geraet sinnvoll. Gespeichert wird bei
// jeder Aenderung, immer alle Arten auf einmal (wie die alten Apps).
// Welche Arten es gibt: fwv_core BenachrichtigungsArt.

import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';
import '../gemeinsam.dart';
import '../push/push_dienst.dart';

class BenachrichtigungenScreen extends StatefulWidget {
  const BenachrichtigungenScreen({super.key, required this.dienste});

  final Dienste dienste;

  @override
  State<BenachrichtigungenScreen> createState() => _BenachrichtigungenScreenState();
}

class _BenachrichtigungenScreenState extends State<BenachrichtigungenScreen> {
  BenachrichtigungsEinstellungen? _werte;
  String? _fehler;
  bool _speichert = false;
  PushErlaubnis? _erlaubnis;

  @override
  void initState() {
    super.initState();
    _laden();
    _erlaubnisLesen();
  }

  Future<void> _laden() async {
    setState(() => _fehler = null);
    try {
      final w = await widget.dienste.mitglieder.benachrichtigungen();
      if (mounted) setState(() => _werte = w);
    } on Object catch (e) {
      if (mounted) setState(() => _fehler = fehlerText(e));
    }
  }

  Future<void> _erlaubnisLesen() async {
    final e = await widget.dienste.push.erlaubnis();
    if (mounted) setState(() => _erlaubnis = e);
  }

  Future<void> _erlaubnisAnfragen() async {
    final e = await widget.dienste.push.erlaubnisAnfragen();
    if (!mounted) return;
    setState(() => _erlaubnis = e);
    if (e == PushErlaubnis.erlaubt) {
      await widget.dienste.pushAnmeldung.anmelden(widget.dienste.mitglieder);
    }
  }

  Future<void> _setzen(String art, bool aktiv) async {
    final vorher = _werte!;
    setState(() {
      _werte = vorher.mit(art, aktiv);
      _speichert = true;
    });
    try {
      final neu = await widget.dienste.mitglieder.benachrichtigungenSpeichern(_werte!);
      if (mounted) setState(() => _werte = neu);
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _werte = vorher);
      meldung(context, 'Nicht gespeichert: ${fehlerText(e)}');
    } finally {
      if (mounted) setState(() => _speichert = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final w = _werte;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Benachrichtigungen'),
        bottom: _speichert
            ? const PreferredSize(
                preferredSize: Size.fromHeight(2),
                child: LinearProgressIndicator(minHeight: 2),
              )
            : null,
      ),
      body: w == null
          ? (_fehler == null
                ? const Center(child: CircularProgressIndicator())
                : FehlerAnsicht(meldung: _fehler!, erneut: _laden))
          : ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                const Abschnitt('Wovon du hören willst'),
                for (final art in BenachrichtigungsArt.alle)
                  SwitchListTile(
                    key: Key('art-${art.schluessel}'),
                    title: Text(art.titel),
                    subtitle: Text(art.beschreibung),
                    value: w.aktiv(art.schluessel),
                    onChanged: _speichert ? null : (v) => _setzen(art.schluessel, v),
                  ),
                const Abschnitt('Dieses Gerät'),
                _geraet(context),
              ],
            ),
    );
  }

  Widget _geraet(BuildContext context) {
    final farben = Theme.of(context).colorScheme;
    return switch (_erlaubnis) {
      null => const ListTile(title: Text('…')),
      PushErlaubnis.erlaubt => const ListTile(
        leading: Icon(Icons.check_circle_outline),
        title: Text('Mitteilungen auf diesem Gerät erlaubt'),
      ),
      PushErlaubnis.abgelehnt => ListTile(
        leading: Icon(Icons.notifications_off_outlined, color: farben.error),
        title: const Text('Mitteilungen sind für diese App abgeschaltet.'),
        subtitle: const Text('In den Einstellungen des Telefons wieder erlauben.'),
      ),
      PushErlaubnis.nichtGefragt => ListTile(
        leading: const Icon(Icons.notifications_outlined),
        title: const Text('Mitteilungen erlauben'),
        onTap: _erlaubnisAnfragen,
        trailing: const Icon(Icons.chevron_right),
      ),
      PushErlaubnis.nichtVerfuegbar => const ListTile(
        leading: Icon(Icons.notifications_paused_outlined),
        title: Text('Mitteilungen aufs Gerät gibt es hier noch nicht.'),
        subtitle: Text('Die gewählten Meldungen kommen per E-Mail.'),
      ),
    };
  }
}
