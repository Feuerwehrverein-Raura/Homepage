// Login-Screen mit zwei Reitern wie die alten Apps:
//  - Mitglied: Anmeldung ueber Authentik (Vereinskonto) + "Passwort vergessen?"
//  - QR-Code:  Login-Code vom Mitglieder-Datenblatt scannen
// Darunter, unauffaellig, der Zugang fuer externe Organisatoren
// (E-Mail + Passwort des Anlasses). Organisatoren, die Mitglied sind, melden
// sich normal als Mitglied an.

import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';
import 'authentik_anmeldung.dart';
import 'organisator_login_screen.dart';
import 'passwort_reset_screen.dart';
import 'qr_scanner_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.dienste});

  final Dienste dienste;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  bool _beschaeftigt = false;
  String? _fehler;

  SitzungsVerwaltung get _sitzung => widget.dienste.sitzung;

  Future<void> _ausfuehren(Future<void> Function() aktion) async {
    setState(() {
      _beschaeftigt = true;
      _fehler = null;
    });
    try {
      await aktion();
    } on ApiFehler catch (e) {
      _fehler = e.meldung;
    } on AuthentikFehler {
      _fehler = 'Anmeldung fehlgeschlagen. Bitte erneut versuchen.';
    }
    if (mounted) setState(() => _beschaeftigt = false);
  }

  Future<void> _mitAuthentik() => _ausfuehren(() async {
    final tokens = await widget.dienste.authentik.anmelden();
    if (tokens == null) return; // abgebrochen
    await _sitzung.mitOidcTokensAnmelden(
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      idToken: tokens.idToken,
    );
  });

  Future<void> _mitQrCode() async {
    final scannen =
        widget.dienste.qrScannen ??
        () =>
            Navigator.of(context)
                .push<String>(MaterialPageRoute(builder: (_) => const QrScannerScreen()));
    final roh = await scannen();
    if (roh == null || !mounted) return;

    final code = qrLoginCodeLesen(roh);
    if (!code.istGueltig) {
      setState(
        () => _fehler = switch (code.fehler!) {
          QrCodeFehler.fremderCode => 'Das ist kein Login-Code des Vereins.',
          QrCodeFehler.organisatorCode =>
            'Organisator-Codes gelten nicht mehr. Bitte unten mit E-Mail und Passwort anmelden.',
          QrCodeFehler.ohneToken => 'Im Code steckt kein Zugang.',
        },
      );
      return;
    }
    await _ausfuehren(() async {
      try {
        await _sitzung.mitQrCodeAnmelden(code.token!);
      } on ApiFehler catch (e) {
        if (e.status == 401 || e.status == 400) {
          throw const ApiFehler('Der Code wurde nicht angenommen (ungültig oder widerrufen).');
        }
        rethrow;
      }
    });
  }

  void _oeffnen(Widget seite) {
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => seite));
  }

  @override
  Widget build(BuildContext context) {
    final farben = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final meldung = _fehler ?? _sitzung.hinweis;

    return DefaultTabController(
      length: 2,
      child: Scaffold(
        body: SafeArea(
          child: Column(
            children: [
              const SizedBox(height: 32),
              Icon(Icons.local_fire_department, size: 56, color: farben.primary),
              const SizedBox(height: 8),
              Text('FWV Mitglieder', style: text.headlineSmall),
              Text('Feuerwehrverein Raura Kaiseraugst', style: text.bodyMedium),
              const SizedBox(height: 16),
              if (meldung != null)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
                  child: Text(
                    meldung,
                    key: const Key('login-meldung'),
                    textAlign: TextAlign.center,
                    style: text.bodyMedium?.copyWith(color: farben.error),
                  ),
                ),
              const TabBar(
                tabs: [
                  Tab(text: 'Mitglied'),
                  Tab(text: 'QR-Code'),
                ],
              ),
              SizedBox(height: 4, child: _beschaeftigt ? const LinearProgressIndicator() : null),
              Expanded(
                child: TabBarView(
                  children: [
                    _Reiter(
                      erklaerung:
                          'Melde dich mit deinem Vereinskonto an — '
                          'gleiche Angaben wie auf der Website.',
                      knopf: FilledButton.icon(
                        onPressed: _beschaeftigt ? null : _mitAuthentik,
                        icon: const Icon(Icons.login),
                        label: const Text('Mit Vereinskonto anmelden'),
                      ),
                      zusatz: TextButton(
                        onPressed: _beschaeftigt
                            ? null
                            : () => _oeffnen(PasswortResetScreen(sitzung: _sitzung)),
                        child: const Text('Passwort vergessen?'),
                      ),
                    ),
                    _Reiter(
                      erklaerung: 'Scanne den Login-Code auf deinem Mitglieder-Datenblatt.',
                      knopf: FilledButton.icon(
                        onPressed: _beschaeftigt ? null : _mitQrCode,
                        icon: const Icon(Icons.qr_code_scanner),
                        label: const Text('QR-Code scannen'),
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: TextButton(
                  onPressed: _beschaeftigt
                      ? null
                      : () => _oeffnen(OrganisatorLoginScreen(sitzung: _sitzung)),
                  child: const Text('Externer Organisator? Hier anmelden'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Reiter extends StatelessWidget {
  const _Reiter({required this.erklaerung, required this.knopf, this.zusatz});

  final String erklaerung;
  final Widget knopf;
  final Widget? zusatz;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(24, 24, 24, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(erklaerung, textAlign: TextAlign.center),
          const SizedBox(height: 24),
          knopf,
          if (zusatz != null) ...[const SizedBox(height: 8), zusatz!],
        ],
      ),
    );
  }
}
