// Kontakt-Abgleich auf Android: die Mitglieder als Kontakte im Konto
// "FWV Raura" (SyncAdapter, Kontotyp com.fwv.members). Das erledigt Kotlin-
// Code im Android-Teil der App; hier steht nur die Dart-Seite des Kanals.
//
// Der native Teil fehlt noch (wird aus members-android ContactsSyncManager
// usw. umgezogen). Bis dahin meldet der Kanal MissingPluginException; die
// Oberflaeche zeigt dann "noch nicht verfuegbar" statt abzustuerzen.
//
// Vertrag des Kanals "ch.fwvraura.members/kontakte" (fuer den Kotlin-Teil):
//  - "status"          -> bool: Abgleich eingeschaltet?
//  - "aktivieren"      -> bool: fragt nach READ/WRITE_CONTACTS, schaltet den
//                         Abgleich ein und stoesst ihn an; false, wenn die
//                         Berechtigung verweigert wurde.
//  - "deaktivieren"    -> null: schaltet aus und entfernt die FWV-Kontakte
//                         (auch beim Abmelden).
//  - "jetztAbgleichen" -> null: stoesst einen Abgleich an.
//  - "wiederherstellen"-> int: Anzahl der wiederhergestellten (vom Nutzer
//                         geloeschten) FWV-Kontakte; danach Abgleich.

import 'package:flutter/services.dart';

/// Ergebnis eines Aufrufs; [verfuegbar] ist false, solange der native Teil
/// fehlt.
class KontakteAntwort<T> {
  const KontakteAntwort(this.wert) : verfuegbar = true;
  const KontakteAntwort.nichtVerfuegbar() : wert = null, verfuegbar = false;

  final T? wert;
  final bool verfuegbar;
}

class KontakteAbgleich {
  const KontakteAbgleich([this._kanal = const MethodChannel(kanalName)]);

  static const kanalName = 'ch.fwvraura.members/kontakte';

  final MethodChannel _kanal;

  Future<KontakteAntwort<bool>> status() async {
    final a = await _aufrufen<Object>('status');
    if (!a.verfuegbar) return const KontakteAntwort.nichtVerfuegbar();
    final w = a.wert;
    return KontakteAntwort(w == true || (w is Map && w['aktiv'] == true));
  }

  Future<KontakteAntwort<bool>> aktivieren() async {
    final a = await _aufrufen<bool>('aktivieren');
    return a.verfuegbar
        ? KontakteAntwort(a.wert ?? false)
        : const KontakteAntwort.nichtVerfuegbar();
  }

  Future<KontakteAntwort<void>> deaktivieren() => _aufrufen<void>('deaktivieren');

  Future<KontakteAntwort<void>> jetztAbgleichen() => _aufrufen<void>('jetztAbgleichen');

  Future<KontakteAntwort<int>> wiederherstellen() async {
    final a = await _aufrufen<int>('wiederherstellen');
    return a.verfuegbar ? KontakteAntwort(a.wert ?? 0) : const KontakteAntwort.nichtVerfuegbar();
  }

  Future<KontakteAntwort<T>> _aufrufen<T>(String methode) async {
    try {
      return KontakteAntwort<T>(await _kanal.invokeMethod<T>(methode));
    } on MissingPluginException {
      return KontakteAntwort<T>.nichtVerfuegbar();
    }
  }
}
