// Anmeldung: nur mit dem Vereinskonto (Authentik im System-Browser). Kein
// QR-Code und kein Organisator-Zugang wie in der Mitglieder-App - Musik
// ist fuer Mitglieder.

import 'package:fwv_anlass/fwv_anlass.dart' show FwvFarben;
import 'package:fwv_core/desktop.dart' show AbbrechbareAnmeldung;
import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import 'dienste.dart';

const logo = AssetImage('assets/logo.png');

class AnmeldeSeite extends StatefulWidget {
  const AnmeldeSeite({super.key, required this.dienste});

  final Dienste dienste;

  @override
  State<AnmeldeSeite> createState() => _AnmeldeSeiteState();
}

class _AnmeldeSeiteState extends State<AnmeldeSeite> {
  bool _beschaeftigt = false;
  String? _fehler;

  SitzungsVerwaltung get _sitzung => widget.dienste.sitzung;

  Future<void> _anmelden() async {
    setState(() {
      _beschaeftigt = true;
      _fehler = null;
    });
    try {
      final tokens = await widget.dienste.authentik.anmelden();
      if (tokens != null) {
        await _sitzung.mitOidcTokensAnmelden(
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          idToken: tokens.idToken,
        );
      }
    } on ApiFehler catch (e) {
      _fehler = e.meldung;
    } on AuthentikFehler {
      _fehler = 'Anmeldung fehlgeschlagen. Bitte erneut versuchen.';
    }
    if (mounted) setState(() => _beschaeftigt = false);
  }

  @override
  Widget build(BuildContext context) {
    final authentik = widget.dienste.authentik;
    final meldung = _fehler ?? _sitzung.hinweis;
    return Scaffold(
      backgroundColor: FwvFarben.loginHintergrund,
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 400),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Image(image: logo, width: 160, height: 160, semanticLabel: 'FWV Raura'),
                const SizedBox(height: 12),
                Text(
                  'FWV Musik',
                  style: Theme.of(context).textTheme.headlineMedium
                      ?.copyWith(color: Colors.white, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 24),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text(
                          'Playlists und Radiosender für den Roten Schopf zusammenstellen '
                          'und hier am Computer hören.',
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 20),
                        FilledButton.icon(
                          key: const Key('anmelden'),
                          onPressed: _beschaeftigt ? null : _anmelden,
                          icon: _beschaeftigt
                              ? const SizedBox.square(
                                  dimension: 18,
                                  child: CircularProgressIndicator(strokeWidth: 2),
                                )
                              : const Icon(Icons.login),
                          label: const Text('Mit Vereinskonto anmelden'),
                        ),
                        if (_beschaeftigt) ...[
                          const SizedBox(height: 12),
                          const Text(
                            'Die Anmeldung läuft im Browser. Danach geht es hier von selbst weiter.',
                            textAlign: TextAlign.center,
                          ),
                          if (authentik is AbbrechbareAnmeldung)
                            TextButton(
                              key: const Key('abbrechen'),
                              onPressed: () => (authentik as AbbrechbareAnmeldung).abbrechen(),
                              child: const Text('Abbrechen'),
                            ),
                        ],
                        if (meldung != null) ...[
                          const SizedBox(height: 12),
                          Text(
                            meldung,
                            textAlign: TextAlign.center,
                            style: TextStyle(color: Theme.of(context).colorScheme.error),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
