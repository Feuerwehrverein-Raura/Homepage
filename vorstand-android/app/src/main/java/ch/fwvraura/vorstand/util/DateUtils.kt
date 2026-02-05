package ch.fwvraura.vorstand.util

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * DateUtils — Hilfsklasse (Singleton) fuer die Datums-Konvertierung.
 *
 * Konvertiert Datumsangaben zwischen zwei Formaten:
 * - ISO-Format (API-seitig): z.B. "2026-02-05" oder "2026-02-05T14:30:00Z"
 * - Schweizer Format (Anzeige in der App): z.B. "05.02.2026" oder "05.02.2026 14:30"
 *
 * Wird ueberall in der App verwendet, wo Datumsangaben von/zur API umgewandelt
 * oder dem Benutzer angezeigt werden muessen.
 */
object DateUtils {

    /**
     * Formatter fuer das Schweizer Datumsformat (nur Datum, ohne Uhrzeit).
     * Format: dd.MM.yyyy — z.B. "05.02.2026"
     * Verwendet die Schweizer Locale (de_CH) fuer korrekte Formatierung.
     */
    private val swissDateFormatter = DateTimeFormatter.ofPattern("dd.MM.yyyy", Locale("de", "CH"))

    /**
     * Formatter fuer das Schweizer Datums- und Zeitformat (mit Uhrzeit).
     * Format: dd.MM.yyyy HH:mm — z.B. "05.02.2026 14:30"
     * Verwendet die Schweizer Locale (de_CH) fuer korrekte Formatierung.
     */
    private val swissDateTimeFormatter = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm", Locale("de", "CH"))

    /**
     * Formatter fuer das ISO-Datumsformat (nur Datum).
     * Format: yyyy-MM-dd — z.B. "2026-02-05"
     * Wird fuer das Parsen und Formatieren von API-Datumsangaben verwendet.
     */
    private val isoFormatter = DateTimeFormatter.ISO_DATE

    /**
     * Formatter fuer das ISO-Datums- und Zeitformat (mit Uhrzeit und Zeitzone).
     * Format: yyyy-MM-ddTHH:mm:ssZ — z.B. "2026-02-05T14:30:00Z"
     * Wird fuer das Parsen von API-Zeitstempeln verwendet.
     */
    private val isoDateTimeFormatter = DateTimeFormatter.ISO_DATE_TIME

    /**
     * Konvertiert ein ISO-Datum in das Schweizer Anzeigeformat.
     *
     * Beispiel: "2026-02-05" → "05.02.2026"
     *
     * Nimmt nur die ersten 10 Zeichen des Strings (yyyy-MM-dd), damit auch
     * laengere ISO-Strings mit Zeitangabe korrekt verarbeitet werden koennen.
     *
     * @param isoDate Das Datum im ISO-Format (z.B. "2026-02-05" oder "2026-02-05T14:30:00Z").
     * @return Das Datum im Schweizer Format (z.B. "05.02.2026"),
     *         ein leerer String falls der Input null/leer ist,
     *         oder der Original-String falls das Parsen fehlschlaegt.
     */
    fun formatDate(isoDate: String?): String {
        if (isoDate.isNullOrEmpty()) return ""
        return try {
            // Nur die ersten 10 Zeichen nehmen (yyyy-MM-dd), Rest abschneiden
            val date = LocalDate.parse(isoDate.take(10), isoFormatter)
            date.format(swissDateFormatter)
        } catch (e: Exception) {
            // Bei Parsing-Fehlern den Original-String zurueckgeben
            isoDate
        }
    }

    /**
     * Konvertiert einen ISO-Zeitstempel in das Schweizer Datums- und Zeitformat.
     *
     * Beispiel: "2026-02-05T14:30:00Z" → "05.02.2026 14:30"
     *
     * Entfernt das "Z" (UTC-Kennzeichnung) und alles nach einem "+" (Zeitzonen-Offset),
     * damit der String als LocalDateTime geparst werden kann.
     *
     * @param isoDateTime Der Zeitstempel im ISO-Format (z.B. "2026-02-05T14:30:00Z").
     * @return Das Datum und die Uhrzeit im Schweizer Format (z.B. "05.02.2026 14:30"),
     *         ein leerer String falls der Input null/leer ist,
     *         oder der Original-String falls das Parsen fehlschlaegt.
     */
    fun formatDateTime(isoDateTime: String?): String {
        if (isoDateTime.isNullOrEmpty()) return ""
        return try {
            // "Z" entfernen und Zeitzonen-Offset abschneiden fuer LocalDateTime-Parsing
            val dateTime = LocalDateTime.parse(isoDateTime.replace("Z", "").substringBefore("+"))
            dateTime.format(swissDateTimeFormatter)
        } catch (e: Exception) {
            // Bei Parsing-Fehlern den Original-String zurueckgeben
            isoDateTime
        }
    }

    /**
     * Konvertiert ein Datum im Schweizer Format zurueck ins ISO-Format.
     *
     * Beispiel: "05.02.2026" → "2026-02-05"
     *
     * Wird verwendet, wenn ein vom Benutzer eingegebenes Datum an die API
     * gesendet werden muss, die das ISO-Format erwartet.
     *
     * @param swissDate Das Datum im Schweizer Format (z.B. "05.02.2026").
     * @return Das Datum im ISO-Format (z.B. "2026-02-05"),
     *         oder null falls das Parsen fehlschlaegt (z.B. ungueltiges Datum).
     */
    fun toIsoDate(swissDate: String): String? {
        return try {
            // Schweizer Datumsformat parsen und als ISO-Datum formatieren
            val date = LocalDate.parse(swissDate, swissDateFormatter)
            date.format(isoFormatter)
        } catch (e: Exception) {
            // Bei Parsing-Fehlern null zurueckgeben
            null
        }
    }
}
