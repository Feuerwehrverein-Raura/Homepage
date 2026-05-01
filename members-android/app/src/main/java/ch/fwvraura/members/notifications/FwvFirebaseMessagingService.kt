package ch.fwvraura.members.notifications

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Empfaengt FCM-Push-Nachrichten und registriert den Geraete-Token beim Backend.
 *
 * Backend-Endpoint POST /members/me/fcm-token wird bei jedem Token-Refresh
 * (Erst-Install, App-Reinstall, Geraete-Wechsel) aufgerufen — nur wenn der
 * User eingeloggt ist; sonst speichern wir den Token lokal und senden ihn
 * beim naechsten Login.
 */
class FwvFirebaseMessagingService : FirebaseMessagingService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "FCM token refreshed (length=${token.length})")
        scope.launch { PushTokenRegistrar.register(PushProvider.FCM, token) }
    }

    override fun onMessageReceived(msg: RemoteMessage) {
        super.onMessageReceived(msg)
        // Wir akzeptieren beide Formate: Notification-Payload (Google rendert selbst, wenn App im
        // Hintergrund ist) und Data-Payload (wir rendern manuell, auch im Vordergrund).
        val title = msg.notification?.title ?: msg.data["title"] ?: "FWV Raura"
        val body  = msg.notification?.body  ?: msg.data["body"]  ?: ""
        PushNotificationDisplay.show(this, title, body)
    }

    companion object {
        private const val TAG = "FwvFcm"
    }
}
