package ch.fwvraura.members.util

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
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

    /**
     * Schreibt beliebige Datei-Bytes in eine Cache-Datei und oeffnet sie im
     * passenden System-Viewer (ACTION_VIEW) — fuer Notiz-Anhaenge (Bilder,
     * PDFs, Office-Dokumente, ...).
     *
     * @return true bei Erfolg, false wenn keine App zum Oeffnen gefunden wurde.
     */
    fun openFile(context: Context, bytes: ByteArray, filename: String, mimeType: String?): Boolean {
        val (uri, type) = writeToCache(context, bytes, filename, mimeType)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, type)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return try {
            context.startActivity(intent)
            true
        } catch (e: ActivityNotFoundException) {
            false
        }
    }

    /**
     * Fallback zu [openFile]: schreibt die Bytes in den Cache und oeffnet den
     * System-Teilen-Dialog (ACTION_SEND), falls keine App die Datei direkt
     * anzeigen kann.
     *
     * @return true bei Erfolg, false wenn gar keine Ziel-App gefunden wurde.
     */
    fun shareFile(context: Context, bytes: ByteArray, filename: String, mimeType: String?): Boolean {
        val (uri, type) = writeToCache(context, bytes, filename, mimeType)
        val send = Intent(Intent.ACTION_SEND).apply {
            setType(type)
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val chooser = Intent.createChooser(send, "Anhang öffnen").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return try {
            context.startActivity(chooser)
            true
        } catch (e: ActivityNotFoundException) {
            false
        }
    }

    /**
     * Schreibt die Bytes in eine (namensbereinigte) Cache-Datei und liefert die
     * FileProvider-URI + den effektiven MIME-Typ. Der FileProvider deckt den
     * Cache-Root ab (siehe res/xml/file_paths.xml).
     */
    private fun writeToCache(
        context: Context,
        bytes: ByteArray,
        filename: String,
        mimeType: String?
    ): Pair<Uri, String> {
        val safeName = filename.ifBlank { "anhang" }
            .replace(Regex("[^A-Za-z0-9._-]"), "_")
        val file = File(context.cacheDir, safeName)
        file.outputStream().use { it.write(bytes) }
        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file
        )
        val type = mimeType?.takeIf { it.isNotBlank() } ?: "application/octet-stream"
        return uri to type
    }
}
