// Mitglieder-Adressbuch — jede Plattform ihr eigener Weg (Entscheidung 1 in
// docs/flutter-mitglieder-app-plan.md):
//  - iOS: CardDAV ueber Nextcloud. Apps duerfen dort kein eigenes Konto
//    anlegen; ein Konfigurationsprofil installiert nur Safari. Darum der
//    Link aufs Profil und eine Handanleitung (wie members-ios
//    CardDAVSetupView).
//  - Android: eigener Kontakt-Abgleich (Konto "FWV Raura") ueber den Kanal
//    in kontakte_abgleich.dart.

import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';
import '../gemeinsam.dart';
import 'kontakte_abgleich.dart';

/// Konfigurationsprofil fuer iOS (unsigniert, darum "Nicht verifiziert").
final carddavProfil = Uri.parse('https://www.fwv-raura.ch/carddav.mobileconfig');
const carddavServer = 'nextcloud.fwv-raura.ch';
const carddavAdressbuch = 'fwv-mitglieder';

class CardDavScreen extends StatelessWidget {
  const CardDavScreen({super.key, required this.dienste});

  final Dienste dienste;

  static const _schritte = [
    'Einstellungen öffnen, dann Apps → Kontakte → Accounts',
    'Account hinzufügen → Andere → CardDAV-Account',
    'Als Server $carddavServer eintragen',
    'Benutzername und Passwort vom Nextcloud-Konto eingeben',
    'Sichern — das Adressbuch $carddavAdressbuch erscheint in den Kontakten',
  ];

  @override
  Widget build(BuildContext context) {
    final hinweis = Theme.of(context).textTheme.bodySmall
        ?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant);
    return Scaffold(
      appBar: AppBar(title: const Text('Adressbuch')),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 24),
        children: [
          const Abschnitt('Empfohlen'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: FilledButton.icon(
              onPressed: () => dienste.linkOeffnen(carddavProfil),
              icon: const Icon(Icons.download_outlined),
              label: const Text('Profil installieren'),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: Text(
              'Öffnet Safari und lädt ein Konfigurationsprofil. Danach in den '
              'Einstellungen bestätigen und das Nextcloud-Passwort eingeben — '
              'fertig. Der Hinweis „Nicht verifiziert“ ist erwartbar: das Profil '
              'ist unsigniert.',
              style: hinweis,
            ),
          ),
          const Abschnitt('Oder von Hand'),
          ListTile(
            title: const Text(carddavServer),
            subtitle: const Text('Server — antippen zum Kopieren'),
            trailing: const Icon(Icons.copy),
            onTap: () async {
              await Clipboard.setData(const ClipboardData(text: carddavServer));
              if (context.mounted) meldung(context, 'Server kopiert');
            },
          ),
          for (final (i, schritt) in _schritte.indexed)
            ListTile(
              dense: true,
              leading: CircleAvatar(radius: 12, child: Text('${i + 1}')),
              title: Text(schritt),
            ),
          const Abschnitt('Was das bringt'),
          const ListTile(
            leading: Icon(Icons.sync),
            title: Text(
              'Änderungen kommen von allein an — das Adressbuch wird nachts aus '
              'der Mitgliederdatenbank aufgefrischt.',
            ),
          ),
          const ListTile(
            leading: Icon(Icons.phone_outlined),
            title: Text('Bei einem Anruf zeigt das iPhone den Namen an.'),
          ),
          const ListTile(
            leading: Icon(Icons.vpn_key_outlined),
            title: Text('Voraussetzung ist ein Nextcloud-Konto.'),
          ),
        ],
      ),
    );
  }
}

/// "Kontakte abgleichen" auf Android: Schalter, "Jetzt abgleichen",
/// "Gelöschte wiederherstellen".
class KontakteAbschnitt extends StatefulWidget {
  const KontakteAbschnitt({super.key, required this.dienste});

  final Dienste dienste;

  @override
  State<KontakteAbschnitt> createState() => _KontakteAbschnittState();
}

class _KontakteAbschnittState extends State<KontakteAbschnitt> {
  bool? _aktiv;
  bool _verfuegbar = true;
  bool _laeuft = false;

