package ch.fwvraura.kitchendisplay

import android.app.AlarmManager
import android.app.Application
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Process
import android.os.SystemClock
import android.util.Log
import kotlin.system.exitProcess

/**
 * Stuerzt die App trotz allem ab, startet sie sich nach 3 Sekunden selbst neu
 * — ein Kuechendisplay mit schwarzem Bildschirm hilft niemandem.
 * Schutz vor Endlosschleifen: hoechstens ein Neustart pro Minute.
 */
class KdsApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            Log.e("KdsApplication", "Absturz — Neustart geplant", error)
            try {
                scheduleRestart()
            } catch (e: Exception) {
                previous?.uncaughtException(thread, error)
            }
            Process.killProcess(Process.myPid())
            exitProcess(10)
        }
    }

    private fun scheduleRestart() {
        val prefs = getSharedPreferences("kds_crash", Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        if (now - prefs.getLong("last_restart", 0) < 60_000) return
        prefs.edit().putLong("last_restart", now).commit()

        val intent = Intent(this, LoginActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        val pending = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
        )
        val alarm = getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarm.set(AlarmManager.ELAPSED_REALTIME, SystemClock.elapsedRealtime() + 3000, pending)
    }
}
