package ch.fwvraura.vorstand.ui.events

import android.content.Context
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.vorstand.R
import ch.fwvraura.vorstand.data.model.OrganizerNote
import ch.fwvraura.vorstand.data.model.OrganizerNoteAttachment
import ch.fwvraura.vorstand.databinding.ItemOrganizerNoteBinding
import ch.fwvraura.vorstand.util.DateUtils

/**
 * OrganizerNotesAdapter — RecyclerView-Adapter fuer die Liste der Organisator-Notizen.
 *
 * Zeigt pro Notiz Ersteller + Datum, den Text (falls vorhanden) und die Anhaenge an.
 * Anhaenge werden programmatisch in den Container jeder Notiz-Card gerendert:
 * - Bild-Anhaenge erhalten eine kleine Vorschau (die Bytes werden authentifiziert
 *   ueber [loadImagePreview] geladen und in die ImageView gesetzt).
 * - Dokument-Anhaenge werden als Zeile (Symbol + Dateiname) dargestellt.
 * Ein Tap auf einen Anhang oeffnet ihn ([onOpenAttachment]); jeder Anhang kann
 * einzeln entfernt werden ([onDeleteAttachment]).
 *
 * @param onDeleteNote Callback zum Loeschen einer ganzen Notiz.
 * @param onOpenAttachment Callback zum Oeffnen eines Anhangs (Download + Viewer).
 * @param onDeleteAttachment Callback zum Loeschen eines einzelnen Anhangs.
 * @param loadImagePreview Laedt die Bild-Vorschau (Notiz, Anhang, Ziel-ImageView).
 */
class OrganizerNotesAdapter(
    private val onDeleteNote: (OrganizerNote) -> Unit,
    private val onOpenAttachment: (OrganizerNote, OrganizerNoteAttachment) -> Unit,
    private val onDeleteAttachment: (OrganizerNote, OrganizerNoteAttachment) -> Unit,
    private val loadImagePreview: (OrganizerNote, OrganizerNoteAttachment, ImageView) -> Unit
) : ListAdapter<OrganizerNote, OrganizerNotesAdapter.VH>(DIFF) {

    inner class VH(val b: ItemOrganizerNoteBinding) : RecyclerView.ViewHolder(b.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH =
        VH(ItemOrganizerNoteBinding.inflate(LayoutInflater.from(parent.context), parent, false))

    override fun onBindViewHolder(holder: VH, position: Int) {
        val note = getItem(position)
        val b = holder.b
        val context = b.root.context

        // Kopfzeile: "Ersteller · Datum"
        val creator = note.createdBy?.takeIf { it.isNotBlank() } ?: "Unbekannt"
        val date = DateUtils.formatDateTime(note.createdAt)
        b.noteMeta.text = listOf(creator, date).filter { it.isNotBlank() }.joinToString(" · ")

        // Notiztext nur anzeigen, wenn vorhanden
        val content = note.content?.trim().orEmpty()
        if (content.isEmpty()) {
            b.noteContent.visibility = View.GONE
        } else {
            b.noteContent.visibility = View.VISIBLE
            b.noteContent.text = content
        }

        b.noteDeleteBtn.setOnClickListener { onDeleteNote(note) }

        // Anhaenge frisch aufbauen (Container bei jedem Bind leeren)
        b.noteAttachmentsContainer.removeAllViews()
        b.noteAttachmentsContainer.visibility =
            if (note.attachments.isEmpty()) View.GONE else View.VISIBLE
        for (att in note.attachments) {
            b.noteAttachmentsContainer.addView(buildAttachmentView(context, note, att))
        }
    }

    /**
     * Baut die View eines einzelnen Anhangs: bei Bildern eine Vorschau plus eine
     * Info-/Aktionszeile, bei Dokumenten nur die Info-/Aktionszeile.
     */
    private fun buildAttachmentView(
        context: Context,
        note: OrganizerNote,
        att: OrganizerNoteAttachment
    ): View {
        val wrapper = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = dp(context, 6) }
        }

        // Bild-Vorschau (authentifiziert geladen)
        if (att.isImage) {
            val preview = ImageView(context).apply {
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    dp(context, 160)
                ).apply { bottomMargin = dp(context, 6) }
                scaleType = ImageView.ScaleType.CENTER_CROP
                setBackgroundColor(context.getColor(R.color.surface_variant))
                contentDescription = att.filename
                isClickable = true
                isFocusable = true
                setOnClickListener { onOpenAttachment(note, att) }
                tag = att.id
            }
            wrapper.addView(preview)
            // Bytes laden und in die ImageView setzen (Fragment kuemmert sich um Auth/Cache)
            loadImagePreview(note, att, preview)
        }

        // Info-/Aktionszeile: Symbol · Dateiname (tappbar) · Entfernen
        val row = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        val glyph = TextView(context).apply {
            text = glyphFor(att)
            textSize = 16f
            setPadding(0, 0, dp(context, 8), 0)
        }
        row.addView(glyph)

        val name = TextView(context).apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            text = "${att.filename}  ·  ${formatSize(att.size)}"
            textSize = 14f
            maxLines = 2
            ellipsize = android.text.TextUtils.TruncateAt.END
            setTextColor(context.getColor(R.color.text_primary))
            isClickable = true
            isFocusable = true
            setOnClickListener { onOpenAttachment(note, att) }
        }
        row.addView(name)

        val delete = TextView(context).apply {
            text = "Entfernen"
            textSize = 12f
            setTextColor(context.getColor(R.color.error))
            setPadding(dp(context, 8), dp(context, 4), dp(context, 4), dp(context, 4))
            isClickable = true
            isFocusable = true
            setOnClickListener { onDeleteAttachment(note, att) }
        }
        row.addView(delete)

        wrapper.addView(row)
        return wrapper
    }

    /** Waehlt ein Emoji-Symbol passend zum Anhang-Typ. */
    private fun glyphFor(att: OrganizerNoteAttachment): String = when {
        att.isImage -> "🖼️" // 🖼️
        att.contentType.equals("application/pdf", ignoreCase = true) -> "📄" // 📄
        else -> "📎" // 📎
    }

    /** Formatiert eine Dateigroesse (Bytes) menschenlesbar (B / KB / MB). */
    private fun formatSize(bytes: Int): String = when {
        bytes < 1024 -> "$bytes B"
        bytes < 1024 * 1024 -> "${bytes / 1024} KB"
        else -> String.format(java.util.Locale.ROOT, "%.1f MB", bytes / 1024f / 1024f)
    }

    /** dp -> px anhand der Bildschirmdichte. */
    private fun dp(context: Context, value: Int): Int =
        (value * context.resources.displayMetrics.density).toInt()

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<OrganizerNote>() {
            override fun areItemsTheSame(o: OrganizerNote, n: OrganizerNote) = o.id == n.id
            override fun areContentsTheSame(o: OrganizerNote, n: OrganizerNote) = o == n
        }
    }
}
