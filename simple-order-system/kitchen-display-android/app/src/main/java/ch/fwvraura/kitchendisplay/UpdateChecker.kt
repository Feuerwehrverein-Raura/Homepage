package ch.fwvraura.kitchendisplay

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.appcompat.app.AlertDialog
import com.google.gson.Gson
import com.google.gson.annotations.SerializedName
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import com.google.gson.reflect.TypeToken
import java.util.concurrent.TimeUnit

class UpdateChecker(private val context: Context) {
    companion object {
        private const val TAG = "UpdateChecker"
        // Fetch all releases and filter for KDS releases (tagged as kds-v*)
        private const val RELEASES_URL = "https://api.github.com/repos/Feuerwehrverein-Raura/Homepage/releases?per_page=20"
        private const val DOWNLOAD_PAGE = "https://feuerwehrverein-raura.github.io/Homepage/kds/"
    }

    data class GitHubRelease(
        @SerializedName("tag_name")
        val tagName: String,
        val name: String,
        @SerializedName("html_url")
        val htmlUrl: String,
        val assets: List<Asset>
    )

    data class Asset(
        val name: String,
        @SerializedName("browser_download_url")
        val downloadUrl: String
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
                Log.e(TAG, "Failed to check for updates: ${response.code}")
                return@withContext UpdateResult.Error("HTTP ${response.code}")
            }

            val body = response.body?.string() ?: return@withContext UpdateResult.Error("Empty response")

            // Parse as array of releases
            val listType = object : TypeToken<List<GitHubRelease>>() {}.type
            val releases: List<GitHubRelease> = gson.fromJson(body, listType)

            // Find the first (most recent) KDS release
            val kdsRelease = releases.firstOrNull { it.tagName.startsWith("kds-v") }

            if (kdsRelease == null) {
                Log.d(TAG, "No KDS release found in ${releases.size} releases")
                return@withContext UpdateResult.NoUpdate
            }

            // Extract version from tag (kds-v1.2 -> 1.2)
            val latestVersion = kdsRelease.tagName.removePrefix("kds-v")
            val currentVersion = getCurrentVersion()

            Log.d(TAG, "Current: $currentVersion, Latest KDS: $latestVersion (tag: ${kdsRelease.tagName})")

            if (isNewerVersion(latestVersion, currentVersion)) {
                // Prefer release APK, fall back to debug
                val apkUrl = kdsRelease.assets
                    .firstOrNull { it.name.contains("release") && it.name.endsWith(".apk") }
                    ?.downloadUrl
                    ?: kdsRelease.assets
                        .firstOrNull { it.name.contains("debug") && it.name.endsWith(".apk") }
                        ?.downloadUrl

                UpdateResult.UpdateAvailable(
                    currentVersion = currentVersion,
                    newVersion = latestVersion,
                    downloadUrl = apkUrl ?: DOWNLOAD_PAGE,
                    releaseName = kdsRelease.name
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
            val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            packageInfo.versionName ?: "0.0"
        } catch (e: Exception) {
            "0.0"
        }
    }

    private fun isNewerVersion(latest: String, current: String): Boolean {
        try {
            val latestParts = latest.split(".").map { it.toIntOrNull() ?: 0 }
            val currentParts = current.split(".").map { it.toIntOrNull() ?: 0 }

            for (i in 0 until maxOf(latestParts.size, currentParts.size)) {
                val latestPart = latestParts.getOrElse(i) { 0 }
                val currentPart = currentParts.getOrElse(i) { 0 }
                if (latestPart > currentPart) return true
                if (latestPart < currentPart) return false
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error comparing versions", e)
        }
        return false
    }

    fun showUpdateDialog(result: UpdateResult.UpdateAvailable) {
        AlertDialog.Builder(context)
            .setTitle("Update verfügbar")
            .setMessage("Version ${result.newVersion} ist verfügbar.\n\nAktuelle Version: ${result.currentVersion}")
            .setPositiveButton("Herunterladen") { _, _ ->
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(result.downloadUrl))
                context.startActivity(intent)
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
