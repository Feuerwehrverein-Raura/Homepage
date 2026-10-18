package ch.fwvraura.kitchendisplay

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.content.FileProvider
import com.google.gson.Gson
import com.google.gson.JsonObject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Selbst-Update ueber www.fwv-raura.ch/download/ (versionen.json + kueche.apk).
 * Der Vereinsserver holt dort das neueste Release kds-v* ab. Die GitHub-API
 * erreichte das Kuechen-Tablet (Android 7) nicht - siehe checkForUpdate.
 *
 * Installiert wird nur das signierte «-release.apk» (gleicher Schluessel wie
 * alle bisherigen Releases). Das Debug-APK ist mit einem wechselnden
 * Entwickler-Schluessel signiert und liesse sich nicht drueberinstallieren.
 */
class UpdateChecker(private val context: Context) {
    companion object {
        private const val TAG = "UpdateChecker"
        private const val VERSIONEN_URL = "https://www.fwv-raura.ch/download/versionen.json"
        private const val DOWNLOAD_URL = "https://www.fwv-raura.ch/download/"
        const val RELEASES_PAGE = "https://www.fwv-raura.ch/apps.html"

        /** Vergleicht Versionsnummern wie "3.0" und "2.6.1". */
        fun isNewerVersion(latest: String, current: String): Boolean {
            val l = latest.split(".").map { it.toIntOrNull() ?: 0 }
            val c = current.split(".").map { it.toIntOrNull() ?: 0 }
            for (i in 0 until maxOf(l.size, c.size)) {
                val a = l.getOrElse(i) { 0 }
                val b = c.getOrElse(i) { 0 }
                if (a != b) return a > b
            }
            return false
        }

        /** Tags (refs/tags/kds-v…) absteigend nach Version. */
        fun sortTags(refs: List<String>): List<String> =
            refs.map { it.removePrefix("refs/tags/") }
                .filter { it.startsWith("kds-v") }
                .sortedWith { a, b ->
                    val va = a.removePrefix("kds-v")
                    val vb = b.removePrefix("kds-v")
                    when {
                        isNewerVersion(va, vb) -> -1
                        isNewerVersion(vb, va) -> 1
                        else -> 0
                    }
                }
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    private val gson = Gson()

    private fun getJson(url: String): String? {
        val request = Request.Builder()
            .url(url)
            .build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                Log.w(TAG, "GET $url -> HTTP ${response.code}")
                return null
            }
            return response.body?.string()
        }
    }

    /**
     * Neue Version? Quelle ist www.fwv-raura.ch/download/versionen.json (der
     * Vereinsserver holt die Releases kds-v*, Skill fwv-app-downloads). Frueher
     * die GitHub-API - die erreicht das Kuechen-Tablet (Android 7) nicht, weil
     * es GitHubs Zertifikatskette nicht kennt; deshalb kamen 3.1/3.2 nie an.
     */
    suspend fun checkForUpdate(): UpdateResult = withContext(Dispatchers.IO) {
        try {
            val json = getJson(VERSIONEN_URL) ?: return@withContext UpdateResult.Error("Versionen nicht lesbar")
            val kueche = gson.fromJson(json, JsonObject::class.java).getAsJsonObject("kueche")
                ?: return@withContext UpdateResult.Error("Keine Kuechen-App in versionen.json")
            val version = kueche.get("version")?.asString ?: return@withContext UpdateResult.Error("Version fehlt")
            val datei = kueche.get("datei")?.asString ?: "kueche.apk"
            val currentVersion = getCurrentVersion()
            if (!isNewerVersion(version, currentVersion)) return@withContext UpdateResult.NoUpdate
            val apkUrl = DOWNLOAD_URL + datei
            Log.d(TAG, "Update: $currentVersion -> $version ($apkUrl)")
            UpdateResult.UpdateAvailable(currentVersion, version, apkUrl)
        } catch (e: Exception) {
            Log.e(TAG, "Error checking for updates", e)
            UpdateResult.Error(e.message ?: "Unbekannter Fehler")
        }
    }

    private fun getCurrentVersion(): String = try {
        context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "0.0"
    } catch (e: Exception) {
        "0.0"
    }

    /** APK in den Cache laden. Liefert die Datei oder null. */
    suspend fun download(update: UpdateResult.UpdateAvailable, onProgress: (Int) -> Unit): File? =
        withContext(Dispatchers.IO) {
            try {
                val dir = File(context.cacheDir, "updates").apply { mkdirs() }
                dir.listFiles()?.forEach { it.delete() }
                val target = File(dir, "kitchen-display-${update.newVersion}.apk")
                val request = Request.Builder().url(update.downloadUrl).build()
                client.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) return@withContext null
                    val body = response.body ?: return@withContext null
                    val total = body.contentLength()
                    body.byteStream().use { input ->
                        target.outputStream().use { output ->
                            val buf = ByteArray(64 * 1024)
                            var done = 0L
                            var lastPct = -1
                            while (true) {
                                val n = input.read(buf)
                                if (n < 0) break
                                output.write(buf, 0, n)
                                done += n
                                if (total > 0) {
                                    val pct = (done * 100 / total).toInt()
                                    if (pct != lastPct) {
                                        lastPct = pct
                                        withContext(Dispatchers.Main) { onProgress(pct) }
                                    }
                                }
                            }
                        }
                    }
                }
                // Plausibel? Muss unser Paket sein.
                val info = context.packageManager.getPackageArchiveInfo(target.absolutePath, 0)
                if (info?.packageName != context.packageName) {
                    Log.e(TAG, "Heruntergeladene Datei ist kein KDS-APK")
                    target.delete()
                    return@withContext null
                }
                target
            } catch (e: Exception) {
                Log.e(TAG, "Download fehlgeschlagen", e)
                null
            }
        }

    /**
     * Darf die App Pakete installieren?
     * Android 7: globale Einstellung «Unbekannte Herkunft» (Einstellungen > Sicherheit).
     * Android 8+: Erlaubnis pro App.
     */
    fun canInstall(): Boolean = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.packageManager.canRequestPackageInstalls()
    } else {
        @Suppress("DEPRECATION")
        Settings.Secure.getInt(context.contentResolver, Settings.Secure.INSTALL_NON_MARKET_APPS, 0) == 1
    }

    /** Einstellungsseite, auf der die Installation erlaubt wird. */
    fun installPermissionIntent(): Intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
    } else {
        Intent(Settings.ACTION_SECURITY_SETTINGS)
    }.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    /** Paketinstaller mit dem APK oeffnen (content:// ueber FileProvider, ab Android 7 Pflicht). */
    fun install(apk: File) {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.updates", apk)
        @Suppress("DEPRECATION")
        val intent = Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }

    sealed class UpdateResult {
        object NoUpdate : UpdateResult()
        data class UpdateAvailable(
            val currentVersion: String,
            val newVersion: String,
            val downloadUrl: String
        ) : UpdateResult()
        data class Error(val message: String) : UpdateResult()
    }
}
