package ch.fwvraura.members.util

import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

object DateUtils {
    private val swissDate = SimpleDateFormat("dd.MM.yyyy", Locale.GERMAN)
    private val swissDateTime = SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.GERMAN)
    private val swissWithDay = SimpleDateFormat("EEEE, d. MMMM yyyy", Locale.GERMAN)

    /** ISO-8601 -> "01.05.2026" oder leer wenn ungueltig/null. */
    fun formatDate(iso: String?): String {
        if (iso.isNullOrBlank()) return ""
        return try { swissDate.format(parse(iso)) } catch (_: Exception) { "" }
    }

    /** ISO-8601 -> "01.05.2026 17:00". */
    fun formatDateTime(iso: String?): String {
        if (iso.isNullOrBlank()) return ""
        return try { swissDateTime.format(parse(iso)) } catch (_: Exception) { "" }
    }

    /** ISO-8601 -> "Samstag, 16. Mai 2026". */
    fun formatLong(iso: String?): String {
        if (iso.isNullOrBlank()) return ""
        return try { swissWithDay.format(parse(iso)) } catch (_: Exception) { "" }
    }

    private fun parse(iso: String): java.util.Date {
        // Backend liefert "2026-05-16 17:00:00" oder "2026-05-16T17:00:00.000Z"
        val cleaned = iso.replace("T", " ").substringBefore(".").substringBefore("Z")
        val pattern = if (cleaned.length >= 16) "yyyy-MM-dd HH:mm:ss" else "yyyy-MM-dd"
        return SimpleDateFormat(pattern, Locale.US).apply {
            timeZone = TimeZone.getTimeZone("Europe/Zurich")
        }.parse(if (cleaned.length >= 19) cleaned else "$cleaned 00:00:00") ?: java.util.Date()
    }
}
