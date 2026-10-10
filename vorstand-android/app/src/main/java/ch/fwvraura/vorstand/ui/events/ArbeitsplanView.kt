package ch.fwvraura.vorstand.ui.events

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TableLayout
import android.widget.TableRow
import android.widget.TextView
import ch.fwvraura.vorstand.data.model.Arbeitsplan
import ch.fwvraura.vorstand.data.model.ArbeitsplanZelle
import ch.fwvraura.vorstand.data.model.zeilenText

/**
 * ArbeitsplanView – Zeichnet den Arbeitsplan eines Events als Tabelle.
 *
 * Die Tabelle baut das Backend (GET /events/{id}/arbeitsplan) – Tage,
 * Zeitfenster, Bereiche und offene Plaetze kommen fertig an. Hier wird
 * nichts gruppiert oder gerechnet, nur gezeichnet: pro Tag eine Tabelle,
 * erste Spalte "Zeit", dann ein Bereich pro Spalte. Eingetragen sind die
 * bestaetigten Helfer, offene Plaetze als grauer Strich, Felder ohne
 * Schicht schwarz – wie im Vorstand-Web und im PDF.
 */
object ArbeitsplanView {

    /**
     * Erstellt die scrollbare Arbeitsplan-Ansicht fuer den Dialog.
     *
     * @param bereichLabel Macht aus dem Bereich die Spaltenueberschrift
     *        (z.B. "Kueche" -> "Küche").
     */
    fun build(context: Context, plan: Arbeitsplan, bereichLabel: (String) -> String): View {
        val bereiche = plan.bereiche.orEmpty()
        val dp = context.resources.displayMetrics.density
        val pad = (12 * dp).toInt()

        val content = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad * 2, pad, pad * 2, pad)
        }

        // Kopf wie auf dem Aushang
        content.addView(TextView(context).apply {
            text = plan.verein ?: ""
            textSize = 16f
            setTypeface(typeface, Typeface.BOLD)
            gravity = Gravity.CENTER
        }, matchWidth())
        content.addView(TextView(context).apply {
            text = plan.titel ?: "Arbeitsplan"
            textSize = 20f
            setTypeface(typeface, Typeface.BOLD)
            paintFlags = paintFlags or android.graphics.Paint.UNDERLINE_TEXT_FLAG
            gravity = Gravity.CENTER
            setPadding(0, (4 * dp).toInt(), 0, (8 * dp).toInt())
        }, matchWidth())

        val tage = plan.tage.orEmpty()
        if (tage.isEmpty()) {
            content.addView(TextView(context).apply {
                text = "Keine Schichten für dieses Event vorhanden."
                gravity = Gravity.CENTER
                setPadding(0, pad, 0, pad)
            }, matchWidth())
        }

        for (tag in tage) {
            content.addView(TextView(context).apply {
                text = tag.bezeichnung ?: tag.datum ?: ""
                textSize = 16f
                setTypeface(typeface, Typeface.BOLD)
                paintFlags = paintFlags or android.graphics.Paint.UNDERLINE_TEXT_FLAG
                setPadding(0, pad, 0, (6 * dp).toInt())
            }, matchWidth())

            val table = TableLayout(context)
            // Kopfzeile: Zeit + ein Bereich pro Spalte
            table.addView(TableRow(context).apply {
                addView(headerCell(context, "Zeit", dp))
                bereiche.forEach { addView(headerCell(context, bereichLabel(it), dp)) }
            })

            for (zeile in tag.zeilen.orEmpty()) {
                val row = TableRow(context)
                row.addView(textCell(context, zeile.zeit ?: "", dp).apply {
                    setTypeface(typeface, Typeface.BOLD)
                })
                // zellen laeuft parallel zu bereiche; null = keine Schicht
                val zellen = zeile.zellen.orEmpty()
                for (i in bereiche.indices) {
                    val zelle = zellen.getOrNull(i)
                    row.addView(if (zelle != null) helperCell(context, zelle, dp) else blackCell(context, dp))
                }
                table.addView(row)
            }

            content.addView(HorizontalScrollView(context).apply { addView(table) }, matchWidth())
        }

        return ScrollView(context).apply { addView(content) }
    }

    private fun matchWidth() = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
    )

    /** Hintergrund mit grauem Rahmen, damit die Tabelle wie im PDF aussieht. */
    private fun border(fill: Int, dp: Float) = GradientDrawable().apply {
        setColor(fill)
        setStroke((1 * dp).toInt().coerceAtLeast(1), Color.parseColor("#9CA3AF"))
    }

    private fun textCell(context: Context, text: String, dp: Float) = TextView(context).apply {
        this.text = text
        textSize = 14f
        setTextColor(Color.parseColor("#111827"))
        val p = (8 * dp).toInt()
        setPadding(p, (6 * dp).toInt(), p, (6 * dp).toInt())
        gravity = Gravity.TOP or Gravity.START
        background = border(Color.WHITE, dp)
        layoutParams = TableRow.LayoutParams(
            TableRow.LayoutParams.WRAP_CONTENT, TableRow.LayoutParams.MATCH_PARENT
        )
    }

    private fun headerCell(context: Context, text: String, dp: Float) = textCell(context, text, dp).apply {
        setTypeface(typeface, Typeface.BOLD)
        background = border(Color.parseColor("#F9FAFB"), dp)
    }

    /** Feld mit "-Name" pro bestaetigtem Helfer und grauem "-" pro offenem Platz. */
    private fun helperCell(context: Context, zelle: ArbeitsplanZelle, dp: Float) = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        val p = (8 * dp).toInt()
        setPadding(p, (6 * dp).toInt(), p, (6 * dp).toInt())
        background = border(Color.WHITE, dp)
        layoutParams = TableRow.LayoutParams(
            TableRow.LayoutParams.WRAP_CONTENT, TableRow.LayoutParams.MATCH_PARENT
        )
        zelle.zeilenText().forEach { (zeile, offen) ->
            addView(TextView(context).apply {
                text = zeile
                textSize = 14f
                setTextColor(Color.parseColor(if (offen) "#9CA3AF" else "#111827"))
            })
        }
    }

    /** Feld ohne Schicht in diesem Zeitfenster/Bereich: schwarz. */
    private fun blackCell(context: Context, dp: Float) = View(context).apply {
        background = border(Color.parseColor("#111827"), dp)
        layoutParams = TableRow.LayoutParams(
            (60 * dp).toInt(), TableRow.LayoutParams.MATCH_PARENT
        )
    }
}
