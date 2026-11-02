package ch.fwvraura.kitchendisplay

import android.app.ActivityManager
import android.app.PendingIntent
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.media.AudioManager
import android.media.ToneGenerator
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.preference.PreferenceManager
import android.provider.Settings
import androidx.core.content.FileProvider
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Was Dart nicht selbst kann (Kanal ch.fwvraura.kitchendisplay/geraet,
 * lib/src/geraet.dart):
 *  - Version, Ton bei neuer Bestellung (ToneGenerator wie bisher)
 *  - Einstellungen der frueheren nativen App (kds-v3.x) einmal uebernehmen:
 *    Token, Station, Server, Ton, Ausgangs-Code - sonst stuende jedes Tablet
 *    nach dem Update vor der Anmeldemaske
 *  - Als Startbildschirm an/aus (HomeAlias), App beenden
 *  - Update laden, SHA-256 pruefen, Installer oeffnen (wie die Kasse)
 *  - Geraetesperre wie bei Fully Kiosk, sobald die App Geraetebesitzer ist
 *    (KioskAdmin.kt): Lock Task, keine Statusleiste, kein Home/Uebersicht,
 *    keine Displaysperre, Bildschirm am Strom immer an, Updates ohne Rueckfrage
 */
class MainActivity : FlutterActivity() {
    private var kanal: MethodChannel? = null
    private val haupt = Handler(Looper.getMainLooper())
    private val dpm by lazy { getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager }
    private val admin by lazy { ComponentName(this, KioskAdmin::class.java) }

    private fun besitzer() = dpm.isDeviceOwnerApp(packageName)

    private fun gesperrt() =
        (getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).lockTaskModeState !=
            ActivityManager.LOCK_TASK_MODE_NONE

    override fun onResume() {
        super.onResume()
        if (besitzer() && !isFinishing) sperren()
    }

    /** Tablet auf die Anzeige sperren; bei jedem Start erneut (auch nach Update/Absturz). */
    private fun sperren() {
        try {
            dpm.setLockTaskPackages(admin, arrayOf(packageName))
            // die App selbst ist der Startbildschirm - fest, ohne Rueckfrage «Immer»
            alsStartbildschirm(true)
            dpm.addPersistentPreferredActivity(
                admin,
                IntentFilter(Intent.ACTION_MAIN).apply {
                    addCategory(Intent.CATEGORY_HOME)
                    addCategory(Intent.CATEGORY_DEFAULT)
                },
                ComponentName(this, "$packageName.HomeAlias")
            )
            dpm.setKeyguardDisabled(admin, true)
            dpm.setStatusBarDisabled(admin, true)
            // am Netzteil, USB oder kabellos: Bildschirm bleibt an
            dpm.setGlobalSetting(admin, Settings.Global.STAY_ON_WHILE_PLUGGED_IN, "7")
            if (!gesperrt()) startLockTask()
        } catch (e: Exception) {
            android.util.Log.w("Kiosk", "Sperren: ${e.message}")
        }
    }

