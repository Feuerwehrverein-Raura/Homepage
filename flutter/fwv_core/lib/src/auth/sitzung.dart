// Die Anmeldedaten einer Sitzung und wo sie liegen.
//
// Die Schluessel heissen wie in der alten Android-App (TokenManager.kt), damit
// man beim Vergleichen und bei der Uebernahme nicht umdenken muss.

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'jwt.dart';

/// Wer angemeldet ist. Gespeichert wird der Text aus den alten Apps.
enum Kontotyp {
  /// Mitglied (Authentik, QR-Code oder Passwort-Reset).
  mitglied('member'),

  /// Externer Organisator eines Anlasses (E-Mail + Passwort, `events/login`).
  organisator('organizer');

  const Kontotyp(this.gespeichert);

  final String gespeichert;

  /// Liest den gespeicherten Text. Die alte Android-App kannte noch "qr"
  /// (QR-Login eines Mitglieds) — das ist heute einfach ein Mitglied.
  static Kontotyp? ausText(String? text) => switch (text) {
    'member' || 'qr' => Kontotyp.mitglied,
    'organizer' => Kontotyp.organisator,
    _ => null,
  };
}

/// Alles, was eine Anmeldung ausmacht. Unveraenderlich; Aenderungen erzeugen
/// eine neue Sitzung ueber [kopieMit].
class Sitzung {
  const Sitzung({
    required this.accessToken,
    required this.kontotyp,
    this.refreshToken,
    this.qrToken,
    this.eventId,
    this.name,
    this.email,
  });

  /// Kurzlebiges Token fuer `Authorization: Bearer`.
  final String accessToken;

  /// OIDC-Refresh-Token (nur bei Anmeldung ueber Authentik). Authentik
  /// rotiert ihn bei jedem Erneuern.
  final String? refreshToken;

  /// Der gescannte QR-Code. Laeuft nicht ab — der gedruckte Code ist die
  /// dauerhafte Berechtigung und dient zum stillen Neu-Anmelden.
  final String? qrToken;

  final Kontotyp kontotyp;

  /// Nur bei externen Organisatoren: der Anlass, fuer den der Zugang gilt.
  final String? eventId;

  /// Anzeigename und E-Mail, soweit bekannt (nur fuer die Anzeige).
  final String? name;
  final String? email;

  /// Authentik-Gruppen des Mitglieds aus dem Access-Token (z.B. `Lager`,
  /// `Vorstand`) — gleich, ob ueber Authentik oder per QR-Code, Anmeldebon,
  /// App-Passwort oder Passwort-Reset angemeldet (api-members schreibt die
  /// Gruppen ins Mitglieder-Token). Leer bei externen Organisatoren. Wird bei
  /// jedem Zugriff aus dem aktuellen Token gelesen, gilt also auch nach dem
  /// Erneuern.
  List<String> get gruppen => kontotyp == Kontotyp.mitglied ? jwtGruppen(accessToken) : const [];

  /// Angemeldetes Mitglied — ueber Authentik oder mit einem Mitglieder-Token
  /// von api-members (QR-Code, Anmeldebon, App-Passwort, Passwort-Reset).
  /// Beide gelten ueberall gleich, auch im Inventar (z.B. fuer die
  /// Ausleihe). Externe Organisatoren nie.
  bool get mitgliedAngemeldet =>
      kontotyp == Kontotyp.mitglied &&
      (jwtVonAuthentik(accessToken) || jwtMitgliederToken(accessToken));

  /// Ob die Sitzung eine der [namen] als Gruppe hat (Gross-/Kleinschreibung
  /// egal: Authentik kennt `Lager` und `admin`).
  bool hatGruppe(Iterable<String> namen) {
    final gesucht = {for (final n in namen) n.trim().toLowerCase()};
    return gruppen.any((g) => gesucht.contains(g.toLowerCase()));
  }

  Sitzung kopieMit({String? accessToken, String? refreshToken}) => Sitzung(
    accessToken: accessToken ?? this.accessToken,
    refreshToken: refreshToken ?? this.refreshToken,
    qrToken: qrToken,
    kontotyp: kontotyp,
    eventId: eventId,
    name: name,
    email: email,
  );
}

/// Schluessel-Wert-Speicher fuer Geheimnisse. Eigene Schnittstelle, damit
/// Tests ohne Geraet laufen ([SpeicherImArbeitsspeicher]).
abstract interface class GeheimSpeicher {
  Future<String?> lesen(String schluessel);
  Future<void> schreiben(String schluessel, String wert);
  Future<void> loeschen(String schluessel);
}

