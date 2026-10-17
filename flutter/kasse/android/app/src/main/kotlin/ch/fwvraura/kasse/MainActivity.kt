package ch.fwvraura.kasse

import android.content.Intent
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
 */
class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "ch.fwvraura.kasse/update").setMethodCallHandler { call, result ->
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
                            val apk = laden(url, sha)
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
        Build.VERSION.SDK_INT < Build.VERSION_CODES.O || packageManager.canRequestPackageInstalls()

    private fun laden(url: String, sha256: String?): File {
        val ordner = File(cacheDir, "updates").apply { mkdirs() }
        ordner.listFiles()?.forEach { it.delete() }
        val ziel = File(ordner, "kasse.apk")
        val verbindung = URL(url).openConnection() as HttpURLConnection
        verbindung.connectTimeout = 15000
        verbindung.readTimeout = 60000
        try {
            if (verbindung.responseCode != 200) throw Exception("Download: HTTP ${verbindung.responseCode}")
            val md = MessageDigest.getInstance("SHA-256")
            verbindung.inputStream.use { ein ->
                ziel.outputStream().use { aus ->
                    val puffer = ByteArray(64 * 1024)
                    while (true) {
                        val n = ein.read(puffer)
                        if (n < 0) break
                        md.update(puffer, 0, n)
                        aus.write(puffer, 0, n)
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
