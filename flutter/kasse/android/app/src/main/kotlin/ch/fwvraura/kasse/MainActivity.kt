package ch.fwvraura.kasse

import android.app.ActivityManager
import android.app.PendingIntent
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
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
 * Updater der Kassen-App (lib/src/updater.dart): Dart prueft
 * www.fwv-raura.ch/download/versionen.json; hier wird das APK geladen, die
 * SHA-256 geprueft und der Paketinstaller geoeffnet (wie die Kuechen-App).
 *
 * Geraetesperre statt Fully Kiosk, sobald die App Geraetebesitzer ist
 * (KioskAdmin.kt, wie flutter/kueche): Lock Task, keine Statusleiste, kein
 * Home/Uebersicht, keine Displaysperre, Bildschirm am Strom immer an, fest
 * Startbildschirm, Updates ohne Rueckfrage.
 */
class MainActivity : FlutterActivity() {
    private var kanal: MethodChannel? = null
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

    private fun startbildschirm(an: Boolean) {
        packageManager.setComponentEnabledSetting(
            ComponentName(this, "$packageName.HomeAlias"),
            if (an) PackageManager.COMPONENT_ENABLED_STATE_ENABLED else PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP
        )
    }

    /** Tablet auf die Kasse sperren; bei jedem Start erneut (auch nach Update). */
    private fun sperren() {
        try {
            dpm.setLockTaskPackages(admin, arrayOf(packageName))
            startbildschirm(true)
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

    /**
     * «Kasse verlassen»: Home und Statusleiste bis zum naechsten Start freigeben
     * (WLAN, Einstellungen). Beim naechsten Start sperrt onResume wieder.
     */
    private fun pausieren() {
        try {
            if (gesperrt()) stopLockTask()
            dpm.clearPackagePersistentPreferredActivities(admin, packageName)
            startbildschirm(false)
            dpm.setStatusBarDisabled(admin, false)
        } catch (e: Exception) {
            android.util.Log.w("Kiosk", "Pausieren: ${e.message}")
        }
    }

    /** Sperre loesen und Geraetebesitz abgeben - danach eine gewoehnliche App. */
    private fun sperreAufheben() {
        try {
            pausieren()
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
        kanal = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "ch.fwvraura.kasse/update")
        kanal!!.setMethodCallHandler { call, result ->
            when (call.method) {
                "version" -> result.success(packageManager.getPackageInfo(packageName, 0).versionName)
                "darfInstallieren" -> result.success(darfInstallieren())
                "sperre" -> result.success(mapOf("besitzer" to besitzer(), "aktiv" to gesperrt()))
                "sperreAufheben" -> {
                    sperreAufheben()
                    result.success(null)
                }
                "beenden" -> {
                    if (besitzer()) pausieren() else if (gesperrt()) stopLockTask()
                    finishAffinity()
                    result.success(null)
                }
                "erlaubnisOeffnen" -> {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
                    }
                    result.success(null)
                }
                "installieren" -> {
                    val url = call.argument<String>("url")!!
                    val sha = call.argument<String>("sha256")
                    val haupt = Handler(Looper.getMainLooper())
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
            sitzung.openWrite("kasse.apk", 0, apk.length()).use { aus ->
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
        val ziel = File(ordner, "kasse.apk")
        val verbindung = URL(url).openConnection() as HttpURLConnection
        verbindung.connectTimeout = 15000
        verbindung.readTimeout = 60000
        try {
            if (verbindung.responseCode != 200) throw Exception("Download: HTTP ${verbindung.responseCode}")
            val md = MessageDigest.getInstance("SHA-256")
            val gesamt = verbindung.contentLengthLong
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
