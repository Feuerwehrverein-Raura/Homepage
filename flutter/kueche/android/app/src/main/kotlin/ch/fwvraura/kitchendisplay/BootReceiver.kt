package ch.fwvraura.kitchendisplay

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.util.Log

/**
 * Startet die Anzeige nach einem Geraete-Neustart und nach einem Selbst-Update
 * (MY_PACKAGE_REPLACED) - niemand muss die App von Hand oeffnen.
 * Auf Android 7 darf ein Empfaenger Aktivitaeten direkt starten.
 */
class BootReceiver : BroadcastReceiver() {
    companion object {
        /** Rueckmeldung der stillen Installation (MainActivity.stillInstallieren) */
        const val INSTALLIERT = "ch.fwvraura.kitchendisplay.INSTALLIERT"
    }

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            INSTALLIERT -> {
                val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -999)
                Log.i("BootReceiver", "Update: $status ${intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)}")
            }
            Intent.ACTION_BOOT_COMPLETED,
            "android.intent.action.QUICKBOOT_POWERON",
            Intent.ACTION_MY_PACKAGE_REPLACED -> {
                Log.i("BootReceiver", "Starte Anzeige nach ${intent.action}")
                try {
                    context.startActivity(
                        Intent(context, MainActivity::class.java)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                    )
                } catch (e: Exception) {
                    // Ab Android 10 sind Starts aus dem Hintergrund eingeschraenkt - dort
                    // hilft die Option «Als Startbildschirm».
                    Log.w("BootReceiver", "Start nicht erlaubt: ${e.message}")
                }
            }
        }
    }
}
