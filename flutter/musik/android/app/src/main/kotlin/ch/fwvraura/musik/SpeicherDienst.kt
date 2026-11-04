package ch.fwvraura.musik

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager

/**
 * Haelt die App am Leben, solange Musik aufs Handy gespeichert wird
 * (MusikAblage in fwv_roterschopf, lib/dienste.dart): Vordergrunddienst mit
 * Mitteilung und Fortschritt, dazu Wake- und WLAN-Lock. Ohne ihn friert
 * Android die App kurz nach dem Wechsel in den Hintergrund ein, und das
 * Laden steht still. Das Laden selbst macht weiter der Dart-Teil.
 *
 * Von aussen nur ueber [stand] und [ende]: gestartet wird einmal (das geht
 * nur, solange die App im Vordergrund ist), danach wird nur die Mitteilung
 * neu gesetzt.
 */
class SpeicherDienst : Service() {
    private var wach: PowerManager.WakeLock? = null
    private var wlan: WifiManager.WifiLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == STOP) {
            beenden()
            return START_NOT_STICKY
        }
        laeuft = true
        val mitteilung = mitteilung(
            this,
            intent?.getStringExtra("text") ?: "",
            intent?.getIntExtra("fertig", 0) ?: 0,
            intent?.getIntExtra("gesamt", 0) ?: 0,
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(KENNUNG, mitteilung, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(KENNUNG, mitteilung)
        }
        sperrenHalten()
        // Wird die App beendet, nicht von selbst neu starten: laden kann nur
        // der Dart-Teil, und der ist dann weg.
        return START_NOT_STICKY
    }

    // Android 15: dataSync hoechstens 6 h am Tag - dann sauber aufhoeren.
    override fun onTimeout(startId: Int, fgsType: Int) = beenden()

    override fun onTaskRemoved(rootIntent: Intent?) = beenden()

    override fun onDestroy() {
        laeuft = false
        freigeben()
        super.onDestroy()
    }

    private fun beenden() {
        laeuft = false
        freigeben()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun sperrenHalten() {
        if (wach == null) {
            wach = (getSystemService(Context.POWER_SERVICE) as PowerManager)
                .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "fwvmusik:speichern")
                .apply { acquire(6 * 60 * 60 * 1000L) }
        }
        if (wlan == null) {
            @Suppress("DEPRECATION")
            wlan = (applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager)
                .createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "fwvmusik:speichern")
                .apply { acquire() }
        }
    }

    private fun freigeben() {
        wach?.let { if (it.isHeld) it.release() }
        wach = null
        wlan?.let { if (it.isHeld) it.release() }
        wlan = null
    }

    companion object {
        private const val STOP = "ch.fwvraura.musik.SPEICHERN_STOP"
        private const val KANAL = "ch.fwvraura.musik.speichern"
        private const val KENNUNG = 4711

        @Volatile
        private var laeuft = false

        /** Fortschritt zeigen; startet den Dienst beim ersten Mal. */
        fun stand(ctx: Context, text: String, fertig: Int, gesamt: Int) {
            if (laeuft) {
                ctx.getSystemService(NotificationManager::class.java)
                    .notify(KENNUNG, mitteilung(ctx, text, fertig, gesamt))
                return
            }
            val i = Intent(ctx, SpeicherDienst::class.java)
                .putExtra("text", text).putExtra("fertig", fertig).putExtra("gesamt", gesamt)
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i) else ctx.startService(i)
            } catch (e: IllegalStateException) {
                // App schon im Hintergrund (Android 12+): dann eben ohne Dienst.
            }
        }

        fun ende(ctx: Context) {
            if (!laeuft) return
            ctx.startService(Intent(ctx, SpeicherDienst::class.java).setAction(STOP))
        }

        fun mitteilung(ctx: Context, text: String, fertig: Int, gesamt: Int): Notification {
            val nm = ctx.getSystemService(NotificationManager::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                nm.createNotificationChannel(
                    NotificationChannel(KANAL, "Musik speichern", NotificationManager.IMPORTANCE_LOW).apply {
                        description = "Fortschritt, solange Musik aufs Handy geladen wird"
                        setShowBadge(false)
                    }
                )
            }
            val oeffnen = PendingIntent.getActivity(
                ctx, 0,
                ctx.packageManager.getLaunchIntentForPackage(ctx.packageName),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            val b = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Notification.Builder(ctx, KANAL)
            } else {
                @Suppress("DEPRECATION")
                Notification.Builder(ctx)
            }
            return b.setSmallIcon(R.drawable.ic_benachrichtigung)
                .setContentTitle("Musik speichern")
                .setContentText(text)
                .setProgress(gesamt, fertig, gesamt <= 0)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(oeffnen)
                .build()
        }
    }
}