  KontakteAbgleich get _k => widget.dienste.kontakte;

  @override
  void initState() {
    super.initState();
    _status();
  }

  Future<void> _status() async {
    final a = await _ausfuehren(_k.status);
    if (!mounted || a == null) return;
    setState(() {
      _verfuegbar = a.verfuegbar;
      _aktiv = a.wert ?? false;
    });
  }

  /// Fuehrt einen Aufruf aus; Fehler des nativen Teils als Meldung.
  Future<KontakteAntwort<T>?> _ausfuehren<T>(Future<KontakteAntwort<T>> Function() aufruf) async {
    setState(() => _laeuft = true);
    try {
      final a = await aufruf();
      if (!a.verfuegbar && mounted) setState(() => _verfuegbar = false);
      return a;
    } on PlatformException catch (e) {
      if (mounted) meldung(context, e.message ?? 'Kontakt-Abgleich fehlgeschlagen.');
      return null;
    } finally {
      if (mounted) setState(() => _laeuft = false);
    }
  }

  Future<void> _schalten(bool ein) async {
    if (ein) {
      final a = await _ausfuehren(_k.aktivieren);
      if (!mounted || a == null || !a.verfuegbar) return;
      final ok = a.wert ?? false;
      setState(() => _aktiv = ok);
      meldung(
        context,
        ok
            ? 'Mitglieder werden ins Adressbuch übernommen.'
            : 'Ohne Zugriff auf die Kontakte geht es nicht.',
      );
    } else {
      final a = await _ausfuehren(_k.deaktivieren);
      if (!mounted || a == null || !a.verfuegbar) return;
      setState(() => _aktiv = false);
      meldung(context, 'Abgleich aus. Die FWV-Kontakte wurden vom Telefon entfernt.');
    }
  }

  Future<void> _jetzt() async {
    final a = await _ausfuehren(_k.jetztAbgleichen);
    if (mounted && a != null && a.verfuegbar) {
      meldung(context, 'Abgleich angestossen — kann ein paar Sekunden dauern.');
    }
  }

  Future<void> _wiederherstellen() async {
    final a = await _ausfuehren(_k.wiederherstellen);
    if (!mounted || a == null || !a.verfuegbar) return;
    final n = a.wert ?? 0;
    meldung(
      context,
      n > 0
          ? '$n gelöschte Mitglieder werden wiederhergestellt.'
          : 'Keine gelöschten FWV-Kontakte gefunden. Abgleich läuft trotzdem.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final hinweis = Theme.of(context).textTheme.bodySmall
        ?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant);
    if (!_verfuegbar) {
      return const ListTile(
        key: Key('kontakte-nicht-verfuegbar'),
        leading: Icon(Icons.contacts_outlined),
        title: Text('Kontakte abgleichen'),
        subtitle: Text('In dieser Version noch nicht verfügbar.'),
        enabled: false,
      );
    }
    final aktiv = _aktiv ?? false;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SwitchListTile(
          key: const Key('kontakte'),
          secondary: const Icon(Icons.contacts_outlined),
          title: const Text('Kontakte abgleichen'),
          subtitle: const Text('Mitglieder als Kontakte im Konto „FWV Raura“'),
          value: aktiv,
          onChanged: (_laeuft || _aktiv == null) ? null : _schalten,
        ),
        if (aktiv)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [
                OutlinedButton.icon(
                  onPressed: _laeuft ? null : _jetzt,
                  icon: const Icon(Icons.sync),
                  label: const Text('Jetzt abgleichen'),
                ),
                OutlinedButton.icon(
                  onPressed: _laeuft ? null : _wiederherstellen,
                  icon: const Icon(Icons.restore),
                  label: const Text('Gelöschte wiederherstellen'),
                ),
              ],
            ),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: Text(
            'Bei einem Anruf zeigt das Telefon dann den Namen an. Beim Abmelden '
            'werden die FWV-Kontakte wieder entfernt.',
            style: hinweis,
          ),
        ),
      ],
    );
  }
}
