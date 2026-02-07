package ch.fwvraura.vorstand.util

import android.graphics.Typeface
import android.text.Editable
import android.text.Html
import android.text.Spannable
import android.text.style.BulletSpan
import android.text.style.StyleSpan
import android.text.style.UnderlineSpan
import android.widget.EditText
import com.google.android.material.button.MaterialButton

/**
 * Hilfsklasse fuer Rich-Text-Formatierung in einem EditText.
 *
 * Unterstuetzt: Fett, Kursiv, Unterstrichen, Aufzaehlungsliste.
 * Verwendet Android Spannable-System und konvertiert zu HTML fuer den API-Versand.
 */
class RichTextEditor(
    private val editText: EditText,
    private val btnBold: MaterialButton,
    private val btnItalic: MaterialButton,
    private val btnUnderline: MaterialButton,
    private val btnList: MaterialButton
) {

    init {
        btnBold.setOnClickListener { toggleStyle(Typeface.BOLD) }
        btnItalic.setOnClickListener { toggleStyle(Typeface.ITALIC) }
        btnUnderline.setOnClickListener { toggleUnderline() }
        btnList.setOnClickListener { toggleBulletList() }
    }

    /**
     * Schaltet Bold/Italic fuer die aktuelle Selektion um.
     * Wenn Text ausgewaehlt ist: Span anwenden/entfernen.
     * Wenn keine Selektion: nichts tun (User muss erst Text markieren).
     */
    private fun toggleStyle(style: Int) {
        val text = editText.text ?: return
        val start = editText.selectionStart
        val end = editText.selectionEnd
        if (start == end) return // Keine Selektion

        val existingSpans = text.getSpans(start, end, StyleSpan::class.java)
        val hasStyle = existingSpans.any { it.style == style }

        if (hasStyle) {
            // Span entfernen
            existingSpans.filter { it.style == style }.forEach { text.removeSpan(it) }
        } else {
            // Span hinzufuegen
            text.setSpan(StyleSpan(style), start, end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
    }

    private fun toggleUnderline() {
        val text = editText.text ?: return
        val start = editText.selectionStart
        val end = editText.selectionEnd
        if (start == end) return

        val existingSpans = text.getSpans(start, end, UnderlineSpan::class.java)
        if (existingSpans.isNotEmpty()) {
            existingSpans.forEach { text.removeSpan(it) }
        } else {
            text.setSpan(UnderlineSpan(), start, end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
    }

    /**
     * Fuegt Aufzaehlungszeichen am Anfang der aktuellen Zeile ein.
     * Wenn die Zeile bereits mit "• " beginnt, wird es entfernt.
     */
    private fun toggleBulletList() {
        val text = editText.text ?: return
        val cursorPos = editText.selectionStart

        // Zeilenanfang finden
        val lineStart = text.lastIndexOf('\n', cursorPos - 1) + 1
        val lineEnd = text.indexOf('\n', cursorPos).let { if (it == -1) text.length else it }
        val line = text.substring(lineStart, lineEnd)

        if (line.startsWith("• ")) {
            // Aufzaehlungszeichen entfernen
            text.delete(lineStart, lineStart + 2)
        } else {
            // Aufzaehlungszeichen einfuegen
            text.insert(lineStart, "• ")
        }
    }

    /**
     * Konvertiert den formatierten Text zu HTML fuer den API-Versand.
     * Wandelt Spans in HTML-Tags um und ersetzt Aufzaehlungszeichen
     * durch HTML-Listenelemente.
     */
    fun toHtml(): String {
        val spanned = editText.text ?: return ""
        var html = Html.toHtml(spanned, Html.TO_HTML_PARAGRAPH_LINES_INDIVIDUAL)

        // Aufzaehlungszeichen (• ) in HTML-Liste umwandeln
        val lines = html.split("\n")
        val result = StringBuilder()
        var inList = false

        for (line in lines) {
            val trimmed = line.trim()
            // Erkennung von Zeilen die mit Aufzaehlungszeichen beginnen
            // (innerhalb von <p> Tags oder als reiner Text)
            val bulletPattern = Regex("""^(<p[^>]*>)?\s*[•·]\s*(.*)$""")
            val match = bulletPattern.find(trimmed)

            if (match != null) {
                if (!inList) {
                    result.append("<ul>")
                    inList = true
                }
                val content = match.groupValues[2].removeSuffix("</p>").trim()
                result.append("<li>$content</li>")
            } else {
                if (inList) {
                    result.append("</ul>")
                    inList = false
                }
                result.append(line)
            }
        }
        if (inList) result.append("</ul>")

        return result.toString()
    }

    /**
     * Gibt den unformatierten Text zurueck (fuer Preview-Dialog).
     */
    fun toPlainText(): String {
        return editText.text?.toString() ?: ""
    }

    /**
     * Setzt den Text (z.B. aus einer Vorlage).
     * Wenn der Text HTML enthaelt, wird er als HTML geparsed.
     */
    fun setText(text: String?) {
        if (text == null) {
            editText.setText("")
            return
        }
        if (text.contains("<") && text.contains(">")) {
            // HTML-Text
            editText.setText(Html.fromHtml(text, Html.FROM_HTML_MODE_COMPACT))
        } else {
            editText.setText(text)
        }
    }
}
