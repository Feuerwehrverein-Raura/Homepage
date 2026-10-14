// Zugangsdokumente eines Mitglieds (docs/vorstand-funktionen.md, Abschnitt
// 3): Login-Datenblatt, Anmeldebon und App-QR. Backend: api-members
// (docker/backend-members/src/index.js).
//
// * POST /members/:id/datenblatt SETZT EIN NEUES PASSWORT (nur mit
//   Authentik-Konto; das bisherige gilt danach nicht mehr) und liefert es
//   im Klartext mit dem QR-Login-Token. Ein Dokument liefert das Backend
//   nicht - das Datenblatt baut [datenblattHtml] hier, wie vorstand.html.
// * POST /members/:id/anmeldebon druckt auf dem Bondrucker im Roten Schopf
//   (Epson, nur im Vereinsnetz) einen Einmal-Code, 1 h gueltig. Mit Konto
//   ist es ein Authentik-Wiederherstellungslink: wer scannt, vergibt ein
//   neues Passwort. Ohne Konto ein Code nur fuer den Mitgliederbereich.
// * /auth/member/app-tokens: dauerhafte QR-Logins fuer die App. Das Token
//   selbst kommt nur beim Erstellen zurueck; die Liste zeigt es nicht.

import 'dart:convert';

import 'package:fwv_core/fwv_core.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../zeit.dart';

/// Inhalt des Login-QR (gleiches Format wie vorstand.html und
/// qrLoginCodeLesen in fwv_core).
String loginQrInhalt(String token) =>
    jsonEncode({'v': 1, 'type': 'fwv-member-login', 'token': token});

/// Play-Store-Eintrag der Mitglieder-App (fuer den Installations-QR).
const mitgliederAppPlayStore = 'https://play.google.com/store/apps/details?id=com.fwv.members';

/// Ein App-QR-Zugang (ohne das Token selbst).
class AppZugang {
  const AppZugang({
    required this.id,
    required this.mitgliedId,
    this.bezeichnung,
    this.erstellt,
    this.erstelltVon,
    this.zuletztBenutzt,
  });

  factory AppZugang.ausJson(Map<String, dynamic> j) => AppZugang(
    id: jsonText(j['id']) ?? '',
    mitgliedId: jsonText(j['member_id']) ?? '',
    bezeichnung: jsonText(j['description']),
    erstellt: utcZeitpunkt(j['created_at']),
    erstelltVon: jsonText(j['created_by']),
    zuletztBenutzt: utcZeitpunkt(j['last_used_at']),
  );

  final String id;
  final String mitgliedId;
  final String? bezeichnung;
  final DateTime? erstellt;
  final String? erstelltVon;
  final DateTime? zuletztBenutzt;
}

/// Neu erstellter App-QR mit dem Token (nur jetzt sichtbar).
typedef NeuerAppZugang = ({AppZugang zugang, String token});

/// Antwort von POST /members/:id/datenblatt.
class Datenblatt {
  const Datenblatt({required this.name, required this.token, this.email, this.passwort});

  factory Datenblatt.ausJson(Object? json) {
    final j = json is Map ? json : const {};
    final token = jsonText(j['qr_token']);
    if (token == null) throw const ApiFehler('Der Server hat keinen QR-Zugang geliefert.');
    return Datenblatt(
      name: jsonText(j['name']) ?? '',
      email: jsonText(j['email']),
      passwort: jsonText(j['password']),
      token: token,
    );
  }

  final String name;
  final String? email;

  /// Neues Passwort; null ohne Login-Konto (dann nur QR).
  final String? passwort;
  final String token;
}

/// Antwort von POST /members/:id/anmeldebon.
class Anmeldebon {
  const Anmeldebon({required this.ueberall, this.giltBis});

  factory Anmeldebon.ausJson(Object? json) {
    final j = json is Map ? json : const {};
    return Anmeldebon(
      ueberall: jsonText(j['umfang']) == 'sso',
      giltBis: utcZeitpunkt(j['gilt_bis']),
    );
  }

  /// true: Authentik-Link (meldet ueberall an); false: nur Mitgliederbereich.
  final bool ueberall;
  final DateTime? giltBis;
}

class ZugangsDokumenteDienst {
  const ZugangsDokumenteDienst(this.api);

  final ApiClient api;

  static String _e(String id) => Uri.encodeComponent(id);

  /// Setzt ein neues Passwort (mit Konto) und liefert es samt QR-Token.
  Future<Datenblatt> datenblatt(String mitgliedId) async =>
      Datenblatt.ausJson(await api.post('members/${_e(mitgliedId)}/datenblatt'));

  /// Druckt den Bon; der Drucker braucht etwas laenger.
  Future<Anmeldebon> anmeldebon(String mitgliedId) async => Anmeldebon.ausJson(
    await api.post('members/${_e(mitgliedId)}/anmeldebon', zeitlimit: const Duration(seconds: 60)),
  );