/// Geraete-Schluesselbund (Android Keystore, iOS/macOS Keychain, ...).
class SichererSpeicher implements GeheimSpeicher {
  SichererSpeicher([FlutterSecureStorage? speicher])
    : _speicher =
          speicher ??
          const FlutterSecureStorage(
            // Wie die alte iOS-App: lesbar ab dem ersten Entsperren nach
            // dem Neustart, damit Hintergrund-Aufrufe (Push) funktionieren.
            iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
            mOptions: MacOsOptions(accessibility: KeychainAccessibility.first_unlock),
          );

  final FlutterSecureStorage _speicher;

  @override
  Future<String?> lesen(String schluessel) => _speicher.read(key: schluessel);

  @override
  Future<void> schreiben(String schluessel, String wert) =>
      _speicher.write(key: schluessel, value: wert);

  @override
  Future<void> loeschen(String schluessel) => _speicher.delete(key: schluessel);
}

/// Fuer Tests und Vorschauen: vergisst alles beim Beenden.
class SpeicherImArbeitsspeicher implements GeheimSpeicher {
  final Map<String, String> werte = {};

  @override
  Future<String?> lesen(String schluessel) async => werte[schluessel];

  @override
  Future<void> schreiben(String schluessel, String wert) async => werte[schluessel] = wert;

  @override
  Future<void> loeschen(String schluessel) async => werte.remove(schluessel);
}

/// Schluessel im [GeheimSpeicher] (gleich benannt wie in TokenManager.kt).
abstract final class SitzungsSchluessel {
  static const accessToken = 'auth_token';
  static const refreshToken = 'refresh_token';
  static const qrToken = 'qr_token';
  static const kontotyp = 'account_type';
  static const eventId = 'event_id';
  static const name = 'user_name';
  static const email = 'user_email';

  /// Gesetzt, sobald die Anmeldedaten der alten App uebernommen sind.
  static const altdatenUebernommen = 'altdaten_uebernommen';

  /// App-Einstellung (keine Sitzung): Die Frage "Mitglieder ins Adressbuch
  /// übernehmen?" wurde beantwortet. Gleicher Name wie in TokenManager.kt,
  /// wird aus der alten App uebernommen.
  static const kontakteGefragt = 'contacts_sync_asked';

  /// Alles, was zur Sitzung gehoert (nicht aber [altdatenUebernommen]).
  static const sitzung = [accessToken, refreshToken, qrToken, kontotyp, eventId, name, email];
}

/// Liest und schreibt eine [Sitzung] im [GeheimSpeicher].
class SitzungsSpeicher {
  SitzungsSpeicher(this.speicher);

  final GeheimSpeicher speicher;

  /// Die gespeicherte Sitzung, oder null, wenn niemand angemeldet ist.
  Future<Sitzung?> laden() async {
    final token = await speicher.lesen(SitzungsSchluessel.accessToken);
    if (token == null || token.isEmpty) return null;
    return Sitzung(
      accessToken: token,
      refreshToken: _leerAlsNull(await speicher.lesen(SitzungsSchluessel.refreshToken)),
      qrToken: _leerAlsNull(await speicher.lesen(SitzungsSchluessel.qrToken)),
      kontotyp:
          Kontotyp.ausText(await speicher.lesen(SitzungsSchluessel.kontotyp)) ?? Kontotyp.mitglied,
      eventId: _leerAlsNull(await speicher.lesen(SitzungsSchluessel.eventId)),
      name: _leerAlsNull(await speicher.lesen(SitzungsSchluessel.name)),
      email: _leerAlsNull(await speicher.lesen(SitzungsSchluessel.email)),
    );
  }

  /// Speichert die Sitzung vollstaendig; fehlende Felder werden geloescht,
  /// damit nichts von einer frueheren Anmeldung uebrig bleibt.
  Future<void> speichern(Sitzung s) async {
    await speicher.schreiben(SitzungsSchluessel.accessToken, s.accessToken);
    await speicher.schreiben(SitzungsSchluessel.kontotyp, s.kontotyp.gespeichert);
    await _setzen(SitzungsSchluessel.refreshToken, s.refreshToken);
    await _setzen(SitzungsSchluessel.qrToken, s.qrToken);
    await _setzen(SitzungsSchluessel.eventId, s.eventId);
    await _setzen(SitzungsSchluessel.name, s.name);
    await _setzen(SitzungsSchluessel.email, s.email);
  }

  /// Entfernt alle Sitzungsdaten (die Uebernahme-Markierung bleibt).
  Future<void> leeren() async {
    for (final k in SitzungsSchluessel.sitzung) {
      await speicher.loeschen(k);
    }
  }

  Future<void> _setzen(String schluessel, String? wert) async {
    if (wert == null || wert.isEmpty) {
      await speicher.loeschen(schluessel);
    } else {
      await speicher.schreiben(schluessel, wert);
    }
  }
}

String? _leerAlsNull(String? s) => (s == null || s.isEmpty) ? null : s;
