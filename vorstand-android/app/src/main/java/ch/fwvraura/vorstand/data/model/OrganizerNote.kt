package ch.fwvraura.vorstand.data.model

import com.google.gson.annotations.SerializedName

/**
 * OrganizerNote — eine Organisator-Notiz zu einem Event.
 *
 * Pro Event koennen beliebig viele Notizen angelegt werden. Jede Notiz hat einen
 * optionalen Text ([content]) und beliebig viele Anhaenge ([attachments]) — Bilder
 * wie auch Dokumente. Mindestens Text ODER ein Anhang muss vorhanden sein.
 *
 * Entspricht dem JSON der API:
 *   GET events/{id}/organizer-notes
 *   → [{ id, content?, created_by, created_at, attachments:[...] }]  (neueste zuerst)
 *
 * Die Felder [createdBy] und [createdAt] sind serverseitig immer gesetzt, werden
 * hier aber (wie im Rest des Moduls ueblich) defensiv als nullable gefuehrt.
 */
data class OrganizerNote(
    val id: String,
    val content: String? = null,
    @SerializedName("created_by") val createdBy: String? = null,
    @SerializedName("created_at") val createdAt: String? = null,
    val attachments: List<OrganizerNoteAttachment> = emptyList()
)

/**
 * OrganizerNoteAttachment — Metadaten eines Anhangs einer Organisator-Notiz.
 *
 * Der eigentliche Binaerinhalt wird NICHT hier mitgeliefert, sondern separat und
 * authentifiziert ueber
 *   GET events/{id}/organizer-notes/{noteId}/attachments/{attId}
 * geladen (Bearer-Token noetig — daher via Retrofit/OkHttp, nicht per <img src>).
 *
 * @property contentType MIME-Type (z.B. "image/jpeg", "application/pdf").
 * @property size Groesse in Bytes.
 */
data class OrganizerNoteAttachment(
    val id: String,
    val filename: String,
    @SerializedName("content_type") val contentType: String,
    val size: Int = 0
) {
    /** true wenn der Anhang ein Bild ist (fuer die Vorschau-Darstellung). */
    val isImage: Boolean get() = contentType.startsWith("image/", ignoreCase = true)
}

/**
 * CreateOrganizerNoteRequest — Body fuer POST events/{id}/organizer-notes.
 *
 * Es muss mindestens [content] ODER ein Anhang gesetzt sein. Da der Standard-Gson
 * des Retrofit-Clients null-Felder weglaesst, wird bei einer reinen Textnotiz nur
 * "content" und bei einer reinen Anhang-Notiz nur "attachments" gesendet.
 */
data class CreateOrganizerNoteRequest(
    val content: String? = null,
    val attachments: List<NoteAttachmentUpload>? = null
)

/**
 * NoteAttachmentUpload — ein einzelner hochzuladender Anhang.
 *
 * @property filename Anzeigename der Datei (aus OpenableColumns.DISPLAY_NAME).
 * @property contentType MIME-Type (aus contentResolver.getType).
 * @property data Dateiinhalt als Base64 (android.util.Base64.NO_WRAP — ohne Zeilenumbrueche).
 */
data class NoteAttachmentUpload(
    val filename: String,
    @SerializedName("content_type") val contentType: String,
    val data: String
)
