# Eigene R8-Regeln fuer den Release-Build der Mitglieder-App.
# Die Flutter-Engine und die Plugins (flutter_appauth, firebase_messaging,
# mobile_scanner, flutter_secure_storage ...) bringen ihre Regeln selbst mit.

# Eigener nativer Code: Kontakte-Abgleich (Authenticator, SyncAdapter,
# Methodenkanal) und Altdaten-Uebernahme. Ist klein — ganz behalten, damit
# R8 nichts entfernt, das nur ueber Manifest, Intent oder Kanalnamen
# erreicht wird.
-keep class ch.fwvraura.fwv_app.** { *; }

# EncryptedSharedPreferences (Uebernahme der Anmeldung aus members-android)
# nutzt Tink; fehlende optionale Annotationen sind kein Fehler.
-dontwarn com.google.errorprone.annotations.**
-dontwarn javax.annotation.**
