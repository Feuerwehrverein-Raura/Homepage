package ch.fwvraura.vorstand.util

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.appcompat.app.AlertDialog
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
        private const val RELEASES_URL = "https://api.github.com/repos/Feuerwehrverein-Raura/Homepage/releases?per_page=100"
        private const val TAG_PREFIX = "vorstand-v"
    }

    data class GitHubRelease(
        @SerializedName("tag_name") val tagName: String,
        val name: String,
        @SerializedName("html_url") val htmlUrl: String,
        val assets: List<Asset>
    )

    data class Asset(
        val name: String,
        @SerializedName("browser_download_url") val downloadUrl: String
    )

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    private val gson = Gson()

    suspend fun checkForUpdate(): UpdateResult = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder()
                .url(RELEASES_URL)
                .header("Accept", "application/vnd.github+json")
                .build()

            val response = client.newCall(request).execute()
            if (!response.isSuccessful) {
                return@withContext UpdateResult.Error("HTTP ${response.code}")
            }

            val body = response.body?.string() ?: return@withContext UpdateResult.Error("Empty response")

            val listType = object : TypeToken<List<GitHubRelease>>() {}.type
            val releases: List<GitHubRelease> = gson.fromJson(body, listType)

            val vorstandRelease = releases.firstOrNull { it.tagName.startsWith(TAG_PREFIX) }
                ?: return@withContext UpdateResult.NoUpdate

            val latestVersion = vorstandRelease.tagName.removePrefix(TAG_PREFIX)
            val currentVersion = getCurrentVersion()

            Log.d(TAG, "Current: $currentVersion, Latest: $latestVersion")

            if (isNewerVersion(latestVersion, currentVersion)) {
                val apkUrl = vorstandRelease.assets
                    .firstOrNull { it.name.contains("release") && it.name.endsWith(".apk") }
                    ?.downloadUrl
                    ?: vorstandRelease.assets
                        .firstOrNull { it.name.endsWith(".apk") }
                        ?.downloadUrl

                UpdateResult.UpdateAvailable(
                    currentVersion = currentVersion,
                    newVersion = latestVersion,
                    downloadUrl = apkUrl ?: vorstandRelease.htmlUrl,
                    releaseName = vorstandRelease.name
                )
            } else {
                UpdateResult.NoUpdate
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error checking for updates", e)
            UpdateResult.Error(e.message ?: "Unknown error")
        }
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
        AlertDialog.Builder(context)
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
