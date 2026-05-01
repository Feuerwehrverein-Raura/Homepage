package ch.fwvraura.members.notifications

import android.util.Log
import com.huawei.hms.push.HmsMessageService
import com.huawei.hms.push.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Empfaengt Pushes vom Huawei Push Kit. Verhaelt sich analog zur FCM-Variante
 * (siehe [FwvFirebaseMessagingService]) — gleicher Notification-Channel, gleiche
 * Backend-Registrierung. Token wird beim Refresh sofort gepusht, wenn der User
 * eingeloggt ist; sonst lokal gecached.
 */
class FwvHmsMessagingService : HmsMessageService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        if (token.isBlank()) return
        Log.d(TAG, "HMS token refreshed (length=${token.length})")
        scope.launch { PushTokenRegistrar.register(PushProvider.HMS, token) }
    }

    override fun onMessageReceived(msg: RemoteMessage) {
        super.onMessageReceived(msg)
        // HMS unterscheidet wie FCM zwischen Notification- und Data-Payload.
        val title = msg.notification?.title ?: msg.dataOfMap?.get("title") ?: "FWV Raura"
        val body  = msg.notification?.body  ?: msg.dataOfMap?.get("body")  ?: ""
        PushNotificationDisplay.show(this, title, body)
    }

    companion object {
        private const val TAG = "FwvHms"
    }
}
