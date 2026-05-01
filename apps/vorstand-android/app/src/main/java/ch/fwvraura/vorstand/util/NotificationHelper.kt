package ch.fwvraura.vorstand.util

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import ch.fwvraura.vorstand.MainActivity
import ch.fwvraura.vorstand.R

/**
 * Hilfsklasse fuer Android-Notifications.
 * Erstellt den Notification-Kanal und zeigt Benachrichtigungen an.
 *
 * Android erfordert seit Version 8 (API 26) einen "NotificationChannel".
 * Dieser Kanal gruppiert alle Audit-Notifications und erlaubt dem User,
 * sie in den System-Einstellungen ein/auszuschalten.
 */
object NotificationHelper {

    // Eindeutige ID fuer den Notification-Kanal (intern, nicht sichtbar fuer User)
    private const val CHANNEL_ID = "vorstand_audit"

    // Feste ID fuer die Notification — gleiche ID = alte Notification wird ersetzt
    // So sieht der User immer nur EINE Notification, nicht mehrere gestapelt
    private const val NOTIFICATION_ID = 1001

    /**
     * Erstellt den Notification-Kanal beim App-Start.
     * Muss einmal aufgerufen werden, bevor Notifications angezeigt werden koennen.
     * Wenn der Kanal schon existiert, passiert nichts (Android ignoriert Duplikate).
     */
    fun createChannel(context: Context) {
        // Kanal mit Name "Vorstand Benachrichtigungen" und Standard-Wichtigkeit erstellen
        // IMPORTANCE_DEFAULT = Ton + Statusbar-Icon, aber kein Vollbild-Popup
        val channel = NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.notification_channel_audit), // "Vorstand Benachrichtigungen"
            NotificationManager.IMPORTANCE_DEFAULT
        )
        // NotificationManager ist der System-Service, der Notifications verwaltet
        val manager = context.getSystemService(NotificationManager::class.java)
        // Kanal beim System registrieren
        manager.createNotificationChannel(channel)
    }

    /**
     * Zeigt eine Notification mit Titel und Text an.
     * Beim Tippen auf die Notification wird die MainActivity geoeffnet.
     */
    fun showAuditNotification(context: Context, title: String, text: String) {
        // Intent erstellen, der beim Tippen auf die Notification ausgefuehrt wird
        val intent = Intent(context, MainActivity::class.java).apply {
            // FLAG_ACTIVITY_NEW_TASK: Startet die Activity in einem neuen Task (noetig aus Worker-Kontext)
            // FLAG_ACTIVITY_CLEAR_TOP: Wenn die App schon offen ist, wird sie in den Vordergrund geholt
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        // PendingIntent = "aufgeschobener Intent", den Android spaeter ausfuehrt wenn User tippt
        // FLAG_UPDATE_CURRENT: Aktualisiert bestehenden PendingIntent statt neuen zu erstellen
        // FLAG_IMMUTABLE: Pflicht ab Android 12 — der PendingIntent kann nicht mehr veraendert werden
        val pendingIntent = PendingIntent.getActivity(
            context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Notification zusammenbauen mit dem Builder-Pattern
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)  // Glocken-Icon in der Statusbar
            .setContentTitle(title)                     // Titel der Notification (z.B. "Neue Aktivitaet")
            .setContentText(text)                       // Inhalt (z.B. "Neues Mitglied: Max Muster")
            .setAutoCancel(true)                        // Notification verschwindet nach dem Tippen
            .setContentIntent(pendingIntent)            // Was passiert beim Tippen (MainActivity oeffnen)
            .build()

        // Notification anzeigen — gleiche NOTIFICATION_ID ersetzt vorherige Notification
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, notification)
    }
}
