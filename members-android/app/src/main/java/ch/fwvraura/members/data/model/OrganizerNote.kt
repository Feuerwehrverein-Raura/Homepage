package ch.fwvraura.members.data.model

import com.google.gson.annotations.SerializedName

/**
 * Eine Organisator-Notiz zu einem Event. Der Organisator (oder Vorstand) kann
 * pro Event beliebig viele Notizen anlegen — jede mit Text und/oder beliebig
 * vielen Anhaengen (Bilder und Dokumente).
 *
 * Backend: GET events/{id}/organizer-notes liefert die Notizen (neueste zuerst).
 */
data class OrganizerNote(
    val id: String,
    val content: String? = null,
    @SerializedName("created_by") val createdBy: String? = null,
    @SerializedName("created_at") val createdAt: String? = null,
    val attachments: List<OrganizerNoteAttachment> = emptyList()
)

/**
 * Ein Anhang einer Organisator-Notiz. Die eigentlichen Bytes werden separat und
 * authentifiziert ueber
 * GET events/{id}/organizer-notes/{noteId}/attachments/{attId} geladen.
 */
data class OrganizerNoteAttachment(
    val id: String,
    val filename: String,
    @SerializedName("content_type") val contentType: String? = null,
    val size: Int = 0
) {
    /** true, wenn der Anhang ein Bild ist (fuer die Vorschau). */
    val isImage: Boolean get() = contentType?.startsWith("image/", ignoreCase = true) == true
}

/**
 * Request-Body zum Anlegen einer Notiz. Mindestens `content` ODER ein Anhang
 * muss gesetzt sein (serverseitig validiert).
 */
data class CreateOrganizerNoteRequest(
    val content: String? = null,
    val attachments: List<NoteAttachmentUpload>? = null
)

/**
 * Ein hochzuladender Anhang: Dateiname, MIME-Typ und die Datei als Base64
 * (Base64.NO_WRAP, ohne data:-Prefix).
 */
data class NoteAttachmentUpload(
    val filename: String,
    @SerializedName("content_type") val contentType: String,
    val data: String
)
