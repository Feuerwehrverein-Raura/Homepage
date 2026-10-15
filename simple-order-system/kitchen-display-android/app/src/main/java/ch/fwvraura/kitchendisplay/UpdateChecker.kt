package ch.fwvraura.kitchendisplay

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.content.FileProvider
import com.google.gson.Gson
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Selbst-Update ueber GitHub-Releases mit Tag kds-v*.
 *
 * Frueher wurden die letzten 100 Releases des Repos durchsucht. Im Repo
 * erscheinen aber laufend andere Releases (Website, Desktop, Mitglieder-App),
 * die KDS-Releases rutschten aus dieser Liste — die App sah kds-v2.4 als
 * neueste Version. Jetzt: alle Tags kds-v* holen (git/matching-refs), nach
 * Version sortieren und das Release zum hoechsten Tag lesen.
 *
 * Installiert wird nur das signierte «-release.apk» (gleicher Schluessel wie
 * alle bisherigen Releases). Das Debug-APK ist mit einem wechselnden
 * Entwickler-Schluessel signiert und liesse sich nicht drueberinstallieren.
 */
class UpdateChecker(private val context: Context) {
    companion object {
        private const val TAG = "UpdateChecker"
        private const val REPO = "https://api.github.com/repos/Feuerwehrverein-Raura/Homepage"
        private const val TAGS_URL = "$REPO/git/matching-refs/tags/kds-v"
        private const val RELEASE_BY_TAG_URL = "$REPO/releases/tags/"
        const val RELEASES_PAGE = "https://github.com/Feuerwehrverein-Raura/Homepage/releases"

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
            .header("Accept", "application/vnd.github+json")
            .build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                Log.w(TAG, "GET $url -> HTTP ${response.code}")
                return null
            }
            return response.body?.string()
        }
    }

    suspend fun checkForUpdate(): UpdateResult = withContext(Dispatchers.IO) {
        try {
            val refsJson = getJson(TAGS_URL) ?: return@withContext UpdateResult.Error("Tags nicht lesbar")
            val refs = gson.fromJson(refsJson, JsonArray::class.java)
                .mapNotNull { it.asJsonObject.get("ref")?.asString }
            val currentVersion = getCurrentVersion()

            // Hoechsten Tag mit einem fertigen Release-APK suchen (ein Tag kann
            // existieren, bevor der Build sein APK angehaengt hat).
            for (tag in sortTags(refs).take(3)) {
                val version = tag.removePrefix("kds-v")
                if (!isNewerVersion(version, currentVersion)) return@withContext UpdateResult.NoUpdate
                val releaseJson = getJson(RELEASE_BY_TAG_URL + tag) ?: continue
                val release = gson.fromJson(releaseJson, JsonObject::class.java)
                val apkUrl = release.getAsJsonArray("assets")
                    ?.map { it.asJsonObject }
                    ?.firstOrNull {
                        val name = it.get("name")?.asString.orEmpty()
                        name.endsWith("-release.apk")
                    }
                    ?.get("browser_download_url")?.asString
                    ?: continue
                Log.d(TAG, "Update: $currentVersion -> $version ($apkUrl)")
                return@withContext UpdateResult.UpdateAvailable(currentVersion, version, apkUrl)
            }
            UpdateResult.NoUpdate
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
