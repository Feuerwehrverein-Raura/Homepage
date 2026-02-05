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

/**
 * UpdateChecker — Prueft auf neue App-Versionen via GitHub Releases API.
 *
 * Da das Repository (Feuerwehrverein-Raura/Homepage) auch andere Releases enthaelt
 * (z.B. fuer die Website oder andere Apps), filtert diese Klasse die Releases
 * nach dem Tag-Prefix "vorstand-v", um nur relevante Vorstand-App-Releases zu finden.
 *
 * Ablauf:
 * 1. Alle Releases vom GitHub-Repository abrufen.
 * 2. Nach dem Tag-Prefix "vorstand-v" filtern (z.B. "vorstand-v1.2.3").
 * 3. Die Versionsnummer (major.minor.patch) mit der aktuellen App-Version vergleichen.
 * 4. Falls ein Update verfuegbar ist, den Download-Link zur APK bereitstellen.
 *
 * @param context Android-Context, wird fuer PackageManager und Dialog-Anzeige benoetigt.
 */
class UpdateChecker(private val context: Context) {

    companion object {
        /** Tag fuer Log-Ausgaben dieser Klasse. */
        private const val TAG = "UpdateChecker"

        /**
         * URL der GitHub Releases API fuer das Repository.
         * Laedt bis zu 100 Releases pro Anfrage, um sicherzustellen,
         * dass auch aeltere Vorstand-Releases gefunden werden.
         */
        private const val RELEASES_URL = "https://api.github.com/repos/Feuerwehrverein-Raura/Homepage/releases?per_page=100"

        /**
         * Tag-Prefix, nach dem die Releases gefiltert werden.
         * Nur Tags, die mit "vorstand-v" beginnen, gehoeren zur Vorstand-App.
         * Beispiel: "vorstand-v1.2.3" → Version 1.2.3
         */
        private const val TAG_PREFIX = "vorstand-v"
    }

    /**
     * Datenklasse fuer ein GitHub-Release.
     * Bildet die relevanten Felder der GitHub API-Antwort ab.
     *
     * @property tagName Der Git-Tag-Name (z.B. "vorstand-v1.2.3").
     * @property name Der Anzeige-Name des Releases (z.B. "Vorstand App v1.2.3").
     * @property htmlUrl Die URL zur Release-Seite auf GitHub (Fallback, falls keine APK vorhanden).
     * @property assets Liste der angehaengten Dateien (z.B. APK-Dateien).
     */
    data class GitHubRelease(
        @SerializedName("tag_name") val tagName: String,
        val name: String,
        @SerializedName("html_url") val htmlUrl: String,
        val assets: List<Asset>
    )

    /**
     * Datenklasse fuer ein Release-Asset (angehaengte Datei).
     *
     * @property name Der Dateiname des Assets (z.B. "vorstand-release.apk").
     * @property downloadUrl Die direkte Download-URL fuer die Datei.
     */
    data class Asset(
        val name: String,
        @SerializedName("browser_download_url") val downloadUrl: String
    )

    /**
     * OkHttp-Client fuer die GitHub API-Anfragen.
     * Konfiguriert mit 10 Sekunden Timeout fuer Verbindungsaufbau und Lesen.
     */
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    /** Gson-Instanz fuer das Parsen der JSON-Antwort von der GitHub API. */
    private val gson = Gson()

