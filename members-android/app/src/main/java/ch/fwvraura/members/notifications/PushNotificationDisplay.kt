package ch.fwvraura.members.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import ch.fwvraura.members.MainActivity
import ch.fwvraura.members.R

/**
 * Gemeinsamer Notification-Renderer fuer FCM- und HMS-Push. Beide Services
 * leiten ankommende Nachrichten hierher um, damit Channel-Setup und Layout an
 * einer Stelle leben.
 */
internal object PushNotificationDisplay {

    private const val CHANNEL_ID = "fwv_general"

    fun show(context: Context, title: String?, body: String?) {
        ensureChannel(context)
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pi = PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val safeTitle = title ?: "FWV Raura"
        val safeBody = body.orEmpty()
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_event)
            .setContentTitle(safeTitle)
            .setContentText(safeBody)
            .setStyle(NotificationCompat.BigTextStyle().bigText(safeBody))
            .setAutoCancel(true)
            .setContentIntent(pi)
            .build()
        context.getSystemService(NotificationManager::class.java)
            ?.notify(System.currentTimeMillis().toInt(), notification)
    }

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val mgr = context.getSystemService(NotificationManager::class.java) ?: return
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
}
