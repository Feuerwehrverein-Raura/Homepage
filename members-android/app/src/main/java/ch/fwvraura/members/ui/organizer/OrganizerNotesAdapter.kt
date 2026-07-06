package ch.fwvraura.members.ui.organizer

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import ch.fwvraura.members.R
import ch.fwvraura.members.data.model.OrganizerNote
import ch.fwvraura.members.data.model.OrganizerNoteAttachment
import ch.fwvraura.members.databinding.ItemNoteAttachmentBinding
import ch.fwvraura.members.databinding.ItemOrganizerNoteBinding
import ch.fwvraura.members.util.DateUtils
import java.util.Locale

/**
 * Adapter fuer die Notizenliste eines Events. Rendert pro Notiz Text, Ersteller +
 * Datum und die Anhaenge (Bild-Vorschau bzw. Datei-Icon). Bild-Vorschauen werden
 * ueber [loadImagePreview] authentifiziert nachgeladen (der Adapter kennt weder
 * API noch Token).
 */
class OrganizerNotesAdapter(
    private val onOpenAttachment: (OrganizerNote, OrganizerNoteAttachment) -> Unit,
    private val onDeleteNote: (OrganizerNote) -> Unit,
    private val onDeleteAttachment: (OrganizerNote, OrganizerNoteAttachment) -> Unit,
    private val loadImagePreview: (noteId: String, att: OrganizerNoteAttachment, target: ImageView) -> Unit
) : ListAdapter<OrganizerNote, OrganizerNotesAdapter.VH>(DIFF) {

    inner class VH(val binding: ItemOrganizerNoteBinding) : RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val binding = ItemOrganizerNoteBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return VH(binding)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val note = getItem(position)
        val b = holder.binding

        val creator = note.createdBy?.takeIf { it.isNotBlank() }
        val date = DateUtils.formatDateTime(note.createdAt)
            .ifBlank { DateUtils.formatDate(note.createdAt) }
        b.noteMeta.text = listOfNotNull(creator, date.takeIf { it.isNotBlank() }).joinToString(" · ")

        b.noteContent.text = note.content.orEmpty()
        b.noteContent.visibility = if (note.content.isNullOrBlank()) View.GONE else View.VISIBLE

        b.noteDeleteBtn.setOnClickListener { onDeleteNote(note) }

        b.noteAttachments.removeAllViews()
        if (note.attachments.isEmpty()) {
            b.noteAttachments.visibility = View.GONE
        } else {
            b.noteAttachments.visibility = View.VISIBLE
            val inflater = LayoutInflater.from(b.root.context)
            for (att in note.attachments) {
                val row = ItemNoteAttachmentBinding.inflate(inflater, b.noteAttachments, false)
                bindAttachment(row, note, att)
                b.noteAttachments.addView(row.root)
            }
        }
    }

    private fun bindAttachment(
        row: ItemNoteAttachmentBinding,
        note: OrganizerNote,
        att: OrganizerNoteAttachment
    ) {
        row.attName.text = att.filename
        row.attMeta.text = attachmentMeta(att)

        if (att.isImage) {
            // Vorschau: Icon-Padding entfernen, damit das Bild den 48dp-Rahmen
            // fuellt (centerCrop). Platzhalter bleibt transparent bis geladen.
            row.attThumb.setPadding(0, 0, 0, 0)
            row.attThumb.setImageResource(android.R.color.transparent)
            loadImagePreview(note.id, att, row.attThumb)
        } else {
            val pad = (10 * row.root.resources.displayMetrics.density).toInt()
            row.attThumb.setPadding(pad, pad, pad, pad)
            row.attThumb.setImageResource(R.drawable.ic_file)
        }

        row.attRow.setOnClickListener { onOpenAttachment(note, att) }
        row.attRemove.setOnClickListener { onDeleteAttachment(note, att) }
    }

    /** "PDF · 320 KB" — Typ-Kuerzel (aus Endung/MIME) + menschenlesbare Groesse. */
    private fun attachmentMeta(att: OrganizerNoteAttachment): String {
        val typeLabel = att.filename.substringAfterLast('.', "").uppercase(Locale.getDefault())
            .ifBlank { att.contentType?.substringAfterLast('/')?.uppercase(Locale.getDefault()).orEmpty() }
        val size = humanSize(att.size)
        return listOf(typeLabel, size).filter { it.isNotBlank() }.joinToString(" · ")
    }

    private fun humanSize(bytes: Int): String {
        if (bytes <= 0) return ""
        val kb = bytes / 1024.0
        return if (kb < 1024) "${kb.toInt()} KB"
        else String.format(Locale.US, "%.1f MB", kb / 1024.0)
    }

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<OrganizerNote>() {
            override fun areItemsTheSame(o: OrganizerNote, n: OrganizerNote) = o.id == n.id
            override fun areContentsTheSame(o: OrganizerNote, n: OrganizerNote) = o == n
        }
    }
}