    /** Sperre loesen und die App wieder zur gewoehnlichen App machen (adb-Eintrag entfernt). */
    private fun sperreAufheben() {
        try {
            if (gesperrt()) stopLockTask()
            dpm.clearPackagePersistentPreferredActivities(admin, packageName)
            dpm.setStatusBarDisabled(admin, false)
            dpm.setKeyguardDisabled(admin, false)
            dpm.setGlobalSetting(admin, Settings.Global.STAY_ON_WHILE_PLUGGED_IN, "0")
            dpm.setLockTaskPackages(admin, arrayOf())
            @Suppress("DEPRECATION")
            dpm.clearDeviceOwnerApp(packageName)
        } catch (e: Exception) {
            android.util.Log.w("Kiosk", "Aufheben: ${e.message}")
        }
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        kanal = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "ch.fwvraura.kitchendisplay/geraet")
        kanal!!.setMethodCallHandler { call, result ->
            when (call.method) {
                "version" -> result.success(packageManager.getPackageInfo(packageName, 0).versionName)
                "ton" -> {
                    ton()
                    result.success(null)
                }
                "alteEinstellungen" -> result.success(alteEinstellungen())
                "alteEinstellungenLoeschen" -> {
                    getSharedPreferences("kds_auth", Context.MODE_PRIVATE).edit().clear().apply()
                    result.success(null)
                }
                "alsStartbildschirm" -> {
                    alsStartbildschirm(call.argument<Boolean>("an") == true)
                    result.success(null)
                }
                "sperre" -> result.success(mapOf("besitzer" to besitzer(), "aktiv" to gesperrt()))
                "sperreAufheben" -> {
                    sperreAufheben()
                    result.success(null)
                }
                "beenden" -> {
                    // ohne stopLockTask liesse sich die Aufgabe nicht verlassen
                    if (gesperrt()) stopLockTask()
                    finishAffinity()
                    result.success(null)
                }
                "darfInstallieren" -> result.success(darfInstallieren())
                "erlaubnisOeffnen" -> {
                    try {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
                        } else {
                            startActivity(Intent(Settings.ACTION_SECURITY_SETTINGS))
                        }
                    } catch (e: Exception) {
                        startActivity(Intent(Settings.ACTION_SETTINGS))
                    }
                    result.success(null)
                }
                "installieren" -> {
                    val url = call.argument<String>("url")!!
                    val sha = call.argument<String>("sha256")
                    Thread {
                        try {
                            val apk = laden(url, sha) { pct -> haupt.post { kanal?.invokeMethod("fortschritt", pct) } }
                            if (besitzer()) {
                                // gesperrt waere der Installer gar nicht erreichbar
                                stillInstallieren(apk)
                                haupt.post { result.success(true) }
                                return@Thread
                            }
                            haupt.post {
                                oeffnen(apk)
                                result.success(true)
                            }
                        } catch (e: Exception) {
                            haupt.post { result.error("update", e.message ?: e.toString(), null) }
                        }
                    }.start()
                }
                else -> result.notImplemented()
            }
        }
    }

    private fun ton() {
        try {
            val t = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 100)
            t.startTone(ToneGenerator.TONE_PROP_BEEP, 150)
            haupt.postDelayed({ t.startTone(ToneGenerator.TONE_PROP_BEEP2, 150) }, 200)
            haupt.postDelayed({
                t.startTone(ToneGenerator.TONE_PROP_ACK, 200)
                haupt.postDelayed({ t.release() }, 300)
            }, 400)
        } catch (e: Exception) {
            // Ton ist nett, aber nicht kritisch
        }
    }

    /** Einstellungen der nativen App (kds-v3.x); leer, wenn es keine gibt. */
    @Suppress("DEPRECATION")
    private fun alteEinstellungen(): Map<String, Any?> {
        val auth = getSharedPreferences("kds_auth", Context.MODE_PRIVATE)
        val p = PreferenceManager.getDefaultSharedPreferences(this)
        return mapOf(
            "token" to auth.getString("jwt_token", null),
            "station" to p.getString("station", null),
            "server_url" to p.getString("server_url", null),
            "sound_enabled" to (if (p.contains("sound_enabled")) p.getBoolean("sound_enabled", true) else null),
            "exit_code" to p.getString("exit_code", null),
            "as_home" to (if (p.contains("as_home")) p.getBoolean("as_home", false) else null),
        )
    }

    private fun alsStartbildschirm(an: Boolean) {
        packageManager.setComponentEnabledSetting(
            ComponentName(this, "$packageName.HomeAlias"),
            if (an) PackageManager.COMPONENT_ENABLED_STATE_ENABLED else PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP
        )
    }

    private fun darfInstallieren(): Boolean =
        besitzer() || Build.VERSION.SDK_INT < Build.VERSION_CODES.O || packageManager.canRequestPackageInstalls()

    /**
     * Als Geraetebesitzer ohne Rueckfrage installieren. Android beendet die App
     * dabei; MY_PACKAGE_REPLACED (BootReceiver) startet die neue Fassung.
     */
    private fun stillInstallieren(apk: File) {
        val installer = packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        params.setAppPackageName(packageName)
        val id = installer.createSession(params)
        installer.openSession(id).use { sitzung ->
            sitzung.openWrite("kueche.apk", 0, apk.length()).use { aus ->
                apk.inputStream().use { it.copyTo(aus) }
                sitzung.fsync(aus)
            }
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
            val rueckmeldung = PendingIntent.getBroadcast(
                this, id, Intent(this, BootReceiver::class.java).setAction(BootReceiver.INSTALLIERT), flags
            )
            sitzung.commit(rueckmeldung.intentSender)
        }
    }

    private fun laden(url: String, sha256: String?, fortschritt: (Int) -> Unit): File {
        val ordner = File(cacheDir, "updates").apply { mkdirs() }
        ordner.listFiles()?.forEach { it.delete() }
        val ziel = File(ordner, "kueche.apk")
        val verbindung = URL(url).openConnection() as HttpURLConnection
        verbindung.connectTimeout = 15000
        verbindung.readTimeout = 60000
        try {
            if (verbindung.responseCode != 200) throw Exception("Download: HTTP ${verbindung.responseCode}")
            val md = MessageDigest.getInstance("SHA-256")
            val gesamt = verbindung.contentLength.toLong()
            var geladen = 0L
            var letzt = -1
            verbindung.inputStream.use { ein ->
                ziel.outputStream().use { aus ->
                    val puffer = ByteArray(64 * 1024)
                    while (true) {
                        val n = ein.read(puffer)
                        if (n < 0) break
                        md.update(puffer, 0, n)
                        aus.write(puffer, 0, n)
                        geladen += n
                        if (gesamt > 0) {
                            val pct = (geladen * 100 / gesamt).toInt()
                            if (pct != letzt) { letzt = pct; fortschritt(pct) }
                        }
                    }
                }
            }
            val ist = md.digest().joinToString("") { "%02x".format(it) }
            if (!sha256.isNullOrBlank() && !ist.equals(sha256, ignoreCase = true)) {
                ziel.delete()
                throw Exception("Prüfsumme stimmt nicht - Download beschädigt")
            }
        } finally {
            verbindung.disconnect()
        }
        return ziel
    }

    private fun oeffnen(apk: File) {
        val uri = FileProvider.getUriForFile(this, "$packageName.updates", apk)
        @Suppress("DEPRECATION")
        startActivity(Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        })
    }
}
