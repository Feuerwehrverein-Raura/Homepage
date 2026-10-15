package ch.fwvraura.fwv_app

import android.app.Activity
import android.os.Build
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.InstallStateUpdatedListener
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

/**
 * Kanal "ch.fwvraura.members/update" — Gegenstueck zu
 * lib/einstellungen/app_update.dart: Play In-App-Updates (flexibel).
 *
 *  - "quelle"       -> "play", wenn Google Play die App installiert hat,
 *                      sonst "andere" (APK von GitHub, Entwicklung).
 *  - "pruefen"      -> {"verfuegbar": Boolean, "geladen": Boolean}
 *  - "laden"        -> Boolean: flexibles Update gestartet (Play-Dialog).
 *  - "abschliessen" -> null: installiert das geladene Update, App startet neu.
 *  - "geraet"       -> {"modell": "samsung SM-A376B", "android": "16", "sdk": 36}
 *                      fuer die Geraete-Meldung (lib/einstellungen/geraet_meldung.dart);
 *                      nur Build-Konstanten, keine Hardware-Kennung.
 *
 * Sobald Play fertig heruntergeladen hat, ruft der Kanal "geladen" in Dart auf.
 */
class AppUpdateKanal(
    private val activity: Activity,
    private val kanal: MethodChannel,
) : MethodChannel.MethodCallHandler {

    private val manager = AppUpdateManagerFactory.create(activity)
    private var lauscher: InstallStateUpdatedListener? = null

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "quelle" -> result.success(if (installiertVon() == PLAY) "play" else "andere")
            "pruefen" -> manager.appUpdateInfo
                .addOnSuccessListener { info ->
                    result.success(
                        mapOf(
                            "verfuegbar" to (info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE &&
                                info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)),
                            "geladen" to (info.installStatus() == InstallStatus.DOWNLOADED),
                        )
                    )
                }
                .addOnFailureListener { result.success(mapOf("verfuegbar" to false, "geladen" to false)) }
            "geraet" -> result.success(
                mapOf(
                    "modell" to "${Build.MANUFACTURER} ${Build.MODEL}".trim(),
                    "android" to Build.VERSION.RELEASE,
                    "sdk" to Build.VERSION.SDK_INT,
                )
            )
            "laden" -> laden(result)
            "abschliessen" -> {
                manager.completeUpdate()
                result.success(null)
            }
            else -> result.notImplemented()
        }
    }

    private fun laden(result: MethodChannel.Result) {
        manager.appUpdateInfo
            .addOnSuccessListener { info ->
                if (info.updateAvailability() != UpdateAvailability.UPDATE_AVAILABLE) {
                    result.success(false)
                    return@addOnSuccessListener
                }
                beobachten()
                val gestartet = manager.startUpdateFlowForResult(
                    info,
                    activity,
                    AppUpdateOptions.defaultOptions(AppUpdateType.FLEXIBLE),
                    ANFRAGE_CODE,
                )
                result.success(gestartet)
            }
            .addOnFailureListener { result.success(false) }
    }

    private fun beobachten() {
        if (lauscher != null) return
        val l = InstallStateUpdatedListener { stand ->
            if (stand.installStatus() == InstallStatus.DOWNLOADED) {
                activity.runOnUiThread { kanal.invokeMethod("geladen", null) }
            }
        }
        lauscher = l
        manager.registerListener(l)
    }

    fun beenden() {
        lauscher?.let { manager.unregisterListener(it) }
        lauscher = null
    }

    private fun installiertVon(): String? = try {
        val pm = activity.packageManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            pm.getInstallSourceInfo(activity.packageName).installingPackageName
        } else {
            @Suppress("DEPRECATION")
            pm.getInstallerPackageName(activity.packageName)
        }
    } catch (e: Exception) {
        null
    }

    companion object {
        const val KANAL = "ch.fwvraura.members/update"
        private const val PLAY = "com.android.vending"
        private const val ANFRAGE_CODE = 4712
    }
}