  /// Gueltige App-QR-Zugaenge dieses Mitglieds (das Backend liefert alle).
  Future<List<AppZugang>> appZugaenge(String mitgliedId) async => [
    for (final z in jsonListe(await api.get('auth/member/app-tokens'), AppZugang.ausJson))
      if (z.mitgliedId == mitgliedId) z,
  ];

  Future<NeuerAppZugang> appZugangErstellen(String mitgliedId, {String? bezeichnung}) async {
    final j = await api.post(
      'auth/member/app-tokens',
      daten: {'member_id': mitgliedId, 'description': bezeichnung?.trim() ?? ''},
    );
    final m = j is Map ? Map<String, dynamic>.from(j) : <String, dynamic>{};
    final token = jsonText(m['token']);
    if (token == null) throw const ApiFehler('Der Server hat kein Token geliefert.');
    return (zugang: AppZugang.ausJson(m), token: token);
  }

  Future<void> appZugangWiderrufen(String id) => api.delete('auth/member/app-tokens/${_e(id)}');
}

/// QR als SVG (schwarze Quadrate, 4 Module Rand), ohne Abhaengigkeit von
/// Flutter-Bildern - fuer das Datenblatt als HTML.
String qrSvg(String inhalt, {int modul = 6}) {
  final code = QrCode.fromData(data: inhalt, errorCorrectLevel: QrErrorCorrectLevel.M);
  final bild = QrImage(code);
  const rand = 4;
  final n = bild.moduleCount + 2 * rand;
  final pfad = StringBuffer();
  for (var y = 0; y < bild.moduleCount; y++) {
    for (var x = 0; x < bild.moduleCount; x++) {
      if (bild.isDark(y, x)) pfad.write('M${x + rand} ${y + rand}h1v1h-1z');
    }
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 $n $n" '
      'width="${n * modul}" height="${n * modul}" shape-rendering="crispEdges">'
      '<rect width="$n" height="$n" fill="#fff"/><path d="$pfad" fill="#000"/></svg>';
}

String _html(String s) => const HtmlEscape().convert(s);

/// Druckfertiges A4-Datenblatt (Aufbau wie vorstand.html generateDatenblatt).
String datenblattHtml(Datenblatt d) {
  final pw = d.passwort;
  final zugang = pw != null
      ? '<div class="box cred">E-Mail / Benutzer:<br><code>${_html(d.email ?? '—')}</code><br><br>'
            'Passwort:<br><code>${_html(pw)}</code><br>'
            '<span class="small">Für fwv-raura.ch und «Anmelden» in der App</span></div>'
      : '<div class="box cred">Anmeldung mit dem QR-Code unten.<br>'
            '<span class="small">Ohne Vereins-Konto gibt es kein Passwort.</span></div>';
  return '''<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">
<title>Login-Datenblatt ${_html(d.name)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: Arial, Helvetica, sans-serif; color:#1f2937; }
  .head { text-align:center; border-bottom:3px solid #dc2626; padding-bottom:10px; margin-bottom:18px; }
  .head h1 { color:#dc2626; margin:0; font-size:22px; }
  .head p { margin:4px 0 0; color:#6b7280; }
  h2 { font-size:15px; margin:22px 0 8px; }
  .name { font-size:26px; font-weight:bold; margin:4px 0 16px; }
  .box { border:1px solid #e5e7eb; border-radius:10px; padding:16px; margin-bottom:14px; }
  .cred { font-size:15px; line-height:1.9; }
  .cred code { background:#f3f4f6; padding:3px 8px; border-radius:6px; font-size:18px; }
  .cols { display:flex; gap:24px; align-items:flex-start; }
  .qrbox { text-align:center; }
  ol { margin:0; padding-left:20px; line-height:1.8; }
  .foot { margin-top:26px; text-align:center; color:#9ca3af; font-size:12px; }
  .small { font-size:12px; color:#6b7280; }
</style></head><body>
  <div class="head"><h1>Feuerwehrverein Raura</h1><p>Dein persönlicher App-Zugang</p></div>
  <div class="name">${_html(d.name)}</div>
  <div class="cols">
    <div style="flex:1">
      <h2>Deine Zugangsdaten</h2>
      $zugang
      <h2>So meldest du dich an</h2>
      <ol>
        <li>App «FWV Mitglieder» installieren (QR rechts scannen).</li>
        <li>App öffnen und auf <b>«QR-Code scannen»</b> tippen.</li>
        <li>Den grossen QR-Code unten scannen – fertig, du bist angemeldet.</li>
      </ol>
      ${pw != null ? '<p class="small">Alternativ: in der App auf «Anmelden» tippen und mit E-Mail und Passwort (oben) anmelden.</p>' : ''}
    </div>
    <div class="qrbox"><div class="small">App installieren</div>${qrSvg(mitgliederAppPlayStore, modul: 4)}</div>
  </div>
  <h2>Login-QR (in der App scannen)</h2>
  <div class="box qrbox">${qrSvg(loginQrInhalt(d.token))}</div>
  <div class="foot">Bitte vertraulich behandeln · Fragen? Der Vorstand hilft gern · fwv-raura.ch</div>
</body></html>
''';
}
