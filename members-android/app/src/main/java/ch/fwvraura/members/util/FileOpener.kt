package ch.fwvraura.members.util

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import java.io.File

/**
 * FileOpener — oeffnet heruntergeladene Dateien im passenden System-Viewer.
 *
 * Schreibt die Bytes ins Cache-Verzeichnis und reicht der Ziel-App eine
 * content:// URI ueber den FileProvider weiter (Authority = applicationId +
 * ".fileprovider", cache-path "." in res/xml/file_paths.xml).
 */
object FileOpener {

    /**
     * Schreibt PDF-Bytes in eine Cache-Datei und oeffnet sie im System-PDF-Viewer.
     *
     * @return true bei Erfolg, false wenn keine App zum Oeffnen gefunden wurde.
     */
    fun openPdf(context: Context, bytes: ByteArray, filename: String): Boolean {
        val safeName = filename.ifBlank { "dokument.pdf" }
            .let { if (it.endsWith(".pdf", ignoreCase = true)) it else "$it.pdf" }
            .replace(Regex("[^A-Za-z0-9._-]"), "_")
        val file = File(context.cacheDir, safeName)
        file.outputStream().use { it.write(bytes) }
        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file
        )
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/pdf")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return try {
            context.startActivity(intent)
            true
        } catch (e: ActivityNotFoundException) {
            false
        }
    }
}
