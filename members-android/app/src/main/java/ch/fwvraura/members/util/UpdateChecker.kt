package ch.fwvraura.members.util

import android.content.Context
import android.util.Log
import com.google.gson.Gson
import com.google.gson.annotations.SerializedName
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

/**
 * Prueft ueber die GitHub-Tags (members-v*), ob eine neuere App-Version vorliegt.
 *
 * Die App wird ueber Google Play (internes Testing) verteilt — deshalb wird
 * bewusst KEIN APK heruntergeladen (die Play-Version hat eine andere Signatur
 * als die GitHub-APKs). Es wird nur die neuere Version gemeldet; das eigentliche
 * Update laeuft ueber den Play Store.
 */
object UpdateChecker {
    private const val TAG = "UpdateChecker"
    private const val REPO = "Feuerwehrverein-Raura/Homepage"
    private const val TAG_PREFIX = "members-v"

    private data class GitHubTag(@SerializedName("name") val name: String? = null)

    private val client by lazy {
        OkHttpClient.Builder()
            .connectTimeout(8, TimeUnit.SECONDS)
            .readTimeout(8, TimeUnit.SECONDS)
            .build()
    }
    private val gson = Gson()

    /** Installierte Version ohne evtl. "-debug"-Suffix (z.B. "0.31.0"). */
    fun currentVersion(context: Context): String = try {
        (context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "0.0")
            .substringBefore("-")
    } catch (_: Exception) { "0.0" }

    /**
     * Gibt die neueste verfuegbare Version zurueck, wenn sie neuer als die
     * installierte ist — sonst null (kein Update noetig oder Netzwerkfehler;
     * Fehler werden bewusst geschluckt, damit der Check nie stoert).
     */
    suspend fun latestNewerVersion(context: Context): String? = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder()
                .url("https://api.github.com/repos/$REPO/tags?per_page=100")
                .header("Accept", "application/vnd.github+json")
                .build()
            client.newCall(request).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext null
                val body = resp.body?.string() ?: return@withContext null
                val type = object : TypeToken<List<GitHubTag>>() {}.type
                val tags: List<GitHubTag> = gson.fromJson(body, type)
                val latest = tags.mapNotNull { it.name }
                    .filter { it.startsWith(TAG_PREFIX) }
                    .maxByOrNull { versionKey(it.removePrefix(TAG_PREFIX)) }
                    ?.removePrefix(TAG_PREFIX)
                    ?: return@withContext null
                if (isNewer(latest, currentVersion(context))) latest else null
            }
        } catch (e: Exception) {
            Log.w(TAG, "Update-Check fehlgeschlagen: ${e.message}")
            null
        }
    }

    private fun versionKey(v: String): Int {
        val p = v.split(".").map { it.toIntOrNull() ?: 0 }
        return p.getOrElse(0) { 0 } * 10000 + p.getOrElse(1) { 0 } * 100 + p.getOrElse(2) { 0 }
    }

    private fun isNewer(latest: String, current: String): Boolean {
        val l = latest.split(".").map { it.toIntOrNull() ?: 0 }
        val c = current.split(".").map { it.toIntOrNull() ?: 0 }
        for (i in 0 until maxOf(l.size, c.size)) {
            val a = l.getOrElse(i) { 0 }
            val b = c.getOrElse(i) { 0 }
            if (a > b) return true
            if (a < b) return false
        }
        return false
    }
}
