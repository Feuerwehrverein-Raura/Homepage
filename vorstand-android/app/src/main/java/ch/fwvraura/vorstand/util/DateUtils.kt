package ch.fwvraura.vorstand.util

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

object DateUtils {

    private val swissDateFormatter = DateTimeFormatter.ofPattern("dd.MM.yyyy", Locale("de", "CH"))
    private val swissDateTimeFormatter = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm", Locale("de", "CH"))
    private val isoFormatter = DateTimeFormatter.ISO_DATE
    private val isoDateTimeFormatter = DateTimeFormatter.ISO_DATE_TIME

    fun formatDate(isoDate: String?): String {
        if (isoDate.isNullOrEmpty()) return ""
        return try {
            val date = LocalDate.parse(isoDate.take(10), isoFormatter)
            date.format(swissDateFormatter)
        } catch (e: Exception) {
            isoDate
        }
    }

    fun formatDateTime(isoDateTime: String?): String {
        if (isoDateTime.isNullOrEmpty()) return ""
        return try {
            val dateTime = LocalDateTime.parse(isoDateTime.replace("Z", "").substringBefore("+"))
            dateTime.format(swissDateTimeFormatter)
        } catch (e: Exception) {
            isoDateTime
        }
    }

    fun toIsoDate(swissDate: String): String? {
        return try {
            val date = LocalDate.parse(swissDate, swissDateFormatter)
            date.format(isoFormatter)
        } catch (e: Exception) {
            null
        }
    }
}