    /**
     * Prueft, ob eine neuere Version der App verfuegbar ist.
     *
     * Diese Methode fuehrt folgende Schritte aus (auf dem IO-Dispatcher):
     * 1. Sendet eine GET-Anfrage an die GitHub Releases API.
     * 2. Parst die JSON-Antwort in eine Liste von GitHubRelease-Objekten.
     * 3. Sucht das erste Release mit dem Tag-Prefix "vorstand-v"
     *    (GitHub liefert Releases nach Erstellungsdatum sortiert, neuste zuerst).
     * 4. Extrahiert die Versionsnummer aus dem Tag-Namen.
     * 5. Vergleicht diese mit der aktuell installierten App-Version.
     * 6. Falls ein Update vorhanden ist, sucht die Methode nach einer APK-Datei
     *    in den Release-Assets. Bevorzugt wird eine Datei mit "release" im Namen,
     *    als Fallback wird jede .apk-Datei akzeptiert.
     *    Falls keine APK gefunden wird, wird die HTML-URL der Release-Seite verwendet.
     *
     * @return UpdateResult — entweder NoUpdate, UpdateAvailable oder Error.
     */
    suspend fun checkForUpdate(): UpdateResult = withContext(Dispatchers.IO) {
        try {
            // HTTP-Anfrage an die GitHub Releases API erstellen
            val request = Request.Builder()
                .url(RELEASES_URL)
                .header("Accept", "application/vnd.github+json")  // GitHub API v3 Accept-Header
                .build()

            // Anfrage ausfuehren
            val response = client.newCall(request).execute()
            if (!response.isSuccessful) {
                return@withContext UpdateResult.Error("HTTP ${response.code}")
            }

            // Antwort-Body lesen
            val body = response.body?.string() ?: return@withContext UpdateResult.Error("Empty response")

            // JSON-Antwort in eine Liste von GitHubRelease-Objekten parsen
            val listType = object : TypeToken<List<GitHubRelease>>() {}.type
            val releases: List<GitHubRelease> = gson.fromJson(body, listType)

            // Erstes Release mit dem Tag-Prefix "vorstand-v" finden
            // (neuste zuerst, da GitHub nach Erstellungsdatum sortiert)
            val vorstandRelease = releases.firstOrNull { it.tagName.startsWith(TAG_PREFIX) }
                ?: return@withContext UpdateResult.NoUpdate

            // Versionsnummer aus dem Tag extrahieren (z.B. "vorstand-v1.2.3" → "1.2.3")
            val latestVersion = vorstandRelease.tagName.removePrefix(TAG_PREFIX)
            val currentVersion = getCurrentVersion()

            Log.d(TAG, "Current: $currentVersion, Latest: $latestVersion")

            // Versionen vergleichen
            if (isNewerVersion(latestVersion, currentVersion)) {
                // APK-Download-URL suchen: Bevorzugt "release"-APK, sonst jede APK
                val apkUrl = vorstandRelease.assets
                    .firstOrNull { it.name.contains("release") && it.name.endsWith(".apk") }
                    ?.downloadUrl
                    ?: vorstandRelease.assets
                        .firstOrNull { it.name.endsWith(".apk") }
                        ?.downloadUrl

                // Update-Ergebnis zurueckgeben (APK-URL oder Fallback auf Release-Seite)
                UpdateResult.UpdateAvailable(
                    currentVersion = currentVersion,
                    newVersion = latestVersion,
                    downloadUrl = apkUrl ?: vorstandRelease.htmlUrl,
                    releaseName = vorstandRelease.name
                )
            } else {
                // Installierte Version ist aktuell oder neuer
                UpdateResult.NoUpdate
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error checking for updates", e)
            UpdateResult.Error(e.message ?: "Unknown error")
        }
    }

    /**
     * Ermittelt die aktuell installierte Versionsnummer der App.
     *
     * Liest die versionName-Eigenschaft aus dem PackageManager.
     * Falls ein Fehler auftritt (z.B. Package nicht gefunden), wird "0.0" zurueckgegeben,
     * damit der Versionsvergleich trotzdem funktioniert und ein Update erkannt wird.
     *
     * @return Die aktuelle Versionsnummer als String (z.B. "1.2.3") oder "0.0" bei Fehler.
     */
    private fun getCurrentVersion(): String {
        return try {
            context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "0.0"
        } catch (_: Exception) { "0.0" }
    }

    /**
     * Vergleicht zwei Versionsnummern im Format "major.minor.patch".
     *
     * Der Vergleich erfolgt komponentenweise von links nach rechts:
     * - Zuerst wird die Major-Version verglichen.
     * - Bei Gleichheit die Minor-Version.
     * - Bei Gleichheit die Patch-Version (und weitere Teile, falls vorhanden).
     *
     * Falls eine Version weniger Teile hat, werden fehlende Teile als 0 behandelt.
     * Beispiele:
     * - isNewerVersion("1.2.0", "1.1.0") → true
     * - isNewerVersion("1.1.0", "1.1.0") → false
     * - isNewerVersion("2.0", "1.9.9")   → true
     *
     * @param latest Die neueste verfuegbare Version (z.B. "1.3.0").
     * @param current Die aktuell installierte Version (z.B. "1.2.5").
     * @return true, falls die neueste Version groesser ist als die aktuelle.
     */
    private fun isNewerVersion(latest: String, current: String): Boolean {
        try {
            // Versionsstring in Integer-Listen aufteilen (z.B. "1.2.3" → [1, 2, 3])
            val latestParts = latest.split(".").map { it.toIntOrNull() ?: 0 }
            val currentParts = current.split(".").map { it.toIntOrNull() ?: 0 }

            // Komponentenweise vergleichen (bis zur laengsten Versionsnummer)
            for (i in 0 until maxOf(latestParts.size, currentParts.size)) {
                val l = latestParts.getOrElse(i) { 0 }   // Fehlende Teile als 0 behandeln
                val c = currentParts.getOrElse(i) { 0 }   // Fehlende Teile als 0 behandeln
                if (l > c) return true   // Neuere Version gefunden
                if (l < c) return false  // Aktuelle Version ist neuer (sollte nicht vorkommen)
            }
        } catch (_: Exception) { }
        // Versionen sind gleich → kein Update noetig
        return false
    }

    /**
     * Zeigt einen AlertDialog an, der den Benutzer ueber ein verfuegbares Update informiert.
     *
     * Der Dialog zeigt:
     * - Die neue Versionsnummer.
     * - Die aktuell installierte Versionsnummer.
     * - Einen "Herunterladen"-Button, der den Browser mit der Download-URL oeffnet.
     * - Einen "Spaeter"-Button, der den Dialog schliesst ohne Aktion.
     *
     * @param result Das UpdateAvailable-Ergebnis mit Versions-Infos und Download-URL.
     */
    fun showUpdateDialog(result: UpdateResult.UpdateAvailable) {
        AlertDialog.Builder(context)
            .setTitle("Update verfügbar")
            .setMessage("Version ${result.newVersion} ist verfügbar.\n\nAktuelle Version: ${result.currentVersion}")
            .setPositiveButton("Herunterladen") { _, _ ->
                // Browser oeffnen mit der Download-URL (APK oder GitHub Release-Seite)
                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(result.downloadUrl)))
            }
            .setNegativeButton("Später", null)  // Dialog einfach schliessen
            .show()
    }

    /**
     * Sealed Class fuer das Ergebnis der Update-Pruefung.
     *
     * Ermoeglicht eine typsichere Unterscheidung der drei moeglichen Ergebnisse
     * mit Kotlin's when-Ausdruck.
     */
    sealed class UpdateResult {
        /** Kein Update verfuegbar — die installierte Version ist aktuell. */
        object NoUpdate : UpdateResult()

        /**
         * Ein Update ist verfuegbar.
         *
         * @property currentVersion Die aktuell installierte Version (z.B. "1.2.0").
         * @property newVersion Die neue verfuegbare Version (z.B. "1.3.0").
         * @property downloadUrl Die URL zum Herunterladen der neuen APK (oder Release-Seite).
         * @property releaseName Der Anzeige-Name des Releases.
         */
        data class UpdateAvailable(
            val currentVersion: String,
            val newVersion: String,
            val downloadUrl: String,
            val releaseName: String
        ) : UpdateResult()

        /**
         * Ein Fehler ist bei der Update-Pruefung aufgetreten.
         *
         * @property message Die Fehlermeldung (z.B. "HTTP 403" oder "Network error").
         */
        data class Error(val message: String) : UpdateResult()
    }
}
