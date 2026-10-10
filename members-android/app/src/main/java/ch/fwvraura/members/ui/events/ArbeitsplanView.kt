package ch.fwvraura.members.ui.events

import android.content.Context
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.content.ContextCompat
import ch.fwvraura.members.R
import ch.fwvraura.members.data.model.Arbeitsplan
import ch.fwvraura.members.data.model.freiText
import ch.fwvraura.members.data.model.karte
import ch.fwvraura.members.data.model.zeitText

/**
 * ArbeitsplanView – Zeichnet den Arbeitsplan eines Events handytauglich.
 *
 * Der Plan kommt fertig vom Backend (GET /events/{id}/arbeitsplan); hier
 * wird nichts gruppiert oder gerechnet. Statt einer breiten Tabelle (die
 * auf dem Handy seitlich gescrollt werden muesste) gibt es wie auf der
 * Website (zeichneTagAlsListe) pro Tag eine Ueberschrift und pro
 * Zeitfenster eine Karte mit nur den Bereichen, die dort eine Schicht
 * haben. Gescrollt wird nur senkrecht; die Knoepfe liegen im Dialog
 * ausserhalb dieser Ansicht und bleiben immer sichtbar.
 */
object ArbeitsplanView {

    private val GRAU_LABEL = Color.parseColor("#6B7280")
    private val GRAU_LEER = Color.parseColor("#9CA3AF")
    private val ORANGE = Color.parseColor("#EA580C")
    private val RAHMEN = Color.parseColor("#D1D5DB")

    /** Erstellt die senkrecht scrollbare Arbeitsplan-Ansicht fuer den Dialog. */
    fun build(context: Context, plan: Arbeitsplan): View {
        val dp = context.resources.displayMetrics.density
        fun px(v: Int) = (v * dp).toInt()
        val textFarbe = ContextCompat.getColor(context, R.color.text_primary)

        val content = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(px(16), px(12), px(16), px(12))
        }

        // Kopf wie auf dem Aushang
        content.addView(TextView(context).apply {
            text = plan.verein ?: "Feuerwehrverein Raura, Kaiseraugst"
            textSize = 15f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(textFarbe)
            gravity = Gravity.CENTER
        }, matchWidth())
        content.addView(TextView(context).apply {
            text = plan.titel ?: "Arbeitsplan ${plan.anlass.orEmpty()}".trim()
            textSize = 19f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(textFarbe)
            paintFlags = paintFlags or Paint.UNDERLINE_TEXT_FLAG
            gravity = Gravity.CENTER
            setPadding(0, px(4), 0, px(4))
        }, matchWidth())

        val tage = plan.tage.orEmpty()
        if (tage.isEmpty()) {
            content.addView(TextView(context).apply {
                text = "Keine Schichten f\u00fcr dieses Event vorhanden."
                setTextColor(textFarbe)
                gravity = Gravity.CENTER
                setPadding(0, px(12), 0, px(12))
            }, matchWidth())
        }

        val bereiche = plan.bereiche.orEmpty()
        for (tag in tage) {
            content.addView(TextView(context).apply {
                text = tag.bezeichnung ?: tag.datum ?: "Ohne Datum"
                textSize = 16f
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(textFarbe)
                setPadding(0, px(16), 0, px(8))
            }, matchWidth())

            for (zeile in tag.zeilen.orEmpty()) {
                val eintraege = zeile.karte(bereiche)
                if (eintraege.isEmpty()) continue

                val karte = LinearLayout(context).apply {
                    orientation = LinearLayout.VERTICAL
                    setPadding(px(12), px(10), px(12), px(10))
                    background = GradientDrawable().apply {
                        cornerRadius = 8 * dp
                        setStroke(px(1).coerceAtLeast(1), RAHMEN)
                    }
                }
                karte.addView(TextView(context).apply {
                    text = zeile.zeitText()
                    textSize = 15f
                    setTypeface(typeface, Typeface.BOLD)
                    setTextColor(textFarbe)
                    setPadding(0, 0, 0, px(4))
                }, matchWidth())

                for (e in eintraege) {
                    karte.addView(TextView(context).apply {
                        text = e.bereich.uppercase()
                        textSize = 11f
                        letterSpacing = 0.05f
                        setTypeface(typeface, Typeface.BOLD)
                        setTextColor(GRAU_LABEL)
                        setPadding(0, px(6), 0, 0)
                    }, matchWidth())

                    val zeileText = SpannableStringBuilder()
                    if (e.namenText.isNotEmpty()) {
                        zeileText.append(e.namenText)
                    } else {
                        farbig(zeileText, "noch niemand", GRAU_LEER)
                    }
                    e.freiText()?.let {
                        zeileText.append(" \u00b7 ")
                        farbig(zeileText, it, ORANGE)
                    }
                    karte.addView(TextView(context).apply {
                        text = zeileText
                        textSize = 14f
                        setTextColor(textFarbe)
                    }, matchWidth())
                }

                content.addView(karte, matchWidth().apply { bottomMargin = px(10) })
            }
        }

        return ScrollView(context).apply { addView(content) }
    }

    private fun farbig(sb: SpannableStringBuilder, text: String, farbe: Int) {
        val start = sb.length
        sb.append(text)
        sb.setSpan(ForegroundColorSpan(farbe), start, sb.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    }

    private fun matchWidth() = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
    )
}
