// Reiter "Profil": eigene Angaben aus `GET members/me`, Bearbeiten, Meine
// Anmeldungen und Austritt. Wie members-android ProfileFragment und
// members-ios ProfileView.

import 'package:fwv_anlass/fwv_anlass.dart' show mitSystemleiste;
import 'package:fwv_core/fwv_core.dart';
import 'package:fwv_lager/fwv_lager.dart' show MeineAusleihenScreen, ausleiheNeuOeffnen;
import 'package:material_ui/material_ui.dart';

import '../anlaesse/meine_anmeldungen_screen.dart';
import '../dienste.dart';
import '../gemeinsam.dart';
import 'austritt_screen.dart';
import 'profil_bearbeiten_screen.dart';

class ProfilTab extends StatefulWidget {
  const ProfilTab({super.key, required this.dienste});

  final Dienste dienste;

  @override
  State<ProfilTab> createState() => _ProfilTabState();
}

class _ProfilTabState extends State<ProfilTab> {
  MitgliedProfil? _profil;
  String? _fehler;
  bool _laedt = true;

  @override
  void initState() {
    super.initState();
    _laden();
  }

  Future<void> _laden() async {
    setState(() {
      _laedt = true;
      _fehler = null;
    });
    try {
      final p = await widget.dienste.mitglieder.profil();
      if (mounted) setState(() => _profil = p);
    } on Object catch (e) {
      if (mounted) setState(() => _fehler = fehlerText(e));
    } finally {
      if (mounted) setState(() => _laedt = false);
    }
  }

  Future<void> _bearbeiten() async {
    final p = _profil;
    if (p == null) return;
    final neu = await Navigator.of(context).push<MitgliedProfil>(
      MaterialPageRoute(
        builder: (_) => ProfilBearbeitenScreen(dienste: widget.dienste, profil: p),
      ),
    );
    // Auch ohne Speichern kann sich das Foto geaendert haben.
    if (neu != null && mounted) setState(() => _profil = neu);
    await _laden();
  }

  @override
  Widget build(BuildContext context) {
    final p = _profil;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Profil'),
        actions: [
          if (p != null)
            IconButton(
              onPressed: _bearbeiten,
              icon: const Icon(Icons.edit),
              tooltip: 'Profil bearbeiten',
            ),
        ],
      ),
      body: p == null
          ? (_laedt
                ? const Center(child: CircularProgressIndicator())
                : FehlerAnsicht(meldung: _fehler ?? 'Profil nicht gefunden.', erneut: _laden))
          : RefreshIndicator(onRefresh: _laden, child: _inhalt(context, p)),
    );
  }

  Widget _inhalt(BuildContext context, MitgliedProfil p) {
    final text = Theme.of(context).textTheme;
    final api = widget.dienste.sitzung.api;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: mitSystemleiste(context, const EdgeInsets.only(bottom: 24)),
      children: [
        const SizedBox(height: 24),
        Center(
          child: ProfilFoto(adresse: p.fotoAdresse(api.basis), api: api),
        ),
        const SizedBox(height: 12),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Text(
            p.name ?? anzeigeNameErsatz,
            style: text.headlineSmall,
            textAlign: TextAlign.center,
          ),
        ),
        if (p.funktion != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
            child: Text(
              p.funktion!,
              style: text.titleMedium?.copyWith(color: Theme.of(context).colorScheme.primary),
              textAlign: TextAlign.center,
            ),
          ),
        if (_fehler != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: Text(
              _fehler!,
              textAlign: TextAlign.center,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
        const Abschnitt('Kontakt'),
        _zeile(Icons.mail_outline, 'E-Mail', p.email),
        _zeile(Icons.smartphone, 'Mobile', p.mobile),
        _zeile(Icons.phone_outlined, 'Telefon', p.telefon),
        if (p.adresszeilen.isNotEmpty)
          _zeile(Icons.home_outlined, 'Adresse', p.adresszeilen.join('\n')),
        if (p.geburtstag != null)
          _zeile(Icons.cake_outlined, 'Geburtstag', schweizerDatum(p.geburtstag!)),
        if (p.status != null) _zeile(Icons.badge_outlined, 'Status', p.status),
        if (p.iban != null && p.iban!.trim().isNotEmpty)
          _zeile(Icons.account_balance_outlined, 'IBAN', ibanFormatieren(p.iban!)),
        const Divider(height: 32),
        ListTile(
          leading: const Icon(Icons.edit_outlined),
          title: const Text('Profil bearbeiten'),
          trailing: const Icon(Icons.chevron_right),
          onTap: _bearbeiten,
        ),
        ListTile(
          leading: const Icon(Icons.how_to_reg_outlined),
          title: const Text('Meine Anmeldungen'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => MeineAnmeldungenScreen(dienste: widget.dienste)),
          ),
        ),
        ..._ausleihe(context),
        const Divider(height: 32),
        ListTile(
          leading: Icon(Icons.exit_to_app, color: Theme.of(context).colorScheme.error),
          title: Text(
            'Austritt beantragen',
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
          onTap: () =>
              Navigator.of(context)
                  .push(MaterialPageRoute(builder: (_) => AustrittScreen(dienste: widget.dienste))),
        ),
      ],
    );
  }

  /// Ausleihe aus dem Vereinslager: jedes angemeldete Mitglied, ueber
  /// Authentik oder per QR-Code gleich.
  List<Widget> _ausleihe(BuildContext context) {
    final d = widget.dienste;
    if (!d.ausleiheMoeglich) return const [];
    return [
      ListTile(
        key: const Key('material-ausleihen'),
        leading: const Icon(Icons.handshake_outlined),
        title: const Text('Material ausleihen'),
        subtitle: const Text('Festbänke, Geschirr, ganze Kisten'),
        trailing: const Icon(Icons.chevron_right),
        onTap: () async {
          final a = await ausleiheNeuOeffnen(context, d.ausleihen);
          if (a != null && context.mounted) {
            meldung(context, 'Reserviert — das Lager ist informiert.');
          }
        },
      ),
      ListTile(
        key: const Key('meine-ausleihen'),
        leading: const Icon(Icons.assignment_return_outlined),
        title: const Text('Meine Ausleihen'),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => Navigator.of(context)
            .push(MaterialPageRoute(builder: (_) => MeineAusleihenScreen(ausleihen: d.ausleihen))),
      ),
    ];
  }

  Widget _zeile(IconData symbol, String titel, String? wert) {
    if (wert == null || wert.isEmpty) return const SizedBox.shrink();
    return ListTile(leading: Icon(symbol), title: Text(wert), subtitle: Text(titel));
  }
}

const anzeigeNameErsatz = 'FWV-Mitglied';
