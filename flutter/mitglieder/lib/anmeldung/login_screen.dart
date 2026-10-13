// Login-Screen wie in der alten Android-App (activity_login.xml): Logo und
// Vereinsname auf dunklem Rot, darunter eine weisse Karte mit zwei Reitern:
//  - Mitglied: Anmeldung ueber Authentik (Vereinskonto) + "Passwort vergessen?"
//  - QR-Code:  Login-Code vom Mitglieder-Datenblatt scannen
// Darunter, unauffaellig, der Zugang fuer externe Organisatoren
// (E-Mail + Passwort des Anlasses). Organisatoren, die Mitglied sind, melden
// sich normal als Mitglied an.

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/services.dart' show SystemUiOverlayStyle;
import 'package:fwv_anlass/fwv_anlass.dart' show FwvFarben, mitSystemleiste;
import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

import '../dienste.dart';
import '../gemeinsam.dart' show logoMitglieder;
import '../web/browser.dart' show automatischAnmeldenErlaubt;
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

class _LoginScreenState extends State<LoginScreen> with SingleTickerProviderStateMixin {
  bool _beschaeftigt = false;
  String? _fehler;
  late final _reiter = TabController(length: 2, vsync: this)..addListener(_reiterGewechselt);

  void _reiterGewechselt() => setState(() {});

  @override
  void initState() {
    super.initState();
    // Im Browser wie mein.html: Sitzung abgelaufen -> gleich wieder anmelden
    // (meist ohne Eingabe, weil die Authentik-Sitzung noch gilt).
    if (kIsWeb && _sitzung.hinweis != null && automatischAnmeldenErlaubt()) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _mitAuthentik());
    }
  }

  @override
  void dispose() {
    _reiter.dispose();
    super.dispose();
  }

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
    final text = Theme.of(context).textTheme;
    final meldung = _fehler ?? _sitzung.hinweis;

    final mitglied = _Reiter(
      erklaerung:
          'Melde dich mit deinem Vereinskonto an — '
          'gleiche Angaben wie auf der Website.',
      knopf: _GrosserKnopf(
        onPressed: _beschaeftigt ? null : _mitAuthentik,
        symbol: Icons.login,
        text: 'Mit Vereinskonto anmelden',
      ),
      zusatz: TextButton(
        onPressed: _beschaeftigt ? null : () => _oeffnen(PasswortResetScreen(sitzung: _sitzung)),
        child: const Text('Passwort vergessen?'),
      ),
    );
    final qr = _Reiter(
      erklaerung: 'Scanne den Login-Code auf deinem Mitglieder-Datenblatt.',
      knopf: _GrosserKnopf(
        onPressed: _beschaeftigt ? null : _mitQrCode,
        symbol: Icons.qr_code_scanner,
        text: 'QR-Code scannen',
      ),
    );

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: FwvFarben.loginHintergrund,
        body: SafeArea(
          child: SingleChildScrollView(
            padding: mitSystemleiste(context, const EdgeInsets.only(bottom: 16)),
            child: Column(
              children: [
                const SizedBox(height: 32),
                const Image(
                  image: logoMitglieder,
                  width: 180,
                  height: 180,
                  semanticLabel: 'FWV Logo',
                ),
                const SizedBox(height: 12),
                Text(
                  'Feuerwehrverein Raura',
                  style: text.titleLarge?.copyWith(
                    color: FwvFarben.aufRot,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 32),
                Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 548),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Card(
                        color: FwvFarben.flaeche,
                        elevation: 8,
                        margin: EdgeInsets.zero,
                        clipBehavior: Clip.antiAlias,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            TabBar(
                              controller: _reiter,
                              tabs: const [
                                Tab(text: 'Mitglied'),
                                Tab(text: 'QR-Code'),
                              ],
                            ),
                            if (_reiter.index == 0) mitglied else qr,
                            if (_beschaeftigt) const LinearProgressIndicator(),
                            if (meldung != null)
                              Padding(
                                padding: const EdgeInsets.all(16),
                                child: Text(
                                  meldung,
                                  key: const Key('login-meldung'),
                                  textAlign: TextAlign.center,
                                  style: text.bodyMedium?.copyWith(color: FwvFarben.fehler),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                TextButton(
                  style: TextButton.styleFrom(foregroundColor: FwvFarben.aufRot),
                  onPressed: _beschaeftigt
                      ? null
                      : () => _oeffnen(OrganisatorLoginScreen(sitzung: _sitzung)),
                  child: const Text('Externer Organisator? Hier anmelden'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Breiter Knopf wie in der alten App (56 hoch, Ecken 12).
class _GrosserKnopf extends StatelessWidget {
  const _GrosserKnopf({required this.onPressed, required this.symbol, required this.text});

  final VoidCallback? onPressed;
  final IconData symbol;
  final String text;

  @override
  Widget build(BuildContext context) {
    return FilledButton.icon(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(56),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
      ),
      onPressed: onPressed,
      icon: Icon(symbol),
      label: Text(text),
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
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            erklaerung,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: FwvFarben.textLeise),
          ),
          const SizedBox(height: 24),
          knopf,
          if (zusatz != null) ...[const SizedBox(height: 4), zusatz!],
        ],
      ),
    );
  }
}
