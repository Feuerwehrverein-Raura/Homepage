// Passwort vergessen — in der App, ohne Browser (wie die alten Apps):
//  Schritt 1: E-Mail eingeben, Code anfordern (POST auth/member/request-reset).
//  Schritt 2: Code aus der E-Mail und neues Passwort (POST auth/member/reset).
// Das Backend setzt das Passwort auch fuer die Website und meldet direkt an.

import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

/// Mindestlaenge wie im Backend (auth/member/reset).
const passwortMindestlaenge = 8;

class PasswortResetScreen extends StatefulWidget {
  const PasswortResetScreen({super.key, required this.sitzung});

  final SitzungsVerwaltung sitzung;

  @override
  State<PasswortResetScreen> createState() => _PasswortResetScreenState();
}

class _PasswortResetScreenState extends State<PasswortResetScreen> {
  final _email = TextEditingController();
  final _code = TextEditingController();
  final _passwort = TextEditingController();
  final _wiederholung = TextEditingController();

  bool _beschaeftigt = false;
  bool _codeAngefordert = false;
  String? _hinweis;
  bool _hinweisIstFehler = false;

  @override
  void dispose() {
    for (final c in [_email, _code, _passwort, _wiederholung]) {
      c.dispose();
    }
    super.dispose();
  }

  void _melden(String text, {bool fehler = true}) => setState(() {
    _hinweis = text;
    _hinweisIstFehler = fehler;
  });

  Future<void> _codeAnfordern() async {
    if (!_email.text.contains('@')) {
      _melden('Bitte E-Mail eingeben.');
      return;
    }
    setState(() => _beschaeftigt = true);
    try {
      final antwort = await widget.sitzung.passwortResetAnfordern(_email.text);
      _codeAngefordert = true;
      _melden(antwort, fehler: false);
    } on ApiFehler catch (e) {
      _melden(e.meldung);
    }
    if (mounted) setState(() => _beschaeftigt = false);
  }

  /// Prueft die Eingaben von Schritt 2; null heisst "in Ordnung".
  String? _pruefen() {
    if (_code.text.trim().isEmpty) return 'Bitte den Code aus der E-Mail eingeben.';
    if (_passwort.text.length < passwortMindestlaenge) {
      return 'Das Passwort muss mindestens $passwortMindestlaenge Zeichen haben.';
    }
    if (_passwort.text != _wiederholung.text) return 'Die Wiederholung stimmt nicht überein.';
    return null;
  }

  Future<void> _passwortSetzen() async {
    final problem = _pruefen();
    if (problem != null) {
      _melden(problem);
      return;
    }
    setState(() => _beschaeftigt = true);
    try {
      // Bei Erfolg ist man angemeldet; die App schliesst diese Seite selbst.
      await widget.sitzung.passwortZuruecksetzen(
        email: _email.text,
        code: _code.text,
        neuesPasswort: _passwort.text,
      );
    } on ApiFehler catch (e) {
      if (mounted) _melden(e.meldung);
    }
    if (mounted) setState(() => _beschaeftigt = false);
  }

  @override
  Widget build(BuildContext context) {
    final farben = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    const rahmen = OutlineInputBorder();

    return Scaffold(
      appBar: AppBar(title: const Text('Passwort zurücksetzen')),
      // Der Knopf steht unter der Liste statt darin: so bleibt er auch bei
      // offener Tastatur sichtbar.
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(24),
                children: [
                  Text('Schritt 1', style: text.titleMedium),
                  const Text('Du bekommst einen Code per E-Mail.'),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    autofillHints: const [AutofillHints.email],
                    autocorrect: false,
                    decoration: const InputDecoration(labelText: 'E-Mail', border: rahmen),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton(
                    onPressed: _beschaeftigt ? null : _codeAnfordern,
                    child: Text(_codeAngefordert ? 'Code erneut anfordern' : 'Code anfordern'),
                  ),
                  const SizedBox(height: 24),
                  Text('Schritt 2', style: text.titleMedium),
                  const Text('Mindestens $passwortMindestlaenge Zeichen.'),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _code,
                    keyboardType: TextInputType.number,
                    autofillHints: const [AutofillHints.oneTimeCode],
                    decoration: const InputDecoration(
                      labelText: 'Code aus der E-Mail',
                      border: rahmen,
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _passwort,
                    obscureText: true,
                    autofillHints: const [AutofillHints.newPassword],
                    decoration: const InputDecoration(labelText: 'Neues Passwort', border: rahmen),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _wiederholung,
                    obscureText: true,
                    decoration: const InputDecoration(labelText: 'Wiederholen', border: rahmen),
                  ),
                ],
              ),
            ),
            // Hinweis direkt ueber dem Knopf, damit er nicht weggescrollt ist.
            if (_hinweis != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 8, 24, 0),
                child: Text(
                  _hinweis!,
                  key: const Key('reset-hinweis'),
                  style: TextStyle(color: _hinweisIstFehler ? farben.error : farben.onSurface),
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 16),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _beschaeftigt ? null : _passwortSetzen,
                  child: const Text('Passwort setzen'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
