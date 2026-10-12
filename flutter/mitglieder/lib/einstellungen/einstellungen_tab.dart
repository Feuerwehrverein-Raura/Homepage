// Reiter "Einstellungen": Benachrichtigungen, Zugaenge, Newsletter,
// Adressbuch, App-Version und Abmelden. Aufbau wie members-ios SettingsView
// (die Android-App hat ihn uebernommen).
//
// "Musik im Roten Schopf" (Playlists, Radiosender) fuer jedes Mitglied.
//
// Externe Organisatoren haben kein Mitgliederkonto; sie sehen nur, wer
// angemeldet ist, die Version und Abmelden. Vorstand und admin sehen
// zusaetzlich "Gruppen verwalten" (Authentik-Gruppen, gruppen_screen.dart).

import 'package:fwv_core/fwv_core.dart';
import 'package:fwv_roterschopf/fwv_roterschopf.dart';
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';
import '../gemeinsam.dart';
import '../hauptseite.dart';
import 'adressbuch.dart';
import 'benachrichtigungen_screen.dart';
import 'bildschirm.dart';
import 'gruppen_screen.dart';
import 'vpn_screen.dart';
import 'zugaenge_screen.dart';

class EinstellungenTab extends StatefulWidget {
  const EinstellungenTab({super.key, required this.dienste});

  final Dienste dienste;

  @override
  State<EinstellungenTab> createState() => _EinstellungenTabState();
}

class _EinstellungenTabState extends State<EinstellungenTab> {
  late final Future<String> _version = widget.dienste.appVersion();
  bool _newsletter = false;
  bool _newsletterLaeuft = false;
  String? _newsletterText;
  bool _abmelden = false;

  Dienste get _d => widget.dienste;

  @override
  void initState() {
    super.initState();
    _d.newsletterAbonniert().then((wert) {
      if (mounted) setState(() => _newsletter = wert);
    });
  }

  /// An- oder abmelden mit der E-Mail aus dem Profil (wie members-ios).
  /// Das Backend kennt keine Abfrage, ob man angemeldet ist — der Schalter
  /// zeigt, was man zuletzt hier getan hat.
  Future<void> _newsletterSetzen(bool gewuenscht) async {
    setState(() {
      _newsletter = gewuenscht;
      _newsletterLaeuft = true;
      _newsletterText = null;
    });
    try {
      String? email;
      try {
        email = (await _d.mitglieder.profil()).email;
      } on ApiFehler {
        email = _d.sitzung.sitzung?.email;
      }
      if (email == null || email.isEmpty) {
        throw const ApiFehler('Im Profil ist keine E-Mail hinterlegt.');
      }
      final text = await _d.mitglieder.newsletter(anmelden: gewuenscht, email: email);
      await _d.newsletterMerken(gewuenscht);
      if (mounted) setState(() => _newsletterText = text);
    } on Object catch (e) {
      if (mounted) {
        setState(() {
          _newsletter = !gewuenscht;
          _newsletterText = fehlerText(e);
        });
      }
    } finally {
      if (mounted) setState(() => _newsletterLaeuft = false);
    }
  }

  Future<void> _abmeldenTippen() async {
    setState(() => _abmelden = true);
    await _d.sitzung.abmelden();
    if (mounted) setState(() => _abmelden = false);
  }

  void _oeffnen(Widget seite) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => seite));

  @override
  Widget build(BuildContext context) {
    final sitzung = _d.sitzung.sitzung;
    final mitglied = sitzung?.kontotyp != Kontotyp.organisator;
    final text = Theme.of(context).textTheme;
    final hinweis = text.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant);

    return Scaffold(
      appBar: AppBar(title: const Text('Einstellungen')),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 24),
        children: [
          ListTile(
            leading: const Icon(Icons.account_circle_outlined),
            title: Text(anzeigeName(sitzung)),
            subtitle: Text(mitglied ? 'Angemeldet als' : 'Angemeldet als Externer Organisator'),
          ),
          if (mitglied) ...[
            const Abschnitt('Konto'),
            ListTile(
              leading: const Icon(Icons.notifications_outlined),
              title: const Text('Benachrichtigungen'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _oeffnen(BenachrichtigungenScreen(dienste: _d)),
            ),
            ListTile(
              leading: const Icon(Icons.key_outlined),
              title: const Text('Zugänge'),
              subtitle: const Text('Funktions-Mails, Cloud, geteilte Konten'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _oeffnen(ZugaengeScreen(dienste: _d)),
            ),
            ListTile(
              leading: const Icon(Icons.vpn_key_outlined),
              title: const Text('VPN-Zugang'),
              subtitle: const Text('Gerät mit dem Vereinsnetz verbinden'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _oeffnen(VpnScreen(dienste: _d)),
            ),
            const Abschnitt('Roter Schopf'),
            ListTile(
              leading: const Icon(Icons.queue_music),
              title: const Text('Musik im Roten Schopf'),
              subtitle: const Text('Playlists und Radiosender für den Laptop'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _oeffnen(MusikScreen(zugang: _d.musik)),
            ),
            ListTile(
              leading: const Icon(Icons.desktop_windows_outlined),
              title: const Text('Bildschirm Roter Schopf'),
              subtitle: const Text('Live sehen, ob die Musik läuft'),
              trailing: const Icon(Icons.open_in_new),
              onTap: () => bildschirmOeffnen(context, _d),
            ),
            if (darfGruppenVerwalten(sitzung)) ...[
              const Abschnitt('Vorstand'),
              ListTile(
                leading: const Icon(Icons.group_outlined),
                title: const Text('Gruppen verwalten'),
                subtitle: const Text('Wer Roter Schopf, Lager & Co. sieht'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => _oeffnen(GruppenScreen(zugang: GruppenZugang(_d.sitzung.api))),
              ),
            ],
            const Abschnitt('Newsletter'),
            SwitchListTile(
              key: const Key('newsletter'),
              secondary: const Icon(Icons.mark_email_unread_outlined),
              title: const Text('Newsletter abonniert'),
              value: _newsletter,
              onChanged: _newsletterLaeuft ? null : _newsletterSetzen,
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                [
                  ?_newsletterText,
                  'Beim Abonnieren schickt der Verein eine Bestätigungs-E-Mail mit '
                      'einem Link. Der Schalter zeigt, was du zuletzt hier gewählt hast.',
                ].join('\n'),
                style: hinweis,
              ),
            ),
            const Abschnitt('Adressbuch'),
            if (_d.plattform == Plattform.ios)
              ListTile(
                leading: const Icon(Icons.contacts_outlined),
                title: const Text('Mitglieder-Adressbuch einrichten'),
                subtitle: const Text('Kontakte über CardDAV (Nextcloud)'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => _oeffnen(CardDavScreen(dienste: _d)),
              )
            else
              KontakteAbschnitt(dienste: _d),
          ],
          const Abschnitt('App'),
          FutureBuilder<String>(
            future: _version,
            builder: (context, v) => ListTile(
              leading: const Icon(Icons.info_outline),
              title: const Text('Version'),
              subtitle: Text(v.data ?? (v.hasError ? 'unbekannt' : '…')),
            ),
          ),
          const SizedBox(height: 16),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: OutlinedButton.icon(
              onPressed: _abmelden ? null : _abmeldenTippen,
              icon: const Icon(Icons.logout),
              label: const Text('Abmelden'),
            ),
          ),
        ],
      ),
    );
  }
}
