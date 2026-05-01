package ch.fwvraura.members.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import ch.fwvraura.members.MainActivity
import ch.fwvraura.members.MembersApp
import ch.fwvraura.members.R
import ch.fwvraura.members.data.api.ApiModule
import ch.fwvraura.members.data.model.FcmTokenRegistration
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
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

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "FCM token refreshed (length=${token.length})")
        val tm = MembersApp.instance.tokenManager
        tm.fcmToken = token
        // Wenn schon eingeloggt: gleich an Backend pushen. Sonst macht das LoginActivity nach erfolgreichem Login.
        if (tm.isLoggedIn) {
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    ApiModule.membersApi.registerFcmToken(FcmTokenRegistration(token = token))
                } catch (e: Exception) {
                    Log.w(TAG, "FCM-Token-Registrierung fehlgeschlagen: ${e.message}")
                }
            }
        }
    }

    override fun onMessageReceived(msg: RemoteMessage) {
        super.onMessageReceived(msg)
        // Wir akzeptieren beide Formate: Notification-Payload (Google rendert selbst, wenn App im
        // Hintergrund ist) und Data-Payload (wir rendern manuell, auch im Vordergrund).
        val title = msg.notification?.title ?: msg.data["title"] ?: "FWV Raura"
        val body  = msg.notification?.body  ?: msg.data["body"]  ?: ""
        showNotification(title, body)
    }

    private fun showNotification(title: String, body: String) {
        ensureChannel()
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pi = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_event)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pi)
            .build()
        getSystemService(NotificationManager::class.java)
            ?.notify(System.currentTimeMillis().toInt(), notification)
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val mgr = getSystemService(NotificationManager::class.java) ?: return
        if (mgr.getNotificationChannel(CHANNEL_ID) != null) return
        mgr.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "FWV-Mitteilungen",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Anlaesse, Anmeldungen, Schicht-Erinnerungen und Newsletter"
            }
        )
    }

    companion object {
        private const val TAG = "FwvFcm"
        private const val CHANNEL_ID = "fwv_general"
    }
}
