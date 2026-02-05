package ch.fwvraura.vorstand.util

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.gson.Gson
import com.google.gson.annotations.SerializedName
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

class UpdateChecker(private val context: Context) {

    companion object {
        private const val TAG = "UpdateChecker"
        private const val REPO = "Feuerwehrverein-Raura/Homepage"
        private const val TAG_PREFIX = "vorstand-v"
    }

    data class GitHubRelease(
        @SerializedName("tag_name") val tagName: String,
        val name: String?,
        @SerializedName("html_url") val htmlUrl: String,
        val assets: List<Asset>?
    )

    data class Asset(
        val name: String,
        @SerializedName("browser_download_url") val downloadUrl: String
    )

    data class GitHubTag(
        val name: String,
        val commit: TagCommit?
    )

    data class TagCommit(
        val sha: String?
    )

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    private val gson = Gson()

    suspend fun checkForUpdate(): UpdateResult = withContext(Dispatchers.IO) {
        try {
            // Schritt 1: Tags laden und neuesten vorstand-v* Tag finden
            val latestTag = findLatestVorstandTag()
                ?: return@withContext UpdateResult.NoUpdate

            val latestVersion = latestTag.removePrefix(TAG_PREFIX)
            val currentVersion = getCurrentVersion()

            Log.d(TAG, "Current: $currentVersion, Latest: $latestVersion")

            if (!isNewerVersion(latestVersion, currentVersion)) {
                return@withContext UpdateResult.NoUpdate
            }

            // Schritt 2: Release fuer diesen Tag laden (fuer APK-Download-URL)
            val release = fetchReleaseByTag(latestTag)
            val apkUrl = release?.assets
                ?.firstOrNull { it.name.contains("release") && it.name.endsWith(".apk") }
                ?.downloadUrl
                ?: release?.assets
                    ?.firstOrNull { it.name.endsWith(".apk") }
                    ?.downloadUrl

            UpdateResult.UpdateAvailable(
                currentVersion = currentVersion,
                newVersion = latestVersion,
                downloadUrl = apkUrl
                    ?: "https://github.com/$REPO/releases/tag/$latestTag",
                releaseName = release?.name ?: latestTag
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error checking for updates", e)
            UpdateResult.Error(e.message ?: "Unknown error")
        }
    }

    private fun findLatestVorstandTag(): String? {
        val request = Request.Builder()
            .url("https://api.github.com/repos/$REPO/tags?per_page=100")
            .header("Accept", "application/vnd.github+json")
            .build()

        val response = client.newCall(request).execute()
        if (!response.isSuccessful) return null

        val body = response.body?.string() ?: return null
        val listType = object : TypeToken<List<GitHubTag>>() {}.type
        val tags: List<GitHubTag> = gson.fromJson(body, listType)

        // Alle vorstand-v* Tags sammeln und nach Versionsnummer sortieren
        return tags
            .filter { it.name.startsWith(TAG_PREFIX) }
            .maxByOrNull { tag ->
                val parts = tag.name.removePrefix(TAG_PREFIX).split(".")
                    .map { it.toIntOrNull() ?: 0 }
                parts.getOrElse(0) { 0 } * 10000 +
                    parts.getOrElse(1) { 0 } * 100 +
                    parts.getOrElse(2) { 0 }
            }
            ?.name
    }

    private fun fetchReleaseByTag(tag: String): GitHubRelease? {
        val request = Request.Builder()
            .url("https://api.github.com/repos/$REPO/releases/tags/$tag")
            .header("Accept", "application/vnd.github+json")
            .build()

        val response = client.newCall(request).execute()
        if (!response.isSuccessful) return null

        val body = response.body?.string() ?: return null
        return gson.fromJson(body, GitHubRelease::class.java)
    }

    private fun getCurrentVersion(): String {
        return try {
            context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "0.0"
        } catch (_: Exception) { "0.0" }
    }

    private fun isNewerVersion(latest: String, current: String): Boolean {
        try {
            val latestParts = latest.split(".").map { it.toIntOrNull() ?: 0 }
            val currentParts = current.split(".").map { it.toIntOrNull() ?: 0 }
            for (i in 0 until maxOf(latestParts.size, currentParts.size)) {
                val l = latestParts.getOrElse(i) { 0 }
                val c = currentParts.getOrElse(i) { 0 }
                if (l > c) return true
                if (l < c) return false
            }
        } catch (_: Exception) { }
        return false
    }

    fun showUpdateDialog(result: UpdateResult.UpdateAvailable) {
        MaterialAlertDialogBuilder(context)
            .setTitle("Update verfügbar")
            .setMessage("Version ${result.newVersion} ist verfügbar.\n\nAktuelle Version: ${result.currentVersion}")
            .setPositiveButton("Herunterladen") { _, _ ->
                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(result.downloadUrl)))
            }
            .setNegativeButton("Später", null)
            .show()
    }

    sealed class UpdateResult {
        object NoUpdate : UpdateResult()
        data class UpdateAvailable(
            val currentVersion: String,
            val newVersion: String,
            val downloadUrl: String,
            val releaseName: String
        ) : UpdateResult()
        data class Error(val message: String) : UpdateResult()
    }
}
