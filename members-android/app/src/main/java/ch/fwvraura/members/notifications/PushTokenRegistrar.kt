package ch.fwvraura.members.notifications

import android.util.Log
import ch.fwvraura.members.MembersApp
import ch.fwvraura.members.data.api.ApiModule
import ch.fwvraura.members.data.model.PushTokenRegistration

/**
 * Schickt den Geraete-Push-Token ans Backend (`POST /members/me/fcm-token`).
 * Wird sowohl beim Login, beim App-Start als auch bei Provider-internen
 * Token-Refreshes (FCM `onNewToken`, HMS `onNewToken`) aufgerufen — die Logik
 * ist genug repetitiv, dass sie an einer Stelle leben sollte.
 *
 * Cached Token + Provider in TokenManager, damit er beim naechsten Boot
 * sofort verfuegbar ist (auch wenn Firebase/HMS gerade keinen Token liefern).
 */
internal object PushTokenRegistrar {

    private const val TAG = "PushTokenRegistrar"

    suspend fun register(provider: PushProvider, token: String) {
        val tm = MembersApp.instance.tokenManager
        tm.fcmToken = token
        tm.pushProvider = provider.wireName
        if (!tm.isLoggedIn) return
        try {
            ApiModule.membersApi.registerFcmToken(
                PushTokenRegistration(token = token, provider = provider.wireName)
            )
            Log.d(TAG, "${provider.wireName.uppercase()}-Token registriert (len=${token.length})")
        } catch (e: Exception) {
            Log.w(TAG, "Token-Registrierung (${provider.wireName}) fehlgeschlagen: ${e.message}")
        }
    }
}
