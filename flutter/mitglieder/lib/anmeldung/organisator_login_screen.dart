// Anmeldung fuer externe Organisatoren eines Anlasses: E-Mail und Passwort,
// die der Vorstand fuer den Anlass vergeben hat (POST events/login).
// Organisatoren, die Mitglied sind, melden sich mit ihrem Mitgliederkonto an.

import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

class OrganisatorLoginScreen extends StatefulWidget {
  const OrganisatorLoginScreen({super.key, required this.sitzung});

  final SitzungsVerwaltung sitzung;

  @override
  State<OrganisatorLoginScreen> createState() => _OrganisatorLoginScreenState();
}

class _OrganisatorLoginScreenState extends State<OrganisatorLoginScreen> {
  final _email = TextEditingController();
  final _passwort = TextEditingController();
  bool _beschaeftigt = false;
  String? _fehler;

  @override
  void dispose() {
    _email.dispose();
    _passwort.dispose();
    super.dispose();
  }

  Future<void> _anmelden() async {
    final email = _email.text.trim();
    if (!email.contains('@') || _passwort.text.isEmpty) {
      setState(() => _fehler = 'Bitte E-Mail und Passwort eingeben.');
      return;
    }
    setState(() {
      _beschaeftigt = true;
      _fehler = null;
    });
    try {
      // Bei Erfolg schliesst die App diese Seite selbst (Anmeldezustand).
      await widget.sitzung.alsOrganisatorAnmelden(email, _passwort.text);
    } on ApiFehler catch (e) {
      if (mounted) setState(() => _fehler = e.meldung);
    }
    if (mounted) setState(() => _beschaeftigt = false);
  }

  @override
  Widget build(BuildContext context) {
    final farben = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Externer Organisator')),
      // Knopf unter der Liste, damit er bei offener Tastatur sichtbar bleibt.
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(24),
                children: [
                  const Text(
                    'Für Organisatoren, die nicht Mitglied sind: Melde dich mit der '
                    'E-Mail und dem Passwort an, die du für deinen Anlass erhalten hast. '
                    'Mitglieder melden sich mit ihrem Vereinskonto an.',
                  ),
                  const SizedBox(height: 24),
                  TextField(
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    autofillHints: const [AutofillHints.email],
                    autocorrect: false,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(
                      labelText: 'E-Mail',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _passwort,
                    obscureText: true,
                    autofillHints: const [AutofillHints.password],
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) => _beschaeftigt ? null : _anmelden(),
                    decoration: const InputDecoration(
                      labelText: 'Passwort',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  if (_fehler != null) ...[
                    const SizedBox(height: 16),
                    Text(_fehler!, style: TextStyle(color: farben.error)),
                  ],
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 16),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _beschaeftigt ? null : _anmelden,
                  child: _beschaeftigt
                      ? const SizedBox.square(
                          dimension: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Anmelden'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
