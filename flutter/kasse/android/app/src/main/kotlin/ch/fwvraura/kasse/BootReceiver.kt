package ch.fwvraura.kasse

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.util.Log

/**
 * Startet die Kasse nach einem Geraete-Neustart und nach einem Selbst-Update
 * (MY_PACKAGE_REPLACED) - bisher erledigte das Fully Kiosk.
 */
class BootReceiver : BroadcastReceiver() {
    companion object {
        /** Rueckmeldung der stillen Installation (MainActivity.stillInstallieren) */
        const val INSTALLIERT = "ch.fwvraura.kasse.INSTALLIERT"
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
                try {
                    context.startActivity(
                        Intent(context, MainActivity::class.java)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                    )
                } catch (e: Exception) {
                    // Ab Android 10 nur als Geraetebesitzer oder Startbildschirm erlaubt
                    Log.w("BootReceiver", "Start nicht erlaubt: ${e.message}")
                }
            }
        }
    }
}
