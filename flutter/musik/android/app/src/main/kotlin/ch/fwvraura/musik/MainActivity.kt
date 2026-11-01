package ch.fwvraura.musik

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.StatFs
import android.provider.Settings
import androidx.core.content.FileProvider
import com.ryanheise.audioservice.AudioServiceActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * FWV Musik auf Android. AudioServiceActivity (eine FlutterActivity) fuer die
 * Musik im Hintergrund, dazu zwei Kanaele:
 *
 *  - ch.fwvraura.musik/geraet: freier Speicher (StatFs) und ob das Netz
 *    unbegrenzt ist (WLAN) - fuer die gespeicherte Musik (lib/dienste.dart).
 *  - ch.fwvraura.musik/update: wie in der Kassen-App - APK von
 *    www.fwv-raura.ch laden, SHA-256 pruefen, Paketinstaller oeffnen
 *    (lib/update.dart).
 */
class MainActivity : AudioServiceActivity() {
    private var update: MethodChannel? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        val boten = flutterEngine.dartExecutor.binaryMessenger
        MethodChannel(boten, "ch.fwvraura.musik/geraet").setMethodCallHandler { call, result ->
            when (call.method) {
                "frei" -> result.success(
                    try {
                        StatFs(call.argument<String>("pfad")!!).availableBytes
                    } catch (e: Exception) {
                        null
                    }
                )
                "unbegrenzt" -> result.success(unbegrenztesNetz())
                else -> result.notImplemented()
            }
        }
        update = MethodChannel(boten, "ch.fwvraura.musik/update")
        update!!.setMethodCallHandler { call, result ->
            when (call.method) {
                "version" -> result.success(packageManager.getPackageInfo(packageName, 0).versionName)
                "darfInstallieren" -> result.success(darfInstallieren())
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
                            val apk = laden(url, sha) { pct -> haupt.post { update?.invokeMethod("fortschritt", pct) } }
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

    /** WLAN oder sonst ein Netz ohne Datenlimit (kein Mobilfunk-Abo). */
    private fun unbegrenztesNetz(): Boolean {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val netz = cm.activeNetwork ?: return false
        val f = cm.getNetworkCapabilities(netz) ?: return false
        return f.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
    }

    private fun darfInstallieren(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.O || packageManager.canRequestPackageInstalls()

    private fun laden(url: String, sha256: String?, fortschritt: (Int) -> Unit): File {
        val ordner = File(cacheDir, "updates").apply { mkdirs() }
        ordner.listFiles()?.forEach { it.delete() }
        val ziel = File(ordner, "musik.apk")
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
